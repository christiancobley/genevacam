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

radioToggle.addEventListener("click", () => {
    if (radio.paused) {
        radio.play()
            .then(() => {
                radioToggle.classList.add("active");
                console.log("Radio playing");
            })
            .catch(err => console.log("Radio playback error:", err));
    } else {
        radio.pause();
        radioToggle.classList.remove("active");
        console.log("Radio paused");
    }
});

//
// Clock (French)
//

function updateClock() {
    const now = new Date();

    document.getElementById("clock").textContent =
        now.toLocaleTimeString(
            "fr-FR",
            {
                hour: "2-digit",
                minute: "2-digit",
                timeZone: "Europe/Zurich"
            }
        ) + " • Genève";

    let dateStr = now.toLocaleDateString(
        "fr-FR",
        {
            weekday: "long",
            day: "numeric",
            month: "long",
            timeZone: "Europe/Zurich"
        }
    );
    dateStr = dateStr.charAt(0).toUpperCase() + dateStr.slice(1);
    document.getElementById("date").textContent = dateStr;
}

updateClock();
setInterval(updateClock, 1000);

//
// Weather (French)
//

async function updateWeather() {
    try {
        const response = await fetch(
            "https://api.open-meteo.com/v1/forecast?latitude=46.2044&longitude=6.1432&current=temperature_2m,weather_code,wind_speed_10m&timezone=Europe/Zurich"
        );
        const data = await response.json();

        let condition = "Inconnu";
        switch (data.current.weather_code) {
            case 0: condition = "Ciel dégagé"; break;
            case 1: case 2: case 3: condition = "Partiellement nuageux"; break;
            case 45: case 48: condition = "Brouillard"; break;
            case 51: case 53: case 55: condition = "Bruine"; break;
            case 61: case 63: case 65: condition = "Pluie"; break;
            case 71: case 73: case 75: condition = "Neige"; break;
            case 95: condition = "Orage"; break;
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
// News Ticker & Weather Forecast
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

async function fetchFeedXml(url) {
    const apiUrl = `https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(url)}`;

    try {
        const response = await fetch(apiUrl);
        if (!response.ok) return [];

        const data = await response.json();
        if (data.status === 'ok' && data.items && data.items.length > 0) {
            return data.items.map(item => item.title.trim());
        }
    } catch (e) {
        console.log("Safely caught feed error for:", url, e);
    }
    return [];
}

let feedBatches = [];
let rotationOffset = 0;
let cachedForecastText = "";
let currentAnimation = null;

async function updateTicker() {
    const feeds = [
        { name: "20 Minutes Genève", url: "https://partner-feeds.20min.ch/rss/20minutes/suisse-romande/geneve" },
        { name: "20 Minutes Principal", url: "https://partner-feeds.20min.ch/rss/20minutes" },
        { name: "20 Minutes Suisse Romande", url: "https://partner-feeds.20min.ch/rss/20minutes/suisse-romande" },
        { name: "20 Minutes Suisse", url: "https://partner-feeds.20min.ch/rss/20minutes/suisse" },
        { name: "20 Minutes Monde", url: "https://partner-feeds.20min.ch/rss/20minutes/monde" },
        { name: "20 Minutes Economie", url: "https://partner-feeds.20min.ch/rss/20minutes/economie" },
        { name: "20 Minutes Sports", url: "https://partner-feeds.20min.ch/rss/20minutes/sports" }
    ];

    const [forecastResult, ...feedResults] = await Promise.allSettled([
        getForecast(),
        ...feeds.map(feed => fetchFeedXml(feed.url))
    ]);

    cachedForecastText = forecastResult.status === 'fulfilled' ? (forecastResult.value || "") : "";
    feedBatches = [];

    // Welcome batch with Geneva, Switzerland, and additional info
    feedBatches.push({
        name: "Genève Cam",
        titles: [
            "Bienvenue sur Geneva Cam",
            "Actualités en direct de Genève et de la Suisse, et autres actualités et informations"
        ]
    });

    feedResults.forEach((result, idx) => {
        if (result.status === 'fulfilled' && result.value && result.value.length > 0) {
            feedBatches.push({
                name: feeds[idx].name,
                titles: result.value
            });
        }
    });

    renderNextRotationBatch();
}

function renderNextRotationBatch() {
    const headlines = [];

    feedBatches.forEach(batch => {
        const total = batch.titles.length;
        if (total > 0) {
            for (let i = 0; i < Math.min(3, total); i++) {
                const storyIndex = (rotationOffset + i) % total;
                headlines.push(`${batch.name}: ${batch.titles[storyIndex]}`);
            }
        }
    });

    if (cachedForecastText) {
        headlines.push(cachedForecastText);
    }

    rotationOffset = (rotationOffset + 3) % 10;

    if (headlines.length > 0) {
        // Keep ticker hidden while updating text to prevent render flash
        ticker.style.visibility = "hidden";
        ticker.textContent = headlines.join("   •   ");
        
        requestAnimationFrame(() => {
            ticker.style.visibility = "visible";
            startTicker();
        });
    } else {
        ticker.textContent = "Impossible de charger le flux d'actualités";
    }
}

function startTicker() {
    if (currentAnimation) {
        currentAnimation.cancel();
    }

    requestAnimationFrame(() => {
        const width = ticker.offsetWidth;
        const distance = width + window.innerWidth;
        const isMobilePortrait = window.matchMedia("(max-width: 768px) and (orientation: portrait)").matches;
        const duration = isMobilePortrait ? distance * 11.4 : distance * 6.4;

        currentAnimation = ticker.animate(
            [
                { transform: `translateX(${window.innerWidth}px)` },
                { transform: `translateX(-${width}px)` }
            ],
            {
                duration: duration,
                iterations: 1,
                easing: "linear"
            }
        );

        currentAnimation.onfinish = () => {
            renderNextRotationBatch();
        };
    });
}

updateTicker();
setInterval(updateTicker, 600000);