/* Radar card. A Leaflet map centered on the city, with the last hour of radar playing on top.
   The radar comes from NOAA's National Weather Service MRMS system, which is free and needs no key.
   It covers the lower 48 states. If it can't load, the map falls back to OpenWeather's precipitation layer.
   leftpanel.js calls showRadar() once it knows the location.

   NOAA has two separate radar maps:
   - how strong the precipitation is (reflectivity, measured in dBZ)
   - what kind it is (rain, snow, or hail)
   Each tile here loads both, then colors every pixel like a TV weather radar:
   rain in green to red, snow in blues, and hail in pink. */

const radarPlace = document.getElementById("radar-place");
const radarPlayButton = document.getElementById("radar-play");
const radarTime = document.getElementById("radar-time");

const RADAR_ZOOM = 8;
const RADAR_OPACITY = 0.8;
const FRAME_TIME = 700; // Milliseconds each frame stays on screen
const LAST_FRAME_TIME = 1800; // Pause on the newest frame before the loop restarts
const RADAR_FRAME_COUNT = 7; // The newest frame plus 6 older ones
const RADAR_FRAME_GAP = 10; // Minutes between frames, so 7 frames cover the last hour

/* NOAA's free map server */
const NOAA_RADAR_URL = "https://opengeo.ncep.noaa.gov/geoserver/conus/ows";
const STRENGTH_LAYER = "conus_bref_qcd";
const TYPE_LAYER = "conus_pcpn_typ";

/* The area NOAA's radar covers: the lower 48 states */
const RADAR_COVERAGE = { south: 20, north: 55, west: -130, east: -60 };

/* NOAA's legend for precipitation type has 7 boxes in this order.
   Most kinds are rain (steady, thunderstorm, and tropical versions). */
const TYPE_LEGEND_KINDS = ["rain", "snow", "rain", "hail", "rain", "rain", "rain"];

/* NOAA's strength legend runs from -25 dBZ at the left edge, with 5 pixels for each dBZ */
const STRENGTH_LEGEND_START = -25;
const STRENGTH_LEGEND_PIXELS_PER_DBZ = 5;

/* CeruSky's colors, from light to heavy. Each one starts at the dBZ shown.
   Snow shows up weaker on radar than rain does, so its scale starts lower. */
const RADAR_COLORS = {
    rain: [
        [15, "#9BE08F"], [20, "#4CC14C"], [30, "#1E8C2E"], [35, "#F6E33B"],
        [40, "#F5A623"], [45, "#E8501C"], [50, "#C8102E"], [55, "#9B1B6E"],
    ],
    snow: [
        [5, "#C4E4FA"], [10, "#8CC8F5"], [15, "#5AA6EA"], [20, "#2F7FD6"], [25, "#1858B8"], [30, "#0B3A8C"],
    ],
    hail: [
        [0, "#FF7AD1"], [55, "#D61FA8"],
    ],
};

let radarMap = null;
let radarMarker = null;
let radarFrames = [];
let radarFrameIndex = 0;
let radarTimer = null;
let radarIsPlaying = false;
let radarColorKeys = null;

function showRadar(latitude, longitude, city) {
    radarPlace.textContent = isInRadarCoverage(latitude, longitude)
        ? "A wider view of your area"
        : "Radar covers the lower 48 US states only";

    if (!radarMap) {
        createRadarMap();
        radarMap.setView([latitude, longitude], RADAR_ZOOM);
        loadRadarFrames();
    } else {
        radarMap.setView([latitude, longitude], RADAR_ZOOM);
    }

    if (radarMarker) {
        radarMarker.remove();
    }

    radarMarker = L.circleMarker([latitude, longitude], {
        radius: 6,
        color: "#FFFFFF",
        weight: 2,
        fillColor: "#2B8FBC",
        fillOpacity: 1,
    }).addTo(radarMap);

    radarMarker.bindTooltip(city, { permanent: true, direction: "top", offset: [0, -6] });
}

function isInRadarCoverage(latitude, longitude) {
    const { south, north, west, east } = RADAR_COVERAGE;
    return latitude >= south && latitude <= north && longitude >= west && longitude <= east;
}

function createRadarMap() {
    radarMap = L.map("radar-map-view", { zoomControl: false, minZoom: 3 });
    radarMap.attributionControl.setPrefix("Leaflet");

    /* The base map: roads, towns, and water */
    L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}", {
        attribution: "Map &copy; Esri",
        maxZoom: 12,
    }).addTo(radarMap);

    /* City and road names, on their own layer so the weather stays underneath them */
    L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Reference/MapServer/tile/{z}/{y}/{x}", {
        maxZoom: 12,
        zIndex: 3,
    }).addTo(radarMap);

    /* The map grows with the card, so it needs to know when its size changes */
    new ResizeObserver(() => radarMap.invalidateSize()).observe(document.getElementById("radar-map-view"));

    document.getElementById("radar-zoom-in").addEventListener("click", () => radarMap.zoomIn());
    document.getElementById("radar-zoom-out").addEventListener("click", () => radarMap.zoomOut());
    radarPlayButton.addEventListener("click", toggleRadarPlayback);
}

/* Each frame is its own map layer. They all load up front, hidden, so the loop plays smoothly. */
async function loadRadarFrames() {
    try {
        const [times, colorKeys] = await Promise.all([getRadarTimes(), loadRadarColorKeys()]);

        radarColorKeys = colorKeys;
        radarFrames = times.map((time) => ({ time, layer: createRadarFrameLayer(time) }));

        radarFrameIndex = radarFrames.length - 1;
        showRadarFrame(radarFrameIndex);
        radarPlayButton.hidden = false;

        /* People who ask their device to reduce motion start on the newest frame, paused */
        if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
            startRadarPlayback();
        } else {
            updatePlayButton();
        }
    } catch (error) {
        console.error(error);
        showOpenWeatherRadar();
    }
}

/* NOAA lists every radar time it has, about every 2 minutes for the last 2 hours.
   This picks the newest one and older ones 10 minutes apart, oldest first. */
async function getRadarTimes() {
    const response = await fetch(`${NOAA_RADAR_URL}?service=WMS&version=1.3.0&request=GetCapabilities`);

    if (!response.ok) throw new Error(`Radar request failed: ${response.status}`);

    const capabilities = new DOMParser().parseFromString(await response.text(), "text/xml");
    const layer = [...capabilities.querySelectorAll("Layer")]
        .find((item) => item.querySelector(":scope > Name")?.textContent === STRENGTH_LAYER);
    const allTimes = layer?.querySelector("Dimension[name='time']")?.textContent.split(",").map((time) => new Date(time.trim())) ?? [];

    if (allTimes.length === 0) throw new Error("No radar times returned");

    const newest = allTimes[allTimes.length - 1];
    const times = [];

    for (let step = RADAR_FRAME_COUNT - 1; step >= 0; step--) {
        const target = newest - step * RADAR_FRAME_GAP * 60 * 1000;
        const closest = allTimes.reduce((best, time) => (Math.abs(time - target) < Math.abs(best - target) ? time : best));
        times.push(closest);
    }

    return times;
}

/* A map layer that draws one radar frame. Leaflet asks it for one square tile at a time. */
const RadarFrameLayer = L.GridLayer.extend({
    createTile(coords, done) {
        const tile = document.createElement("canvas");
        const size = this.getTileSize();

        tile.width = size.x;
        tile.height = size.y;

        drawRadarTile(tile, getTileBounds(this._map, coords, size), this.options.time)
            .then(() => done(null, tile))
            .catch((error) => done(error, tile));

        return tile;
    },
});

function createRadarFrameLayer(time) {
    return new RadarFrameLayer({
        time,
        opacity: 0,
        maxZoom: 12,
        zIndex: 2,
        keepBuffer: 0, // Skips extra tiles outside the map
        updateWhenIdle: true, // Waits until zooming stops before loading
        attribution: 'Radar: <a href="https://www.nssl.noaa.gov/projects/mrms/" target="_blank" rel="noopener noreferrer">NOAA/NWS</a>',
    }).addTo(radarMap);
}

/* The corners of a tile in the map's own units (meters), which NOAA's server needs */
function getTileBounds(map, coords, size) {
    const topLeft = coords.scaleBy(size);
    const bottomRight = topLeft.add(size);
    const northWest = L.CRS.EPSG3857.project(map.unproject(topLeft, coords.z));
    const southEast = L.CRS.EPSG3857.project(map.unproject(bottomRight, coords.z));

    return [northWest.x, southEast.y, southEast.x, northWest.y].join(",");
}

function getRadarImageUrl(layer, bounds, time, size) {
    return `${NOAA_RADAR_URL}?service=WMS&version=1.3.0&request=GetMap&layers=${layer}&styles=&format=image/png&transparent=true`
        + `&crs=EPSG:3857&bbox=${bounds}&width=${size}&height=${size}&time=${time.toISOString()}`;
}

/* Loads the strength and type images for one tile, then paints CeruSky's colors onto the tile */
async function drawRadarTile(tile, bounds, time) {
    const [strengthImage, typeImage] = await Promise.all([
        loadImage(getRadarImageUrl(STRENGTH_LAYER, bounds, time, tile.width)),
        loadImage(getRadarImageUrl(TYPE_LAYER, bounds, time, tile.width)),
    ]);

    const context = tile.getContext("2d", { willReadFrequently: true });
    const strengthPixels = readPixels(context, strengthImage);
    const typePixels = readPixels(context, typeImage);
    const output = context.createImageData(tile.width, tile.height);

    for (let i = 0; i < output.data.length; i += 4) {
        /* Clear pixels in the type image mean no precipitation, like ground clutter or birds */
        if (typePixels[i + 3] < 128 || strengthPixels[i + 3] < 128) continue;

        const kind = getPrecipitationKind(typePixels, i);
        const strength = getPrecipitationStrength(strengthPixels, i);
        const color = getRadarColor(kind, strength);

        if (!color) continue;

        output.data.set(color, i);
    }

    context.putImageData(output, 0, 0);
}

function loadImage(url) {
    return new Promise((resolve, reject) => {
        const image = new Image();

        image.crossOrigin = "anonymous"; // Lets the page read the pixels. NOAA allows this.
        image.onload = () => resolve(image);
        image.onerror = () => reject(new Error(`Radar image failed: ${url}`));
        image.src = url;
    });
}

function readPixels(context, image) {
    context.clearRect(0, 0, context.canvas.width, context.canvas.height);
    context.drawImage(image, 0, 0);
    return context.getImageData(0, 0, context.canvas.width, context.canvas.height).data;
}

/* -------- Reading NOAA's colors -------- */

/* NOAA bakes its colors into the images, so the page reads them from NOAA's own legends.
   That way, every color in a radar image can be matched back to a strength or a type. */
async function loadRadarColorKeys() {
    const [strengthLegend, typeLegend] = await Promise.all([
        loadImage(getLegendUrl(STRENGTH_LAYER)),
        loadImage(getLegendUrl(TYPE_LAYER)),
    ]);

    const strengthRow = readLegendRow(strengthLegend);
    const typeRow = readLegendRow(typeLegend);
    const boxWidth = typeLegend.width / TYPE_LEGEND_KINDS.length;

    return {
        strength: strengthRow.map((rgb, x) => ({ rgb, value: STRENGTH_LEGEND_START + x / STRENGTH_LEGEND_PIXELS_PER_DBZ })),
        type: TYPE_LEGEND_KINDS.map((kind, box) => ({ rgb: typeRow[Math.round((box + 0.5) * boxWidth)], value: kind })),
        matches: { strength: new Map(), type: new Map() },
    };
}

function getLegendUrl(layer) {
    return `${NOAA_RADAR_URL}?service=WMS&version=1.3.0&request=GetLegendGraphic&format=image/png&layer=${layer}`;
}

/* The color bar is the top part of each legend image, above the labels */
function readLegendRow(image) {
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");
    const row = 6;

    canvas.width = image.width;
    canvas.height = image.height;
    context.drawImage(image, 0, 0);

    const pixels = context.getImageData(0, row, image.width, 1).data;
    const colors = [];

    for (let i = 0; i < pixels.length; i += 4) {
        colors.push([pixels[i], pixels[i + 1], pixels[i + 2]]);
    }

    return colors;
}

function getPrecipitationKind(pixels, i) {
    return findClosestColor(pixels, i, radarColorKeys.type, radarColorKeys.matches.type);
}

function getPrecipitationStrength(pixels, i) {
    return findClosestColor(pixels, i, radarColorKeys.strength, radarColorKeys.matches.strength);
}

/* Finds the legend color closest to this pixel. Each answer is remembered,
   because a radar image only uses a few hundred different colors. */
function findClosestColor(pixels, i, keys, matches) {
    const red = pixels[i];
    const green = pixels[i + 1];
    const blue = pixels[i + 2];
    const colorId = (red << 16) | (green << 8) | blue;

    if (matches.has(colorId)) return matches.get(colorId);

    let closest = keys[0];
    let closestDistance = Infinity;

    for (const key of keys) {
        const distance = (key.rgb[0] - red) ** 2 + (key.rgb[1] - green) ** 2 + (key.rgb[2] - blue) ** 2;

        if (distance < closestDistance) {
            closest = key;
            closestDistance = distance;
        }
    }

    matches.set(colorId, closest.value);
    return closest.value;
}

/* The CeruSky color for a kind of precipitation at a strength, as [red, green, blue, alpha].
   Too weak to show returns null. */
function getRadarColor(kind, strength) {
    const scale = RADAR_COLORS[kind];
    let color = null;

    for (const [start, hex] of scale) {
        if (strength >= start) color = hex;
    }

    return color ? hexToRgba(color) : null;
}

function hexToRgba(hex) {
    const value = parseInt(hex.slice(1), 16);
    return [value >> 16, (value >> 8) & 255, value & 255, 255];
}

/* -------- Playing the frames -------- */

function showRadarFrame(index) {
    radarFrames[radarFrameIndex].layer.setOpacity(0);
    radarFrames[index].layer.setOpacity(RADAR_OPACITY);
    radarFrameIndex = index;

    radarTime.textContent = radarFrames[index].time.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

function playNextRadarFrame() {
    showRadarFrame((radarFrameIndex + 1) % radarFrames.length);

    const isNewestFrame = radarFrameIndex === radarFrames.length - 1;
    radarTimer = setTimeout(playNextRadarFrame, isNewestFrame ? LAST_FRAME_TIME : FRAME_TIME);
}

function startRadarPlayback() {
    radarIsPlaying = true;
    updatePlayButton();
    playNextRadarFrame();
}

function stopRadarPlayback() {
    radarIsPlaying = false;
    clearTimeout(radarTimer);
    updatePlayButton();
}

function toggleRadarPlayback() {
    if (radarIsPlaying) {
        stopRadarPlayback();
    } else {
        startRadarPlayback();
    }
}

function updatePlayButton() {
    radarPlayButton.textContent = radarIsPlaying ? "❚❚" : "▶";
    radarPlayButton.setAttribute("aria-label", radarIsPlaying ? "Pause radar" : "Play radar");
}

/* The backup: a single current image from OpenWeather */
function showOpenWeatherRadar() {
    L.tileLayer(getPrecipitationTileUrl(), {
        className: "PrecipitationLayer",
        maxZoom: 12,
        zIndex: 2,
    }).addTo(radarMap);
}

function showRadarMessage(message) {
    radarPlace.textContent = message;
}
