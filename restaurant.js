 // STATE 
let currentRestaurant = null;
let editingItemId = null;
let activeReservationFilter = 'all';
let activeMenuFilter = 'all';

let menuItems = [
    { id: 1, name: 'Fatia de Pizza', desc: 'Uma fatia de pizza à escolha', price: 3.50, category: 'prato' },
    { id: 2, name: 'Fatia c/ Bebida', desc: 'Fatia de pizza com refrigerante ou água', price: 4.50, category: 'prato' },
    { id: 3, name: '2 Fatias de Pizza', desc: 'Duas fatias à escolha', price: 6.50, category: 'prato' },
    { id: 4, name: '2 Fatias c/ Bebida', desc: 'Duas fatias com bebida incluída', price: 7.50, category: 'prato' },
    { id: 5, name: 'Água 0.5L', desc: 'Água mineral natural', price: 1.00, category: 'bebida' },
    { id: 6, name: 'Refrigerante', desc: 'Coca-Cola, Fanta ou Sprite', price: 1.50, category: 'bebida' },
];

let reservations = [
    { id: '#A5B2C9', student: 'joão.silva', item: 'Fatia de Pizza', mode: 'Take-away', time: '12:05', status: 'confirmed' },
    { id: '#B1D3E7', student: 'maria.costa', item: '2 Fatias c/ Bebida', mode: 'No local', time: '12:12', status: 'pending' },
    { id: '#C9F1A2', student: 'pedro.lopes', item: 'Fatia c/ Bebida', mode: 'Take-away', time: '12:18', status: 'collected' },
    { id: '#D7E2B4', student: 'ana.ferreira', item: '2 Fatias de Pizza', mode: 'Take-away', time: '12:31', status: 'pending' },
    { id: '#E4A6C1', student: 'tiago.neves', item: 'Fatia de Pizza', mode: 'No local', time: '12:45', status: 'confirmed' },
    { id: '#F2B8D9', student: 'ines.rodrigues', item: 'Fatia c/ Bebida', mode: 'Take-away', time: '13:02', status: 'pending' },
];

const weekDays = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];
const weekData = [14, 22, 18, 27, 31, 8, 0];

 // AUTH 
function switchAuthTab(tab) {
    document.querySelectorAll('.auth-tab').forEach((t, i) => {
        t.classList.toggle('active', (i === 0 && tab === 'login') || (i === 1 && tab === 'signup'));
    });
    document.getElementById('loginForm').classList.toggle('active', tab === 'login');
    document.getElementById('signupForm').classList.toggle('active', tab === 'signup');
}

 // Erro inline 
function showRestaurantError(id, msg) {
    const el = document.getElementById(id);
    el.textContent = msg;
    el.classList.add('visible');
}

function clearRestaurantError(id) {
    const el = document.getElementById(id);
    el.textContent = '';
    el.classList.remove('visible');
}

function doLogin(event) {
    event.preventDefault();
    clearRestaurantError('loginError');

    const email = document.getElementById('loginEmail').value.trim();
    const pass  = document.getElementById('loginPassword').value;

    // 1. Credenciais estáticas (config.js)
    const staticUser = DEMO_RESTAURANTS.find(u => u.email === email && u.password === pass);
    if (staticUser) {
        loginSuccess({ name: staticUser.name, email });
        return;
    }

    // 2. Backend
    fetch('http://172.16.0.36:3000/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password: pass, role: 'restaurant' })
    })
    .then(r => r.json())
    .then(data => {
        if (data.success) {
            loginSuccess(data.restaurant || { name: email.split('@')[0], email });
        } else {
            showRestaurantError('loginError', data.message || 'Email ou palavra-passe incorretos.');
        }
    })
    .catch(() => {
        showRestaurantError('loginError', 'Email ou palavra-passe incorretos.');
    });
}

function loginSuccess(restaurant) {
    currentRestaurant = restaurant;
    document.getElementById('authOverlay').style.display = 'none';
    document.getElementById('sidebarName').textContent = restaurant.name;
    document.getElementById('sidebarAvatar').textContent = restaurant.name.charAt(0).toUpperCase();
    initDashboard();
}

function doSignup(event) {
    event.preventDefault();
    clearRestaurantError('signupError');

    const name     = document.getElementById('signupName').value.trim();
    const email    = document.getElementById('signupEmail').value.trim();
    const location = document.getElementById('signupLocation').value.trim();
    const hours    = document.getElementById('signupHours').value.trim();
    const password = document.getElementById('signupPassword').value;

    fetch('http://172.16.0.36:3000/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, password, location, hours, role: 'restaurant' })
    })
    .then(r => r.json())
    .then(data => {
        if (data.success) {
            alert('Conta criada com sucesso! Pode entrar agora.');
            switchAuthTab('login');
        } else {
            showRestaurantError('signupError', data.message || 'Erro ao criar conta. Tente novamente.');
        }
    })
    .catch(() => {
        showRestaurantError('signupError', 'Sem ligação ao servidor. O registo requer conexão ao backend.');
    });
}

function doLogout() {
    currentRestaurant = null;
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

 // INIT 
function initDashboard() {
    updateStats();
    renderBarChart();
    renderTopItems();
    renderReservations();
    renderMenu();
    document.getElementById('topbarDate').textContent = new Date().toLocaleDateString('pt-PT', {
        weekday: 'long', day: 'numeric', month: 'long'
    });
}

function updateStats() {
    document.getElementById('statTotal').textContent = reservations.length + 120;
    document.getElementById('statToday').textContent = reservations.length;
    document.getElementById('statConfirmed').textContent = reservations.filter(r => r.status === 'confirmed').length;
    document.getElementById('statPending').textContent = reservations.filter(r => r.status === 'pending').length;
    document.getElementById('statItems').textContent = menuItems.length;
}

function renderBarChart() {
    const max = Math.max(...weekData);
    const container = document.getElementById('barChart');
    container.innerHTML = weekData.map((v, i) => `
        <div class="bar-wrap">
            <div class="bar ${i === 4 ? 'today' : ''}" style="height:${max ? (v / max) * 100 : 0}%" title="${v} reservas"></div>
            <div class="bar-label">${weekDays[i]}</div>
        </div>
    `).join('');
}

function renderTopItems() {
    const counts = {};
    reservations.forEach(r => { counts[r.item] = (counts[r.item] || 0) + 1; });
    menuItems.forEach(m => { if (!counts[m.name]) counts[m.name] = Math.floor(Math.random() * 20 + 5); });

    const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 5);
    const catMap = {};
    menuItems.forEach(m => catMap[m.name] = m.category);

    document.getElementById('topItemsBody').innerHTML = sorted.map(([name, count], i) => {
        const cat = catMap[name] || 'prato';
        const catLabel = { prato: 'Prato', bebida: 'Bebida', sobremesa: 'Sobremesa', snack: 'Snack' }[cat];
        return `<tr>
            <td><strong>${i + 1}</strong></td>
            <td>${name}</td>
            <td><span class="badge badge-blue">${catLabel}</span></td>
            <td><strong>${count}</strong></td>
        </tr>`;
    }).join('');
}

 // RESERVATIONS 
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
        r.student.includes(q) || r.id.toLowerCase().includes(q) || r.item.toLowerCase().includes(q)
    );

    const statusBadge = { confirmed: 'badge-green', pending: 'badge-yellow', collected: 'badge-blue' };
    const statusLabel = { confirmed: 'Confirmada', pending: 'Pendente', collected: 'Levantada' };

    document.getElementById('reservationsBody').innerHTML = list.length
        ? list.map(r => `
            <tr>
                <td><strong>${r.id}</strong></td>
                <td>${r.student}</td>
                <td>${r.item}</td>
                <td>${r.mode}</td>
                <td>${r.time}</td>
                <td><span class="badge ${statusBadge[r.status]}">${statusLabel[r.status]}</span></td>
                <td>
                    ${r.status === 'pending' ? `<button class="btn btn-sm btn-primary" onclick="confirmReservation('${r.id}')">Confirmar</button>` : ''}
                    ${r.status === 'confirmed' ? `<button class="btn btn-sm btn-ghost" onclick="markCollected('${r.id}')">Levantada</button>` : ''}
                </td>
            </tr>
        `).join('')
        : `<tr><td colspan="7" style="text-align:center;color:var(--muted);padding:30px">Nenhuma reserva encontrada</td></tr>`;
}

function confirmReservation(id) {
    const r = reservations.find(x => x.id === id);
    if (r) { r.status = 'confirmed'; renderReservations(); updateStats(); }
}

function markCollected(id) {
    const r = reservations.find(x => x.id === id);
    if (r) { r.status = 'collected'; renderReservations(); updateStats(); }
}

 // MENU 
function filterMenu(cat, btn) {
    activeMenuFilter = cat;
    document.querySelectorAll('.filters .filter-btn').forEach(b => b.classList.remove('active'));
    if (btn) btn.classList.add('active');
    renderMenu();
}

function renderMenu() {
    const list = activeMenuFilter === 'all' ? menuItems : menuItems.filter(m => m.category === activeMenuFilter);
    const catLabel = { prato: 'Prato', bebida: 'Bebida', sobremesa: 'Sobremesa', snack: 'Snack' };
    const catClass = { prato: 'cat-prato', bebida: 'cat-bebida', sobremesa: 'cat-sobremesa', snack: 'cat-snack' };

    document.getElementById('menuGrid').innerHTML = list.length
        ? list.map(m => `
            <div class="menu-card">
                <div class="menu-card-header">
                    <span class="menu-card-name">${m.name}</span>
                    <span class="menu-card-price">€${m.price.toFixed(2)}</span>
                </div>
                <span class="menu-category ${catClass[m.category]}">${catLabel[m.category]}</span>
                <div class="menu-card-desc">${m.desc}</div>
                <div class="menu-card-footer">
                    <button class="btn btn-sm btn-ghost" onclick="editMenuItem(${m.id})">✏️ Editar</button>
                    <button class="btn btn-sm btn-danger" onclick="deleteMenuItem(${m.id})">🗑️ Remover</button>
                </div>
            </div>
        `).join('')
        : `<div class="empty-state"><div class="icon">🍽️</div><p>Nenhum item nesta categoria</p></div>`;
}

function openMenuModal(id = null) {
    editingItemId = id;
    document.getElementById('modalTitle').textContent = id ? 'Editar item' : 'Adicionar item ao menu';
    if (id) {
        const item = menuItems.find(m => m.id === id);
        document.getElementById('itemName').value = item.name;
        document.getElementById('itemDesc').value = item.desc;
        document.getElementById('itemPrice').value = item.price;
        document.getElementById('itemCategory').value = item.category;
    } else {
        document.getElementById('itemName').value = '';
        document.getElementById('itemDesc').value = '';
        document.getElementById('itemPrice').value = '';
        document.getElementById('itemCategory').value = 'prato';
    }
    document.getElementById('menuModal').classList.add('open');
}

function closeMenuModal() {
    document.getElementById('menuModal').classList.remove('open');
    editingItemId = null;
}

function saveMenuItem() {
    const name = document.getElementById('itemName').value.trim();
    const desc = document.getElementById('itemDesc').value.trim();
    const price = parseFloat(document.getElementById('itemPrice').value);
    const category = document.getElementById('itemCategory').value;

    if (!name || isNaN(price)) { alert('Preencha o nome e o preço.'); return; }

    if (editingItemId) {
        const item = menuItems.find(m => m.id === editingItemId);
        Object.assign(item, { name, desc, price, category });
    } else {
        menuItems.push({ id: Date.now(), name, desc, price, category });
    }

    closeMenuModal();
    renderMenu();
    updateStats();
    renderTopItems();
}

function editMenuItem(id) { openMenuModal(id); }

function deleteMenuItem(id) {
    if (!confirm('Remover este item do menu?')) return;
    menuItems = menuItems.filter(m => m.id !== id);
    renderMenu();
    updateStats();
}

 // SET DATE ON LOAD 
document.getElementById('topbarDate').textContent = new Date().toLocaleDateString('pt-PT', {
    weekday: 'long', day: 'numeric', month: 'long'
});