/* Current weather in major US cities for the third card, from OpenWeather.
   Clicking a city loads the whole page for it, the same as searching for it. */

const cityWeatherList = document.getElementById("city-weather");

const MAJOR_CITIES = [
    { name: "New York", state: "New York", latitude: 40.71, longitude: -74.01 },
    { name: "Los Angeles", state: "California", latitude: 34.05, longitude: -118.24 },
    { name: "Chicago", state: "Illinois", latitude: 41.88, longitude: -87.63 },
    { name: "Houston", state: "Texas", latitude: 29.76, longitude: -95.37 },
    { name: "Miami", state: "Florida", latitude: 25.76, longitude: -80.19 },
    { name: "Seattle", state: "Washington", latitude: 47.61, longitude: -122.33 },
];

/* Kept so the list can redraw when the °F / °C switch changes */
let pageCities = [];

function loadCityWeather() {
    Promise.all(MAJOR_CITIES.map(loadOneCity))
        .then((cities) => {
            pageCities = cities;
            showCityWeather();
        })
        .catch((error) => {
            cityWeatherList.textContent = "City weather is unavailable right now.";
            console.error(error);
        });
}

function loadOneCity(city) {
    return getCurrentWeather(city.latitude, city.longitude)
        .then((data) => ({ ...city, temperature: data.main.temp, weather: data.weather[0] }));
}

function showCityWeather() {
    cityWeatherList.innerHTML = pageCities.map((city, index) => `
        <button type="button" class="CityWeather" data-city-index="${index}" aria-label="Show the weather for ${city.name}, ${city.state}">
            ${getIconHtml(city.weather)}
            <span class="CityWeatherName">${city.name}</span>
            <span class="CityWeatherTemp">${formatTemperature(city.temperature)}</span>
        </button>
    `).join("");
}

/* The list sits at the bottom of the page, so it scrolls back up to show the new city */
function openMajorCity(city) {
    const place = { name: city.name, state: city.state, country: "US", lat: city.latitude, lon: city.longitude };
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    window.scrollTo({ top: 0, behavior: reduceMotion ? "auto" : "smooth" });

    loadLocation(place.lat, place.lon, place).catch((error) => {
        showSearchMessage(`Couldn't load ${city.name}. Please try again.`);
        console.error(error);
    });
}

/* One listener for the whole list, since the buttons are redrawn when the units change */
cityWeatherList.addEventListener("click", (event) => {
    const button = event.target.closest(".CityWeather");

    if (button) {
        openMajorCity(pageCities[button.dataset.cityIndex]);
    }
});

loadCityWeather();
