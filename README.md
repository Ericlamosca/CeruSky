# CeruSky 

A weather website that shows your local weather, a 36-hour forecast, live radar, and national weather news, all on one page.

> **Work in progress.** The frontend is working. I'm now building a backend that will hide the API key and cache weather data.

<img width="1913" height="911" alt="image" src="https://github.com/user-attachments/assets/3ab6c513-eb2a-4eb7-94d9-715d8a43cfe3" />

## Features

- **Local weather:** current conditions for your location, with "feels like," highs and lows, and wind.
- **36-hour forecast:** the next few hours, today and tonight, and an expandable table in 3-hour steps.
- **Search:** enter a city or a US zip code, and the whole page updates for that place: the weather, the forecast, the radar, and the town image. Search works whether or not you allow location access.
- **Saved cities and recent searches:** save cities with the star next to the city's name, and jump back to your last searches from the left panel.
- **Live radar:** the last hour of NOAA radar, with rain, snow, and hail shown in different colors. It covers the lower 48 US states.
- **Town image:** a photo of the city from Wikipedia, credited on the image when its license requires it. If there's no usable photo, it shows a map of the state with the city marked.
- **Weather News:** the most important weather story at the top, with a YouTube video when there is one. Below it are more national weather stories and the current temperature in major US cities. Every news link opens the website that published it, and clicking a city loads its weather.
- **°F / °C switch:** your choice is remembered.

## How I built it

I built the foundational layout (frontend) of the project, then used Figma to refine what I already had. After that, I used AI for a lot of the frontend code (a timesaver) so I could focus on learning and building the backend of the application.

The icons and logo are based on [Lucide icons](https://lucide.dev/icons/cloud-sun), changed to fit the theme of the website.

**Built with:** HTML, CSS, and JavaScript (no framework), plus [Leaflet](https://leafletjs.com/) for the radar map.

## Running it locally

1. Clone the repository:
   ```
   git clone https://github.com/Ericlamosca/CeruSky.git
   ```
2. Get a free API key from [OpenWeather](https://openweathermap.org/api).
3. In the `homepage` folder, copy `config.example.js`, name the copy `config.js`, and paste your key into it. `config.js` is listed in `.gitignore`, so your key stays off GitHub.
4. Open `homepage/index.html` with a local server, such as the Live Server extension in VS Code. (The news video only plays from a server, not from a file opened directly.)

## What's next

- [ ] Build a backend that combines the APIs this site uses into a single custom API, so the API key lives on the server instead of in the frontend code.
- [ ] Add caching so the API isn't called as often and the site stays under the daily call limit.
- [ ] Use in-memory caching, so the site still works if one of the third-party APIs goes down for a while.
- [ ] Have the backend read the news articles (not the YouTube videos) and find a photo for each one.
- [ ] Make a new OpenWeather API key once the backend is in place.

## Credits

- Weather, forecast, and place search: [OpenWeather](https://openweathermap.org/)
- Radar: [NOAA's National Weather Service (MRMS)](https://www.nssl.noaa.gov/projects/mrms/)
- Maps: [Leaflet](https://leafletjs.com/) and [Esri](https://www.esri.com/)
- City photos: [Wikipedia](https://www.wikipedia.org/) and Wikimedia Commons (each photographer is credited on the image when the license requires it)
- News stories: [Google News](https://news.google.com/), converted with [rss2json](https://rss2json.com/)
- Videos: [FOX Weather](https://www.youtube.com/@FOXWeather) on YouTube
- State outlines: US Census Bureau, through the [us-atlas](https://github.com/topojson/us-atlas) package
- Icons: [Lucide](https://lucide.dev/), under the ISC License
