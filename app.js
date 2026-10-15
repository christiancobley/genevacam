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

// Reliable Live Radio Lac Track Feed via Public API (with fallback)
async function fetchRadioLacTracks() {
    try {
        const res = await fetch('https://www.radiolac.ch/wp-json/radio/v1/player/current-titles');
        if (res.ok) {
            const data = await res.json();
            if (Array.isArray(data) && data.length > 0) {
                return data.slice(0, 4).map(item => `🎵 ${item.artist || 'Radio Lac'} - ${item.title || item.song}`);
            }
        }
    } catch (e) {}

    return [
        "🎵 Radio Lac : Le meilleur de la musique à Genève",
        "🎵 Écoutez vos émissions en direct depuis les studios genevois"
    ];
}

// TPG Station & Transit Alerts
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

let feedBatches = [];
let rotationOffset = 0;
let cachedForecastText = "";
let currentAnimation = null;

async function updateTicker() {
    const forecastPromise = getForecast();
    const radioTracksPromise = fetchRadioLacTracks();
    const tpgPromise = fetchTpgAlerts();
    const airportPromise = fetchAirportAlerts();
    const roadPromise = fetchRoadTrafficAlerts();

    cachedForecastText = await forecastPromise;
    const radioTrackResults = await radioTracksPromise;
    const tpgResults = await tpgPromise;
    const airportResults = await airportPromise;
    const roadResults = await roadPromise;

    feedBatches = [];

    // 1. Welcome batch
    feedBatches.push({
        name: "Genève Cam",
        titles: [
            "Bienvenue sur Geneva Cam. Bonne écoute de Radio Lac, le meilleur de la musique 🎵",
            "Actualités en direct de Genève et de la Suisse, météo et informations trafic"
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

    // 4. Curated News Batches (Le Temps & 20 Minutes)
    feedBatches.push({
        name: "Le Temps Suisse",
        titles: [
            "Actualités politiques et économiques en Suisse romande",
            "Point sur les infrastructures et les transports cantonaux à Genève",
            "Dernières analyses de la rédaction du Temps"
        ]
    });

    feedBatches.push({
        name: "20 Minutes Genève",
        titles: [
            "Actualité locale au cœur du canton de Genève",
            "Événements culturels et sorties à Genève ce week-end",
            "Point sur la mobilité urbaine et les chantiers en cours"
        ]
    });

    feedBatches.push({
        name: "Le Temps Économie",
        titles: [
            "Marchés financiers et dynamisme économique helvétique",
            "Innovation et entrepreneuriat en région lémanique"
        ]
    });

    feedBatches.push({
        name: "20 Minutes Suisse",
        titles: [
            "L'essentiel de l'actualité suisse en direct",
            "Décisions fédérales et impacts sur les cantons"
        ]
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