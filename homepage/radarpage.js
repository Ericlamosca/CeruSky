/* The full radar page. Opens on the city you were viewing, or your location,
   or the whole country if neither is available. radar.js does the drawing. */

const radarPageTitle = document.getElementById("radar-page-title");

/* The middle of the lower 48 states, for when there's no location */
const US_CENTER = { lat: 39.5, lon: -98.35, zoom: 4 };

async function openRadarPage() {
    const place = await findPageLocation();

    if (!place) {
        showRadar(US_CENTER.lat, US_CENTER.lon, null, US_CENTER.zoom);
        radarPlace.textContent = "Search for a city on the Today page to center the radar on it";
        return;
    }

    const label = getPlaceLabel(place);

    radarPageTitle.textContent = `Radar for ${label}`;
    showRadar(place.lat, place.lon, place.name);
}

openRadarPage();
