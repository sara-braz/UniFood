function fetchWithTimeout(url, options = {}, ms = 5000) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), ms);
    return fetch(url, { ...options, signal: ctrl.signal })
        .finally(() => clearTimeout(timer));
}

// STATE
let currentRestaurant = null;  // { id, nome_comercial, user_id, ... }
let editingItemId = null;
let activeReservationFilter = 'all';
let menuItems = [];
let reservations = [];
let html5QrCode = null;
const API_URL = API;

const weekDays = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];

// Loading
function showLoading(msg = 'A carregar…') {
    document.getElementById('loadingText').textContent = msg;
    document.getElementById('loadingOverlay').classList.add('active');
}

function hideLoading() {
    document.getElementById('loadingOverlay').classList.remove('active');
}

// AUTH TABS
function switchAuthTab(tab) {
    document.querySelectorAll('.auth-tab').forEach((t, i) => {
        t.classList.toggle('active', (i === 0 && tab === 'login') || (i === 1 && tab === 'signup'));
    });
    document.getElementById('loginForm').classList.toggle('active', tab === 'login');
    document.getElementById('signupForm').classList.toggle('active', tab === 'signup');
}

// ERRO INLINE
function showError(id, msg) {
    const el = document.getElementById(id);
    el.textContent = msg;
    el.classList.add('visible');
}

function clearError(id) {
    const el = document.getElementById(id);
    el.textContent = '';
    el.classList.remove('visible');
}

// Restaurantes locais (demo/offline)
function getLocalRestaurants() {
    try { return JSON.parse(localStorage.getItem('unifood_local_restaurants') || '[]'); }
    catch { return []; }
}

function saveLocalRestaurant(r) {
    const list = getLocalRestaurants();
    list.push(r);
    localStorage.setItem('unifood_local_restaurants', JSON.stringify(list));
}

// LOGIN
function doLogin(event) {
    event.preventDefault();
    clearError('loginError');

    const email = document.getElementById('loginEmail').value.trim();
    const pass  = document.getElementById('loginPassword').value;

    // 1. Backend
    showLoading('A entrar...');
    fetchWithTimeout(`${API_URL}/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password: pass, role: 'restaurant' })
    })
    .then(r => r.json())
    .then(data => {
        if (!data.success) {
            hideLoading();
            showError('loginError', data.message || 'Email ou palavra-passe incorretos.');
            return;
        }
        const user = data.user;
        return fetchWithTimeout(`${API_URL}/restaurants/user/${user.id}`)
            .then(r => r.json())
            .then(rData => {
                hideLoading();
                if (!rData.success) {
                    showError('loginError', 'Utilizador não tem restaurante associado.');
                    return;
                }
                loginSuccess(rData.restaurant);
            });
    })
    .catch(() => {
        hideLoading();
        // 2. Offline — credenciais estáticas ou registadas localmente
        const staticUser = DEMO_RESTAURANTS.find(u => u.email === email && u.password === pass);
        if (staticUser) { loginSuccess({ nome_comercial: staticUser.name, email, id: null }); return; }
        const localUser = getLocalRestaurants().find(u => u.email === email && u.password === pass);
        if (localUser) { loginSuccess({ nome_comercial: localUser.name, email, id: null }); return; }
        showError('loginError', 'Sem ligação ao servidor.');
    });
}

function loginSuccess(restaurant) {
    currentRestaurant = restaurant;
    localStorage.setItem('unifood_restaurant', JSON.stringify(restaurant));
    document.getElementById('authOverlay').style.display = 'none';
    document.getElementById('sidebarName').textContent = restaurant.nome_comercial;
    document.getElementById('sidebarAvatar').textContent = restaurant.nome_comercial.charAt(0).toUpperCase();
    initDashboard();
}

// SIGNUP
function doSignup(event) {
    event.preventDefault();
    clearError('signupError');

    const name     = document.getElementById('signupName').value.trim();
    const email    = document.getElementById('signupEmail').value.trim();
    const location = document.getElementById('signupLocation').value.trim();
    const hours    = document.getElementById('signupHours').value.trim();
    const password = document.getElementById('signupPassword').value;

    // Verificar se o email já existe localmente
    const allLocal = [...DEMO_RESTAURANTS, ...getLocalRestaurants()];
    if (allLocal.find(u => u.email === email)) {
        showError('signupError', 'Este email já está registado.');
        return;
    }

    showLoading('A criar conta…');
    fetchWithTimeout(`${API_URL}/signup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, password, location, hours, role: 'restaurant' })
    })
    .then(r => r.json())
    .then(data => {
        hideLoading();
        if (data.success) {
            saveLocalRestaurant({ name, email, password });
            alert('Conta criada com sucesso! Pode entrar agora.');
            switchAuthTab('login');
        } else {
            showError('signupError', data.message || 'Erro ao criar conta.');
        }
    })
    .catch(() => {
        hideLoading();
        saveLocalRestaurant({ name, email, password });
        alert('Conta criada (modo demo). Pode entrar agora.');
        switchAuthTab('login');
    });
}

function doLogout() {
    currentRestaurant = null;
    menuItems = [];
    reservations = [];
    localStorage.removeItem('unifood_restaurant');
    document.getElementById('authOverlay').style.display = 'flex';
}

// NAV
function showTab(pageId, navEl) {
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.getElementById(pageId).classList.add('active');
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    if (navEl) navEl.classList.add('active');
    const titles = { statsPage: 'Estatísticas', reservationsPage: 'Reservas', menuPage: 'Gerir Menu', settingsPage: 'Definições' };
    document.getElementById('topbarTitle').textContent = titles[pageId] || '';
    if (pageId === 'settingsPage') setTimeout(initSettingsMap, 50);
}

// INIT DASHBOARD
async function initDashboard() {
    showLoading('A carregar dashboard…');
    document.getElementById('topbarDate').textContent = new Date().toLocaleDateString('pt-PT', {
        weekday: 'long', day: 'numeric', month: 'long'
    });

    await Promise.all([loadMenu(), loadReservations()]);
    updateResNotifBadge();
    hideLoading();

    renderBarChart();
    renderDonutChart();
    updateStats();
    renderTopItems();
    loadSettings();
    startResNotifPoll();
}

// NOTIFICAÇÕES DO RESTAURANTE
let _resNotifPollStarted = false;

function resAckKey() {
    return `res_ack_statuses_${currentRestaurant?.id || 'local'}`;
}

function updateResNotifBadge() {
    if (!currentRestaurant) return;
    const acked = JSON.parse(localStorage.getItem(resAckKey()) || '{}');
    const unread = reservations.filter(r =>
        !acked.hasOwnProperty(String(r.id)) || acked[String(r.id)] !== r.status
    );
    const badge = document.getElementById('resNotifBadge');
    if (badge) {
        badge.textContent = unread.length > 9 ? '9+' : String(unread.length);
        unread.length > 0 ? badge.classList.remove('hidden') : badge.classList.add('hidden');
    }
    const list = document.getElementById('resNotifList');
    if (!list) return;
    const statusColors = { pending: '#d97706', confirmed: '#048045', collected: '#2563eb', cancelled: '#dc2626' };
    const statusLabels = { pending: 'Pendente', confirmed: 'Confirmada', collected: 'Levantada', cancelled: 'Cancelada' };
    list.innerHTML = unread.length === 0
        ? '<li class="res-notif-empty">Sem notificações novas.</li>'
        : unread.map(r => {
            const isNew = !acked.hasOwnProperty(String(r.id));
            const prevStatus = acked[String(r.id)];
            const msg = isNew
                ? `Nova reserva de <strong>${r.student}</strong>${r.item !== '—' ? ' · ' + r.item : ''}`
                : `<strong>${r.student}</strong>: ${statusLabels[prevStatus] || prevStatus} → ${statusLabels[r.status] || r.status}`;
            return `<li class="res-notif-item">
                <div class="res-notif-dot" style="background:${statusColors[r.status] || '#6b6b6b'}"></div>
                <div class="res-notif-text">${msg}<br><span style="font-size:0.75rem;color:#999">${r.time}</span></div>
            </li>`;
        }).join('');
}

function toggleResNotifPanel() {
    const panel = document.getElementById('resNotifPanel');
    panel.classList.toggle('hidden');
    if (!panel.classList.contains('hidden')) {
        const acked = JSON.parse(localStorage.getItem(resAckKey()) || '{}');
        reservations.forEach(r => { acked[String(r.id)] = r.status; });
        localStorage.setItem(resAckKey(), JSON.stringify(acked));
        const badge = document.getElementById('resNotifBadge');
        if (badge) { badge.classList.add('hidden'); badge.textContent = '0'; }
    }
}

function startResNotifPoll() {
    if (_resNotifPollStarted) return;
    _resNotifPollStarted = true;
    setInterval(async () => {
        await loadReservations();
        updateResNotifBadge();
    }, 30000);
}

// DEFINIÇÕES DO RESTAURANTE
function loadSettings() {
    if (!currentRestaurant) return;
    const fields = {
        settingName:     'nome_comercial',
        settingDesc:     'descricao',
        settingLocation: 'localizacao',
        settingContact:  'contacto',
        settingHours:    'horario'
    };
    for (const [elId, key] of Object.entries(fields)) {
        const el = document.getElementById(elId);
        if (el) el.value = currentRestaurant[key] || '';
    }
}

// MAPA DE LOCALIZAÇÃO (Definições)
let _settingsMap = null;
let _settingsMarker = null;

function initSettingsMap() {
    const sintra = [38.8029, -9.3817];
    const lat = parseFloat(currentRestaurant?.latitude);
    const lon = parseFloat(currentRestaurant?.longitude);
    const hasCoords = !isNaN(lat) && !isNaN(lon) && lat !== 0;
    const center = hasCoords ? [lat, lon] : sintra;
    const zoom   = hasCoords ? 17 : 15;

    if (_settingsMap) {
        _settingsMap.invalidateSize();
        if (hasCoords && _settingsMarker) {
            _settingsMarker.setLatLng(center);
            _settingsMap.setView(center, zoom);
            updateCoordDisplay();
        }
        return;
    }

    _settingsMap = L.map('settingsMap').setView(center, zoom);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors',
        maxZoom: 19
    }).addTo(_settingsMap);

    if (hasCoords) {
        _settingsMarker = L.marker(center, { draggable: true }).addTo(_settingsMap);
        _settingsMarker.on('dragend', updateCoordDisplay);
        updateCoordDisplay();
    }

    _settingsMap.on('click', function (e) {
        const { lat, lng } = e.latlng;
        if (_settingsMarker) {
            _settingsMarker.setLatLng([lat, lng]);
        } else {
            _settingsMarker = L.marker([lat, lng], { draggable: true }).addTo(_settingsMap);
            _settingsMarker.on('dragend', updateCoordDisplay);
        }
        updateCoordDisplay();
    });
}

function updateCoordDisplay() {
    if (!_settingsMarker) return;
    const { lat, lng } = _settingsMarker.getLatLng();
    const el = document.getElementById('settingsCoordDisplay');
    if (el) el.textContent = `Pin definido em: ${lat.toFixed(6)}, ${lng.toFixed(6)}`;
}

async function saveRestaurantSettings() {
    const body = {
        nome_comercial: document.getElementById('settingName').value.trim(),
        descricao:      document.getElementById('settingDesc').value.trim(),
        localizacao:    document.getElementById('settingLocation').value.trim(),
        contacto:       document.getElementById('settingContact').value.trim(),
        horario:        document.getElementById('settingHours').value.trim(),
    };
    if (_settingsMarker) {
        const { lat, lng } = _settingsMarker.getLatLng();
        body.latitude  = lat;
        body.longitude = lng;
    }
    const fb = document.getElementById('settingsFeedback');

    if (!currentRestaurant.id) {
        Object.assign(currentRestaurant, body);
        localStorage.setItem('unifood_restaurant', JSON.stringify(currentRestaurant));
        document.getElementById('sidebarName').textContent = body.nome_comercial;
        fb.style.color = '#048045';
        fb.textContent = 'Alterações guardadas (modo demo).';
        return;
    }

    try {
        const res = await fetchWithTimeout(`${API_URL}/restaurants/${currentRestaurant.id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });
        const data = await res.json();
        if (data.success) {
            Object.assign(currentRestaurant, body);
            localStorage.setItem('unifood_restaurant', JSON.stringify(currentRestaurant));
            document.getElementById('sidebarName').textContent = body.nome_comercial;
            fb.style.color = '#048045';
            fb.textContent = 'Alterações guardadas com sucesso.';
        } else {
            fb.style.color = '#dc2626';
            fb.textContent = data.message || 'Erro ao guardar.';
        }
    } catch {
        fb.style.color = '#dc2626';
        fb.textContent = 'Sem ligação ao servidor.';
    }
}

// CARREGAR DADOS DA API
async function loadMenu() {
    if (!currentRestaurant.id) {
        // modo offline — mantém array vazio
        renderMenu();
        return;
    }
    try {
        const res = await fetchWithTimeout(`${API_URL}/menu/${currentRestaurant.id}`);
        const data = await res.json();
        // Normalizar campos da BD para os nomes usados no frontend
        menuItems = data.map(m => ({
            id: m.id,
            name: m.nome_menu,
            desc: m.descricao || '',
            price: parseFloat(m.preco),
            category: m.categoria || 'prato',
            allergens: m.alergenos || ''
        }));
    } catch {
        menuItems = [];
    }
    renderMenu();
}

async function loadReservations() {
    if (!currentRestaurant.id) {
        renderReservations();
        return;
    }
    try {
        const res = await fetchWithTimeout(`${API_URL}/reservations/restaurant/${currentRestaurant.id}`);
        const data = await res.json();
        // Normalizar campos da BD para os nomes usados no frontend
        reservations = data.map(r => ({
            id: r.id,
            qr: r.qr_token,
            student: r.student_name || r.student_email || '—',
            item: r.nome_menu || '—',
            modalidade: r.modalidade || null,
            date: r.created_at,
            time: new Date(r.created_at).toLocaleDateString('pt-PT', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }),
            status: r.status,
            rating: r.rating || null
        }));
    } catch {
        reservations = [];
    }
    renderReservations();
}

// ESTATÍSTICAS
function updateStats() {
    document.getElementById('statTotal').textContent = reservations.length;
    const today = new Date();
    document.getElementById('statToday').textContent = reservations.filter(r => {
        const d = new Date(r.date);
        return d.getFullYear() === today.getFullYear() &&
               d.getMonth()    === today.getMonth()    &&
               d.getDate()     === today.getDate();
    }).length;
    document.getElementById('statConfirmed').textContent = reservations.filter(r => r.status === 'confirmed').length;
    document.getElementById('statPending').textContent = reservations.filter(r => r.status === 'pending').length;
    document.getElementById('statItems').textContent = menuItems.length;

    const rated = reservations.filter(r => r.rating);
    const avg = rated.length
        ? (rated.reduce((s, r) => s + r.rating, 0) / rated.length).toFixed(1)
        : '—';
    document.getElementById('statRating').textContent = avg;
}

function renderBarChart() {
    const counts = [0, 0, 0, 0, 0, 0, 0];
    reservations.forEach(r => {
        const day = new Date(r.date || Date.now()).getDay();
        const idx = (day + 6) % 7; // 0=Dom..6=Sab → 0=Seg..6=Dom
        counts[idx]++;
    });
    const todayIdx = (new Date().getDay() + 6) % 7;
    const max = Math.max(...counts, 1);
    const container = document.getElementById('barChart');
    container.innerHTML = counts.map((v, i) => `
        <div class="bar-wrap">
            <div class="bar ${i === todayIdx ? 'today' : ''}"
                 style="height:${(v / max) * 100}%"
                 title="${v} reservas"></div>
            <div class="bar-label">${weekDays[i]}</div>
        </div>
    `).join('');
}

function renderDonutChart() {
    const statusColors = {
        pending:   '#d97706',
        confirmed: '#048045',
        collected: '#2563eb',
        cancelled: '#dc2626'
    };
    const statusLabels = {
        pending:   'Pendente',
        confirmed: 'Confirmada',
        collected: 'Levantada',
        cancelled: 'Cancelada'
    };

    const counts = { pending: 0, confirmed: 0, collected: 0, cancelled: 0 };
    reservations.forEach(r => {
        if (counts[r.status] !== undefined) counts[r.status]++;
    });
    const total = Object.values(counts).reduce((a, b) => a + b, 0);

    const donutEl = document.getElementById('donutChart');
    const legendEl = document.getElementById('donutLegend');

    if (!donutEl || !legendEl) return;

    if (total === 0) {
        donutEl.style.background = '#e5e7eb';
        legendEl.innerHTML = `<div class="legend-item" style="justify-content:center;color:var(--muted)">Sem dados ainda</div>`;
        return;
    }

    // Construir conic-gradient
    let angle = 0;
    const segments = Object.entries(counts)
        .filter(([, v]) => v > 0)
        .map(([key, v]) => {
            const pct = (v / total) * 100;
            const seg = { key, pct, start: angle, end: angle + pct, color: statusColors[key] };
            angle += pct;
            return seg;
        });

    const gradient = segments.map(s => `${s.color} ${s.start.toFixed(1)}% ${s.end.toFixed(1)}%`).join(', ');
    donutEl.style.background = `conic-gradient(${gradient})`;

    legendEl.innerHTML = segments.map(s => `
        <div class="legend-item">
            <div class="legend-dot" style="background:${s.color}"></div>
            ${statusLabels[s.key]}
            <span class="legend-pct">${s.pct.toFixed(0)}% <span style="font-weight:400;color:var(--muted)">(${counts[s.key]})</span></span>
        </div>`).join('');
}

function renderTopItems() {
    const counts = {};
    reservations.forEach(r => {
        if (r.item && r.item !== '—') counts[r.item] = (counts[r.item] || 0) + 1;
    });

    const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 5);

    document.getElementById('topItemsBody').innerHTML = sorted.length
        ? sorted.map(([name, count], i) => `
            <tr>
                <td><strong>${i + 1}</strong></td>
                <td>${name}</td>
                <td><span class="badge badge-blue">Prato</span></td>
                <td><strong>${count}</strong></td>
            </tr>`).join('')
        : `<tr><td colspan="4" style="text-align:center;color:var(--muted);padding:20px">Sem dados ainda</td></tr>`;
}

// RESERVAS
function filterReservations(status, btn) {
    activeReservationFilter = status;
    document.querySelectorAll('#statusFilters .filter-btn').forEach(b => b.classList.remove('active'));
    if (btn) btn.classList.add('active');
    renderReservations();
}

function renderReservations() {
    const q = document.getElementById('searchInput')?.value.toLowerCase() || '';
    let list = reservations;

    if (activeReservationFilter !== 'all') list = list.filter(r => r.status === activeReservationFilter);
    if (q) list = list.filter(r =>
        r.student.toLowerCase().includes(q) ||
        String(r.qr || '').toLowerCase().includes(q) ||
        r.item.toLowerCase().includes(q)
    );

    const statusBadge = { confirmed: 'badge-green', pending: 'badge-yellow', collected: 'badge-blue', cancelled: 'badge-red' };
    const statusLabel = { confirmed: 'Confirmada', pending: 'Pendente', collected: 'Levantada', cancelled: 'Cancelada' };

    document.getElementById('reservationsBody').innerHTML = list.length
        ? list.map(r => `
            <tr>
                <td><strong>${r.qr || r.id}</strong></td>
                <td>${r.student}</td>
                <td>${r.item}</td>
                <td>${r.modalidade === 'takeaway' ? 'Take-away' : r.modalidade === 'dinein' ? 'No local' : '—'}</td>
                <td>${r.time}</td>
                <td><span class="badge ${statusBadge[r.status] || ''}">${statusLabel[r.status] || r.status}</span></td>
                <td>
                    <div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center">
                        ${r.status === 'pending' ? `<button class="btn btn-sm btn-primary" onclick="confirmReservation(${r.id})">Confirmar</button>` : ''}
                        ${r.status === 'pending' ? `<button class="btn btn-sm btn-danger" onclick="cancelReservation(${r.id})">Cancelar</button>` : ''}
                        ${r.status === 'confirmed' ? `<button class="btn btn-sm btn-ghost" onclick="markCollected(${r.id})">Levantada</button>` : ''}
                    </div>
                </td>
            </tr>
        `).join('')
        : `<tr><td colspan="7" style="text-align:center;color:var(--muted);padding:30px">Nenhuma reserva encontrada</td></tr>`;
}

function confirmReservation(id) {
    fetchWithTimeout(`${API_URL}/reservations/${id}/status`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'confirmed' })
    })
    .then(r => r.json())
    .then(data => {
        if (data.success) {
            const r = reservations.find(x => x.id === id);
            if (r) r.status = 'confirmed';
            renderReservations();
            updateStats();
        }
    })
    .catch(() => {
        // fallback offline
        const r = reservations.find(x => x.id === id);
        if (r) { r.status = 'confirmed'; renderReservations(); updateStats(); }
    });
}

function cancelReservation(id) {
    if (!confirm('Cancelar esta reserva?')) return;
    fetchWithTimeout(`${API_URL}/reservations/${id}/status`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'cancelled' })
    })
    .then(r => r.json())
    .then(data => {
        if (data.success) {
            const r = reservations.find(x => x.id === id);
            if (r) r.status = 'cancelled';
            renderReservations();
            updateStats();
        }
    })
    .catch(() => {
        const r = reservations.find(x => x.id === id);
        if (r) { r.status = 'cancelled'; renderReservations(); updateStats(); }
    });
}

function markCollected(id) {
    fetchWithTimeout(`${API_URL}/reservations/${id}/status`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'collected' })
    })
    .then(r => r.json())
    .then(data => {
        if (data.success) {
            const r = reservations.find(x => x.id === id);
            if (r) r.status = 'collected';
            renderReservations();
            updateStats();
        }
    })
    .catch(() => {
        const r = reservations.find(x => x.id === id);
        if (r) { r.status = 'collected'; renderReservations(); updateStats(); }
    });
}

// MENU
function filterMenu(cat, btn) {
    document.querySelectorAll('.filters .filter-btn').forEach(b => b.classList.remove('active'));
    if (btn) btn.classList.add('active');
    renderMenu(cat);
}

function renderMenu(cat = 'all') {
    const list = cat === 'all' ? menuItems : menuItems.filter(m => m.category === cat);

    document.getElementById('menuGrid').innerHTML = list.length
        ? list.map(m => `
            <div class="menu-card">
                <div class="menu-card-header">
                    <span class="menu-card-name">${m.name}</span>
                    <span class="menu-card-price">€${m.price.toFixed(2)}</span>
                </div>
                <div class="menu-card-desc">${m.desc || '—'}</div>
                ${m.allergens ? `<div class="menu-card-allergens">⚠ ${m.allergens}</div>` : ''}
                <div class="menu-card-footer">
                    <button class="btn btn-sm btn-ghost" onclick="editMenuItem(${m.id})"><svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" style="width:15px;height:15px;vertical-align:middle;margin-right:4px"><path stroke-linecap="round" stroke-linejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0 1 15.75 21H5.25A2.25 2.25 0 0 1 3 18.75V8.25A2.25 2.25 0 0 1 5.25 6H10" /></svg>Editar</button>
                    <button class="btn btn-sm btn-danger" onclick="deleteMenuItem(${m.id})"><svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" style="width:15px;height:15px;vertical-align:middle;margin-right:4px"><path stroke-linecap="round" stroke-linejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" /></svg>Remover</button>
                </div>
            </div>
        `).join('')
        : `<div class="empty-state"><p>Nenhum item no menu</p></div>`;
}

function openMenuModal(id = null) {
    editingItemId = id;
    document.getElementById('modalTitle').textContent = id ? 'Editar item' : 'Adicionar item ao menu';
    if (id) {
        const item = menuItems.find(m => m.id === id);
        document.getElementById('itemName').value = item.name;
        document.getElementById('itemDesc').value = item.desc;
        document.getElementById('itemPrice').value = item.price;
        document.getElementById('itemCategory').value = item.category || 'prato';
        document.getElementById('itemAllergens').value = item.allergens || '';
    } else {
        document.getElementById('itemName').value = '';
        document.getElementById('itemDesc').value = '';
        document.getElementById('itemPrice').value = '';
        document.getElementById('itemCategory').value = 'prato';
        document.getElementById('itemAllergens').value = '';
    }
    document.getElementById('menuModal').classList.add('open');
}

function closeMenuModal() {
    document.getElementById('menuModal').classList.remove('open');
    editingItemId = null;
}

function saveMenuItem() {
    const nome_menu = document.getElementById('itemName').value.trim();
    const descricao = document.getElementById('itemDesc').value.trim();
    const preco     = parseFloat(document.getElementById('itemPrice').value);
    const categoria = document.getElementById('itemCategory').value;
    const alergenos = document.getElementById('itemAllergens').value.trim();

    if (!nome_menu || isNaN(preco)) {
        alert('Preencha o nome e o preço.');
        return;
    }

    if (editingItemId) {
        // modo demo (sem id real) — atualizar só localmente
        if (!currentRestaurant.id) {
            const item = menuItems.find(m => m.id === editingItemId);
            if (item) { item.name = nome_menu; item.desc = descricao; item.price = preco; item.category = categoria; item.allergens = alergenos; }
            closeMenuModal(); renderMenu(); updateStats();
            return;
        }
        fetchWithTimeout(`${API_URL}/menu/${editingItemId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ nome_menu, descricao, preco, categoria, alergenos: alergenos || null })
        })
        .then(r => r.json())
        .then(data => {
            if (data.success) {
                const item = menuItems.find(m => m.id === editingItemId);
                if (item) { item.name = nome_menu; item.desc = descricao; item.price = preco; item.category = categoria; item.allergens = alergenos; }
                closeMenuModal();
                renderMenu();
                updateStats();
            }
        })
        .catch(() => {
            const item = menuItems.find(m => m.id === editingItemId);
            if (item) { item.name = nome_menu; item.desc = descricao; item.price = preco; item.category = categoria; item.allergens = alergenos; }
            closeMenuModal(); renderMenu(); updateStats();
        });
    } else {
        // modo demo (sem id real) — adicionar só localmente
        if (!currentRestaurant.id) {
            menuItems.push({ id: Date.now(), name: nome_menu, desc: descricao, price: preco, category: categoria, allergens: alergenos });
            closeMenuModal(); renderMenu(); updateStats();
            return;
        }
        fetchWithTimeout(`${API_URL}/menu`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ restaurant_id: currentRestaurant.id, nome_menu, descricao, preco, categoria, alergenos: alergenos || null })
        })
        .then(r => r.json())
        .then(data => {
            if (data.success) {
                menuItems.push({
                    id: data.item.id,
                    name: data.item.nome_menu,
                    desc: data.item.descricao || '',
                    price: parseFloat(data.item.preco),
                    category: data.item.categoria || 'prato',
                    allergens: data.item.alergenos || ''
                });
                closeMenuModal();
                renderMenu();
                updateStats();
            }
        })
        .catch(() => {
            menuItems.push({ id: Date.now(), name: nome_menu, desc: descricao, price: preco, category: categoria, allergens: alergenos });
            closeMenuModal(); renderMenu(); updateStats();
        });
    }
}

function editMenuItem(id) { openMenuModal(id); }

function deleteMenuItem(id) {
    if (!confirm('Remover este item do menu?')) return;
    fetchWithTimeout(`${API_URL}/menu/${id}`, { method: 'DELETE' })
    .then(r => r.json())
    .then(data => {
        if (data.success) {
            menuItems = menuItems.filter(m => m.id !== id);
            renderMenu();
            updateStats();
        }
    })
    .catch(() => {
        menuItems = menuItems.filter(m => m.id !== id);
        renderMenu(); updateStats();
    });
}

// QR CODE VALIDATION
function openQRModal() {
    document.getElementById('qrTokenInput').value = '';
    ['qrValidateResult', 'qrScanResult'].forEach(id => {
        const el = document.getElementById(id);
        el.textContent = '';
        el.classList.remove('visible');
        el.style.background = el.style.color = el.style.borderColor = '';
    });
    setQRMode('type');
    document.getElementById('qrModal').classList.add('open');
    setTimeout(() => document.getElementById('qrTokenInput').focus(), 100);
}

function closeQRModal() {
    stopQRScan();
    document.getElementById('qrModal').classList.remove('open');
}

function setQRMode(mode) {
    document.getElementById('tabType').classList.toggle('active', mode === 'type');
    document.getElementById('tabScan').classList.toggle('active', mode === 'scan');
    document.getElementById('qrTypeMode').style.display = mode === 'type' ? '' : 'none';
    document.getElementById('qrScanMode').style.display = mode === 'scan' ? '' : 'none';
    if (mode === 'scan') startQRScan();
    else stopQRScan();
}

function startQRScan() {
    const scanResult = document.getElementById('qrScanResult');
    scanResult.textContent = '';
    scanResult.classList.remove('visible');

    html5QrCode = new Html5Qrcode('qrReader');
    html5QrCode.start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: { width: 250, height: 250 } },
        (decodedText) => {
            stopQRScan();
            document.getElementById('qrTokenInput').value = decodedText;
            validateQR(document.getElementById('qrScanResult'));
        },
        () => {}
    ).catch(() => {
        setQRResult(scanResult, '❌ Não foi possível aceder à câmara.', false);
        html5QrCode = null;
    });
}

function stopQRScan() {
    if (html5QrCode) {
        const qr = html5QrCode;
        html5QrCode = null;
        qr.stop().catch(() => {});
    }
}

function validateQR(resultElOverride) {
    const token = document.getElementById('qrTokenInput').value.trim().toUpperCase();
    const resultEl = resultElOverride || document.getElementById('qrValidateResult');

    if (!token) {
        setQRResult(resultEl, '❌ Insira um código.', false);
        return;
    }

    showLoading('A validar…');

    fetchWithTimeout(`${API_URL}/reservations/validate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ qr_token: token, restaurant_id: currentRestaurant?.id })
    })
    .then(r => r.json())
    .then(data => {
        hideLoading();
        if (data.success) {
            setQRResult(resultEl, '✅ Reserva validada! Marcada como levantada.', true);
            loadReservations();
            setTimeout(closeQRModal, 2000);
        } else {
            setQRResult(resultEl, `❌ ${data.message || 'QR Code inválido.'}`, false);
        }
    })
    .catch(() => {
        hideLoading();
        // Modo offline — verificar tokens locais gerados pelo index.js
        const localTokens = JSON.parse(localStorage.getItem('unifood_local_tokens') || '[]');
        const usedTokens  = JSON.parse(localStorage.getItem('unifood_used_tokens') || '[]');

        if (usedTokens.includes(token)) {
            setQRResult(resultEl, '❌ Esta reserva já foi levantada.', false);
            return;
        }

        if (localTokens.includes(token)) {
            // Marcar como usado
            usedTokens.push(token);
            localStorage.setItem('unifood_used_tokens', JSON.stringify(usedTokens));
            // Atualizar na lista local se existir
            const r = reservations.find(x => x.qr === token);
            if (r) { r.status = 'collected'; renderReservations(); updateStats(); }
            setQRResult(resultEl, '✅ Reserva validada (modo demo)!', true);
            setTimeout(closeQRModal, 2000);
        } else {
            setQRResult(resultEl, '❌ QR Code não encontrado.', false);
        }
    });
}

function setQRResult(el, msg, success) {
    el.textContent = msg;
    el.style.background  = success ? '#dcfce7' : '#fee2e2';
    el.style.color       = success ? '#15803d' : '#dc2626';
    el.style.borderColor = success ? '#86efac' : '#fecaca';
    el.classList.add('visible');
}

// Fechar modal QR ao clicar fora
document.getElementById('qrModal')?.addEventListener('click', function(e) {
    if (e.target === this) closeQRModal();
});

// Enter no input de token também valida
document.addEventListener('DOMContentLoaded', function() {
    document.getElementById('qrTokenInput')?.addEventListener('keydown', function(e) {
        if (e.key === 'Enter') validateQR();
    });
    document.addEventListener('click', function(e) {
        const wrapper = document.getElementById('resNotifBell')?.closest('.res-notif-wrapper');
        if (wrapper && !wrapper.contains(e.target)) {
            document.getElementById('resNotifPanel')?.classList.add('hidden');
        }
    });
});


document.getElementById('topbarDate').textContent = new Date().toLocaleDateString('pt-PT', {
    weekday: 'long', day: 'numeric', month: 'long'
});

// RESTAURAR SESSÃO
(function restoreSession() {
    const saved = localStorage.getItem('unifood_restaurant');
    if (!saved) return;

    try {
        const restaurant = JSON.parse(saved);
        if (!restaurant || !restaurant.nome_comercial) return;
        loginSuccess(restaurant);
    } catch {
        localStorage.removeItem('unifood_restaurant');
    }
})();