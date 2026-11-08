/* Shared by every page: the page buttons in the left panel, the weather icons,
   and remembering which city you're looking at, so every page shows the same one. */

/* To add a page, add it here. The buttons are built from this list on every page. */
const SITE_PAGES = [
    { name: "Today", href: "index.html" },
    { name: "Radar", href: "radar.html" },
    { name: "7-Day Forecast", href: "forecast.html" },
    { name: "About & Credits", href: "about.html" },
];

const VIEWED_PLACE_STORAGE_KEY = "cerusky-viewed-place";

function showPageLinks() {
    const linkList = document.getElementById("page-links");

    if (!linkList) return;

    const currentFile = location.pathname.split("/").pop() || "index.html";

    linkList.replaceChildren(...SITE_PAGES.map((page) => {
        const item = document.createElement("li");
        const link = document.createElement("a");

        link.className = "PanelBox";
        link.href = page.href;
        link.textContent = page.name;

        if (page.href === currentFile) {
            link.setAttribute("aria-current", "page");
        }

        item.append(link);
        return item;
    }));
}

/* Each OpenWeather icon code, like 10n, has a matching file in images/weather */
function getWeatherIconUrl(iconCode) {
    return `../images/weather/${iconCode}.svg`;
}

function getCountryName(countryCode) {
    return new Intl.DisplayNames(["en"], { type: "region" }).of(countryCode);
}

/* "Dallas, Texas" in the US, "Paris, France" everywhere else */
function getPlaceLabel(place) {
    const area = place.state ?? (place.country && place.country !== "US" ? getCountryName(place.country) : "");
    return area ? `${place.name}, ${area}` : place.name;
}

/* The homepage saves the city it's showing, so the other pages open on the same one.
   It's kept for this visit only (sessionStorage), so a new visit starts from your own location. */
function saveViewedPlace(place) {
    try {
        sessionStorage.setItem(VIEWED_PLACE_STORAGE_KEY, JSON.stringify(place));
    } catch (error) {
        console.error(error);
    }
}

function getViewedPlace() {
    try {
        return JSON.parse(sessionStorage.getItem(VIEWED_PLACE_STORAGE_KEY));
    } catch (error) {
        return null;
    }
}

/* For pages other than the homepage: the city viewed during this visit, or else your device's location.
   Returns null if neither is available. */
async function findPageLocation() {
    const viewed = getViewedPlace();

    if (viewed) return viewed;

    try {
        const position = await new Promise((resolve, reject) => navigator.geolocation.getCurrentPosition(resolve, reject));
        const { latitude, longitude } = position.coords;
        const place = await getPlaceAt(latitude, longitude);

        return { name: place?.name ?? "Your location", state: place?.state, country: place?.country, lat: latitude, lon: longitude };
    } catch (error) {
        return null;
    }
}

showPageLinks();
