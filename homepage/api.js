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

/* -------- Free services that need no key -------- */

const OPEN_METEO_FORECAST_API = "https://api.open-meteo.com/v1/forecast";
const OPEN_METEO_AIR_API = "https://air-quality-api.open-meteo.com/v1/air-quality";
const NWS_API = "https://api.weather.gov";

/* 7 days of highs, lows, and conditions from Open-Meteo, in the city's own time zone.
   OpenWeather's free plan only goes 5 days. */
function getSevenDayForecast(latitude, longitude) {
    const fields = "weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,wind_speed_10m_max,sunrise,sunset";
    return requestJson(`${OPEN_METEO_FORECAST_API}?latitude=${latitude}&longitude=${longitude}&daily=${fields}`
        + "&temperature_unit=fahrenheit&wind_speed_unit=mph&timezone=auto&forecast_days=7", "7-day forecast");
}

/* Current temperatures (°F) for several points in one request. The backup radar uses these to tell
   snow from rain. Returns one result per point, each with its latitude, longitude, and current temperature. */
async function getTemperatures(latitudes, longitudes) {
    const data = await requestJson(`${OPEN_METEO_FORECAST_API}?latitude=${latitudes.join(",")}&longitude=${longitudes.join(",")}`
        + "&current=temperature_2m&temperature_unit=fahrenheit", "Temperatures");
    return Array.isArray(data) ? data : [data];
}

/* Current air quality on the US AQI scale (0 to 500), plus the main pollutants */
function getAirQuality(latitude, longitude) {
    return requestJson(`${OPEN_METEO_AIR_API}?latitude=${latitude}&longitude=${longitude}&current=us_aqi,pm2_5,pm10,ozone&timezone=auto`, "Air quality");
}

/* Active National Weather Service alerts for a point, like warnings and watches. US only. */
async function getWeatherAlerts(latitude, longitude) {
    const data = await requestJson(`${NWS_API}/alerts/active?point=${latitude.toFixed(4)},${longitude.toFixed(4)}`, "Weather alerts");
    return data.features.map((feature) => feature.properties);
}
