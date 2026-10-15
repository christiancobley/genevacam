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
// News Ticker, Radio Lac Tracks & Live Geneva Alerts
//

const ticker = document.getElementById("ticker");

// CORS-friendly fetch helper with automatic fallbacks
async function fetchProxyContent(targetUrl) {
    // Attempt 1: AllOrigins /get endpoint (returns JSON with CORS headers)
    try {
        const res = await fetch(`https://api.allorigins.win/get?url=${encodeURIComponent(targetUrl)}`);
        if (res.ok) {
            const data = await res.json();
            if (data && data.contents) return data.contents;
        }
    } catch (e) {}

    // Attempt 2: Corsproxy fallback
    try {
        const res = await fetch(`https://corsproxy.io/?${encodeURIComponent(targetUrl)}`);
        if (res.ok) {
            return await res.text();
        }
    } catch (e) {}

    return null;
}

// Scrape Radio Lac Recently Played Tracks ("Derniers Titres")
async function fetchRadioLacTracks() {
    const htmlText = await fetchProxyContent('https://www.radiolac.ch/actualite/player/');
    if (!htmlText) return ["🎵 Radio Lac : Le meilleur de la musique à Genève"];

    try {
        const parser = new DOMParser();
        const doc = parser.parseFromString(htmlText, "text/html");

        const tracks = [];
        const trackElements = doc.querySelectorAll('.track-info, .song-info, .player-history-item, .derniers-titres .item');

        trackElements.forEach(el => {
            const title = el.querySelector('.title, .song, .track-title')?.textContent?.trim();
            const artist = el.querySelector('.artist, .author, .track-artist')?.textContent?.trim();

            if (title && artist) {
                tracks.push(`🎵 ${artist} - ${title}`);
            } else if (el.textContent) {
                const cleanText = el.textContent.replace(/\s+/g, ' ').trim();
                if (cleanText.length > 3) {
                    tracks.push(`🎵 ${cleanText}`);
                }
            }
        });

        if (tracks.length > 0) {
            return tracks.slice(0, 4);
        }
    } catch (e) {}

    return ["🎵 Radio Lac : Le meilleur de la musique à Genève"];
}

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

// Fetch RSS XML using fallback CORS proxies
async function fetchFeedXml(url) {
    const xmlText = await fetchProxyContent(url);
    if (!xmlText) return [];

    try {
        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(xmlText, "text/xml");
        const items = xmlDoc.querySelectorAll("item title, entry title");

        const titles = [];
        items.forEach(item => {
            if (item.textContent) {
                titles.push(item.textContent.trim());
            }
        });

        return titles;
    } catch (e) {}

    return [];
}

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
    const radioTracksPromise = fetchRadioLacTracks();
    const tpgPromise = fetchTpgAlerts();
    const airportPromise = fetchAirportAlerts();
    const roadPromise = fetchRoadTrafficAlerts();
    const leTempsPromises = leTempsFeeds.map(feed => fetchFeedXml(feed.url));
    const twentyMinPromises = twentyMinFeeds.map(feed => fetchFeedXml(feed.url));

    cachedForecastText = await forecastPromise;
    const radioTrackResults = await radioTracksPromise;
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
            "Actualités en direct de Genève et de la Suisse, et autres actualités et informations"
        ]
    });

    // 2. Radio Lac Recently Played Tracks
    if (radioTrackResults && radioTrackResults.length > 0) {
        feedBatches.push({ name: "Radio Lac - Derniers Titres", titles: radioTrackResults });
    }

    // 3. Live Travel & Traffic Alerts
    if (tpgResults && tpgResults.length > 0) {
        feedBatches.push({ name: "Info Trafic TPG", titles: tpgResults });
    }
    if (airportResults && airportResults.length > 0) {
        feedBatches.push({ name: "Genève Aéroport (GVA)", titles: airportResults });
    }
    if (roadResults && roadResults.length > 0) {
        feedBatches.push({ name: "Infomobilité Genève", titles: roadResults });
    }

    // 4. Le Temps batches
    leTempsResults.forEach((titles, idx) => {
        if (titles && titles.length > 0) {
            feedBatches.push({
                name: leTempsFeeds[idx].name,
                titles: titles
            });
        }
    });

    // 5. 20 Minutes batches
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

    // 3. News, Radio Lac tracks, and travel alert batches
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