/* Every OpenWeather request on the page goes through this file.
   Later, these functions can call CeruSky's own API instead, so the key stays on the
   server and never reaches the browser. The rest of the page won't need to change. */

/* API_KEY comes from config.js, which stays off GitHub. See config.example.js. */
const WEATHER_API = "https://api.openweathermap.org";

async function requestJson(url, label) {
    const response = await fetch(url);

    if (!response.ok) throw new Error(`${label} request failed: ${response.status}`);
    return response.json();
}

/* Current conditions, in Fahrenheit */
function getCurrentWeather(latitude, longitude) {
    return requestJson(`${WEATHER_API}/data/2.5/weather?lat=${latitude}&lon=${longitude}&units=imperial&appid=${API_KEY}`, "Weather");
}

/* 5 days of forecasts, one every 3 hours, in Fahrenheit */
function getForecast(latitude, longitude) {
    return requestJson(`${WEATHER_API}/data/2.5/forecast?lat=${latitude}&lon=${longitude}&units=imperial&appid=${API_KEY}`, "Forecast");
}

/* The place at a point. Includes the state for US places. */
async function getPlaceAt(latitude, longitude) {
    const places = await requestJson(`${WEATHER_API}/geo/1.0/reverse?lat=${latitude}&lon=${longitude}&limit=1&appid=${API_KEY}`, "Reverse geocode");
    return places[0] ?? null;
}

/* Up to 5 places matching a name, like "Dallas" or "Dallas,TX,US" */
function getPlacesNamed(query) {
    return requestJson(`${WEATHER_API}/geo/1.0/direct?q=${encodeURIComponent(query)}&limit=5&appid=${API_KEY}`, "Place search");
}

/* The place for a US zip code, or null if there isn't one. This one has no state. */
async function getPlaceForZip(zipCode) {
    try {
        return await requestJson(`${WEATHER_API}/geo/1.0/zip?zip=${zipCode},US&appid=${API_KEY}`, "Zip search");
    } catch (error) {
        return null;
    }
}

/* Map tiles for the radar's backup layer */
function getPrecipitationTileUrl() {
    return `https://tile.openweathermap.org/map/precipitation_new/{z}/{x}/{y}.png?appid=${API_KEY}`;
}
