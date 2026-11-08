/* National weather news for the third card.
   Google News supplies the stories as an RSS feed. Browsers can't read that feed directly,
   so rss2json converts it to JSON. Each story links out to the site that published it.
   The most important story is featured at the top with a thumbnail. When FOX Weather has
   a YouTube video about it, the thumbnail is that video. */

const nationalNews = document.getElementById("national-news");
const featuredStory = document.getElementById("featured-story");

const RSS_CONVERTER = "https://api.rss2json.com/v1/api.json?rss_url=";
const NEWS_SEARCH = '(hurricane OR tornado OR "severe storms" OR "flood warning" OR "winter storm" OR wildfire OR blizzard OR "tropical storm") -study when:2d';
const NEWS_FEED = `https://news.google.com/rss/search?q=${encodeURIComponent(NEWS_SEARCH)}&hl=en-US&gl=US&ceid=US:en`;
const NEWS_URL = `${RSS_CONVERTER}${encodeURIComponent(NEWS_FEED)}`;
const NEWS_STORY_COUNT = 8;
const NEWS_STORAGE_KEY = "cerusky-national-news-v6";
const NEWS_CHECK_TIME = 24 * 60 * 60 * 1000; // 1 day in milliseconds

/* FOX Weather's public YouTube channel */
const VIDEO_CHANNEL = "UC1FbPiXx59_ltnFVx7IxWow";
const VIDEO_CHANNEL_NAME = "FOX Weather";
const VIDEO_FEED = `https://www.youtube.com/feeds/videos.xml?channel_id=${VIDEO_CHANNEL}`;
const VIDEO_URL = `${RSS_CONVERTER}${encodeURIComponent(VIDEO_FEED)}`;
const VIDEO_RETRY_TIME = 60 * 60 * 1000; // Checks again in 1 hour if the videos couldn't load
const VIDEO_ID = /[?&]v=([\w-]{11})/;

/* A story has to mention a real weather event, and can't look like routine coverage */
const WORTH_SEEING = /hurricane|tornado|tropical storm|flood|wildfire|blizzard|winter storm|severe storm|evacuat|state of emergency/i;
const NOT_WORTH_SEEING = /\bstudy\b|almanac|forecast for|how to|how many|anniversary|years? (ago|later)|\b(ram|engine|truck|miles|stock|shares|movie|game|recipe)\b|is hurricane season/i;
const LONGEST_SOURCE_NAME = 30;

/* Most important first. The first type a headline matches decides its rank,
   and the label and icon on its thumbnail when there's no video. */
const EVENT_TYPES = [
    { pattern: /hurricane(?! (center|season|hunter))/i, label: "Hurricane", icon: "11d" },
    { pattern: /tropical storm/i, label: "Tropical storm", icon: "09d" },
    { pattern: /tornado/i, label: "Tornado", icon: "11d" },
    { pattern: /state of emergency|evacuat/i, label: "Emergency", icon: "11d" },
    { pattern: /blizzard|winter storm/i, label: "Winter storm", icon: "13d" },
    { pattern: /flood/i, label: "Flooding", icon: "10d" },
    { pattern: /wildfire/i, label: "Wildfire", icon: "50d" },
    { pattern: /severe storm/i, label: "Severe storms", icon: "11d" },
];
const OTHER_EVENT = { label: "Weather news", icon: "04d" };

/* Words that don't show two headlines are about the same story */
const COMMON_WORDS = /^(about|after|again|amid|area|before|could|first|from|have|into|just|last|more|near|news|over|says|since|than|that|their|them|they|this|through|what|when|where|which|while|will|with|watch|video|weather|storm|storms|tropical|hurricane|tornado|tornadoes|flood|flooding|floods|wildfire|wildfires|blizzard|winter|severe|warning|forecast|becomes)$/;
const SHARED_WORDS_FOR_MATCH = 2;

/* A storm's name, like Pena in "Tropical Storm Pena". A shared name is enough to match a video. */
const NAMED_STORM = /(?:[Hh]urricane|[Tt]ropical [Ss]torm|[Tt]yphoon)\s+([A-Z][a-z]+)/;
const NOT_A_NAME = /^(Center|Season|Hunters?|Watch|Warning|Forecast|Outlook|Tracker|Tracking|Update|Expected|Could|Will)$/;

/* Checks for news once a day. The list only changes when a new story is worth seeing. */
function loadNationalNews() {
    const saved = getSavedNews();

    if (saved && Date.now() - saved.checkedAt < NEWS_CHECK_TIME) {
        showNews(saved.stories, saved.featured);
        return;
    }

    const videoRequest = loadVideos();

    fetch(NEWS_URL)
        .then((response) => {
            if (!response.ok) throw new Error(`News request failed: ${response.status}`);
            return response.json();
        })
        .then(async (data) => {
            if (data.status !== "ok") throw new Error("News feed returned an error");

            const stories = addNewStories(data.items, saved?.stories ?? []);
            const { videos, failed } = await videoRequest;
            const featured = pickFeaturedStory(stories, videos);

            saveNews(stories, featured, failed);
            showNews(stories, featured);
        })
        .catch((error) => {
            /* Older stories are better than an empty card if the check fails */
            if (saved?.stories.length > 0) {
                showNews(saved.stories, saved.featured);
            } else {
                showNewsMessage("Weather news is unavailable right now.");
            }
            console.error(error);
        });
}

/* Puts new stories at the top and keeps earlier ones below them */
function addNewStories(items, savedStories) {
    const savedTitles = savedStories.map((story) => story.title);
    const newStories = items.filter((story) => isWorthSeeing(story) && !savedTitles.includes(story.title));

    return [...newStories, ...savedStories].slice(0, NEWS_STORY_COUNT);
}

function isWorthSeeing(story) {
    return WORTH_SEEING.test(story.title) && !NOT_WORTH_SEEING.test(story.title);
}

/* The most important story, along with its video if FOX Weather has one.
   When two are just as important, one with a video wins, then the newer one. */
function pickFeaturedStory(stories, videos) {
    const choices = stories.map((story) => ({ story, video: matchVideo(story, videos) }));

    return choices.sort((a, b) => getEventRank(a.story.title) - getEventRank(b.story.title)
        || Boolean(b.video) - Boolean(a.video)
        || getStoryTime(b.story.pubDate) - getStoryTime(a.story.pubDate))[0] ?? null;
}

function getEventRank(title) {
    const rank = EVENT_TYPES.findIndex((type) => type.pattern.test(title));
    return rank === -1 ? EVENT_TYPES.length : rank;
}

function getEventType(title) {
    return EVENT_TYPES.find((type) => type.pattern.test(title)) ?? OTHER_EVENT;
}

/* FOX Weather's newest videos. "failed" means they couldn't load, so the page should check again soon. */
async function loadVideos() {
    try {
        const response = await fetch(VIDEO_URL);
        const data = await response.json();

        if (data.status !== "ok") throw new Error("Video feed returned an error");

        return { videos: data.items, failed: false };
    } catch (error) {
        console.error(error);
        return { videos: [], failed: true };
    }
}

/* A video about the story: one with the storm's name, or else the one sharing
   the most words with the headline, like where it's happening */
function matchVideo(story, videos) {
    const headline = splitHeadline(decodeEntities(story.title)).headline;
    const stormName = getStormName(headline);
    const storyWords = getKeywords(headline);
    let bestVideo = null;
    let mostShared = stormName ? 0 : SHARED_WORDS_FOR_MATCH - 1;

    videos.forEach((video) => {
        const title = decodeEntities(video.title);
        const id = video.link?.match(VIDEO_ID)?.[1];

        if (!id || (stormName && !new RegExp(`\\b${stormName}\\b`, "i").test(title))) return;

        const shared = getKeywords(title).filter((word) => storyWords.includes(word)).length;

        if (shared > mostShared) {
            mostShared = shared;
            bestVideo = { id, title, pubDate: video.pubDate };
        }
    });

    return bestVideo;
}

function getStormName(headline) {
    const name = headline.match(NAMED_STORM)?.[1];
    return name && !NOT_A_NAME.test(name) ? name : null;
}

function getKeywords(title) {
    const words = title.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").match(/[a-z]{4,}/g) ?? [];
    return [...new Set(words.filter((word) => !COMMON_WORDS.test(word)))];
}

function showNews(stories, featured) {
    showFeaturedStory(featured?.story, featured?.video);

    const otherStories = stories.filter((story) => story.title !== featured?.story.title);

    if (otherStories.length === 0) {
        if (featured) {
            nationalNews.replaceChildren();
        } else {
            showNewsMessage("No major weather news right now.");
        }
        return;
    }

    nationalNews.replaceChildren(...otherStories.map(createNewsLink));
}

function getSavedNews() {
    try {
        return JSON.parse(localStorage.getItem(NEWS_STORAGE_KEY));
    } catch (error) {
        return null;
    }
}

/* A failed video check is saved as an older check, so the page tries again in an hour */
function saveNews(stories, featured, videoFailed) {
    const checkedAt = videoFailed ? Date.now() - NEWS_CHECK_TIME + VIDEO_RETRY_TIME : Date.now();

    try {
        localStorage.setItem(NEWS_STORAGE_KEY, JSON.stringify({ checkedAt, stories, featured }));
    } catch (error) {
        console.error(error);
    }
}

/* -------- Featured story -------- */

function showFeaturedStory(story, video) {
    featuredStory.hidden = !story;

    if (!story) {
        featuredStory.replaceChildren();
        return;
    }

    featuredStory.replaceChildren(video ? createFeaturedVideo(video) : createFeaturedArticle(story));
}

/* A story without a video gets a CeruSky thumbnail showing what kind of event it is */
function createFeaturedArticle(story) {
    const { headline, source } = splitHeadline(decodeEntities(story.title));
    const event = getEventType(story.title);

    const link = createExternalLink("FeaturedLink", story.link, `${headline}, from ${source}, opens in a new tab`);
    const thumbnail = document.createElement("span");
    const icon = document.createElement("img");
    const label = document.createElement("span");

    thumbnail.className = "FeaturedThumbnail EventThumbnail";
    icon.src = getWeatherIconUrl(event.icon);
    icon.alt = "";
    label.className = "EventLabel";
    label.textContent = event.label;
    thumbnail.append(icon, label);

    link.append(thumbnail, ...createStoryText(headline, `${source} · ${getTimeAgo(story.pubDate)}`));
    return link;
}

/* The video's own thumbnail. Pressing it plays the video right in the card.
   YouTube's player only works on a real web address, so a local file opens YouTube instead. */
function createFeaturedVideo(video) {
    const box = document.createElement("div");
    const watchUrl = `https://www.youtube.com/watch?v=${video.id}`;
    const canPlayHere = location.protocol.startsWith("http");

    const thumbnail = canPlayHere ? document.createElement("button") : createExternalLink("", watchUrl, `Watch ${video.title} on YouTube, opens in a new tab`);
    const image = document.createElement("img");
    const playBadge = document.createElement("span");

    box.className = "FeaturedVideo";
    thumbnail.classList.add("FeaturedThumbnail", "VideoThumbnail");
    image.src = `https://i.ytimg.com/vi/${video.id}/hqdefault.jpg`;
    image.alt = "";
    playBadge.className = "VideoPlay";
    playBadge.textContent = "▶";
    thumbnail.append(image, playBadge);

    if (canPlayHere) {
        thumbnail.type = "button";
        thumbnail.setAttribute("aria-label", `Play video: ${video.title}`);
        thumbnail.addEventListener("click", () => thumbnail.replaceWith(createVideoPlayer(video)));
    }

    const link = createExternalLink("FeaturedLink", watchUrl, `${video.title}, from ${VIDEO_CHANNEL_NAME}, opens YouTube in a new tab`);
    link.append(...createStoryText(video.title, `Video · ${VIDEO_CHANNEL_NAME} on YouTube · ${getTimeAgo(video.pubDate)}`));

    box.append(thumbnail, link);
    return box;
}

/* YouTube's official player, started by the click on the thumbnail */
function createVideoPlayer(video) {
    const player = document.createElement("iframe");

    player.className = "FeaturedThumbnail";
    player.src = `https://www.youtube-nocookie.com/embed/${video.id}?autoplay=1&playsinline=1&rel=0`;
    player.title = video.title;
    player.allow = "autoplay; encrypted-media; picture-in-picture; fullscreen";
    player.referrerPolicy = "strict-origin-when-cross-origin";
    return player;
}

function createExternalLink(className, url, label) {
    const link = document.createElement("a");

    if (className) link.className = className;
    link.href = url;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.setAttribute("aria-label", label);
    return link;
}

function createStoryText(headline, metaText) {
    const title = document.createElement("span");
    const meta = document.createElement("span");

    title.className = "NewsLinkTitle FeaturedTitle";
    title.textContent = headline;
    meta.className = "NewsLinkMeta";
    meta.textContent = metaText;
    meta.append(createExternalIcon());
    return [title, meta];
}

/* rss2json dates are in UTC but aren't labeled that way */
function getStoryTime(dateText) {
    return new Date(`${dateText.replace(" ", "T")}Z`).getTime() || 0;
}

/* -------- Story list -------- */

/* Builds each link with textContent, because the headlines come from outside sites */
function createNewsLink(story) {
    const { headline, source } = splitHeadline(decodeEntities(story.title));

    const item = document.createElement("li");
    const link = document.createElement("a");
    const title = document.createElement("span");
    const meta = document.createElement("span");

    link.className = "NewsLink";
    link.href = story.link;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.setAttribute("aria-label", `${headline}, from ${source}, opens in a new tab`);

    title.className = "NewsLinkTitle";
    title.textContent = headline;

    meta.className = "NewsLinkMeta";
    meta.textContent = `${source} · ${getTimeAgo(story.pubDate)}`;
    meta.append(createExternalIcon());

    link.append(title, meta);
    item.append(link);
    return item;
}

/* Google News titles end with the site's name, like "Flood watch issued - Local News" */
function splitHeadline(text) {
    const divider = text.lastIndexOf(" - ");

    if (divider === -1) return { headline: text, source: "News site" };

    const headline = text.slice(0, divider);
    const source = text.slice(divider + 3);

    /* Some sites add a slogan after their name, so the real name is the part before it */
    if (source.length > LONGEST_SOURCE_NAME && headline.includes(" - ")) {
        return splitHeadline(headline);
    }

    return { headline, source };
}

function decodeEntities(text) {
    return new DOMParser().parseFromString(text, "text/html").documentElement.textContent;
}

function getTimeAgo(dateText) {
    /* rss2json dates are in UTC but aren't labeled that way */
    const hours = Math.floor((Date.now() - new Date(`${dateText.replace(" ", "T")}Z`)) / 3600000);

    if (Number.isNaN(hours)) return "Recently";
    if (hours < 1) return "Less than an hour ago";
    if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;

    const days = Math.floor(hours / 24);
    return `${days} day${days === 1 ? "" : "s"} ago`;
}

function createExternalIcon() {
    const icon = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    const shape = document.createElementNS("http://www.w3.org/2000/svg", "use");

    icon.setAttribute("class", "Icon");
    icon.setAttribute("aria-hidden", "true");
    shape.setAttribute("href", "#icon-arrow-up-right");
    icon.append(shape);
    return icon;
}

function showNewsMessage(message) {
    const item = document.createElement("li");
    item.className = "Muted";
    item.textContent = message;
    nationalNews.replaceChildren(item);
}

loadNationalNews();
