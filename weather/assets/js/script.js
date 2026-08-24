'use strict';

const CFG = {
    API_KEY: '5dce7401294749de557d85ddfee63adc',
    BASE: 'https://api.openweathermap.org/data/2.5',
    GEO: 'https://api.openweathermap.org/geo/1.0',
    ICONS: 'https://openweathermap.org/img/wn',
    REFRESH: 10 * 60 * 1000,
    FALLBACK: { lat: 51.5074, lon: -0.1278, name: 'London' },
};

const S = {
    unit: 'metric',
    lat: null, lon: null,
    timer: null,
};

const el = id => document.getElementById(id);
const searchInput = el('search-input');
const acList = el('ac-list');
const weatherBlock = el('weather-content');
const loadingEl = el('loading');
const errorBar = el('error-bar');
const setupNotice = el('setup-notice');

const hasKey = () => CFG.API_KEY && CFG.API_KEY !== '';
const round = n => Math.round(n);
const tUnit = () => S.unit === 'metric' ? '°C' : '°F';
const wUnit = () => S.unit === 'metric' ? 'km/h' : 'mph';
const toWind = mps => S.unit === 'metric' ? round(mps * 3.6) : round(mps * 2.237);
const iconUrl = (code, x = 2) => `${CFG.ICONS}/${code}@${x}x.png`;

function utcTime(unix, tzOffset) {
    const d = new Date((unix + tzOffset) * 1000);
    return [
        String(d.getUTCHours()).padStart(2, '0'),
        String(d.getUTCMinutes()).padStart(2, '0')
    ].join(':');
}

function dayName(dt) {
    return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][new Date(dt * 1000).getDay()];
}

async function apiFetch(url) {
    const r = await fetch(url);
    if (!r.ok) {
        if (r.status === 401) throw new Error('Invalid API key. Check your OpenWeatherMap key and wait up to 2 hours after registration.');
        if (r.status === 404) throw new Error('Location not found. Try a different city name.');
        throw new Error(`API error ${r.status}. Please try again.`);
    }
    return r.json();
}

async function loadWeather(lat, lon) {
    if (!hasKey()) { setupNotice.style.display = 'block'; return; }
    setupNotice.style.display = 'none';
    showLoading(true); hideError();

    try {
        const u = S.unit;
        const [w, f] = await Promise.all([
            apiFetch(`${CFG.BASE}/weather?lat=${lat}&lon=${lon}&units=${u}&appid=${CFG.API_KEY}`),
            apiFetch(`${CFG.BASE}/forecast?lat=${lat}&lon=${lon}&units=${u}&appid=${CFG.API_KEY}`)
        ]);
        S.lat = lat; S.lon = lon;
        renderCurrent(w);
        renderForecast(f);
        renderTime();
        weatherBlock.classList.remove('hidden');
        startRefresh();
    } catch (err) {
        showError(err.message || 'Failed to load weather. Check your connection and try again.');
        weatherBlock.classList.add('hidden');
    } finally {
        showLoading(false);
    }
}

async function geocode(q) {
    return apiFetch(`${CFG.GEO}/direct?q=${encodeURIComponent(q)}&limit=5&appid=${CFG.API_KEY}`);
}

function renderCurrent(d) {
    const w = d.weather[0];
    const tz = d.timezone;
    const now = new Date();

    el('w-date').textContent = now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
    el('w-city').textContent = d.name;
    el('w-state').textContent = d.sys.country;
    el('w-temp').textContent = round(d.main.temp);
    el('w-sym').textContent = tUnit();
    el('w-desc').textContent = w.description;
    el('w-feels').textContent = `Feels like ${round(d.main.feels_like)}° · H:${round(d.main.temp_max)}°  L:${round(d.main.temp_min)}°`;

    const icon = el('w-icon');
    icon.src = iconUrl(w.icon, 4);
    icon.alt = w.description;

    el('m-hum').textContent = d.main.humidity;
    el('m-wind').textContent = toWind(d.wind.speed);
    el('wind-unit').textContent = wUnit();
    el('m-vis').textContent = (d.visibility / 1000).toFixed(1);
    el('m-pres').textContent = d.main.pressure;

    el('w-rise').textContent = utcTime(d.sys.sunrise, tz);
    el('w-set').textContent = utcTime(d.sys.sunset, tz);
}

function renderForecast(data) {
    const byDay = {};
    for (const item of data.list) {
        const key = new Date(item.dt * 1000).toDateString();
        (byDay[key] = byDay[key] || []).push(item);
    }

    const days = Object.entries(byDay).slice(1, 6);
    const strip = el('forecast-strip');
    strip.innerHTML = '';

    for (const [, items] of days) {
        const best = items.reduce((a, b) =>
            Math.abs(new Date(a.dt * 1000).getHours() - 12) <
                Math.abs(new Date(b.dt * 1000).getHours() - 12) ? a : b);
        const hi = round(Math.max(...items.map(i => i.main.temp_max)));
        const lo = round(Math.min(...items.map(i => i.main.temp_min)));

        const li = document.createElement('li');
        li.className = 'f-card';
        li.setAttribute('role', 'listitem');
        li.setAttribute('aria-label',
            `${dayName(best.dt)}: ${best.weather[0].description}, high ${hi}°, low ${lo}°`);
        li.innerHTML = `
      <div class="f-day">${dayName(best.dt)}</div>
      <img class="f-icon" src="${iconUrl(best.weather[0].icon, 2)}"
           alt="${best.weather[0].description}" loading="lazy">
      <div class="f-main">${best.weather[0].main}</div>
      <div class="f-temps">
        <span class="f-hi">${hi}°</span>
        <span class="f-lo">${lo}°</span>
      </div>`;
        strip.appendChild(li);
    }
}

function renderTime() {
    el('upd-time').textContent = new Date().toLocaleTimeString('en-US',
        { hour: '2-digit', minute: '2-digit' });
}

function setUnit(u) {
    if (S.unit === u) return;
    S.unit = u;
    ['metric', 'imperial'].forEach(v => {
        const btn = el(v === 'metric' ? 'btn-c' : 'btn-f');
        btn.classList.toggle('active', v === u);
        btn.setAttribute('aria-pressed', v === u ? 'true' : 'false');
    });
    if (S.lat) loadWeather(S.lat, S.lon);
}

function geoLocate() {
    if (!navigator.geolocation) {
        showError('Geolocation is not supported by your browser.'); return;
    }
    showLoading(true);
    navigator.geolocation.getCurrentPosition(
        p => loadWeather(p.coords.latitude, p.coords.longitude),
        () => {
            showLoading(false);
            showError('Location permission denied. Please search for a city manually.');
        },
        { timeout: 8000 }
    );
}

let _debounce = null;
let _acResults = [];
let _focusIdx = -1;

searchInput.addEventListener('input', () => {
    clearTimeout(_debounce);
    const q = searchInput.value.trim();
    if (q.length < 2) { hideAC(); return; }
    _debounce = setTimeout(() => fetchAC(q), 360);
});

searchInput.addEventListener('keydown', e => {
    const items = acList.querySelectorAll('.ac-item');
    if (e.key === 'ArrowDown') { e.preventDefault(); moveFocus(items, 1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); moveFocus(items, -1); }
    else if (e.key === 'Enter') { e.preventDefault(); onEnter(); }
    else if (e.key === 'Escape') { hideAC(); }
});

function moveFocus(items, dir) {
    _focusIdx = Math.max(-1, Math.min(_focusIdx + dir, items.length - 1));
    items.forEach((el, i) => el.classList.toggle('focused', i === _focusIdx));
    if (_focusIdx >= 0) items[_focusIdx].scrollIntoView({ block: 'nearest' });
}

async function fetchAC(q) {
    if (!hasKey()) return;
    try {
        _acResults = await geocode(q);
        renderAC(_acResults);
    } catch { }
}

function renderAC(results) {
    if (!results.length) { hideAC(); return; }
    acList.innerHTML = '';
    _focusIdx = -1;

    results.forEach((c, i) => {
        const li = document.createElement('li');
        li.className = 'ac-item';
        li.setAttribute('role', 'option');
        li.setAttribute('id', `ac-${i}`);
        li.innerHTML = `
      <svg width="11" height="11" viewBox="0 0 24 24"
           fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true">
        <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/>
        <circle cx="12" cy="10" r="3"/>
      </svg>
      <span class="city">${c.name}</span>
      <span>${c.state ? c.state + ', ' : ''}${c.country}</span>`;
        li.addEventListener('click', () => pick(c));
        acList.appendChild(li);
    });

    acList.classList.remove('hidden');
    searchInput.setAttribute('aria-expanded', 'true');
}

function hideAC() {
    acList.classList.add('hidden');
    acList.innerHTML = '';
    searchInput.setAttribute('aria-expanded', 'false');
    _focusIdx = -1;
}

function pick(city) {
    searchInput.value = `${city.name}, ${city.country}`;
    hideAC();
    loadWeather(city.lat, city.lon);
}

async function onEnter() {
    if (_focusIdx >= 0 && _acResults[_focusIdx]) { pick(_acResults[_focusIdx]); return; }
    const q = searchInput.value.trim();
    if (!q || !hasKey()) return;
    try {
        const results = await geocode(q);
        if (results.length) pick(results[0]);
        else showError(`No city found for "${q}". Try a more specific name.`);
    } catch (err) {
        showError(err.message || 'Search failed. Please try again.');
    }
}

document.addEventListener('click', e => {
    if (!e.target.closest('.search-container')) hideAC();
});

function startRefresh() {
    clearInterval(S.timer);
    S.timer = setInterval(() => { if (S.lat) loadWeather(S.lat, S.lon); }, CFG.REFRESH);
}

function manualRefresh() {
    if (S.lat) loadWeather(S.lat, S.lon);
}

function showLoading(v) { loadingEl.classList.toggle('show', v); }
function showError(msg) { el('error-msg').textContent = msg; errorBar.classList.add('show'); }
function hideError() { errorBar.classList.remove('show'); }

(function stars() {
    const cv = el('bg-canvas');
    const ctx = cv.getContext('2d');
    let st = [], t = 0;

    function resize() {
        cv.width = window.innerWidth;
        cv.height = window.innerHeight;
    }

    function seed(n = 130) {
        st = Array.from({ length: n }, () => ({
            x: Math.random() * cv.width,
            y: Math.random() * cv.height,
            r: Math.random() * 1.1 + 0.2,
            a: Math.random() * 0.45 + 0.08,
            s: Math.random() * 0.004 + 0.001,
            p: Math.random() * Math.PI * 2,
        }));
    }

    function draw() {
        ctx.clearRect(0, 0, cv.width, cv.height);
        t += 0.01;
        for (const s of st) {
            const a = s.a * (0.55 + 0.45 * Math.sin(t * s.s * 60 + s.p));
            ctx.beginPath();
            ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(190,205,225,${a})`;
            ctx.fill();
        }
        requestAnimationFrame(draw);
    }

    resize(); seed(); draw();
    window.addEventListener('resize', () => { resize(); seed(); });
})();

(function init() {
    if (!hasKey()) {
        setupNotice.style.display = 'block';
        return;
    }
    setupNotice.style.display = 'none';
    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
            p => loadWeather(p.coords.latitude, p.coords.longitude),
            () => loadWeather(CFG.FALLBACK.lat, CFG.FALLBACK.lon),
            { timeout: 5000 }
        );
    } else {
        loadWeather(CFG.FALLBACK.lat, CFG.FALLBACK.lon);
    }
})();