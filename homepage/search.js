/* The search bar. Finds a city or US zip code, then reloads the whole page for it:
   the live weather, forecast, city photo or state map, and radar. */

const searchBar = document.querySelector(".SearchBar");
const searchSubmit = document.querySelector(".SearchSubmit");
const searchMessage = document.getElementById("search-message");

const ZIP_CODE = /^\d{5}$/;
const TWO_LETTER_CODE = /^[a-z]{2}$/i;

async function searchLocation() {
    const searchText = searchBar.value.trim();

    if (!searchText) return;

    showSearchMessage(`Searching for ${searchText}...`);

    try {
        const place = await findPlace(searchText);

        if (!place) {
            showSearchMessage(`Couldn't find ${searchText}. Try a city name, "City, ST", or a 5-digit zip code.`);
            return;
        }

        await loadLocation(place.lat, place.lon, place);
        addRecentSearch(place);
        showSearchMessage("");
        searchBar.blur();
    } catch (error) {
        showSearchMessage("Search is unavailable right now. Please try again.");
        console.error(error);
    }
}

function findPlace(searchText) {
    return ZIP_CODE.test(searchText) ? findZipCode(searchText) : findCity(searchText);
}

/* The zip lookup has no state, so a second lookup at the same spot finds it */
async function findZipCode(zipCode) {
    const zipPlace = await getPlaceForZip(zipCode);

    if (!zipPlace) return null;

    const place = await getPlaceAt(zipPlace.lat, zipPlace.lon);
    return { ...zipPlace, state: place?.state };
}

/* Accepts "Dallas", "Dallas, TX", "Dallas, Texas", or "Paris, FR" */
async function findCity(searchText) {
    const [city, area] = searchText.split(",").map((part) => part.trim());

    if (!area) {
        const places = await getPlacesNamed(city);
        return places[0] ?? null;
    }

    /* Two letters is most likely a US state, otherwise a country */
    if (TWO_LETTER_CODE.test(area)) {
        const statePlaces = await getPlacesNamed(`${city},${area},US`);
        if (statePlaces.length > 0) return statePlaces[0];

        const countryPlaces = await getPlacesNamed(`${city},${area}`);
        return countryPlaces[0] ?? null;
    }

    /* A full state or country name. Picks the match, or the top result if none match. */
    const places = await getPlacesNamed(city);
    const areaName = area.toLowerCase();
    const match = places.find((place) => [place.state, getCountryName(place.country)]
        .some((name) => name?.toLowerCase() === areaName));

    return match ?? places[0] ?? null;
}

function showSearchMessage(message) {
    searchMessage.textContent = message;
    searchMessage.hidden = !message;
}

searchSubmit.addEventListener("click", searchLocation);

searchBar.addEventListener("keydown", (event) => {
    if (event.key === "Enter") searchLocation();
});
