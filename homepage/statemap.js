/* Draws the state in CeruSky navy with a yellow dot on the city.
   Used when a place has no public domain photo. */

const MAP_WIDTH = 710;
const MAP_HEIGHT = 211;

/* Equal margins on both sides keep the state centered in the image */
const MAP_AREA = { left: 14, right: 696, top: 14, bottom: 197 };

function createStateMap(state, latitude, longitude, city) {
    const rings = STATE_SHAPES[state];

    if (!rings) return "";

    const project = createProjection(rings);
    const outline = rings.map((ring) => `M${ring.map((point) => project(point).join(" ")).join("L")}Z`).join("");
    const [dotX, dotY] = project([longitude, latitude]);

    return `
        <svg viewBox="0 0 ${MAP_WIDTH} ${MAP_HEIGHT}" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Map of ${state} showing ${city}">
            <path d="${outline}" fill="#12324A" fill-rule="evenodd"/>
            <circle cx="${dotX}" cy="${dotY}" r="6" fill="#F6C85F" stroke="#F7FBFC" stroke-width="2"/>
        </svg>
    `;
}

/* Fits the whole state inside MAP_AREA and returns a function that converts
   longitude and latitude to a position on the image. Longitude lines get closer
   together farther north, so x is squeezed by the state's middle latitude. */
function createProjection(rings) {
    const points = rings.flat();
    const longitudes = points.map(([longitude]) => longitude);
    const latitudes = points.map(([, latitude]) => latitude);
    const west = Math.min(...longitudes);
    const east = Math.max(...longitudes);
    const south = Math.min(...latitudes);
    const north = Math.max(...latitudes);

    const squeeze = Math.cos(((north + south) / 2) * Math.PI / 180);
    const stateWidth = (east - west) * squeeze;
    const stateHeight = north - south;
    const areaWidth = MAP_AREA.right - MAP_AREA.left;
    const areaHeight = MAP_AREA.bottom - MAP_AREA.top;
    const scale = Math.min(areaWidth / stateWidth, areaHeight / stateHeight);

    const offsetX = MAP_AREA.left + (areaWidth - stateWidth * scale) / 2;
    const offsetY = MAP_AREA.top + (areaHeight - stateHeight * scale) / 2;

    return ([longitude, latitude]) => [
        +(offsetX + (longitude - west) * squeeze * scale).toFixed(1),
        +(offsetY + (north - latitude) * scale).toFixed(1),
    ];
}
