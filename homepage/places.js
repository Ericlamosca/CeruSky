/* Saved cities and recent searches in the left panel.
   Both lists are kept in the browser, like the °F / °C setting, so they're still there after a refresh.
   Each city keeps its coordinates, so clicking one loads it without searching again. */

const savedList = document.getElementById("saved-places");
const savedEmpty = document.getElementById("saved-empty");
const recentList = document.getElementById("recent-places");
const recentEmpty = document.getElementById("recent-empty");
const saveButton = document.getElementById("save-city");
const saveLabel = document.getElementById("save-city-label");

const SAVED_STORAGE_KEY = "cerusky-saved-cities";
const RECENT_STORAGE_KEY = "cerusky-recent-searches";
const MOST_SAVED = 6;
const MOST_RECENT = 3;

let savedPlaces = readPlaces(SAVED_STORAGE_KEY);
let recentPlaces = readPlaces(RECENT_STORAGE_KEY);

/* The city the page is showing right now */
let currentPlace = null;

/* Keeps only what's needed to load the city again */
function toPlace({ name, state, country, lat, lon }) {
    return { name, state, country, lat, lon };
}

/* Two searches for the same city, like "Dallas" and "75201", count as one */
function getPlaceKey(place) {
    return [place.name, place.state, place.country].join("|").toLowerCase();
}

function isSamePlace(a, b) {
    return Boolean(a && b) && getPlaceKey(a) === getPlaceKey(b);
}

/* "Dallas, Texas" in the US, "Paris, France" everywhere else */
function getPlaceLabel(place) {
    const area = place.state ?? (place.country && place.country !== "US" ? getCountryName(place.country) : "");
    return area ? `${place.name}, ${area}` : place.name;
}

/* leftpanel.js calls this each time the page finishes loading a city */
function setCurrentPlace(place) {
    currentPlace = toPlace(place);
    showPlaces();
}

/* search.js calls this after a search works. The newest search goes on top. */
function addRecentSearch(place) {
    const newPlace = toPlace(place);

    recentPlaces = [newPlace, ...recentPlaces.filter((recent) => !isSamePlace(recent, newPlace))].slice(0, MOST_RECENT);
    writePlaces(RECENT_STORAGE_KEY, recentPlaces);
    showPlaces();
}

function toggleSavedCity() {
    if (!currentPlace) return;

    if (savedPlaces.some((saved) => isSamePlace(saved, currentPlace))) {
        removeSavedCity(currentPlace);
        return;
    }

    if (savedPlaces.length >= MOST_SAVED) return;

    savedPlaces = [...savedPlaces, currentPlace];
    writePlaces(SAVED_STORAGE_KEY, savedPlaces);
    showPlaces();
}

function removeSavedCity(place) {
    savedPlaces = savedPlaces.filter((saved) => !isSamePlace(saved, place));
    writePlaces(SAVED_STORAGE_KEY, savedPlaces);
    showPlaces();
}

function openPlace(place) {
    loadLocation(place.lat, place.lon, place).catch((error) => {
        showSearchMessage(`Couldn't load ${getPlaceLabel(place)}. Please try again.`);
        console.error(error);
    });
}

/* Redraws both lists and the Save button */
function showPlaces() {
    savedList.replaceChildren(...savedPlaces.map((place) => createPlaceItem(place, true)));
    savedEmpty.hidden = savedPlaces.length > 0;

    recentList.replaceChildren(...recentPlaces.map((place) => createPlaceItem(place, false)));
    recentEmpty.hidden = recentPlaces.length > 0;

    showSaveButton();
}

function showSaveButton() {
    const isSaved = savedPlaces.some((saved) => isSamePlace(saved, currentPlace));
    const isFull = !isSaved && savedPlaces.length >= MOST_SAVED;

    saveButton.hidden = !currentPlace;
    saveButton.disabled = isFull;
    saveButton.setAttribute("aria-pressed", String(isSaved));
    saveLabel.textContent = isSaved ? "Saved" : isFull ? `Saved list is full (${MOST_SAVED})` : "Save city";
}

/* Built with textContent, because city names come from OpenWeather */
function createPlaceItem(place, canRemove) {
    const item = document.createElement("li");
    const button = document.createElement("button");
    const label = getPlaceLabel(place);

    item.className = "PlaceItem";
    button.type = "button";
    button.className = "PanelBox";
    button.textContent = label;
    button.addEventListener("click", () => openPlace(place));

    if (isSamePlace(place, currentPlace)) {
        button.setAttribute("aria-current", "true");
    }

    item.append(button);

    if (canRemove) {
        const removeButton = document.createElement("button");

        removeButton.type = "button";
        removeButton.className = "PlaceRemove";
        removeButton.textContent = "×";
        removeButton.setAttribute("aria-label", `Remove ${label} from saved cities`);
        removeButton.addEventListener("click", () => removeSavedCity(place));
        item.append(removeButton);
    }

    return item;
}

function readPlaces(storageKey) {
    try {
        const places = JSON.parse(localStorage.getItem(storageKey));
        return Array.isArray(places) ? places : [];
    } catch (error) {
        return [];
    }
}

function writePlaces(storageKey, places) {
    try {
        localStorage.setItem(storageKey, JSON.stringify(places));
    } catch (error) {
        console.error(error);
    }
}

saveButton.addEventListener("click", toggleSavedCity);

showPlaces();
