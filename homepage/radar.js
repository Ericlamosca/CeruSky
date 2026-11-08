/* Radar card. A Leaflet map centered on the city, with the last hour of radar playing on top.
   leftpanel.js calls showRadar() once it knows the location. Both radars below are free, need no key,
   and cover the lower 48 states.

   Main radar: NOAA's National Weather Service MRMS system. It's the only free radar that tells
   rain, snow, and hail apart.
   Backup radar: the same National Weather Service radar network, from the Iowa Environmental Mesonet
   at Iowa State University. It's very reliable but only shows how strong the precipitation is,
   so rain and snow look alike. It loads first because it's quick, then the main radar replaces it
   once ready. If NOAA's MRMS can't load, the backup just keeps playing.

   NOAA has two separate radar maps:
   - how strong the precipitation is (reflectivity, measured in dBZ)
   - what kind it is (rain, snow, or hail)
   Each tile here loads both, then colors every pixel like a TV weather radar:
   rain in green to red, snow in blues, and hail in pink. */

const radarPlace = document.getElementById("radar-place");
const radarPlayButton = document.getElementById("radar-play");
const radarTime = document.getElementById("radar-time");
const radarMapView = document.getElementById("radar-map-view");
const radarSlider = document.getElementById("radar-slider"); // Only on the full radar page

/* The homepage card uses these. The full radar page changes them with
   data-zoom and data-frames on its map, for example data-frames="13" for 2 hours. */
const RADAR_ZOOM = Number(radarMapView.dataset.zoom ?? 8);
const RADAR_FRAME_COUNT = Number(radarMapView.dataset.frames ?? 7); // 7 frames, 10 minutes apart, is the last hour
const RADAR_FRAME_GAP = 10; // Minutes between frames
const RADAR_OPACITY = 0.8;
const FRAME_TIME = 700; // Milliseconds each frame stays on screen
const LAST_FRAME_TIME = 1800; // Pause on the newest frame before the loop restarts

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

/* Centers the map on a place. Without a city name, no marker is shown,
   like when the full radar page has no location and shows the whole country. */
function showRadar(latitude, longitude, city, zoom = RADAR_ZOOM) {
    radarPlace.textContent = isInRadarCoverage(latitude, longitude)
        ? "A wider view of your area"
        : "Radar covers the lower 48 US states only";

    if (!radarMap) {
        createRadarMap();
        radarMap.setView([latitude, longitude], zoom);
        loadRadarFrames();
    } else {
        radarMap.setView([latitude, longitude], zoom);
    }

    if (radarMarker) {
        radarMarker.remove();
        radarMarker = null;
    }

    if (!city) return;

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
        /* Esri's required credit for these map tiles. OpenStreetMap's license requires its part too. */
        attribution: 'Map: Esri, HERE, Garmin, &copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a> contributors, and the GIS user community',
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

    /* Dragging the slider pauses the loop and shows that frame */
    radarSlider?.addEventListener("input", () => {
        stopRadarPlayback();
        showRadarFrame(Number(radarSlider.value));
    });
}

/* NOAA's free server sometimes fails for a moment. A failed load is tried again after
   3 seconds, then after 8 more. The backup keeps playing the whole time. */
const RADAR_RETRY_WAITS = [3000, 8000];

/* If NOAA still hasn't answered, it's checked again this often, and the map switches to it once it answers */
const MAIN_RADAR_RECHECK_TIME = 2 * 60 * 1000;

/* The main radar replaces the backup once its newest frame has finished drawing,
   or after this long, so a slow tile can't hold up the switch forever */
const MAIN_RADAR_SWAP_WAIT = 15000;

function loadMainRadarSetup() {
    return Promise.all([getRadarTimes(), loadRadarColorKeys()]);
}

async function getRadarSetup() {
    for (const wait of RADAR_RETRY_WAITS) {
        try {
            return await loadMainRadarSetup();
        } catch (error) {
            console.error(error);
            await new Promise((resolve) => setTimeout(resolve, wait));
        }
    }

    return loadMainRadarSetup();
}

/* The backup radar starts right away, because it's quick to load, so there's something on the map fast.
   The main radar loads at the same time, hidden, and takes over once it's ready.
   Each frame is its own map layer. They all load up front, hidden, so the loop plays smoothly. */
async function loadRadarFrames() {
    const backupReady = showBackupRadar();

    try {
        const setup = await getRadarSetup();
        await backupReady;
        swapToMainRadar(setup);
    } catch (error) {
        console.error(error);
        await backupReady;
        scheduleMainRadarCheck();
    }
}

/* Builds the main radar's frames hidden underneath the backup. Once the newest one has drawn,
   the backup is removed and the main radar starts playing, so the map never goes blank.
   If none of the newest frame's map pieces load, NOAA isn't really working: the main radar is
   thrown away, the backup stays, and NOAA is checked again later. */
function swapToMainRadar([times, colorKeys]) {
    radarColorKeys = colorKeys;

    /* Only the newest frame loads first, so its map pieces aren't stuck waiting behind the older frames'.
       The older frames load after the swap, while the newest one is already showing. */
    const newestTime = times[times.length - 1];
    const newestLayer = createRadarFrameLayer(newestTime);
    let piecesLoaded = 0;
    let decided = false;

    const decide = () => {
        if (decided) return;
        decided = true;

        if (piecesLoaded === 0) {
            newestLayer.remove();
            scheduleMainRadarCheck();
            return;
        }

        const olderFrames = times.slice(0, -1).map((time) => ({ time, layer: createRadarFrameLayer(time) }));

        clearRadarFrames();
        restoreMainLegend();
        startRadarFrames([...olderFrames, { time: newestTime, layer: newestLayer }]);
    };

    newestLayer.on("tileload", () => piecesLoaded++);
    /* Waits until Leaflet has finished handling the "load" event before deciding.
       Removing the layer in the middle of Leaflet's own handling makes Leaflet error. */
    newestLayer.once("load", () => setTimeout(decide, 0));
    setTimeout(decide, MAIN_RADAR_SWAP_WAIT);
}

/* Tries NOAA again in a couple of minutes. If it answers, the backup is swapped out for the main radar. */
function scheduleMainRadarCheck() {
    setTimeout(async () => {
        try {
            swapToMainRadar(await loadMainRadarSetup());
        } catch (error) {
            console.error(error);
            scheduleMainRadarCheck();
        }
    }, MAIN_RADAR_RECHECK_TIME);
}

function clearRadarFrames() {
    stopRadarPlayback();
    radarFrames.forEach((frame) => frame.layer.remove());
    radarFrames = [];
}

/* Shows the newest frame, sets up the slider, and starts the loop. Both radars use this. */
function startRadarFrames(frames) {
    radarFrames = frames;
    radarFrameIndex = radarFrames.length - 1;

    if (radarSlider) {
        radarSlider.max = radarFrames.length - 1;
        radarSlider.disabled = false;
    }

    showRadarFrame(radarFrameIndex);
    radarPlayButton.hidden = false;

    /* People who ask their device to reduce motion start on the newest frame, paused */
    if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        startRadarPlayback();
    } else {
        updatePlayButton();
    }
}

/* MRMS makes a new radar image every 2 minutes, and the newest one is usually ready about 6 minutes later */
const RADAR_DELAY_MINUTES = 6;

/* The frame times, oldest first, 10 minutes apart. NOAA's list of available times is used when it loads.
   If it doesn't, the times are estimated, which works because NOAA's map server sends the
   nearest radar image to whatever time is asked for. */
async function getRadarTimes() {
    try {
        return await loadRadarTimeList();
    } catch (error) {
        console.error(error);
        return estimateRadarTimes();
    }
}

function estimateRadarTimes() {
    const twoMinutes = 2 * 60 * 1000;
    const newest = Math.floor((Date.now() - RADAR_DELAY_MINUTES * 60 * 1000) / twoMinutes) * twoMinutes;
    const times = [];

    for (let step = RADAR_FRAME_COUNT - 1; step >= 0; step--) {
        times.push(new Date(newest - step * RADAR_FRAME_GAP * 60 * 1000));
    }

    return times;
}

/* NOAA lists every radar time it has, about every 2 minutes for the last 2 hours.
   This picks the newest one and older ones 10 minutes apart, oldest first. */
async function loadRadarTimeList() {
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

/* A map layer that draws one radar frame. Leaflet asks it for one square tile at a time.
   A tile that fails to load gets one more try a second later, so a brief NOAA hiccup
   doesn't leave a blank square in the radar. */
const TILE_RETRY_TIME = 1000;

const RadarFrameLayer = L.GridLayer.extend({
    createTile(coords, done) {
        const tile = document.createElement("canvas");
        const size = this.getTileSize();
        const bounds = getTileBounds(this._map, coords, size);
        const time = this.options.time;

        tile.width = size.x;
        tile.height = size.y;

        drawRadarTile(tile, bounds, time)
            .catch(() => new Promise((resolve) => setTimeout(resolve, TILE_RETRY_TIME)).then(() => drawRadarTile(tile, bounds, time)))
            /* A frame can be removed from the map while its tiles are still loading, like when the
               backup is swapped out. Leaflet errors if a removed layer reports a finished tile, so those are skipped. */
            .then(() => this._map && done(null, tile))
            .catch((error) => this._map && done(error, tile));

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
   That way, every color in a radar image can be matched back to a strength or a type.
   Copies of the two legends are saved in images/radar, because loading them from NOAA
   sometimes fails for a moment. If NOAA ever changes its colors, save the new legends there
   from these addresses (NOAA data is public domain):
   https://opengeo.ncep.noaa.gov/geoserver/conus/ows?service=WMS&version=1.3.0&request=GetLegendGraphic&format=image/png&layer=conus_bref_qcd
   https://opengeo.ncep.noaa.gov/geoserver/conus/ows?service=WMS&version=1.3.0&request=GetLegendGraphic&format=image/png&layer=conus_pcpn_typ */
const STRENGTH_LEGEND_IMAGE = "../images/radar/noaa-strength-legend.png";
const TYPE_LEGEND_IMAGE = "../images/radar/noaa-type-legend.png";

async function loadRadarColorKeys() {
    const [strengthLegend, typeLegend] = await Promise.all([
        loadImage(STRENGTH_LEGEND_IMAGE),
        loadImage(TYPE_LEGEND_IMAGE),
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

/* The color bar is the top part of each legend image, above the labels */
function readLegendRow(image, row = 6) {
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");

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
    return getColorFromScale(RADAR_COLORS[kind], strength);
}

/* The color for a strength on a scale of [starting dBZ, color] pairs, or null if it's too weak to show */
function getColorFromScale(scale, strength) {
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

    if (radarSlider) {
        radarSlider.value = index;
    }
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

/* -------- Backup radar: Iowa Environmental Mesonet -------- */

const BACKUP_RADAR_URL = "https://mesonet.agron.iastate.edu/cache/tile.py/1.0.0/nexrad-n0q-900913";
const BACKUP_RADAR_TIME_URL = "https://mesonet.agron.iastate.edu/data/gis/images/4326/USCOMP/n0q_0.json";
const BACKUP_RADAR_OLDEST = 50; // Minutes back. The IEM keeps frames every 5 minutes, up to 50 minutes old.

/* The IEM's 256 radar colors, saved from its own radar image. Pixel x is the color for -32 + x * 0.5 dBZ.
   The backup is repainted in CeruSky's rain colors using this, so it matches the main radar. */
const BACKUP_PALETTE_IMAGE = "../images/radar/iem-n0q-palette.png";
const BACKUP_PALETTE_START = -32;
const BACKUP_PALETTE_STEP = 0.5;

/* The backup's data doesn't say whether it's rain or snow, so snow is estimated from temperature:
   precipitation where it's 33°F or colder is shown as snow. Temperatures come from a grid of
   points across the map (Open-Meteo), and each part of the map uses the closest point. */
const SNOW_TEMPERATURE = 33;
/* One temperature point for about every 200 pixels of map, from 4 x 4 (16 points) on the small
   homepage map up to 8 x 8 (64) on the big Radar page, so snow lines are just as detailed on both */
const TEMPERATURE_POINT_SPACING = 200;
const TEMPERATURE_BLOCK = 16; // Pixels. Each 16 x 16 block of a tile uses one temperature.

/* Both scales start at 10 dBZ. Lower than that, the backup's data includes ground clutter. */
const BACKUP_COLORS = {
    rain: [[10, "#9BE08F"], ...RADAR_COLORS.rain.slice(1)],
    snow: [[10, "#C4E4FA"], ...RADAR_COLORS.snow.slice(2)],
};

let backupColorKey = null;
let temperatureGrid = null;

/* The last 50 minutes of National Weather Service radar, 10 minutes apart.
   The IEM names older frames by how many minutes ago they were, like "-m20m" for 20 minutes ago. */
async function showBackupRadar() {
    const [newestTime] = await Promise.all([getBackupRadarTime(), loadBackupColorKey(), loadTemperatureGrid()]);
    const minutesAgo = [];

    watchForFarMoves();

    for (let minutes = 0; minutes <= BACKUP_RADAR_OLDEST && minutesAgo.length < RADAR_FRAME_COUNT; minutes += RADAR_FRAME_GAP) {
        minutesAgo.unshift(minutes);
    }

    startRadarFrames(minutesAgo.map((minutes) => ({
        time: new Date(newestTime - minutes * 60 * 1000),
        layer: createBackupFrameLayer(minutes),
    })));

    showBackupLegend();
}

/* When the IEM's newest frame was made. If that can't load, the current time is close enough. */
async function getBackupRadarTime() {
    try {
        const response = await fetch(BACKUP_RADAR_TIME_URL);
        const data = await response.json();
        return new Date(data.meta.valid);
    } catch (error) {
        console.error(error);
        return new Date();
    }
}

/* Gets temperatures for a grid of points covering the map and a wide area around it.
   If they can't load, the backup shows everything in the rain colors and the key says so. */
async function loadTemperatureGrid() {
    try {
        const area = radarMap.getBounds().pad(0.5);
        const latitudes = [];
        const longitudes = [];
        const mapSize = radarMap.getSize();
        const gridSize = Math.min(8, Math.max(4, Math.round(Math.max(mapSize.x, mapSize.y) / TEMPERATURE_POINT_SPACING)));

        for (let row = 0; row < gridSize; row++) {
            for (let column = 0; column < gridSize; column++) {
                latitudes.push((area.getSouth() + (row + 0.5) * (area.getNorth() - area.getSouth()) / gridSize).toFixed(2));
                longitudes.push((area.getWest() + (column + 0.5) * (area.getEast() - area.getWest()) / gridSize).toFixed(2));
            }
        }

        const results = await getTemperatures(latitudes, longitudes);

        temperatureGrid = {
            area,
            points: results.map((result) => ({ lat: result.latitude, lon: result.longitude, temperature: result.current.temperature_2m })),
        };
    } catch (error) {
        console.error(error);
        temperatureGrid = null;
    }
}

/* If the map moves far from the area the temperatures cover, new ones are loaded and the backup is redrawn */
let watchingForFarMoves = false;

function watchForFarMoves() {
    if (watchingForFarMoves) return;
    watchingForFarMoves = true;

    radarMap.on("moveend", async () => {
        const backupShowing = radarFrames.length > 0 && radarFrames[0].layer instanceof BackupFrameLayer;

        if (!backupShowing || (temperatureGrid && temperatureGrid.area.contains(radarMap.getCenter()))) return;

        await loadTemperatureGrid();
        radarFrames.forEach((frame) => frame.layer.redraw());
        showBackupLegend();
    });
}

/* Rain or snow for a spot on the map, from the closest temperature */
function getBackupKind(latLng) {
    if (!temperatureGrid) return "rain";

    let closest = temperatureGrid.points[0];
    let closestDistance = Infinity;

    for (const point of temperatureGrid.points) {
        const distance = (point.lat - latLng.lat) ** 2 + (point.lon - latLng.lng) ** 2;

        if (distance < closestDistance) {
            closest = point;
            closestDistance = distance;
        }
    }

    return closest.temperature <= SNOW_TEMPERATURE ? "snow" : "rain";
}

/* Reads the IEM's color list. If it can't load, the backup just shows the IEM's own colors. */
async function loadBackupColorKey() {
    try {
        const image = await loadImage(BACKUP_PALETTE_IMAGE);
        const colors = readLegendRow(image, 0);

        /* Color 0 means "no data", so it's skipped */
        backupColorKey = {
            keys: colors.slice(1).map((rgb, index) => ({ rgb, value: BACKUP_PALETTE_START + (index + 1) * BACKUP_PALETTE_STEP })),
            matches: new Map(),
        };
    } catch (error) {
        console.error(error);
        backupColorKey = null;
    }
}

const BACKUP_ATTRIBUTION = 'Radar: <a href="https://mesonet.agron.iastate.edu/" target="_blank" rel="noopener noreferrer">Iowa Environmental Mesonet</a>, Iowa State University (NWS NEXRAD)';

/* A backup frame repainted in CeruSky's colors, one tile at a time, like the main radar */
const BackupFrameLayer = L.GridLayer.extend({
    createTile(coords, done) {
        const tile = document.createElement("canvas");
        const size = this.getTileSize();
        const url = this.options.tileUrl.replace("{z}", coords.z).replace("{x}", coords.x).replace("{y}", coords.y);

        tile.width = size.x;
        tile.height = size.y;

        drawBackupTile(tile, url, coords)
            .catch(() => new Promise((resolve) => setTimeout(resolve, TILE_RETRY_TIME)).then(() => drawBackupTile(tile, url, coords)))
            /* A frame can be removed from the map while its tiles are still loading, like when the
               backup is swapped out. Leaflet errors if a removed layer reports a finished tile, so those are skipped. */
            .then(() => this._map && done(null, tile))
            .catch((error) => this._map && done(error, tile));

        return tile;
    },
});

function createBackupFrameLayer(minutesAgo) {
    const suffix = minutesAgo === 0 ? "" : `-m${String(minutesAgo).padStart(2, "0")}m`;
    const tileUrl = `${BACKUP_RADAR_URL}${suffix}/{z}/{x}/{y}.png`;
    const options = { opacity: 0, maxZoom: 12, zIndex: 2, keepBuffer: 0, updateWhenIdle: true, attribution: BACKUP_ATTRIBUTION };

    if (!backupColorKey) {
        return L.tileLayer(tileUrl, options).addTo(radarMap);
    }

    return new BackupFrameLayer({ ...options, tileUrl }).addTo(radarMap);
}

/* Turns each IEM color back into a strength, then paints it with the rain or snow colors,
   depending on the temperature there */
async function drawBackupTile(tile, url, coords) {
    const image = await loadImage(url);
    const context = tile.getContext("2d", { willReadFrequently: true });
    const pixels = readPixels(context, image);
    const output = context.createImageData(tile.width, tile.height);
    const kinds = getBlockKinds(coords, tile.width);

    for (let i = 0; i < output.data.length; i += 4) {
        if (pixels[i + 3] < 128) continue;

        const pixel = i / 4;
        const x = pixel % tile.width;
        const y = Math.floor(pixel / tile.width);
        const kind = kinds[Math.floor(y / TEMPERATURE_BLOCK)][Math.floor(x / TEMPERATURE_BLOCK)];

        const strength = findClosestColor(pixels, i, backupColorKey.keys, backupColorKey.matches);
        const color = getColorFromScale(BACKUP_COLORS[kind], strength);

        if (color) output.data.set(color, i);
    }

    context.putImageData(output, 0, 0);
}

/* Rain or snow for each 16 x 16 block of a tile, using the temperature at the middle of the block */
function getBlockKinds(coords, size) {
    const blocks = size / TEMPERATURE_BLOCK;
    const kinds = [];

    for (let row = 0; row < blocks; row++) {
        kinds.push([]);

        for (let column = 0; column < blocks; column++) {
            const point = L.point(coords.x * size + (column + 0.5) * TEMPERATURE_BLOCK, coords.y * size + (row + 0.5) * TEMPERATURE_BLOCK);
            kinds[row].push(getBackupKind(radarMap.unproject(point, coords.z)));
        }
    }

    return kinds;
}

/* The main radar's key and slider label, saved while the backup is showing so they can be put back */
let mainLegendHtml = null;
let mainSliderLabel = null;

/* The backup's key. With temperatures: Rain and Snow, noting that snow is estimated from temperature.
   Without them: "Rain or snow". If the backup is showing the IEM's own colors, the key shows those. */
function showBackupLegend() {
    const legend = document.querySelector(".RadarLegend");
    const sliderLabel = document.querySelector("label[for='radar-slider']");

    if (mainLegendHtml === null) {
        mainLegendHtml = legend?.innerHTML ?? null;
        mainSliderLabel = sliderLabel?.textContent ?? null;
    }

    if (legend) {
        const note = document.createElement("span");
        note.className = "LegendNote";

        if (!backupColorKey) {
            note.textContent = "Backup radar: can't tell rain from snow";
            legend.replaceChildren(createLegendItem("Light to heavy", "BackupScale"), note);
        } else if (temperatureGrid) {
            note.textContent = "Backup radar: snow estimated from temperature";
            legend.replaceChildren(createLegendItem("Rain", "RainScale"), createLegendItem("Snow", "SnowScale"), note);
        } else {
            note.textContent = "Backup radar: can't tell rain from snow";
            legend.replaceChildren(createLegendItem("Rain or snow", "RainScale"), note);
        }
    }

    if (sliderLabel) {
        sliderLabel.textContent = "Past 50 minutes";
    }
}

function createLegendItem(label, scaleClass) {
    const item = document.createElement("span");
    const scale = document.createElement("i");

    item.className = "LegendItem";
    scale.className = `LegendScale ${scaleClass}`;
    item.append(label, scale);
    return item;
}

function restoreMainLegend() {
    const legend = document.querySelector(".RadarLegend");
    const sliderLabel = document.querySelector("label[for='radar-slider']");

    if (legend && mainLegendHtml !== null) legend.innerHTML = mainLegendHtml;
    if (sliderLabel && mainSliderLabel !== null) sliderLabel.textContent = mainSliderLabel;

    mainLegendHtml = null;
    mainSliderLabel = null;
}

function showRadarMessage(message) {
    radarPlace.textContent = message;
}
