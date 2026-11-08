/* The °F / °C switch. Weather data always arrives in Fahrenheit, and
   formatTemperature() converts it right before it goes on the page. */

const UNIT_STORAGE_KEY = "cerusky-temperature-unit";
const unitButtons = document.querySelectorAll(".UnitToggle button");

let temperatureUnit = getSavedUnit();

function formatTemperature(fahrenheit) {
    const temperature = temperatureUnit === "C" ? (fahrenheit - 32) * 5 / 9 : fahrenheit;
    const rounded = Math.round(temperature);

    /* Keeps small negative numbers from showing as -0° */
    return `${rounded === 0 ? 0 : rounded}°`;
}

function setTemperatureUnit(unit) {
    temperatureUnit = unit;
    saveUnit(unit);
    showActiveUnit();
    redrawTemperatures();
}

function showActiveUnit() {
    unitButtons.forEach((button) => {
        const isActive = button.dataset.unit === temperatureUnit;

        button.classList.toggle("UnitActive", isActive);
        button.setAttribute("aria-pressed", String(isActive));
    });
}

/* Tells the page the unit changed. Each page listens for "unitchange" and redraws
   from the data it already has, so switching doesn't use another API call. */
function redrawTemperatures() {
    document.dispatchEvent(new Event("unitchange"));
}

function getSavedUnit() {
    try {
        return localStorage.getItem(UNIT_STORAGE_KEY) === "C" ? "C" : "F";
    } catch (error) {
        return "F";
    }
}

function saveUnit(unit) {
    try {
        localStorage.setItem(UNIT_STORAGE_KEY, unit);
    } catch (error) {
        console.error(error);
    }
}

unitButtons.forEach((button) => {
    button.addEventListener("click", () => setTemperatureUnit(button.dataset.unit));
});

showActiveUnit();
