/* Air quality, shown in the weather card in the left panel, with the other current conditions.
   Uses the US AQI scale (0 to 500) from Open-Meteo, with the EPA's categories, colors, and advice.
   leftpanel.js calls showAirQuality() each time a city loads. */

const airQualityBox = document.getElementById("air-quality");
const aqiValue = document.getElementById("aqi-value");
const aqiCategory = document.getElementById("aqi-category");
const aqiAdvice = document.getElementById("aqi-advice");
const aqiMarker = document.getElementById("aqi-marker");

/* The EPA's six categories. Each one runs up to "top". */
const AQI_LEVELS = [
    { top: 50, name: "Good", color: "#3FB950", advice: "Air quality is good. A great time to be outside." },
    { top: 100, name: "Moderate", color: "#E3B505", advice: "Acceptable for most people. Very sensitive people may want to take it easy outdoors." },
    { top: 150, name: "Unhealthy for sensitive groups", color: "#F08A24", advice: "People with asthma, heart or lung conditions, kids, and older adults should limit long outdoor activity." },
    { top: 200, name: "Unhealthy", color: "#E5484D", advice: "Everyone may start to feel effects. Cut back on long or heavy outdoor activity." },
    { top: 300, name: "Very unhealthy", color: "#8E4EC6", advice: "Health alert. Everyone should avoid long or heavy outdoor activity." },
    { top: Infinity, name: "Hazardous", color: "#7E1F3B", advice: "Emergency conditions. Everyone should stay indoors if they can." },
];

async function showAirQuality(latitude, longitude) {
    const requestId = locationRequestId;

    try {
        const data = await getAirQuality(latitude, longitude);
        const { us_aqi: aqi, pm2_5: fineParticles, pm10: particles, ozone } = data.current ?? {};

        if (!isCurrentLocation(requestId)) return;
        if (aqi == null) throw new Error("No air quality reading");

        const levelIndex = AQI_LEVELS.findIndex((level) => aqi <= level.top);
        const level = AQI_LEVELS[levelIndex];

        aqiValue.textContent = Math.round(aqi);
        aqiValue.style.setProperty("--aqi-color", level.color);
        aqiCategory.textContent = level.name;
        aqiAdvice.textContent = level.advice;
        aqiMarker.style.left = `${getScalePosition(aqi, levelIndex)}%`;

        /* The card is narrow, so the pollutant levels show when you hover over the air quality */
        airQualityBox.title = [
            ["PM2.5", fineParticles],
            ["PM10", particles],
            ["Ozone", ozone],
        ].filter(([, value]) => value != null).map(([name, value]) => `${name}: ${Math.round(value)} µg/m³`).join("\n");

        airQualityBox.hidden = false;
    } catch (error) {
        if (isCurrentLocation(requestId)) airQualityBox.hidden = true;
        console.error(error);
    }
}

/* The scale bar gives each category the same width, so the marker moves within its category's part */
function getScalePosition(aqi, levelIndex) {
    const bottom = levelIndex === 0 ? 0 : AQI_LEVELS[levelIndex - 1].top;
    const top = Number.isFinite(AQI_LEVELS[levelIndex].top) ? AQI_LEVELS[levelIndex].top : 500;
    const withinLevel = Math.min((aqi - bottom) / (top - bottom), 1);

    return ((levelIndex + withinLevel) / AQI_LEVELS.length) * 100;
}
