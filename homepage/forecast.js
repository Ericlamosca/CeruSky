/* Page heading, 36-Hour Forecast card, and city photo.
   leftpanel.js calls loadForecast() after it finds your location. */

const pageCity = document.getElementById("page-city");
const pageSummary = document.getElementById("page-summary");
const pageDate = document.getElementById("page-date");
const radarTimeline = document.getElementById("radar-timeline");
const hourlyTable = document.getElementById("hourly-table");
const forecastDetails = document.getElementById("forecast-details");
const forecastToggle = document.getElementById("forecast-toggle");
const forecastToggleLabel = document.getElementById("forecast-toggle-label");
const radarNoteTitle = document.getElementById("radar-note-title");
const radarNoteText = document.getElementById("radar-note-text");
const forecastSummary = document.getElementById("forecast-summary");
const hourlyRow = document.getElementById("hourly-row");
const forecastPeriods = document.getElementById("forecast-periods");
const cityPhoto = document.getElementById("city-photo");
const cityMap = document.getElementById("city-map");
const newsHeadline = document.getElementById("news-headline");
const newsText = document.getElementById("news-text");
const newsSource = document.getElementById("news-source");
const newsOutdoorTitle = document.getElementById("news-outdoor-title");
const newsOutdoorMeta = document.getElementById("news-outdoor-meta");
const newsSunTitle = document.getElementById("news-sun-title");
const newsSunMeta = document.getElementById("news-sun-meta");
const cityPhotoName = document.getElementById("city-photo-name");

const HOURS_PER_DAY = 24;
const SECONDS_PER_HOUR = 3600;
const DAYTIME_START_HOUR = 6;
const DAYTIME_END_HOUR = 18;
const ENTRIES_IN_36_HOURS = 12; // OpenWeather sends one entry every 3 hours
const RAIN_CHANCE_TO_MENTION = 0.3;
const ENTRIES_IN_24_HOURS = 8;
const COMFORTABLE_TEMPERATURE = 70;
const MILLIMETERS_PER_INCH = 25.4;
const LABEL_EVERY_NTH_STEP = 3;
const PRECIPITATION_LEVELS = [0.5, 2, 5, 10]; // mm in 3 hours, the top of levels 1 to 4

/* Kept so the page can redraw when the °F / °C switch changes */
let pageForecast = null;

function loadForecast(latitude, longitude, currentWeather, place) {
    updateHeading(currentWeather, place);
    loadCityImage(currentWeather.name, place?.state, latitude, longitude);

    const requestId = locationRequestId;

    getForecast(latitude, longitude)
        .then((forecastData) => {
            if (!isCurrentLocation(requestId)) return;

            pageForecast = forecastData;
            showForecast(forecastData, currentWeather);
        })
        .catch((error) => {
            if (!isCurrentLocation(requestId)) return;

            showForecastMessage("Forecast unavailable right now.");
            console.error(error);
        });
}

function updateHeading(currentWeather, place) {
    const area = place?.state ?? getCountryName(currentWeather.sys.country);
    const localNow = getLocalDate(currentWeather.dt, currentWeather.timezone);

    pageCity.textContent = `${currentWeather.name}, ${area}`;
    pageSummary.textContent = `${capitalize(currentWeather.weather[0].description)}, feels like ${formatTemperature(currentWeather.main.feels_like)}.`;
    pageDate.textContent = localNow.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", timeZone: "UTC" });
}

function showForecast(forecastData, currentWeather) {
    const timezone = forecastData.city.timezone;
    const entries = forecastData.list.slice(0, ENTRIES_IN_36_HOURS);

    showSummary(entries, currentWeather);
    showRadarNote(entries);
    showRadarTimeline(entries, timezone);
    showCityDetails(forecastData, entries, currentWeather);
    showHourly(entries, currentWeather, timezone);
    showPeriods(entries, currentWeather.dt, timezone);
    showHourlyTable(entries, timezone);
}

function showSummary(entries, currentWeather) {
    const highestChance = Math.max(...entries.map((entry) => entry.pop));
    const outlook = highestChance >= RAIN_CHANCE_TO_MENTION
        ? `Up to a ${Math.round(highestChance * 100)}% chance of precipitation in the next 36 hours.`
        : "No precipitation expected in the next 36 hours.";

    forecastSummary.innerHTML = `${getIconHtml(currentWeather.weather[0])}${outlook}`;
}

/* The next two entries cover about 6 hours */
function showRadarNote(entries) {
    const nextEntries = entries.slice(0, 2);
    const chance = Math.max(...nextEntries.map((entry) => entry.pop));
    const wind = Math.round(Math.max(...nextEntries.map((entry) => entry.wind.speed)));

    radarNoteTitle.textContent = chance >= RAIN_CHANCE_TO_MENTION ? "Precipitation possible soon" : "Dry for the next few hours";
    radarNoteText.textContent = `Up to a ${Math.round(chance * 100)}% chance in the next 6 hours, with winds up to ${wind} mph.`;
}

/* One bar per 3-hour step. Height is the chance of precipitation, color is the amount. */
function showRadarTimeline(entries, timezone) {
    radarTimeline.innerHTML = entries.map((entry, index) => {
        const time = formatHour(getLocalDate(entry.dt, timezone));
        const chance = Math.round(entry.pop * 100);
        const amount = getPrecipitationAmount(entry);
        const amountInInches = (amount / MILLIMETERS_PER_INCH).toFixed(2);
        const label = index % LABEL_EVERY_NTH_STEP === 0 ? time : "";

        return `
            <div class="TimelineStep" title="${time}: ${chance}% chance, ${amountInInches} in">
                <div class="TimelineBarArea"><span class="TimelineBar ${getPrecipitationLevel(amount)}" style="height: ${chance}%"></span></div>
                <span class="TimelineLabel">${label}</span>
            </div>
        `;
    }).join("");
}

/* OpenWeather only includes rain or snow on entries that have some */
function getPrecipitationAmount(entry) {
    return (entry.rain?.["3h"] ?? 0) + (entry.snow?.["3h"] ?? 0);
}

function getPrecipitationLevel(amount) {
    const level = PRECIPITATION_LEVELS.findIndex((top) => amount <= top);
    return `Level${level === -1 ? PRECIPITATION_LEVELS.length + 1 : level + 1}`;
}

/* Everything under the city image in the third card, all from OpenWeather */
function showCityDetails(forecastData, entries, currentWeather) {
    const city = currentWeather.name;
    const nextDay = entries.slice(0, ENTRIES_IN_24_HOURS);
    const temperatures = nextDay.map((entry) => entry.main.temp);
    const high = formatTemperature(Math.max(...temperatures));
    const low = formatTemperature(Math.min(...temperatures));
    const population = forecastData.city.population;

    newsHeadline.textContent = `${capitalize(currentWeather.weather[0].description)} over ${city}`;
    newsText.textContent = `Expect a high near ${high} and a low near ${low} over the next 24 hours. Humidity is at ${currentWeather.main.humidity}%, with winds around ${Math.round(currentWeather.wind.speed)} mph.`;
    newsSource.textContent = population > 0 ? `Home to about ${population.toLocaleString("en-US")} people` : "";
    newsSource.hidden = !population;

    showBestOutdoorTime(entries, city, forecastData.city.timezone);
    showDaylight(currentWeather);
}

/* Picks the daytime hour with the lowest rain chance, then the most comfortable temperature */
function showBestOutdoorTime(entries, city, timezone) {
    const daytimeEntries = entries.filter((entry) => isDaytime(getLocalDate(entry.dt, timezone).getUTCHours()));

    if (daytimeEntries.length === 0) {
        newsOutdoorTitle.textContent = `No daylight hours ahead in ${city}`;
        newsOutdoorMeta.textContent = "";
        return;
    }

    const best = [...daytimeEntries].sort((a, b) => a.pop - b.pop
        || Math.abs(a.main.temp - COMFORTABLE_TEMPERATURE) - Math.abs(b.main.temp - COMFORTABLE_TEMPERATURE))[0];

    const date = getLocalDate(best.dt, timezone);
    const dayName = date.toLocaleDateString("en-US", { weekday: "long", timeZone: "UTC" });

    newsOutdoorTitle.textContent = `${dayName} around ${formatHour(date)} looks best in ${city}`;
    newsOutdoorMeta.textContent = `${formatTemperature(best.main.temp)} · ${Math.round(best.pop * 100)}% chance of precipitation`;
}

function showDaylight(currentWeather) {
    const { sunrise, sunset } = currentWeather.sys;
    const timezone = currentWeather.timezone;
    const totalMinutes = Math.round((sunset - sunrise) / 60);

    newsSunTitle.textContent = `Sunrise ${formatTime(getLocalDate(sunrise, timezone))}, sunset ${formatTime(getLocalDate(sunset, timezone))}`;
    newsSunMeta.textContent = `${Math.floor(totalMinutes / 60)} hours and ${totalMinutes % 60} minutes of daylight`;
}

function isDaytime(hour) {
    return hour >= DAYTIME_START_HOUR && hour < DAYTIME_END_HOUR;
}

function showHourly(entries, currentWeather, timezone) {
    const now = hourHtml("Now", currentWeather.weather[0], currentWeather.main.temp, "HourTime HourNow");

    const nextHours = entries.slice(0, 3).map((entry) => {
        const label = formatHour(getLocalDate(entry.dt, timezone));
        return hourHtml(label, entry.weather[0], entry.main.temp, "HourTime");
    });

    hourlyRow.innerHTML = [now, ...nextHours].join("");
}

function hourHtml(label, weather, temperature, labelClass) {
    return `
        <div class="Hour">
            <p class="${labelClass}">${label}</p>
            ${getIconHtml(weather)}
            <p class="HourTemp">${formatTemperature(temperature)}</p>
        </div>
    `;
}

/* The expanded view: one row for each 3-hour step */
function showHourlyTable(entries, timezone) {
    hourlyTable.innerHTML = entries.map((entry) => {
        const date = getLocalDate(entry.dt, timezone);
        const day = date.toLocaleDateString("en-US", { weekday: "short", timeZone: "UTC" });

        return `
            <tr>
                <th scope="row">${day} ${formatHour(date)}</th>
                <td><span class="TableTemp">${getIconHtml(entry.weather[0])}${formatTemperature(entry.main.temp)}</span></td>
                <td>${formatTemperature(entry.main.feels_like)}</td>
                <td>${Math.round(entry.pop * 100)}%</td>
                <td>${getWindDirection(entry.wind.deg)} ${Math.round(entry.wind.speed)} mph</td>
                <td>${entry.main.humidity}%</td>
            </tr>
        `;
    }).join("");
}

forecastToggle.addEventListener("click", () => {
    const isOpening = forecastDetails.hidden;

    forecastDetails.hidden = !isOpening;
    forecastToggle.setAttribute("aria-expanded", String(isOpening));
    forecastToggleLabel.textContent = isOpening ? "Hide full forecast" : "View full forecast";
});

function showPeriods(entries, nowSeconds, timezone) {
    forecastPeriods.innerHTML = groupIntoPeriods(entries, timezone)
        .slice(0, 3)
        .map((period) => periodHtml(period, nowSeconds, timezone))
        .join("");
}

/* Splits the forecast into daytime and nighttime blocks, in order. */
function groupIntoPeriods(entries, timezone) {
    const periods = [];

    entries.forEach((entry) => {
        const hour = getLocalDate(entry.dt, timezone).getUTCHours();
        const isDay = isDaytime(hour);
        const lastPeriod = periods[periods.length - 1];

        if (lastPeriod?.isDay === isDay) {
            lastPeriod.entries.push(entry);
        } else {
            periods.push({ isDay, entries: [entry] });
        }
    });

    return periods;
}

function periodHtml(period, nowSeconds, timezone) {
    const temperatures = period.entries.map((entry) => entry.main.temp);
    const winds = period.entries.map((entry) => Math.round(entry.wind.speed));
    const rainChance = Math.round(Math.max(...period.entries.map((entry) => entry.pop)) * 100);
    const temperature = formatTemperature(period.isDay ? Math.max(...temperatures) : Math.min(...temperatures));
    const typicalWeather = getMostCommonWeather(period.entries);
    const direction = getWindDirection(period.entries[0].wind.deg);
    const lowestWind = Math.min(...winds);
    const highestWind = Math.max(...winds);
    const windRange = lowestWind === highestWind ? highestWind : `${lowestWind}–${highestWind}`;
    const firstDate = getLocalDate(period.entries[0].dt, timezone);

    return `
        <div class="Period">
            <div class="PeriodText">
                <p class="PeriodName">${getPeriodName(period, nowSeconds, timezone)} <span>${formatShortDate(firstDate)}</span></p>
                <p class="Muted">${capitalize(typicalWeather.description)}</p>
                <p class="Muted">${period.isDay ? "High" : "Low"} of ${temperature}.</p>
                <p class="PeriodStats">
                    <span><svg class="Icon"><use href="#icon-droplet"/></svg>${rainChance}%</span>
                    <span><svg class="Icon"><use href="#icon-wind"/></svg>${direction} ${windRange} mph</span>
                </p>
            </div>
            <p class="PeriodTemp">${getIconHtml(typicalWeather)}${temperature}</p>
        </div>
    `;
}

function getPeriodName(period, nowSeconds, timezone) {
    const firstEntryTime = period.entries[0].dt;

    if (period.isDay) {
        const daysAway = getCalendarDay(firstEntryTime, timezone) - getCalendarDay(nowSeconds, timezone);
        return daysAway === 0 ? "Today" : "Tomorrow";
    }

    /* Hours after midnight still belong to the night that started the evening before. */
    const nightStart = firstEntryTime - (DAYTIME_START_HOUR * SECONDS_PER_HOUR);
    const nightsAway = getCalendarDay(nightStart, timezone) - getCalendarDay(nowSeconds, timezone);

    if (nightsAway < 0) return "Overnight";
    return nightsAway === 0 ? "Tonight" : "Tomorrow night";
}

function getMostCommonWeather(entries) {
    const counts = {};

    entries.forEach((entry) => {
        const { description } = entry.weather[0];
        counts[description] = (counts[description] ?? 0) + 1;
    });

    const mostCommon = Object.keys(counts).sort((a, b) => counts[b] - counts[a])[0];
    return entries.find((entry) => entry.weather[0].description === mostCommon).weather[0];
}

/* Uses the same icon files as the live weather box */
function getIconHtml(weather) {
    return `<img class="ForecastIcon" src="${getWeatherIconUrl(weather.icon)}" alt="${weather.description}">`;
}

function showForecastMessage(message) {
    forecastSummary.textContent = message;
    hourlyRow.innerHTML = "";
    forecastPeriods.innerHTML = "";
    hourlyTable.innerHTML = "";
    radarTimeline.innerHTML = "";
    newsHeadline.textContent = message;
}

/* Date helpers. Shifting by the city's timezone and reading the UTC values
   shows that city's local time, whatever timezone the viewer is in. */

function getLocalDate(seconds, timezone) {
    return new Date((seconds + timezone) * 1000);
}

function getCalendarDay(seconds, timezone) {
    return Math.floor((seconds + timezone) / (HOURS_PER_DAY * SECONDS_PER_HOUR));
}

function formatHour(date) {
    const hour = date.getUTCHours();
    return `${hour % 12 || 12} ${hour < 12 ? "AM" : "PM"}`;
}

function formatTime(date) {
    const minutes = String(date.getUTCMinutes()).padStart(2, "0");
    const [hour, period] = formatHour(date).split(" ");
    return `${hour}:${minutes} ${period}`;
}

function formatShortDate(date) {
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

function capitalize(text) {
    return text.charAt(0).toUpperCase() + text.slice(1);
}

/* City image for the 36-Hour Forecast card.
   While the photo is being found, the box shows a soft sky blue pulse. Then it fades in the
   photo from the city's Wikipedia page, or the state map if there isn't a photo to use.
   Public domain photos need no credit. CC BY and CC BY-SA photos are free to use too,
   but only with a credit naming the photographer and the license, so those get one. */

const WIKIPEDIA_API = "https://en.wikipedia.org/w/api.php?action=query&format=json&formatversion=2&origin=*";
const NO_CREDIT_NEEDED = /^(pd|cc0)/i;
const FREE_TO_USE = /^(pd|cc0|cc-by-(sa-)?\d)/i; // Leaves out "non-commercial" and other limited licenses
const NOT_A_PHOTO = /\.svg|flag|seal|logo|locator|doton|coat_of_arms|map[^l]/i;
const LONGEST_CREDIT_NAME = 40;

/* Some cities' main Wikipedia photo doesn't show anything you'd recognize, like
   New Orleans' downtown office towers. These use a landmark photo from the same page instead.
   Add a city here with its exact "City, State" name and the photo's file name from Wikimedia Commons. */
const CITY_PHOTO_PICKS = {
    "New Orleans, Louisiana": "French Quarter03 New Orleans.JPG",
    "Houston, Texas": "Buildings-city-houston-skyline-1870617.jpg",
    "San Antonio, Texas": "Alamo Mission San Antonio at Night.jpg",
    "Boston, Massachusetts": "Boston skyline from Longfellow Bridge September 2017 panorama 2.jpg",
    "San Diego, California": "Gaslamp Quarter, San Diego-1.jpg",
};

/* Each city's photo is remembered in the browser, so a refresh can skip the Wikipedia lookup.
   The "v2" makes browsers forget photos saved before the picks above were added. */
const PHOTO_STORAGE_KEY = "cerusky-city-photos-v2";
const PHOTO_KEEP_TIME = 7 * 24 * 60 * 60 * 1000; // 1 week in milliseconds

const cityPhotoCredit = document.getElementById("city-photo-credit");
const cityImageBox = cityMap.parentElement;

function loadCityImage(city, state, latitude, longitude) {
    cityPhotoName.textContent = state ? `${city}, ${state}` : city;
    cityMap.innerHTML = createStateMap(state, latitude, longitude, city);
    cityMap.hidden = true;
    cityPhoto.hidden = true;
    cityPhotoCredit.hidden = true;
    cityImageBox.classList.add("IsLoading");

    /* Clears the last city's photo, so it can't finish loading over this one */
    cityPhoto.onload = null;
    cityPhoto.onerror = null;
    cityPhoto.removeAttribute("src");

    /* Always search with the state, or Dallas, North Carolina would match Dallas, Texas */
    const titles = state ? [`${city}, ${state}`] : [city];
    const requestId = locationRequestId;

    getCityPhoto(titles).then((photo) => {
        if (!isCurrentLocation(requestId)) return;

        if (!photo) {
            showStateMap();
            return;
        }

        cityPhoto.onload = () => {
            cityImageBox.classList.remove("IsLoading");
            cityPhoto.hidden = false;
            showPhotoCredit(photo);
        };
        cityPhoto.onerror = showStateMap;
        cityPhoto.src = photo.url;
        cityPhoto.alt = `Photo of ${city}`;
    });
}

function showStateMap() {
    cityImageBox.classList.remove("IsLoading");
    cityPhoto.hidden = true;
    cityMap.hidden = false;
}

/* Uses the remembered photo when there is one. Otherwise looks it up and remembers it,
   unless the lookup failed, so a bad connection doesn't stick for a week. */
async function getCityPhoto(titles) {
    const savedPhotos = getSavedPhotos();
    const saved = savedPhotos[titles[0]];

    if (saved && Date.now() - saved.savedAt < PHOTO_KEEP_TIME) {
        return saved.photo;
    }

    const { photo, failed } = await findCityPhoto(titles);

    if (!failed) {
        savedPhotos[titles[0]] = { photo, savedAt: Date.now() };
        savePhotos(savedPhotos);
    }

    return photo;
}

function getSavedPhotos() {
    try {
        return JSON.parse(localStorage.getItem(PHOTO_STORAGE_KEY)) ?? {};
    } catch (error) {
        return {};
    }
}

function savePhotos(photos) {
    try {
        localStorage.setItem(PHOTO_STORAGE_KEY, JSON.stringify(photos));
    } catch (error) {
        console.error(error);
    }
}

/* Tries each title in order and returns the first photo that's free to use */
async function findCityPhoto(titles) {
    let failed = false;

    for (const title of titles) {
        try {
            const fileName = CITY_PHOTO_PICKS[title] ?? await getPageImageName(title);

            if (fileName && !NOT_A_PHOTO.test(fileName)) {
                const image = await getImageInfo(fileName);
                const metadata = image?.extmetadata ?? {};
                const license = metadata.License?.value ?? "";

                if (FREE_TO_USE.test(license)) {
                    const photo = {
                        url: image.thumburl,
                        needsCredit: !NO_CREDIT_NEEDED.test(license),
                        author: getAuthorName(metadata.Artist?.value),
                        licenseName: metadata.LicenseShortName?.value ?? license.toUpperCase(),
                        licenseUrl: metadata.LicenseUrl?.value,
                        pageUrl: image.descriptionurl,
                    };

                    return { photo, failed: false };
                }
            }
        } catch (error) {
            failed = true;
            console.error(error);
        }
    }

    return { photo: null, failed };
}

/* "Photo: Dllu, CC BY-SA 4.0". The name links to the photo's page, which has the full details. */
function showPhotoCredit(photo) {
    if (!photo.needsCredit) return;

    const author = document.createElement("a");
    const authorName = photo.author.length > LONGEST_CREDIT_NAME ? `${photo.author.slice(0, LONGEST_CREDIT_NAME).trim()}…` : photo.author;

    author.href = photo.pageUrl;
    author.textContent = authorName;
    author.target = "_blank";
    author.rel = "noopener noreferrer";

    const license = document.createElement(photo.licenseUrl ? "a" : "span");

    license.textContent = photo.licenseName;
    if (photo.licenseUrl) {
        license.href = photo.licenseUrl;
        license.target = "_blank";
        license.rel = "noopener noreferrer";
    }

    cityPhotoCredit.replaceChildren("Photo: ", author, ", ", license);
    cityPhotoCredit.hidden = false;
}

/* Wikipedia sends the photographer's name as HTML, sometimes with links in it.
   A cropped copy of a photo also starts with the original's file name, like
   "File:Chicago River ferry.jpg: John Picken ... derivative work: Someone", so only the photographer is kept. */
function getAuthorName(html) {
    const text = html ? new DOMParser().parseFromString(html, "text/html").body.textContent : "";
    const name = text
        .replace(/\s+/g, " ")
        .replace(/^File:.+?\.(jpe?g|png|tiff?|gif|webp):\s*/i, "")
        .split(/\s*derivative work:/i)[0]
        .trim();

    return name || "Wikimedia Commons";
}

async function getPageImageName(title) {
    const response = await fetch(`${WIKIPEDIA_API}&prop=pageimages&piprop=name&redirects=1&titles=${encodeURIComponent(title)}`);
    const data = await response.json();
    return data.query.pages[0].pageimage;
}

async function getImageInfo(fileName) {
    const response = await fetch(`${WIKIPEDIA_API}&prop=imageinfo&iiprop=url|extmetadata&iiextmetadatafilter=License|LicenseShortName|LicenseUrl|Artist&iiurlwidth=960&titles=${encodeURIComponent(`File:${fileName}`)}`);
    const data = await response.json();
    return data.query.pages[0].imageinfo?.[0];
}
