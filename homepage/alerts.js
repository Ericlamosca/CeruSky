/* The red alert banner at the top of the homepage.
   Checks the National Weather Service for active alerts where the city is, like a
   Flash Flood Warning, and glides the details across the banner. US only.
   leftpanel.js calls showWeatherAlerts() each time a city loads. */

const alertBanner = document.getElementById("alert-banner");
const alertText = document.getElementById("alert-text");
const alertCount = document.getElementById("alert-count");

const ALERT_GLIDE_SPEED = 80; // Pixels per second the text moves
const SEVERITY_ORDER = ["Extreme", "Severe", "Moderate", "Minor", "Unknown"];

/* The NWS's servers sometimes refuse a request ("Access Denied"), and the browser reports it as
   "Failed to fetch". Alerts matter for safety, so a failed check is tried again after
   1, 2, and 4 seconds. If every try fails, it checks again every minute. */
const ALERT_RETRY_WAITS = [1000, 2000, 4000];
const ALERT_RECHECK_TIME = 60 * 1000;
const ALERT_STORAGE_KEY = "cerusky-alerts";

async function showWeatherAlerts(latitude, longitude, isRecheck = false) {
    const requestId = locationRequestId;

    /* Alerts saved earlier in this visit (and not expired yet) show right away,
       then get updated when the fresh check finishes */
    if (!isRecheck) {
        const saved = getSavedAlerts(latitude, longitude);

        if (saved.length > 0) {
            showAlertBanner(saved);
        } else {
            alertBanner.hidden = true;
        }
    }

    const alerts = await checkAlertsWithRetries(latitude, longitude);

    if (!isCurrentLocation(requestId)) return;

    /* Couldn't reach the NWS: any saved alerts stay up, and it keeps checking every minute until it answers */
    if (alerts === null) {
        setTimeout(() => {
            if (isCurrentLocation(requestId)) showWeatherAlerts(latitude, longitude, true);
        }, ALERT_RECHECK_TIME);
        return;
    }

    saveAlerts(latitude, longitude, alerts);

    if (alerts.length === 0) {
        alertBanner.hidden = true;
        return;
    }

    showAlertBanner(alerts);
}

/* The active alerts, or null if the NWS couldn't be reached.
   Only network failures are retried. An answer like "no data here" (for places outside the US) means no alerts. */
async function checkAlertsWithRetries(latitude, longitude) {
    for (let attempt = 0; attempt <= ALERT_RETRY_WAITS.length; attempt++) {
        try {
            return await getWeatherAlerts(latitude, longitude);
        } catch (error) {
            console.error(error);

            const couldNotConnect = error instanceof TypeError;
            if (!couldNotConnect) return [];
            if (attempt === ALERT_RETRY_WAITS.length) return null;

            await new Promise((resolve) => setTimeout(resolve, ALERT_RETRY_WAITS[attempt]));
        }
    }

    return null;
}

function showAlertBanner(alerts) {
    /* The most serious alert goes first */
    const sorted = [...alerts].sort((a, b) => SEVERITY_ORDER.indexOf(a.severity) - SEVERITY_ORDER.indexOf(b.severity));

    alertCount.textContent = sorted.length === 1 ? "Weather alert" : `${sorted.length} weather alerts`;
    alertText.textContent = sorted.map(describeAlert).join("     •     ");
    alertBanner.hidden = false;
    setGlideTime();
}

/* Alerts are saved for this visit by place, keeping only what the banner needs */
function getAlertPlaceKey(latitude, longitude) {
    return `${latitude.toFixed(2)},${longitude.toFixed(2)}`;
}

function saveAlerts(latitude, longitude, alerts) {
    try {
        const saved = JSON.parse(sessionStorage.getItem(ALERT_STORAGE_KEY)) ?? {};
        saved[getAlertPlaceKey(latitude, longitude)] = alerts.map(({ event, severity, ends, expires, areaDesc, description }) => ({ event, severity, ends, expires, areaDesc, description }));
        sessionStorage.setItem(ALERT_STORAGE_KEY, JSON.stringify(saved));
    } catch (error) {
        console.error(error);
    }
}

/* Only alerts that haven't ended yet */
function getSavedAlerts(latitude, longitude) {
    try {
        const saved = JSON.parse(sessionStorage.getItem(ALERT_STORAGE_KEY)) ?? {};
        const alerts = saved[getAlertPlaceKey(latitude, longitude)] ?? [];
        return alerts.filter((alert) => new Date(alert.ends ?? alert.expires) > new Date());
    } catch (error) {
        return [];
    }
}

/* "FLASH FLOOD WARNING until 1:30 PM for Kleberg, TX. Flash flooding caused by excessive rainfall is expected." */
function describeAlert(alert) {
    const until = alert.ends ?? alert.expires;
    const untilText = until ? ` until ${formatAlertTime(until)}` : "";
    const summary = getAlertSummary(alert);

    return `${alert.event.toUpperCase()}${untilText} for ${alert.areaDesc}.${summary ? ` ${summary}` : ""}`;
}

/* Alert times come with the local time already in them, like 2026-11-08T13:30:00-06:00,
   so this reads the hours and minutes straight from the text. */
function formatAlertTime(isoText) {
    const [, hour, minute] = isoText.match(/T(\d{2}):(\d{2})/) ?? [];

    if (!hour) return "";

    const hourNumber = Number(hour);
    return `${hourNumber % 12 || 12}:${minute} ${hourNumber < 12 ? "AM" : "PM"}`;
}

/* NWS descriptions have a "* WHAT..." line that says what's happening in plain words */
function getAlertSummary(alert) {
    const what = alert.description?.match(/\*\s*WHAT\.\.\.([\s\S]*?)(?:\n\s*\n|\n\*)/)?.[1];
    const text = (what ?? "").replace(/\s+/g, " ").trim();

    if (!text) return "";
    return /[.!]$/.test(text) ? text : `${text}.`;
}

/* Longer messages get more time, so the text always moves at the same speed */
function setGlideTime() {
    const distance = alertText.scrollWidth;
    alertText.style.setProperty("--glide-time", `${Math.max(distance / ALERT_GLIDE_SPEED, 8)}s`);
}
