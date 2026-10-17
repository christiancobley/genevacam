console.log("GenevaCam loaded");

//
// Settings
//

// Your Cloudflare Worker address (keep the trailing slash).
// Replace YOURNAME with your own workers.dev name.
const PROXY_BASE = "https://genevacam-rss.christian-cobley.workers.dev/";

const proxied = (url) => `${PROXY_BASE}?url=${encodeURIComponent(url)}`;

//
// Full screen toggle
//

function isFullscreen() {
    return !!(document.fullscreenElement || document.webkitFullscreenElement);
}

(function setupFullscreen() {
    const btn = document.getElementById("fullscreen-btn");
    if (!btn) return;

    const root = document.documentElement;
    const canFullscreen = document.fullscreenEnabled || document.webkitFullscreenEnabled;

    // iPhone Safari can't do this for web pages: hide the button rather than show a dead one
    if (!canFullscreen) {
        btn.hidden = true;
        return;
    }

    function updateButton() {
        const on = isFullscreen();
        btn.classList.toggle("is-fullscreen", on);
        const label = on ? "Quitter le plein écran" : "Plein écran";
        btn.setAttribute("aria-label", label);
        btn.title = label;
    }

    btn.addEventListener("click", () => {
        try {
            if (isFullscreen()) {
                const exit = document.exitFullscreen || document.webkitExitFullscreen;
                Promise.resolve(exit.call(document)).catch(err => console.warn("Exit fullscreen:", err));
            } else {
                const enter = root.requestFullscreen || root.webkitRequestFullscreen;
                Promise.resolve(enter.call(root)).catch(err => console.warn("Fullscreen:", err));
            }
        } catch (err) {
            console.warn("Fullscreen error:", err);
        }
    });

    document.addEventListener("fullscreenchange", updateButton);
    document.addEventListener("webkitfullscreenchange", updateButton);
    updateButton();
})();

//
// Webcam
//

const video = document.getElementById("video");
const STREAM_URL = "https://edge16.vedge.infomaniak.com/livecast/ik:sig2/chunklist_w1380254353.m3u8";

let hls = null;

function startStream() {
    // Tear down any previous attempt first
    if (hls) {
        hls.destroy();
        hls = null;
    }

    if (video.canPlayType("application/vnd.apple.mpegurl")) {
        // Safari and other browsers with native HLS support
        video.src = STREAM_URL;
        video.load();
    } else if (window.Hls && Hls.isSupported()) {
        // Chrome, Firefox, Edge: play HLS through hls.js
        hls = new Hls();
        hls.on(Hls.Events.ERROR, (event, data) => {
            if (!data.fatal) return;
            console.warn("Stream error:", data.type, data.details);
            if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
                hls.startLoad();
            } else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
                hls.recoverMediaError();
            } else {
                setTimeout(startStream, 5000);
            }
        });
        hls.loadSource(STREAM_URL);
        hls.attachMedia(video);
    } else {
        // Last resort
        video.src = STREAM_URL;
    }

    video.play().catch(() => {});
}

// Native playback failed: try again shortly
video.addEventListener("error", () => {
    console.warn("Video error, retrying in 5 seconds");
    setTimeout(startStream, 5000);
});

// Watchdog: if the picture has frozen for 30 seconds, restart the stream
let lastVideoTime = -1;
setInterval(() => {
    if (video.paused) {
        video.play().catch(() => {});
        return;
    }
    if (video.currentTime === lastVideoTime) {
        console.warn("Video stalled, restarting stream");
        startStream();
    }
    lastVideoTime = video.currentTime;
}, 30000);

startStream();

// Reload the whole page once a night (04:00 Geneva time) to keep a 24/7 display fresh.
// Skipped while in full screen, because a reload would drop out of full screen.
const pageLoadedAt = Date.now();
setInterval(() => {
    const parts = new Intl.DateTimeFormat("en-GB", {
        hour: "numeric",
        minute: "numeric",
        hour12: false,
        timeZone: "Europe/Zurich"
    }).formatToParts(new Date());
    const hour = Number(parts.find(p => p.type === "hour").value) % 24;
    const minute = Number(parts.find(p => p.type === "minute").value);
    if (hour === 4 && minute === 0 && Date.now() - pageLoadedAt > 30 * 60 * 1000 && !isFullscreen()) {
        location.reload();
    }
}, 30000);

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

    // Capitalise the first letter of the weekday and of the month (e.g. "Jeudi 15 Octobre")
    const dateStr = new Intl.DateTimeFormat(
        "fr-FR",
        {
            weekday: "long",
            day: "numeric",
            month: "long",
            timeZone: "Europe/Zurich"
        }
    ).formatToParts(now).map(part =>
        (part.type === "weekday" || part.type === "month")
            ? part.value.charAt(0).toUpperCase() + part.value.slice(1)
            : part.value
    ).join("");
    document.getElementById("date").textContent = dateStr;
}

updateClock();
setInterval(updateClock, 1000);

//
// Weather (French)
//

// Open-Meteo (WMO) weather codes, in French. Used by both the clock box and the forecast.
function describeWeatherFr(code) {
    if (code === 0) return "Ciel dégagé";
    if (code === 1) return "Plutôt dégagé";
    if (code === 2) return "Partiellement nuageux";
    if (code === 3) return "Couvert";
    if (code === 45 || code === 48) return "Brouillard";
    if (code >= 51 && code <= 55) return "Bruine";
    if (code === 56 || code === 57) return "Bruine verglaçante";
    if (code >= 61 && code <= 65) return "Pluie";
    if (code === 66 || code === 67) return "Pluie verglaçante";
    if (code >= 71 && code <= 75) return "Neige";
    if (code === 77) return "Grains de neige";
    if (code >= 80 && code <= 82) return "Averses";
    if (code === 85 || code === 86) return "Averses de neige";
    if (code === 95) return "Orage";
    if (code === 96 || code === 99) return "Orage avec grêle";
    return "";
}

async function updateWeather() {
    try {
        const response = await fetch(
            "https://api.open-meteo.com/v1/forecast?latitude=46.2044&longitude=6.1432&current=temperature_2m,weather_code,wind_speed_10m&timezone=Europe/Zurich"
        );
        const data = await response.json();

        const condition = describeWeatherFr(data.current.weather_code);

        const parts = [Math.round(data.current.temperature_2m) + "°C"];
        if (condition) parts.push(condition);
        parts.push(Math.round(data.current.wind_speed_10m) + " km/h");

        document.getElementById("temperature").textContent = parts.join(" • ");
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
const GRANGE_CANAL_STOP_ID = "8592833";
const DEPARTURES_TICKER_SPEED = 91.8; // pixels per second, matching the Alexa ticker pace

(function createSongsWidget() {
    // Container: lives inside the Radio Lac box (#logoBox), beside the logo and power button
    const logoBox = document.getElementById("logoBox");
    const box = document.createElement("div");
    box.id = "songs-widget";
    box.hidden = true; // stays hidden until we have data
    const tramTicker = document.createElement("div");
    tramTicker.id = "tram-ticker";
    tramTicker.setAttribute("aria-label", "Départs des trams à Grange-Canal dans les 15 prochaines minutes");
    const tramTrack = document.createElement("span");
    tramTrack.id = "tram-ticker-track";
    tramTicker.appendChild(tramTrack);
    let tramAnimation = null;
    let lastDepartureText = "";

    const placeTramTicker = () => {
        if (!logoBox) return;
        const portrait = window.matchMedia("(max-width: 768px) and (orientation: portrait)").matches;
        const parent = portrait && !box.hidden ? box : logoBox;
        parent.appendChild(tramTicker);
    };

    const renderTramTicker = (text) => {
        if (text === lastDepartureText) return;
        lastDepartureText = text;
        const loopText = text + "   •   ";
        tramTrack.textContent = loopText + loopText;
        placeTramTicker();
        if (tramAnimation) tramAnimation.cancel();

        requestAnimationFrame(() => {
            const copyWidth = tramTrack.getBoundingClientRect().width / 2;
            if (!copyWidth) return;
            tramAnimation = tramTrack.animate(
                [
                    { transform: "translateX(0px)" },
                    { transform: `translateX(-${copyWidth}px)` }
                ],
                {
                    duration: (copyWidth / DEPARTURES_TICKER_SPEED) * 1000,
                    iterations: Infinity,
                    easing: "linear"
                }
            );
        });
    };

    async function refreshTramDepartures() {
        try {
            const url = `https://transport.opendata.ch/v1/stationboard?id=${GRANGE_CANAL_STOP_ID}&limit=60`;
            const response = await fetch(url);
            if (!response.ok) throw new Error("HTTP " + response.status);
            const data = await response.json();
            const now = Date.now();
            const cutoff = now + 15 * 60 * 1000;
            const formatter = new Intl.DateTimeFormat("fr-CH", {
                hour: "2-digit",
                minute: "2-digit",
                timeZone: "Europe/Zurich"
            });
            const departures = (data.stationboard || [])
                .map(item => {
                    const stop = item.stop || {};
                    const departure = (stop.prognosis && stop.prognosis.departure) || stop.departure;
                    return { item, stop, departure, timestamp: departure ? Date.parse(departure) : NaN };
                })
                .filter(row => String(row.item.category || "").toUpperCase() === "T" &&
                    Number.isFinite(row.timestamp) && row.timestamp >= now && row.timestamp <= cutoff)
                .sort((a, b) => a.timestamp - b.timestamp)
                .map(row => {
                    const line = "T" + (row.item.number || "");
                    const delay = Number(row.stop.delay) > 0 ? " +" + row.stop.delay + " min" : "";
                    return `${line} → ${row.item.to || "destination inconnue"} ${formatter.format(new Date(row.timestamp))}${delay}`;
                });
            renderTramTicker(departures.length
                ? "Grange-Canal : " + departures.join("   •   ")
                : "Grange-Canal : aucun tram prévu dans les 15 prochaines minutes");
        } catch (error) {
            console.warn("Tram departures error:", error);
            renderTramTicker("Départs à Grange-Canal temporairement indisponibles");
        }
    }

    const portraitLayout = window.matchMedia("(max-width: 768px) and (orientation: portrait)");
    const relocateTramTicker = () => {
        placeTramTicker();
        if (lastDepartureText) renderTramTicker(lastDepartureText);
    };
    if (portraitLayout.addEventListener) portraitLayout.addEventListener("change", relocateTramTicker);
    else portraitLayout.addListener(relocateTramTicker);
    window.addEventListener("resize", relocateTramTicker, { passive: true });

    if (logoBox) {
        // Wrap the existing logo / power button / label so they can sit on the left
        const main = document.createElement("div");
        main.id = "logoMain";
        while (logoBox.firstChild) main.appendChild(logoBox.firstChild);
        logoBox.append(main, box, tramTicker);
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
                el("div", "sw-header", "DERNIERS TITRES"),
                makeRow("En ce moment", now, true),
                ...prev.map((s, i) => makeRow(i === 0 ? "Juste avant" : "Avant cela", s, false))
            );
            box.hidden = false;
            if (logoBox) logoBox.classList.add("has-songs");
            placeTramTicker();
        } catch (e) {
            console.warn("Songs error:", e);
            // Keep showing the last known songs, but dim them so it's clear they may be old
            if (!box.hidden) box.classList.add("stale");
        }
    }

    refreshSongs();
    setInterval(refreshSongs, SONGS_REFRESH_MS);
    refreshTramDepartures();
    setInterval(refreshTramDepartures, SONGS_REFRESH_MS);

    // Refresh straight away when the tab becomes visible again
    document.addEventListener("visibilitychange", () => {
        if (!document.hidden) {
            refreshSongs();
            refreshTramDepartures();
        }
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
    const leTempsPromises = leTempsFeeds.map(feed => fetchFeedXml(feed.url));
    const twentyMinPromises = twentyMinFeeds.map(feed => fetchFeedXml(feed.url));

    cachedForecastText = await forecastPromise;
    const tpgResults = await tpgPromise;
    const leTempsResults = await Promise.all(leTempsPromises);
    const twentyMinResults = await Promise.all(twentyMinPromises);

    feedBatches = [];

    // 1. Welcome batch
    feedBatches.push({
        name: "Genève Cam",
        titles: [
            "Bienvenue sur Geneva Cam 😃 Bonne écoute de Radio Lac, le meilleur de la musique 🎵",
            "Actualités en direct de Genève, de Suisse et du monde, ainsi que les dernières informations sur l'économie, le sport, la météo et les transports publics à Genève"
        ]
    });

    // 2. Geneva public transport alerts
    if (tpgResults && tpgResults.length > 0) {
        feedBatches.push({ name: "Transports publics à Genève", titles: tpgResults });
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
        const isMobileLandscape = window.matchMedia("(max-height: 500px) and (orientation: landscape)").matches;
        const duration = isMobilePortrait ? distance * 14.25 : isMobileLandscape ? distance * 10.6666667 : distance * 8.0;

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

// Toggle the camera information panels without interrupting the video or ticker.
(function setupOverlayToggle() {
    const button = document.getElementById("overlay-toggle");
    if (!button) return;

    button.addEventListener("click", () => {
        const hidden = document.body.classList.toggle("boxes-hidden");
        button.textContent = hidden ? "Afficher" : "Masquer";
        button.setAttribute("aria-expanded", String(!hidden));
        button.setAttribute(
            "aria-label",
            hidden ? "Afficher les panneaux d'information" : "Masquer les panneaux d'information"
        );
    });
})();

// Match the Masquer/Afficher control to the credits strip in every viewport.
(function alignOverlayToggleWithCredits() {
    const credits = document.getElementById("credits");
    const button = document.getElementById("overlay-toggle");
    if (!credits || !button) return;

    const align = () => {
        const bounds = credits.getBoundingClientRect();
        button.style.top = `${bounds.top}px`;
        button.style.bottom = "auto";
        button.style.height = `${bounds.height}px`;
        button.style.boxSizing = "border-box";
        button.style.display = "flex";
        button.style.alignItems = "center";
        button.style.justifyContent = "center";
        button.style.paddingTop = "0";
        button.style.paddingBottom = "0";
    };

    align();
    window.addEventListener("resize", align, { passive: true });

    if (typeof ResizeObserver === "function") {
        const observer = new ResizeObserver(align);
        observer.observe(credits);
    }
})();
