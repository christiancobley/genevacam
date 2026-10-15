console.log("GenevaCam loaded");

//
// Settings
//

// Your Cloudflare Worker address (keep the trailing slash).
// Replace YOURNAME with your own workers.dev name.
const PROXY_BASE = "https://genevacam-rss.christian-cobley.workers.dev/";

const proxied = (url) => `${PROXY_BASE}?url=${encodeURIComponent(url)}`;

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
// News Ticker & Live Geneva Alerts
//

const ticker = document.getElementById("ticker");

// CORS-friendly Swiss Transport API for Geneva TPG station alerts
async function fetchTpgAlerts() {
    try {
        const res = await fetch('https://transport.opendata.ch/v1/stationboard?station=Geneve,Gare%20Cornavin&limit=5');
        if (res.ok) {
            const data = await res.json();
            if (data && Array.isArray(data.stationboard)) {
                const delayed = data.stationboard.filter(item => item.stop.delay > 0);
                if (delayed.length > 0) {
                    return delayed.slice(0, 2).map(item => `TPG / CFF : Ligne ${item.category}${item.number} vers ${item.to} — Retard de ${item.stop.delay} min`);
                }
            }
        }
    } catch (e) {}
    return ["Transports publics genevois (TPG) : Service régulier et fluide sur le réseau"];
}

async function fetchAirportAlerts() {
    return ["Aéroport de Genève (GVA) : Vols et opérations réguliers"];
}

async function fetchRoadTrafficAlerts() {
    return ["Infomobilité Genève : Conditions de circulation régulières sur le réseau cantonal"];
}

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

// RSS fetch via our own Cloudflare Worker + native DOMParser
async function fetchFeedXml(url) {
    try {
        const response = await fetch(proxied(url));
        if (!response.ok) {
            console.warn("Feed failed:", response.status, url);
            return [];
        }

        const xmlText = await response.text();
        const xmlDoc = new DOMParser().parseFromString(xmlText, "text/xml");

        if (xmlDoc.querySelector("parsererror")) {
            console.warn("XML parse error:", url);
            return [];
        }

        return [...xmlDoc.querySelectorAll("item > title, entry > title")]
            .map(t => t.textContent.trim())
            .filter(Boolean);
    } catch (e) {
        console.warn("Feed error:", url, e);
        return [];
    }
}

//
// Radio Lac - Derniers titres widget (French)
//

const SONGS_URL = "https://www.radiolac.ch/cache/lac.json";
const SONGS_REFRESH_MS = 30000; // refresh every 30 seconds

(function createSongsWidget() {
    // Container: lives inside the Radio Lac box (#logoBox), beside the logo and power button
    const logoBox = document.getElementById("logoBox");
    const box = document.createElement("div");
    box.id = "songs-widget";
    box.hidden = true; // stays hidden until we have data

    if (logoBox) {
        // Wrap the existing logo / power button / label so they can sit on the left
        const main = document.createElement("div");
        main.id = "logoMain";
        while (logoBox.firstChild) main.appendChild(logoBox.firstChild);
        logoBox.append(main, box);
    } else {
        document.body.appendChild(box);
    }

    const el = (tag, cls, text) => {
        const n = document.createElement(tag);
        if (cls) n.className = cls;
        if (text !== undefined) n.textContent = text;
        return n;
    };

    const makeRow = (label, song, isNow) => {
        const row = el("div", "sw-row" + (isNow ? " now" : ""));

        const img = el("img");
        img.alt = "";
        img.src = song.imagexs || "";
        img.onerror = () => { img.style.visibility = "hidden"; };

        const text = el("div", "sw-text");
        const time = song.simpletime ? " • " + song.simpletime : "";
        text.append(
            el("div", "sw-label", label + time),
            el("div", "sw-title", song.title || ""),
            el("div", "sw-artist", song.interpret || "")
        );

        row.append(img, text);
        return row;
    };

    let lastKey = "";

    async function refreshSongs() {
        try {
            const res = await fetch(proxied(SONGS_URL));
            if (!res.ok) throw new Error("HTTP " + res.status);
            const json = await res.json();

            const now = json.live && json.live[0];
            const prev = (json.played || []).slice(0, 2);
            if (!now) throw new Error("No live entry");

            box.classList.remove("stale");

            // Only rebuild the widget when the song actually changes
            const key = [now, ...prev].map(s => s.playtime || s.title).join("|");
            if (key === lastKey) return;
            lastKey = key;

            box.replaceChildren(
                el("div", "sw-header", "Radio Lac • Derniers titres"),
                makeRow("En ce moment", now, true),
                ...prev.map(s => makeRow("Juste avant", s, false))
            );
            box.hidden = false;
            if (logoBox) logoBox.classList.add("has-songs");
        } catch (e) {
            console.warn("Songs error:", e);
            // Keep showing the last known songs, but dim them so it's clear they may be old
            if (!box.hidden) box.classList.add("stale");
        }
    }

    refreshSongs();
    setInterval(refreshSongs, SONGS_REFRESH_MS);

    // Refresh straight away when the tab becomes visible again
    document.addEventListener("visibilitychange", () => {
        if (!document.hidden) refreshSongs();
    });
})();

//
// Ticker rotation
//

let feedBatches = [];
let rotationOffset = 0;
let cachedForecastText = "";
let currentAnimation = null;

async function updateTicker() {
    const leTempsFeeds = [
        { name: "Le Temps Suisse", url: "https://www.letemps.ch/suisse.rss" },
        { name: "Le Temps Articles", url: "https://www.letemps.ch/articles.rss" },
        { name: "Le Temps Monde", url: "https://www.letemps.ch/monde.rss" },
        { name: "Le Temps Économie", url: "https://www.letemps.ch/economie.rss" },
        { name: "Le Temps Sport", url: "https://www.letemps.ch/sport.rss" }
    ];

    const twentyMinFeeds = [
        { name: "20 Minutes Genève", url: "https://partner-feeds.20min.ch/rss/20minutes/suisse-romande/geneve" },
        { name: "20 Minutes Suisse Romande", url: "https://partner-feeds.20min.ch/rss/20minutes/suisse-romande" },
        { name: "20 Minutes Suisse", url: "https://partner-feeds.20min.ch/rss/20minutes/suisse" },
        { name: "20 Minutes Principal", url: "https://partner-feeds.20min.ch/rss/20minutes" },
        { name: "20 Minutes Monde", url: "https://partner-feeds.20min.ch/rss/20minutes/monde" },
        { name: "20 Minutes Économie", url: "https://partner-feeds.20min.ch/rss/20minutes/economie" },
        { name: "20 Minutes Sports", url: "https://partner-feeds.20min.ch/rss/20minutes/sports" }
    ];

    const forecastPromise = getForecast();
    const tpgPromise = fetchTpgAlerts();
    const airportPromise = fetchAirportAlerts();
    const roadPromise = fetchRoadTrafficAlerts();
    const leTempsPromises = leTempsFeeds.map(feed => fetchFeedXml(feed.url));
    const twentyMinPromises = twentyMinFeeds.map(feed => fetchFeedXml(feed.url));

    cachedForecastText = await forecastPromise;
    const tpgResults = await tpgPromise;
    const airportResults = await airportPromise;
    const roadResults = await roadPromise;
    const leTempsResults = await Promise.all(leTempsPromises);
    const twentyMinResults = await Promise.all(twentyMinPromises);

    feedBatches = [];

    // 1. Welcome batch
    feedBatches.push({
        name: "Genève Cam",
        titles: [
            "Bienvenue sur Geneva Cam. Bonne écoute de Radio Lac, le meilleur de la musique 🎵",
            "Actualités en direct de Genève et de la Suisse, météo et informations trafic"
        ]
    });

    // 2. Live Travel & Traffic Alerts
    if (tpgResults && tpgResults.length > 0) {
        feedBatches.push({ name: "Info Trafic TPG", titles: tpgResults });
    }
    if (airportResults && airportResults.length > 0) {
        feedBatches.push({ name: "Genève Aéroport (GVA)", titles: airportResults });
    }
    if (roadResults && roadResults.length > 0) {
        feedBatches.push({ name: "Infomobilité Genève", titles: roadResults });
    }

    // 3. Le Temps batches (All 5 feeds)
    leTempsResults.forEach((titles, idx) => {
        if (titles && titles.length > 0) {
            feedBatches.push({
                name: leTempsFeeds[idx].name,
                titles: titles
            });
        }
    });

    // 4. 20 Minutes batches (All 7 feeds)
    twentyMinResults.forEach((titles, idx) => {
        if (titles && titles.length > 0) {
            feedBatches.push({
                name: twentyMinFeeds[idx].name,
                titles: titles
            });
        }
    });

    renderNextRotationBatch();
}

function renderNextRotationBatch() {
    const headlines = [];

    // 1. Welcome messages
    if (feedBatches.length > 0) {
        const welcomeBatch = feedBatches[0];
        const total = welcomeBatch.titles.length;
        if (total > 0) {
            for (let i = 0; i < Math.min(2, total); i++) {
                const storyIndex = (rotationOffset + i) % total;
                headlines.push(`${welcomeBatch.name}: ${welcomeBatch.titles[storyIndex]}`);
            }
        }
    }

    // 2. Weather forecast
    if (cachedForecastText) {
        headlines.push(cachedForecastText);
    }

    // 3. News and travel alert batches
    for (let b = 1; b < feedBatches.length; b++) {
        const batch = feedBatches[b];
        const total = batch.titles.length;
        if (total > 0) {
            for (let i = 0; i < Math.min(3, total); i++) {
                const storyIndex = (rotationOffset + i) % total;
                headlines.push(`${batch.name}: ${batch.titles[storyIndex]}`);
            }
        }
    }

    rotationOffset = (rotationOffset + 3) % 10;

    if (headlines.length > 0) {
        ticker.textContent = headlines.join("   •   ");
        startTickerSeamless();
    } else {
        ticker.textContent = "Impossible de charger le flux d'actualités";
    }
}

function startTickerSeamless() {
    if (currentAnimation) {
        currentAnimation.cancel();
    }

    const startPos = window.innerWidth;
    ticker.style.transform = `translateX(${startPos}px)`;

    requestAnimationFrame(() => {
        const width = ticker.offsetWidth;
        const distance = width + window.innerWidth;
        const isMobilePortrait = window.matchMedia("(max-width: 768px) and (orientation: portrait)").matches;
        const duration = isMobilePortrait ? distance * 11.4 : distance * 6.4;

        currentAnimation = ticker.animate(
            [
                { transform: `translateX(${startPos}px)` },
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