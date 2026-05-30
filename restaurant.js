// STATE
let currentRestaurant = null;  // { id, nome_comercial, user_id, ... }
let editingItemId = null;
let activeReservationFilter = 'all';
let menuItems = [];
let reservations = [];
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
    fetch(`${API_URL}/login`, {
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
        return fetch(`${API_URL}/restaurants/user/${user.id}`)
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
    fetch(`${API_URL}/signup`, {
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
}

// INIT DASHBOARD
async function initDashboard() {
    showLoading('A carregar dashboard…');
    document.getElementById('topbarDate').textContent = new Date().toLocaleDateString('pt-PT', {
        weekday: 'long', day: 'numeric', month: 'long'
    });

    await Promise.all([loadMenu(), loadReservations()]);
    hideLoading();

    renderBarChart();
    renderDonutChart();
    updateStats();
    renderTopItems();
    loadSettings();
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

async function saveRestaurantSettings() {
    const body = {
        nome_comercial: document.getElementById('settingName').value.trim(),
        descricao:      document.getElementById('settingDesc').value.trim(),
        localizacao:    document.getElementById('settingLocation').value.trim(),
        contacto:       document.getElementById('settingContact').value.trim(),
        horario:        document.getElementById('settingHours').value.trim(),
    };
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
        const res = await fetch(`${API_URL}/restaurants/${currentRestaurant.id}`, {
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
        const res = await fetch(`${API_URL}/menu/${currentRestaurant.id}`);
        const data = await res.json();
        // Normalizar campos da BD para os nomes usados no frontend
        menuItems = data.map(m => ({
            id: m.id,
            name: m.nome_menu,
            desc: m.descricao || '',
            price: parseFloat(m.preco),
            category: 'prato'  // BD não tem categoria ainda — padrão prato
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
        const res = await fetch(`${API_URL}/reservations/restaurant/${currentRestaurant.id}`);
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
    fetch(`${API_URL}/reservations/${id}/status`, {
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
    fetch(`${API_URL}/reservations/${id}/status`, {
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
    fetch(`${API_URL}/reservations/${id}/status`, {
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
                <div class="menu-card-footer">
                    <button class="btn btn-sm btn-ghost" onclick="editMenuItem(${m.id})">✏️ Editar</button>
                    <button class="btn btn-sm btn-danger" onclick="deleteMenuItem(${m.id})">🗑️ Remover</button>
                </div>
            </div>
        `).join('')
        : `<div class="empty-state"><div class="icon">🍽️</div><p>Nenhum item no menu</p></div>`;
}

function openMenuModal(id = null) {
    editingItemId = id;
    document.getElementById('modalTitle').textContent = id ? 'Editar item' : 'Adicionar item ao menu';
    if (id) {
        const item = menuItems.find(m => m.id === id);
        document.getElementById('itemName').value = item.name;
        document.getElementById('itemDesc').value = item.desc;
        document.getElementById('itemPrice').value = item.price;
    } else {
        document.getElementById('itemName').value = '';
        document.getElementById('itemDesc').value = '';
        document.getElementById('itemPrice').value = '';
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

    if (!nome_menu || isNaN(preco)) {
        alert('Preencha o nome e o preço.');
        return;
    }

    if (editingItemId) {
        // modo demo (sem id real) — atualizar só localmente
        if (!currentRestaurant.id) {
            const item = menuItems.find(m => m.id === editingItemId);
            if (item) { item.name = nome_menu; item.desc = descricao; item.price = preco; }
            closeMenuModal(); renderMenu(); updateStats();
            return;
        }
        fetch(`${API_URL}/menu/${editingItemId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ nome_menu, descricao, preco })
        })
        .then(r => r.json())
        .then(data => {
            if (data.success) {
                const item = menuItems.find(m => m.id === editingItemId);
                if (item) { item.name = nome_menu; item.desc = descricao; item.price = preco; }
                closeMenuModal();
                renderMenu();
                updateStats();
            }
        })
        .catch(() => {
            const item = menuItems.find(m => m.id === editingItemId);
            if (item) { item.name = nome_menu; item.desc = descricao; item.price = preco; }
            closeMenuModal(); renderMenu(); updateStats();
        });
    } else {
        // modo demo (sem id real) — adicionar só localmente
        if (!currentRestaurant.id) {
            menuItems.push({ id: Date.now(), name: nome_menu, desc: descricao, price: preco, category: 'prato' });
            closeMenuModal(); renderMenu(); updateStats();
            return;
        }
        fetch(`${API_URL}/menu`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ restaurant_id: currentRestaurant.id, nome_menu, descricao, preco })
        })
        .then(r => r.json())
        .then(data => {
            if (data.success) {
                menuItems.push({
                    id: data.item.id,
                    name: data.item.nome_menu,
                    desc: data.item.descricao || '',
                    price: parseFloat(data.item.preco),
                    category: 'prato'
                });
                closeMenuModal();
                renderMenu();
                updateStats();
            }
        })
        .catch(() => {
            menuItems.push({ id: Date.now(), name: nome_menu, desc: descricao, price: preco, category: 'prato' });
            closeMenuModal(); renderMenu(); updateStats();
        });
    }
}

function editMenuItem(id) { openMenuModal(id); }

function deleteMenuItem(id) {
    if (!confirm('Remover este item do menu?')) return;
    fetch(`${API_URL}/menu/${id}`, { method: 'DELETE' })
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
    const result = document.getElementById('qrValidateResult');
    result.textContent = '';
    result.classList.remove('visible');
    result.style.background = '';
    result.style.color = '';
    result.style.borderColor = '';
    document.getElementById('qrModal').classList.add('open');
    setTimeout(() => document.getElementById('qrTokenInput').focus(), 100);
}

function closeQRModal() {
    document.getElementById('qrModal').classList.remove('open');
}

function validateQR() {
    const token = document.getElementById('qrTokenInput').value.trim().toUpperCase();
    const resultEl = document.getElementById('qrValidateResult');

    if (!token) {
        setQRResult(resultEl, '❌ Insira um código.', false);
        return;
    }

    showLoading('A validar…');

    fetch(`${API_URL}/reservations/validate`, {
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