console.log("GenevaCam loaded");

//
// Webcam
//

const video = document.getElementById("video");
video.src = "https://edge16.vedge.infomaniak.com/livecast/ik:sig2/chunklist_w1380254353.m3u8";

//
// Radio & Power Toggle
//

const radio = document.getElementById("radio");
const radioToggle = document.getElementById("radio-toggle");

radio.src = "https://radiolac.ice.infomaniak.ch/radiolac-high.mp3";

radioToggle.addEventListener("click", () => {
    if (radio.paused) {
        radio.play()
            .then(() => radioToggle.classList.add("active"))
            .catch(err => console.log("Radio playback error:", err));
    } else {
        radio.pause();
        radioToggle.classList.remove("active");
    }
});

//
// Clock
//

function updateClock() {
    const now = new Date();

    document.getElementById("clock").textContent =
        now.toLocaleTimeString(
            "en-GB",
            {
                hour: "2-digit",
                minute: "2-digit",
                timeZone: "Europe/Zurich"
            }
        ) + " • Geneva";

    document.getElementById("date").textContent =
        now.toLocaleDateString(
            "en-GB",
            {
                weekday: "long",
                day: "numeric",
                month: "long",
                timeZone: "Europe/Zurich"
            }
        );
}

updateClock();
setInterval(updateClock, 1000);

//
// Weather
//

async function updateWeather() {
    try {
        const response = await fetch(
            "https://api.open-meteo.com/v1/forecast?latitude=46.2044&longitude=6.1432&current=temperature_2m,weather_code,wind_speed_10m&timezone=Europe/Zurich"
        );
        const data = await response.json();

        let condition = "Unknown";
        switch (data.current.weather_code) {
            case 0: condition = "Clear"; break;
            case 1: case 2: case 3: condition = "Partly cloudy"; break;
            case 45: case 48: condition = "Fog"; break;
            case 51: case 53: case 55: condition = "Drizzle"; break;
            case 61: case 63: case 65: condition = "Rain"; break;
            case 71: case 73: case 75: condition = "Snow"; break;
            case 95: condition = "Thunderstorm"; break;
        }

        document.getElementById("temperature").textContent =
            Math.round(data.current.temperature_2m) +
            "°C • " +
            condition +
            " • " +
            Math.round(data.current.wind_speed_10m) +
            " km/h";

        document.getElementById("weather").textContent = "";

    } catch (error) {
        console.log("Weather error:", error);
    }
}

updateWeather();
setInterval(updateWeather, 600000);

//
// News Ticker & Weather Forecast (20 Minutes feeds only)
//

const ticker = document.getElementById("ticker");

const describeWeatherFr = (code) => {
    if (code === 0) return 'Ciel dégagé';
    if (code === 1) return 'Plutôt dégagé';
    if (code === 2) return 'Partiellement nuageux';
    if (code === 3) return 'Couvert';
    if (code === 45 || code === 48) return 'Brouillard';
    if (code >= 51 && code <= 55) return 'Bruine';
    if (code >= 61 && code <= 65) return 'Pluie';
    if (code >= 71 && code <= 75) return 'Neige';
    if (code === 95) return 'Orage';
    return '';
};

const getForecast = async () => {
    try {
        const response = await fetch('https://api.open-meteo.com/v1/forecast?latitude=46.2044&longitude=6.1432&daily=weather_code,temperature_2m_max,temperature_2m_min&forecast_days=3&timezone=Europe%2FZurich');
        const data = await response.json();
        const d = data.daily;
        
        const parts = d.time.map((day, i) => {
            let label = "Aujourd'hui";
            if (i === 1) label = 'Demain';
            else if (i > 1) {
                const name = new Date(day + 'T12:00:00Z').toLocaleDateString('fr-CH', { weekday: 'long', timeZone: 'UTC' });
                label = name.charAt(0).toUpperCase() + name.slice(1);
            }
            const desc = describeWeatherFr(d.weather_code[i]);
            return label + ' : ' + (desc ? desc + ', ' : '') + Math.round(d.temperature_2m_min[i]) + ' à ' + Math.round(d.temperature_2m_max[i]) + ' °C';
        });
        return 'Prévisions pour Genève : ' + parts.join('   |   ');
    } catch (e) {
        console.log('Forecast fetch error:', e);
        return null;
    }
};

async function updateTicker() {
    const feeds = [
        { name: "20 Minutes", url: "https://partner-feeds.20min.ch/rss/20minutes/suisse-romande" },
        { name: "20 Minutes", url: "https://partner-feeds.20min.ch/rss/20minutes/suisse" },
        { name: "20 Minutes", url: "https://partner-feeds.20min.ch/rss/20minutes/monde" },
        { name: "20 Minutes", url: "https://partner-feeds.20min.ch/rss/20minutes/economie" },
        { name: "20 Minutes", url: "https://partner-feeds.20min.ch/rss/20minutes/sports" }
    ];

    const headlines = [];

    const forecastText = await getForecast();
    if (forecastText) {
        headlines.push(forecastText);
    }

    for (const feed of feeds) {
        try {
            const apiUrl = `https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(feed.url)}`;
            const response = await fetch(apiUrl);
            const data = await response.json();

            if (data.status === 'ok' && data.items) {
                data.items.slice(0, 4).forEach(item => {
                    if (item.title) {
                        headlines.push(`${feed.name}: ${item.title}`);
                    }
                });
            }
        } catch (err) {
            console.log("Ticker error for feed:", feed.name, err);
        }
    }

    if (headlines.length > 0) {
        ticker.textContent = headlines.join("   •   ");
        startTicker();
    } else {
        ticker.textContent = "Could not load ticker content";
    }
}

function startTicker() {
    const width = ticker.offsetWidth;
    const distance = width + window.innerWidth;
    const duration = distance * 15;

    ticker.animate(
        [
            { transform: `translateX(${window.innerWidth}px)` },
            { transform: `translateX(-${width}px)` }
        ],
        {
            duration: duration,
            iterations: Infinity,
            easing: "linear"
        }
    );
}

updateTicker();
setInterval(updateTicker, 600000);