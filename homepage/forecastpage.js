/* The 7-day forecast page. Data comes from Open-Meteo, because OpenWeather's free plan only goes 5 days.
   Each day shows its conditions, low and high, a bar showing where those fall in the week's range,
   the chance of precipitation, and the strongest wind. */

const weekTitle = document.getElementById("week-title");
const weekPlace = document.getElementById("week-place");
const weekList = document.getElementById("week-list");

/* Kept so the page can redraw when the °F / °C switch changes */
let weekData = null;

/* Open-Meteo uses the World Meteorological Organization's weather codes.
   Each one gets a description and the closest icon from images/weather. */
const WEATHER_CODES = [
    { codes: [0], text: "Clear sky", icon: "01d" },
    { codes: [1], text: "Mainly clear", icon: "02d" },
    { codes: [2], text: "Partly cloudy", icon: "03d" },
    { codes: [3], text: "Overcast", icon: "04d" },
    { codes: [45, 48], text: "Fog", icon: "50d" },
    { codes: [51, 53, 55], text: "Drizzle", icon: "09d" },
    { codes: [56, 57], text: "Freezing drizzle", icon: "09d" },
    { codes: [61, 63], text: "Rain", icon: "10d" },
    { codes: [65], text: "Heavy rain", icon: "10d" },
    { codes: [66, 67], text: "Freezing rain", icon: "10d" },
    { codes: [71, 73, 77], text: "Snow", icon: "13d" },
    { codes: [75], text: "Heavy snow", icon: "13d" },
    { codes: [80, 81], text: "Rain showers", icon: "09d" },
    { codes: [82], text: "Heavy showers", icon: "09d" },
    { codes: [85, 86], text: "Snow showers", icon: "13d" },
    { codes: [95], text: "Thunderstorms", icon: "11d" },
    { codes: [96, 99], text: "Thunderstorms with hail", icon: "11d" },
];

function getWeatherCodeInfo(code) {
    return WEATHER_CODES.find((item) => item.codes.includes(code)) ?? { text: "Mixed conditions", icon: "03d" };
}

async function openForecastPage() {
    const place = await findPageLocation();

    if (!place) {
        weekPlace.textContent = "Search for a city on the Today page, or allow location access, to see the forecast.";
        weekList.replaceChildren();
        return;
    }

    weekTitle.textContent = "7-Day Forecast";
    weekPlace.textContent = getPlaceLabel(place);

    try {
        weekData = await getSevenDayForecast(place.lat, place.lon);
        showWeek();
    } catch (error) {
        weekList.textContent = "The forecast is unavailable right now.";
        console.error(error);
    }
}

function showWeek() {
    const days = weekData.daily;
    const weekLow = Math.min(...days.temperature_2m_min);
    const weekHigh = Math.max(...days.temperature_2m_max);

    weekList.replaceChildren(...days.time.map((date, index) => createDayRow({
        date,
        index,
        code: days.weather_code[index],
        low: days.temperature_2m_min[index],
        high: days.temperature_2m_max[index],
        rainChance: days.precipitation_probability_max[index],
        wind: days.wind_speed_10m_max[index],
        weekLow,
        weekHigh,
    })));
}

/* Built with textContent and DOM elements, the same as the news links */
function createDayRow(day) {
    const info = getWeatherCodeInfo(day.code);
    const row = document.createElement("li");

    row.className = "DayRow";
    row.innerHTML = `
        <div class="DayName"><strong></strong><span class="Muted"></span></div>
        <img class="DayIcon" alt="">
        <p class="DayCondition"></p>
        <p class="DayStat DayRain" title="Chance of precipitation"><svg class="Icon"><use href="#icon-droplet"/></svg><span></span></p>
        <p class="DayStat DayWind" title="Strongest wind"><svg class="Icon"><use href="#icon-wind"/></svg><span></span></p>
        <div class="DayTemps">
            <span class="DayLow"></span>
            <span class="TempRange"><i></i></span>
            <span class="DayHigh"></span>
        </div>
    `;

    const [dayName, dateText] = getDayLabels(day.date, day.index);

    row.querySelector(".DayName strong").textContent = dayName;
    row.querySelector(".DayName .Muted").textContent = dateText;
    row.querySelector(".DayIcon").src = getWeatherIconUrl(info.icon);
    row.querySelector(".DayIcon").alt = info.text;
    row.querySelector(".DayCondition").textContent = info.text;
    row.querySelector(".DayRain span").textContent = `${day.rainChance ?? 0}%`;
    row.querySelector(".DayWind span").textContent = `${Math.round(day.wind)} mph`;
    row.querySelector(".DayLow").textContent = formatTemperature(day.low);
    row.querySelector(".DayHigh").textContent = formatTemperature(day.high);

    /* The bar shows where this day's low and high fall within the whole week's range */
    const span = Math.max(day.weekHigh - day.weekLow, 1);
    const bar = row.querySelector(".TempRange i");
    bar.style.left = `${((day.low - day.weekLow) / span) * 100}%`;
    bar.style.right = `${((day.weekHigh - day.high) / span) * 100}%`;

    return row;
}

/* "Today", "Tomorrow", then weekday names. Dates come as "2026-11-08" in the city's own time zone. */
function getDayLabels(dateText, index) {
    const date = new Date(`${dateText}T12:00:00`);
    const shortDate = date.toLocaleDateString("en-US", { month: "short", day: "numeric" });

    if (index === 0) return ["Today", shortDate];
    if (index === 1) return ["Tomorrow", shortDate];
    return [date.toLocaleDateString("en-US", { weekday: "long" }), shortDate];
}

document.addEventListener("unitchange", () => {
    if (weekData) showWeek();
});

openForecastPage();
