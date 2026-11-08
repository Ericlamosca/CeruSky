/* Current Weather API pull*/

const liveweather = document.getElementById("liveweather");

/* Kept so the page can redraw when the °F / °C switch changes */
let pageWeather = null;

/* Opens on the city you were viewing earlier in this visit, like after coming back from the Radar page.
   Otherwise it asks for your device's location. */
onload = function () {
    const viewed = getViewedPlace();

    if (viewed) {
        loadLocation(viewed.lat, viewed.lon, viewed).catch((error) => {
            liveweather.innerHTML = "Weather unavailable";
            console.error(error);
        });
        return;
    }

    navigator.geolocation.getCurrentPosition(onLocationFound, onLocationError);
};

/* OpenWeather has no wind condition, so windy is based on wind speed. Rain, snow, storms and mist keep their own icons. */
const WINDY_SPEED_MPH = 20;
const CALM_SKY_CONDITIONS = ["01", "02", "03", "04"];

function getWeatherDisplay(weather, windSpeed) {
    const isWindy = windSpeed >= WINDY_SPEED_MPH && CALM_SKY_CONDITIONS.includes(weather.icon.slice(0, 2));

    /* Just the wind lines, day or night, with no clouds */
    if (isWindy) {
        return { iconUrl: "../images/weather/wind.svg", condition: "Windy" };
    }

    return {
        iconUrl: getWeatherIconUrl(weather.icon),
        condition: weather.main,
    };
}

function getWindDirection(degrees) {
    const directions = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
    return directions[Math.round(degrees / 45) % 8] ?? "";
}

function onLocationFound(position) {
    loadLocation(position.coords.latitude, position.coords.longitude)
        .catch((error) => {
            liveweather.innerHTML = "Weather unavailable";
            console.error(error);
        });
}

/* Goes up by one for each new location. A slow request from an earlier
   location checks this, so it can't draw over the newer one. */
let locationRequestId = 0;

/* Fills the whole page for one location. Your device's location and the search bar both use this.
   A searched place already has its name and state, so it skips the reverse lookup. */
async function loadLocation(latitude, longitude, searchedPlace = null) {
    const requestId = ++locationRequestId;

    const [weatherData, place] = await Promise.all([
        getCurrentWeather(latitude, longitude),
        searchedPlace ?? getPlaceAt(latitude, longitude),
    ]);

    if (requestId !== locationRequestId) return;

    /* OpenWeather names the nearest weather station's town, which may not be the place you searched */
    if (searchedPlace) {
        weatherData.name = searchedPlace.name;
    }

    pageWeather = { weatherData, place };
    pageForecast = null;
    setCurrentPlace({
        name: weatherData.name,
        state: place?.state,
        country: weatherData.sys?.country ?? place?.country,
        lat: latitude,
        lon: longitude,
    });
    showLiveWeather(weatherData, place);
    loadForecast(latitude, longitude, weatherData, place);
    showRadar(latitude, longitude, weatherData.name);
    showWeatherAlerts(latitude, longitude);
    showAirQuality(latitude, longitude);
}

function isCurrentLocation(requestId) {
    return requestId === locationRequestId;
}

function showLiveWeather(weatherData, place) {
    const { temp, feels_like, temp_max, temp_min } = weatherData.main;
    const { speed, deg } = weatherData.wind;
    const country = weatherData.sys?.country ? getCountryName(weatherData.sys.country) : "";
    const region = [place?.state, country].filter(Boolean).join(", ");
    const { iconUrl, condition } = getWeatherDisplay(weatherData.weather[0], speed);

    liveweather.innerHTML = `
        <p class="LiveCity"><svg class="Icon"><use href="#icon-pin"/></svg>${weatherData.name}</p>
        <p class="LiveRegion">${region}</p>
        <img class="WeatherIcon" src="${iconUrl}" alt="${weatherData.weather[0].description}">
        <p class="LiveTemp">${formatTemperature(temp)}<span>${temperatureUnit}</span></p>
        <p class="LiveCondition">${condition}</p>
        <p class="LiveDetails">Feels like ${formatTemperature(feels_like)} · H ${formatTemperature(temp_max)} / L ${formatTemperature(temp_min)}</p>
        <p class="LiveWind"><img class="LiveWindIcon" src="../images/weather/wind-small.svg" alt="">${getWindDirection(deg)} ${Math.round(speed)} mph</p>
    `;
}

/* The °F / °C switch announces a change. This redraws the homepage from the data it already has. */
document.addEventListener("unitchange", () => {
    if (pageCities.length > 0) {
        showCityWeather();
    }

    if (!pageWeather) return;

    showLiveWeather(pageWeather.weatherData, pageWeather.place);
    updateHeading(pageWeather.weatherData, pageWeather.place);

    if (pageForecast) {
        showForecast(pageForecast, pageWeather.weatherData);
    }
});

function onLocationError() {
    liveweather.innerHTML = "Location unavailable";
    showForecastMessage("Allow location access to see your forecast.");
    showRadarMessage("Allow location access to see radar");
}
