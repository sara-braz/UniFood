// STATE
let currentRestaurant = null;  // { id, nome_comercial, user_id, ... }
let editingItemId = null;
let activeReservationFilter = 'all';
let menuItems = [];
let reservations = [];
const API_URL = API;

const weekDays = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];

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

    // 1. Credenciais estáticas (config.js — fallback offline)
    const staticUser = DEMO_RESTAURANTS.find(u => u.email === email && u.password === pass);
    if (staticUser) {
        loginSuccess({ nome_comercial: staticUser.name, email, id: null });
        return;
    }

    // 2. Restaurantes registados localmente
    const localUser = getLocalRestaurants().find(u => u.email === email && u.password === pass);
    if (localUser) {
        loginSuccess({ nome_comercial: localUser.name, email, id: null });
        return;
    }

    // 3. Backend
    fetch(`${API_URL}/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password: pass, role: 'restaurant' })
    })
    .then(r => r.json())
    .then(data => {
        if (!data.success) {
            showError('loginError', data.message || 'Email ou palavra-passe incorretos.');
            return;
        }
        const user = data.user;
        return fetch(`${API_URL}/restaurants/user/${user.id}`)
            .then(r => r.json())
            .then(rData => {
                if (!rData.success) {
                    showError('loginError', 'Utilizador não tem restaurante associado.');
                    return;
                }
                loginSuccess(rData.restaurant);
            });
    })
    .catch(() => {
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

    fetch(`${API_URL}/signup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, password, location, hours, role: 'restaurant' })
    })
    .then(r => r.json())
    .then(data => {
        if (data.success) {
            saveLocalRestaurant({ name, email, password });
            alert('Conta criada com sucesso! Pode entrar agora.');
            switchAuthTab('login');
        } else {
            showError('signupError', data.message || 'Erro ao criar conta.');
        }
    })
    .catch(() => {
        // Sem backend — guardar só localmente para demo
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
    const titles = { statsPage: 'Estatísticas', reservationsPage: 'Reservas', menuPage: 'Gerir Menu' };
    document.getElementById('topbarTitle').textContent = titles[pageId] || '';
}

// INIT DASHBOARD
async function initDashboard() {
    document.getElementById('topbarDate').textContent = new Date().toLocaleDateString('pt-PT', {
        weekday: 'long', day: 'numeric', month: 'long'
    });

    await Promise.all([
        loadMenu(),
        loadReservations()
    ]);

    renderBarChart();
    updateStats();
    renderTopItems();
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
            time: new Date(r.created_at).toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' }),
            status: r.status
        }));
    } catch {
        reservations = [];
    }
    renderReservations();
}

// ESTATÍSTICAS
function updateStats() {
    document.getElementById('statTotal').textContent = reservations.length;
    document.getElementById('statToday').textContent = reservations.filter(r => {
        // contar só reservas de hoje
        return true; // simplificado — BD não guarda hora separada
    }).length;
    document.getElementById('statConfirmed').textContent = reservations.filter(r => r.status === 'confirmed').length;
    document.getElementById('statPending').textContent = reservations.filter(r => r.status === 'pending').length;
    document.getElementById('statItems').textContent = menuItems.length;
}

function renderBarChart() {
    // Agrupar reservas por dia da semana
    const counts = [0, 0, 0, 0, 0, 0, 0];
    reservations.forEach(r => {
        // usa índice 0=Dom..6=Sab, ajusta para Seg=0
        const day = new Date(r.created_at || Date.now()).getDay();
        const idx = (day + 6) % 7;
        counts[idx]++;
    });
    const max = Math.max(...counts, 1);
    const container = document.getElementById('barChart');
    container.innerHTML = counts.map((v, i) => `
        <div class="bar-wrap">
            <div class="bar ${i === new Date().getDay() ? 'today' : ''}"
                 style="height:${(v / max) * 100}%"
                 title="${v} reservas"></div>
            <div class="bar-label">${weekDays[i]}</div>
        </div>
    `).join('');
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
                <td>—</td>
                <td>${r.time}</td>
                <td><span class="badge ${statusBadge[r.status] || ''}">${statusLabel[r.status] || r.status}</span></td>
                <td>
                    ${r.status === 'pending' ? `<button class="btn btn-sm btn-primary" onclick="confirmReservation(${r.id})">Confirmar</button>` : ''}
                    ${r.status === 'confirmed' ? `<button class="btn btn-sm btn-ghost" onclick="markCollected(${r.id})">Levantada</button>` : ''}
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
        // Editar
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
            // fallback offline
            const item = menuItems.find(m => m.id === editingItemId);
            if (item) { item.name = nome_menu; item.desc = descricao; item.price = preco; }
            closeMenuModal(); renderMenu(); updateStats();
        });
    } else {
        // Adicionar
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

// SET DATE ON LOAD
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