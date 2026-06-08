const API_URL = (typeof API !== 'undefined') ? API : 'http://localhost:3000';

function fetchWithTimeout(url, options = {}, ms = 5000) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), ms);
    return fetch(url, { ...options, signal: ctrl.signal })
        .finally(() => clearTimeout(timer));
}

const RESTAURANT_IDS = {
    'Pastelaria Monserrate Confeitaria': 3,
    'Tulipa de Sintra': 4,
    'O Caralhinho Bar & Restaurante': 5,
    'Pizaria do Mercado': 2,
    'Monkys': 6,
    'O Melhor Croissant da Minha Rua': 7
};

const IMG_BASE = 'https://raw.githubusercontent.com/sara-braz/UniFood/refs/heads/site-final/imagens/';
const RESTAURANT_IMAGES = {
    2: 'Pizaria_Mercado.jpeg',
    3: 'Pastelaria_Monserrate.jpeg',
    4: 'Tulipa.jpeg',
    5: 'caralhinho.jpeg',
    6: 'Monkys.jpeg',
    7: 'OMCDMR.jpeg'
};

// Auth tab switch
function switchTab(tab) {
    document.querySelectorAll('.auth-tab').forEach((t, i) => {
        t.classList.toggle('active', (i === 0 && tab === 'login') || (i === 1 && tab === 'signup'));
    });
    document.getElementById('loginForm').classList.toggle('active', tab === 'login');
    document.getElementById('signupForm').classList.toggle('active', tab === 'signup');
}

// Erro inline
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

// Loading
function showLoading(msg = 'A processar...') {
    document.getElementById('loadingText').textContent = msg;
    document.getElementById('loadingOverlay').classList.add('active');
}

function hideLoading() {
    document.getElementById('loadingOverlay').classList.remove('active');
}

// Tokens e reservas locais (demo offline)
function saveLocalToken(token) {
    const tokens = JSON.parse(localStorage.getItem('unifood_local_tokens') || '[]');
    if (!tokens.includes(token)) tokens.push(token);
    localStorage.setItem('unifood_local_tokens', JSON.stringify(tokens));
}

function saveLocalReservation(reservation) {
    const list = JSON.parse(localStorage.getItem('unifood_local_reservations') || '[]');
    list.unshift(reservation); // mais recente primeiro
    localStorage.setItem('unifood_local_reservations', JSON.stringify(list));
}

function getLocalReservations() {
    try { return JSON.parse(localStorage.getItem('unifood_local_reservations') || '[]'); }
    catch { return []; }
}


function getLocalUsers() {
    try { return JSON.parse(localStorage.getItem('unifood_local_users') || '[]'); }
    catch { return []; }
}

function saveLocalUser(user) {
    const users = getLocalUsers();
    users.push(user);
    localStorage.setItem('unifood_local_users', JSON.stringify(users));
}

// Login
function doLogin(event) {
    event.preventDefault();
    clearError('loginError');

    const email    = document.getElementById('email').value.trim();
    const password = document.getElementById('password').value;

    // 1. Backend
    showLoading('A entrar...');
    fetchWithTimeout(`${API_URL}/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, role: 'student' })
    })
    .then(r => r.json())
    .then(data => {
        hideLoading();
        if (data.success) loginSuccess({ name: data.user.name, id: data.user.id, email: data.user.email });
        else showError('loginError', data.message || 'Email ou palavra-passe incorretos.');
    })
    .catch(() => {
        hideLoading();
        // 2. Offline — credenciais estáticas ou registadas localmente
        const staticUser = DEMO_USERS.find(u => u.email === email && u.password === password);
        if (staticUser) { loginSuccess({ name: staticUser.name, id: null, email: staticUser.email }); return; }
        const localUser = getLocalUsers().find(u => u.email === email && u.password === password);
        if (localUser) { loginSuccess({ name: localUser.name, id: null, email: localUser.email }); return; }
        showError('loginError', 'Email ou palavra-passe incorretos.');
    });
}

function loginSuccess(user) {
    localStorage.setItem('unifood_student', JSON.stringify(user));
    document.getElementById('userName').textContent = user.name;
    document.getElementById('userAvatar').textContent = user.name.charAt(0).toUpperCase();
    document.getElementById('userInfo').style.display = 'flex';
    showPage('mainMenuPage');
    loadRestaurants();
}

async function loadRestaurants() {
    const grid = document.getElementById('restaurantsGrid');
    if (!grid) return;

    function renderCard(name, id, horario, localizacao) {
        const img  = RESTAURANT_IMAGES[id] ? `${IMG_BASE}${RESTAURANT_IMAGES[id]}` : '';
        const safe = name.replace(/'/g, "\\'");
        return `
        <div class="restaurant-card">
            <div class="restaurant-image"><img src="${img}" alt="${name}"></div>
            <div class="restaurant-info">
                <h3>${name}</h3>
                ${horario    ? `<p class="restaurant-detail">Horário: ${horario}</p>` : ''}
                ${localizacao ? `<p class="restaurant-detail">Localização: ${localizacao}</p>` : ''}
                <div class="restaurant-buttons">
                    <button class="btn btn-primary reserve-btn" onclick="showReservationPage('${safe}')">Fazer Reserva</button>
                    <button class="btn btn-primary reserve-btn" onclick="showMenuPage(${id},'${safe}')">Menu</button>
                </div>
            </div>
        </div>`;
    }

    try {
        const res  = await fetchWithTimeout(`${API_URL}/restaurants`);
        const data = await res.json();
        data.forEach(r => { RESTAURANT_IDS[r.nome_comercial] = r.id; });
        grid.innerHTML = data.map(r =>
            renderCard(r.nome_comercial, r.id, r.horario, r.localizacao)
        ).join('');
    } catch {
        grid.innerHTML = Object.entries(RESTAURANT_IDS).map(([name, id]) =>
            renderCard(name, id, '', '')
        ).join('');
    }
}

function getStudentSession() {
    try { return JSON.parse(localStorage.getItem('unifood_student')); }
    catch { return null; }
}

// Sign Up
function doSignup(event) {
    event.preventDefault();
    clearError('signupError');

    const name     = document.getElementById('signupName').value.trim();
    const email    = document.getElementById('signupEmail').value.trim();
    const number   = document.getElementById('signupNumber').value.trim();
    const password = document.getElementById('signupPassword').value;
    const confirm  = document.getElementById('signupConfirm').value;

    if (password !== confirm) {
        showError('signupError', 'As palavras-passe não coincidem.');
        return;
    }

    // Verificar se o email já existe localmente
    const allLocal = [...DEMO_USERS, ...getLocalUsers()];
    if (allLocal.find(u => u.email === email)) {
        showError('signupError', 'Este email já está registado.');
        return;
    }

    // Tentar backend
    showLoading('A criar conta...');
    fetchWithTimeout(`${API_URL}/signup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, password, student_number: number, role: 'student' })
    })
    .then(r => r.json())
    .then(data => {
        hideLoading();
        if (data.success) {
            showToast('Conta criada com sucesso! Pode entrar agora.', 'success');
            switchTab('login');
        } else {
            showError('signupError', data.message || 'Erro ao criar conta.');
        }
    })
    .catch(() => {
        hideLoading();
        saveLocalUser({ name, email, password });
        showToast('Conta criada (modo demo). Pode entrar agora.', 'success');
        switchTab('login');
    });
}

// Logo → home
function goHome() {
    // Só navega para o menu se já estiver autenticado
    const userInfo = document.getElementById('userInfo');
    if (userInfo.style.display !== 'none' && userInfo.style.display !== '') {
        showPage('mainMenuPage');
    }
}

// Dropdown do utilizador
function toggleDropdown() {
    document.getElementById('userDropdown').classList.toggle('open');
}

function doLogout() {
    localStorage.removeItem('unifood_student');
    document.getElementById('userInfo').style.display = 'none';
    document.getElementById('userDropdown').classList.remove('open');
    document.getElementById('email').value = '';
    document.getElementById('password').value = '';
    clearError('loginError');
    switchTab('login');
    showPage('loginPage');
}
// Fechar dropdowns ao clicar fora
document.addEventListener('click', function (e) {
    const userInfo = document.getElementById('userInfo');
    if (!userInfo.contains(e.target)) {
        document.getElementById('userDropdown').classList.remove('open');
        document.getElementById('notifPanel')?.classList.add('hidden');
    }
});

// Navegação
function showPage(pageId) {
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.getElementById(pageId).classList.add('active');
    if (pageId === 'myReservationsPage') loadMyReservations();
    if (pageId === 'mapaPage') initMap();
    if (pageId === 'allMenusPage') loadAllMenus();
    if (pageId === 'reservationPage') {
        selectedRestaurantName = null;
        document.querySelectorAll('.restaurant-select-card').forEach(c => c.classList.remove('selected'));
        document.querySelectorAll('.meal-option').forEach(o => o.classList.remove('selected'));
        document.querySelectorAll('.time-slot-btn').forEach(b => b.classList.remove('selected'));
        resetReservationSteps();
    }
    document.getElementById('notifPanel')?.classList.add('hidden');
    document.getElementById('userDropdown')?.classList.remove('open');
    closeSettings();
}

function showToast(msg, type = 'info') {
    const container = document.getElementById('toastContainer');
    if (!container) { console.log(msg); return; }
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = msg;
    container.appendChild(toast);
    setTimeout(() => {
        toast.classList.add('out');
        setTimeout(() => toast.remove(), 400);
    }, 3100);
}

// As Minhas Reservas
function loadMyReservations() {
    const session = getStudentSession();
    allMyUsedTokens = JSON.parse(localStorage.getItem('unifood_used_tokens') || '[]');
    myResFilterStatus     = 'all';
    myResFilterRestaurant = 'all';

    if (session?.id) {
        showLoading('A carregar reservas...');
        fetchWithTimeout(`${API_URL}/reservations/student/${session.id}`)
        .then(r => r.json())
        .then(data => {
            hideLoading();
            allMyReservations = data.map(r => ({
                id: r.id,
                token: r.qr_token,
                restaurant: r.restaurant_nome || '—',
                date: r.created_at,
                status: r.status,
                rating: r.rating || null
            }));
            updateNotifBadge();
            buildMyReservationFilters();
            applyMyReservationFilters();
        })
        .catch(() => {
            hideLoading();
            allMyReservations = getLocalReservations();
            buildMyReservationFilters();
            applyMyReservationFilters();
        });
    } else {
        allMyReservations = getLocalReservations();
        buildMyReservationFilters();
        applyMyReservationFilters();
    }
}

function buildMyReservationFilters() {
    const el = document.getElementById('myResFilters');
    if (!el) return;

    if (!allMyReservations.length) { el.innerHTML = ''; return; }

    const statuses = [
        { key: 'all',       label: 'Todas' },
        { key: 'pending',   label: 'Pendente' },
        { key: 'confirmed', label: 'Confirmada' },
        { key: 'collected', label: 'Levantada' },
        { key: 'cancelled', label: 'Cancelada' },
    ];

    const restaurants = ['all', ...new Set(
        allMyReservations.map(r => r.restaurant).filter(r => r && r !== '—')
    )];

    const statusBtns = statuses.map(s => `
        <button class="btn ${myResFilterStatus === s.key ? 'btn-primary' : 'btn-ghost'}"
                style="padding:6px 14px;font-size:0.82rem"
                onclick="myResFilterStatus='${s.key}';buildMyReservationFilters();applyMyReservationFilters()">
            ${s.label}
        </button>`).join('');

    const restaurantOpts = restaurants.map(r =>
        `<option value="${r}" ${myResFilterRestaurant === r ? 'selected' : ''}>${r === 'all' ? 'Todos os restaurantes' : r}</option>`
    ).join('');

    el.innerHTML = `
        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:10px">${statusBtns}</div>
        <select style="padding:7px 12px;border:1px solid #ddd;border-radius:8px;font-size:0.85rem;color:#333;background:white;cursor:pointer"
                onchange="myResFilterRestaurant=this.value;applyMyReservationFilters()">
            ${restaurantOpts}
        </select>`;
}

function applyMyReservationFilters() {
    let filtered = allMyReservations;

    if (myResFilterStatus !== 'all') {
        filtered = filtered.filter(r => {
            const status = r.status || (allMyUsedTokens.includes(r.token) ? 'collected' : 'pending');
            return status === myResFilterStatus;
        });
    }
    if (myResFilterRestaurant !== 'all') {
        filtered = filtered.filter(r => r.restaurant === myResFilterRestaurant);
    }

    _resPage = 0;
    _currentFilteredRes = filtered;
    document.getElementById('resLoadMore')?.remove();
    renderPagedReservations();
}

function renderMyReservations(container, list, usedTokens) {
    if (!list.length) {
        const hasReservations = allMyReservations.length > 0;
        container.innerHTML = `
            <div style="text-align:center;padding:40px;color:#6b6b6b">
                <div style="margin-bottom:12px"></div>
                <p>${hasReservations ? 'Nenhuma reserva encontrada para este filtro.' : 'Ainda não tem reservas.'}</p>
            </div>`;
        return;
    }

    container.innerHTML = list.map(r => {
        const used = usedTokens.includes(r.token);
        const status = r.status || (used ? 'collected' : 'pending');
        const statusLabel = { pending: 'Pendente', confirmed: 'Confirmada', collected: 'Levantada', cancelled: 'Cancelada' }[status] || status;
        const statusColor = { pending: '#d97706', confirmed: '#048045', collected: '#2563eb', cancelled: '#dc2626' }[status] || '#6b6b6b';
        const date = new Date(r.date).toLocaleDateString('pt-PT', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });

        return `
        <div style="background:white;border:1px solid #eee;border-radius:12px;padding:20px;margin-bottom:14px;display:flex;align-items:center;gap:20px;flex-wrap:wrap">
            <div id="qr-mini-${r.token}" style="flex-shrink:0;cursor:pointer;border-radius:6px" title="Clique para ampliar" onclick="openQRExpand('${r.token}')"></div>
            <div style="flex:1;min-width:160px">
                <div style="font-weight:700;font-size:1rem;color:#111;margin-bottom:4px">${r.restaurant || '—'}</div>
                <div style="font-size:0.82rem;color:#6b6b6b;margin-bottom:6px">${date}</div>
                <div style="font-size:0.8rem;font-weight:700;letter-spacing:0.08em;color:#444">Senha: ${r.token}</div>
            </div>
            <div style="text-align:right">
                <span style="font-size:0.78rem;font-weight:700;padding:4px 10px;border-radius:20px;background:${statusColor}22;color:${statusColor}">${statusLabel}</span>
                ${status === 'pending' ? `<div style="margin-top:8px"><button class="btn btn-ghost" style="font-size:0.8rem;padding:5px 12px;color:#dc2626;border-color:#dc2626" onclick="cancelMyReservation(${r.id})">Cancelar</button></div>` : ''}
                ${status === 'collected' ? `
                <div style="margin-top:8px">
                    ${r.rating
                        ? `<div style="font-size:0.75rem;color:#6b6b6b;margin-bottom:2px">A sua avaliação:</div>` +
                          [1,2,3,4,5].map(n => `<span style="font-size:1.3rem;color:${n <= r.rating ? '#f59e0b' : '#d1d5db'}">★</span>`).join('')
                        : r.id
                            ? `<button class="btn btn-ghost" style="font-size:0.8rem;padding:5px 12px;margin-top:4px" onclick="openRatingModal('${r.token}',${r.id})">Avalie o pedido</button>`
                            : ''
                    }
                </div>` : ''}
            </div>
        </div>`;
    }).join('');

    // Gerar QR miniatura para cada reserva
    list.forEach(r => {
        const el = document.getElementById(`qr-mini-${r.token}`);
        if (el) el.innerHTML = `<img src="https://api.qrserver.com/v1/create-qr-code/?data=${encodeURIComponent(r.token)}&size=70x70&ecc=M&margin=1" style="width:70px;height:70px;display:block" alt="QR">`;
    });
}


async function cancelMyReservation(id) {
    if (!confirm('Tens a certeza que queres cancelar esta reserva?')) return;
    const session = getStudentSession();
    if (!session || !session.id) {
        const r = allMyReservations.find(r => r.id === id);
        if (r) r.status = 'cancelled';
        applyMyReservationFilters();
        showToast('Reserva cancelada com sucesso.', 'success');
        return;
    }
    try {
        const res = await fetchWithTimeout(`${API_URL}/reservations/${id}/status`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status: 'cancelled' })
        });
        if (res.ok) { loadMyReservations(); showToast('Reserva cancelada com sucesso.', 'success'); }
    } catch {
        showToast('Sem ligação ao servidor.', 'error');
    }
}

let _ratingToken = null, _ratingId = null, _selectedRating = 0;

function openRatingModal(token, id) {
    _ratingToken = token;
    _ratingId = id;
    _selectedRating = 0;

    document.getElementById('ratingStars').innerHTML = [1,2,3,4,5].map(n =>
        `<span id="rstar-${n}" style="font-size:2.8rem;cursor:pointer;color:#d1d5db;transition:color 0.1s">★</span>`
    ).join('');

    [1,2,3,4,5].forEach(n => {
        const s = document.getElementById(`rstar-${n}`);
        s.addEventListener('mouseover', () => highlightStars(n));
        s.addEventListener('mouseout',  () => highlightStars(_selectedRating));
        s.addEventListener('click',     () => selectRating(n));
    });

    document.getElementById('ratingConfirmBtn').disabled = true;
    document.getElementById('ratingModal').style.display = 'flex';
}

function closeRatingModal() {
    document.getElementById('ratingModal').style.display = 'none';
}

function highlightStars(upTo) {
    [1,2,3,4,5].forEach(n => {
        const s = document.getElementById(`rstar-${n}`);
        if (s) s.style.color = n <= upTo ? '#f59e0b' : '#d1d5db';
    });
}

function selectRating(n) {
    _selectedRating = n;
    highlightStars(n);
    document.getElementById('ratingConfirmBtn').disabled = false;
}

function confirmRating() {
    if (!_selectedRating) return;
    rateReservation(_ratingToken, _ratingId, _selectedRating);
    closeRatingModal();
}

function rateReservation(token, id, rating) {
    fetchWithTimeout(`${API_URL}/reservations/${id}/rating`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rating })
    })
    .then(r => r.json())
    .then(data => {
        if (data.success) {
            const r = allMyReservations.find(x => x.token === token);
            if (r) { r.rating = rating; applyMyReservationFilters(); }
        }
    })
    .catch(() => {
        const r = allMyReservations.find(x => x.token === token);
        if (r) { r.rating = rating; applyMyReservationFilters(); }
    });
}

function loadMenuForReservation() {
    const container = document.getElementById('menuItemsForReservation');
    const restaurantId = RESTAURANT_IDS[selectedRestaurantName];
    selectedMenuItem = null;

    if (!restaurantId) {
        container.innerHTML = '';
        return;
    }

    container.innerHTML = '<p style="color:#6b6b6b;font-size:0.85rem">A carregar...</p>';

    fetchWithTimeout(`${API_URL}/menu/${restaurantId}`)
    .then(r => r.json())
    .then(items => {
        if (!items.length) { container.innerHTML = '<p style="color:#6b6b6b;font-size:0.85rem">Sem itens disponíveis.</p>'; return; }

        const noneCard = `<div class="menu-item-option selected" data-id="" onclick="selectMenuItemForReservation(this,null)"
            style="padding:10px 14px;border:1.5px solid var(--accent);border-radius:8px;cursor:pointer;margin-bottom:8px;background:var(--accent)08">
            <span style="font-weight:600;font-size:0.9rem">Sem preferência</span>
        </div>`;

        const itemCards = items.map(item => `
            <div class="menu-item-option" data-id="${item.id}"
                 onclick="selectMenuItemForReservation(this,{id:${item.id},name:'${item.nome_menu.replace(/'/g,"\\'")}',price:${parseFloat(item.preco)}})"
                 style="padding:10px 14px;border:1.5px solid #eee;border-radius:8px;cursor:pointer;margin-bottom:8px;display:flex;justify-content:space-between;align-items:center">
                <div>
                    <div style="font-weight:600;font-size:0.9rem">${item.nome_menu}</div>
                    ${item.descricao ? `<div style="font-size:0.78rem;color:#6b6b6b">${item.descricao}</div>` : ''}
                    ${item.alergenos ? `<div class="all-menus-item-allergens">⚠ ${item.alergenos}</div>` : ''}
                </div>
                <span style="font-weight:700;color:var(--accent);white-space:nowrap;margin-left:12px">€${parseFloat(item.preco).toFixed(2)}</span>
            </div>`).join('');

        container.innerHTML = noneCard + itemCards;
    })
    .catch(() => { container.innerHTML = '<p style="color:#6b6b6b;font-size:0.85rem">Não foi possível carregar o menu.</p>'; });
}

function selectMenuItemForReservation(card, item) {
    document.querySelectorAll('.menu-item-option').forEach(c => {
        c.style.border = '1.5px solid #eee';
        c.style.background = '';
    });
    card.style.border = '1.5px solid var(--accent)';
    card.style.background = 'rgba(4,128,69,0.05)';
    selectedMenuItem = item;
}

function updateReservationSummary() {
    const modalLabel = selectedMealType === 'takeaway' ? 'Take-away' : selectedMealType === 'dinein' ? 'No local' : '—';
    const itemLine = selectedMenuItem
        ? `<div style="display:flex;justify-content:space-between;margin-top:6px">
               <span>Item:</span><span style="font-weight:600">${selectedMenuItem.name}</span>
           </div>
           <div style="display:flex;justify-content:space-between;margin-top:8px;padding-top:8px;border-top:1px solid #eee">
               <span style="font-weight:700">Total:</span>
               <span style="font-weight:700;font-size:1.1rem;color:var(--accent)">€${selectedMenuItem.price.toFixed(2)}</span>
           </div>`
        : `<div style="margin-top:6px;color:#6b6b6b">Item: Sem preferência</div>`;

    document.getElementById('reservationSummary').innerHTML = `
        <div style="display:flex;justify-content:space-between"><span>Restaurante:</span><span style="font-weight:600">${selectedRestaurantName}</span></div>
        <div style="display:flex;justify-content:space-between;margin-top:6px"><span>Horário:</span><span style="font-weight:600">${selectedTimeSlot || '—'}</span></div>
        <div style="display:flex;justify-content:space-between;margin-top:6px"><span>Modalidade:</span><span style="font-weight:600">${modalLabel}</span></div>
        ${itemLine}`;
}

function showReservationPage(restaurantName = null) {
    showPage('reservationPage');
    selectedRestaurantName = null;
    // Limpar seleção anterior
    document.querySelectorAll('.restaurant-select-card').forEach(c => c.classList.remove('selected'));
    // Se veio de "Fazer Reserva" num cartão específico, pré-selecionar
    if (restaurantName) {
        const cards = document.querySelectorAll('.restaurant-select-card');
        cards.forEach(c => {
            if (c.querySelector('.rs-name').textContent.trim() === restaurantName ||
                restaurantName.includes(c.querySelector('.rs-name').textContent.trim())) {
                c.classList.add('selected');
                selectedRestaurantName = restaurantName;
            }
        });
    }
    resetReservationSteps();
}

function showMenuPage() {
    showPage('menusPage');
}

// Estado da reserva atual
let currentReservation = null;
let selectedRestaurantName = null;
let selectedMealType = null;
let selectedTimeSlot = null;
let selectedMenuItem = null; // { id, name, price } ou null

// Estado dos filtros de "As Minhas Reservas"
let allMyReservations = [];
let allMyUsedTokens   = [];
let myResFilterStatus     = 'all';
let myResFilterRestaurant = 'all';

function selectRestaurant(card, name) {
    document.querySelectorAll('.restaurant-select-card').forEach(c => c.classList.remove('selected'));
    card.classList.add('selected');
    selectedRestaurantName = name;
}

function nextStep(stepNumber) {
    // Validações antes de avançar
    if (stepNumber === 2 && !selectedRestaurantName) {
        showToast('Por favor selecione um restaurante.', 'error');
        return;
    }
    if (stepNumber === 2) {
        document.getElementById('selectedRestaurantLabel').textContent = selectedRestaurantName;
        loadMenuForReservation();
    }
    if (stepNumber === 3 && !selectedTimeSlot) {
        showToast('Por favor selecione o horário da refeição.', 'error');
        return;
    }
    if (stepNumber === 3 && !selectedMealType) {
        showToast('Por favor selecione a modalidade da refeição.', 'error');
        return;
    }
    if (stepNumber === 3) {
        updateReservationSummary();
    }
    if (stepNumber === 4) {
        createReservationAndShowQR();
        return;
    }
    goToStep(stepNumber);
}

function goToStep(stepNumber) {
    document.querySelectorAll('.step').forEach(step => {
        step.classList.remove('active');
        if (parseInt(step.dataset.step) <= stepNumber) step.classList.add('active');
    });
    document.querySelectorAll('.step-content').forEach(c => c.classList.remove('active'));
    document.getElementById('step' + stepNumber).classList.add('active');
}

function createReservationAndShowQR() {
    showLoading('A criar reserva...');
    const session = getStudentSession();
    const student_id = session?.id || null;
    const restaurant_id = RESTAURANT_IDS[selectedRestaurantName] || null;

    if (!student_id) {
        hideLoading();
        const token = generateLocalToken();
        saveLocalToken(token);
        saveLocalReservation({ token, restaurant: selectedRestaurantName, modalidade: selectedMealType, date: new Date().toISOString() });
        showQRStep(token);
        return;
    }

    fetchWithTimeout(`${API_URL}/reservations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ student_id, restaurant_id, menu_id: selectedMenuItem?.id || null, modalidade: [selectedTimeSlot, selectedMealType === 'takeaway' ? 'Take-away' : selectedMealType === 'dinein' ? 'No local' : null].filter(Boolean).join(' · ') || null })
    })
    .then(r => r.json())
    .then(data => {
        hideLoading();
        if (!data.success) {
            showToast(data.message || 'Erro ao criar reserva.', 'error');
            return;
        }
        const token = data.reservation.qr_token;
        saveLocalToken(token);
        saveLocalReservation({ token, restaurant: selectedRestaurantName, date: new Date().toISOString() });
        showQRStep(token);
    })
    .catch(() => {
        // servidor offline → modo demo
        hideLoading();
        const token = generateLocalToken();
        saveLocalToken(token);
        saveLocalReservation({ token, restaurant: selectedRestaurantName, date: new Date().toISOString() });
        showQRStep(token);
    });
}

function generateLocalToken() {
    return Math.random().toString(36).substring(2, 8).toUpperCase();
}

function showQRStep(token) {
    currentReservation = { token };
    document.getElementById('qrTokenDisplay').textContent = token;
    const container = document.getElementById('qrCodeContainer');
    container.innerHTML = `<img src="https://api.qrserver.com/v1/create-qr-code/?data=${encodeURIComponent(token)}&size=180x180&ecc=H&margin=2" style="width:180px;height:180px;display:block" alt="QR Code">`;
    goToStep(4);
}

function openQRExpand(token) {
    const codeEl = document.getElementById('qrExpandCode');
    codeEl.innerHTML = `<img src="https://api.qrserver.com/v1/create-qr-code/?data=${encodeURIComponent(token)}&size=240x240&ecc=H&margin=2" style="width:240px;height:240px;display:block" alt="QR Code">`;
    document.getElementById('qrExpandToken').textContent = 'Senha: ' + token;
    document.getElementById('qrExpandOverlay').style.display = 'flex';
}

function closeQRExpand() {
    document.getElementById('qrExpandOverlay').style.display = 'none';
    document.getElementById('qrExpandCode').innerHTML = '';
}

async function downloadQR() {
    const token = currentReservation?.token;
    if (!token) return;
    const url = `https://api.qrserver.com/v1/create-qr-code/?data=${encodeURIComponent(token)}&size=300x300&ecc=H&margin=2`;
    try {
        const res = await fetch(url);
        const blob = await res.blob();
        const link = document.createElement('a');
        link.download = `unifood-reserva-${token}.png`;
        link.href = URL.createObjectURL(blob);
        link.click();
    } catch {
        window.open(url, '_blank');
    }
}

function prevStep(n) { goToStep(n); }

// Mapa de Restaurantes
let _mapInstance = null;

async function initMap() {
    const msgEl = document.getElementById('mapLoadingMsg');

    if (_mapInstance) {
        _mapInstance.invalidateSize();
        return;
    }

    _mapInstance = L.map('map').setView([38.8029, -9.3817], 15);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        maxZoom: 19
    }).addTo(_mapInstance);

    let restaurants = [];
    try {
        const res = await fetchWithTimeout(`${API_URL}/restaurants`);
        restaurants = await res.json();
    } catch {
        restaurants = [];
    }

    let placed = 0;
    const markers = [];
    for (const r of restaurants) {
        const lat = parseFloat(r.latitude);
        const lon = parseFloat(r.longitude);
        if (isNaN(lat) || isNaN(lon) || lat === 0) continue;

        const safeName = r.nome_comercial.replace(/'/g, "\\'").replace(/"/g, '&quot;');
        const popupHtml =
            `<div class="map-popup">` +
            `<strong>${r.nome_comercial}</strong>` +
            (r.horario    ? `<span class="map-popup-hours">${r.horario}</span>` : '') +
            (r.localizacao ? `<span class="map-popup-addr">${r.localizacao}</span>` : '') +
            `<button onclick="showReservationPage('${safeName}')" class="map-popup-btn">Reservar</button>` +
            `</div>`;
        const marker = L.marker([lat, lon]).addTo(_mapInstance).bindPopup(popupHtml);
        markers.push(marker);
        placed++;
    }

    if (markers.length > 0) {
        _mapInstance.fitBounds(L.featureGroup(markers).getBounds().pad(0.12));
    }

    if (msgEl) {
        msgEl.textContent = placed > 0
            ? `${placed} restaurante${placed !== 1 ? 's' : ''} no mapa.`
            : 'Nenhum restaurante definiu ainda a sua localização. Os restaurantes podem fazê-lo nas Definições do painel.';
    }
}

function selectTimeSlot(btn, slot) {
    document.querySelectorAll('.time-slot-btn').forEach(b => b.classList.remove('selected'));
    btn.classList.add('selected');
    selectedTimeSlot = slot;
}

// Todos os menus
async function loadAllMenus() {
    const container = document.getElementById('allMenusContainer');
    if (!container) return;
    container.innerHTML = '<p style="color:var(--muted);padding:20px 0">A carregar menus…</p>';
    try {
        const res = await fetchWithTimeout(`${API_URL}/restaurants`);
        const restaurants = await res.json();
        if (!restaurants.length) {
            container.innerHTML = '<p style="color:var(--muted)">Sem restaurantes disponíveis.</p>';
            return;
        }
        const groups = await Promise.all(restaurants.map(async r => {
            try {
                const mr = await fetchWithTimeout(`${API_URL}/menu/${r.id}`);
                return { r, items: await mr.json() };
            } catch { return { r, items: [] }; }
        }));
        container.innerHTML = groups.map(({ r, items }) => `
            <div class="all-menus-group">
                <div class="all-menus-group-header">${r.nome_comercial}${r.horario ? ' · ' + r.horario : ''}</div>
                ${items.length
                    ? items.map(item => `
                        <div class="all-menus-item">
                            <div>
                                <div class="all-menus-item-name">${item.nome_menu}</div>
                                ${item.descricao ? `<div class="all-menus-item-desc">${item.descricao}</div>` : ''}
                                ${item.alergenos ? `<div class="all-menus-item-allergens">⚠ ${item.alergenos}</div>` : ''}
                            </div>
                            <div class="all-menus-item-price">€${parseFloat(item.preco).toFixed(2)}</div>
                        </div>`).join('')
                    : '<div class="all-menus-item" style="color:var(--muted);font-size:0.85rem">Sem itens disponíveis</div>'
                }
            </div>`).join('');
    } catch {
        container.innerHTML = '<p style="color:#dc2626;padding:20px 0">Erro ao carregar menus.</p>';
    }
}

// Definições do utilizador
async function openSettings() {
    const session = getStudentSession();
    if (!session) return;
    document.getElementById('profileModalAvatar').textContent = session.name.charAt(0).toUpperCase();
    document.getElementById('profileModalName').textContent = session.name;
    document.getElementById('profileModalEmail').textContent = session.email || '';
    const nameInput = document.getElementById('settingNameInput');
    if (nameInput) nameInput.value = session.name;
    document.getElementById('profileModal').classList.add('open');
    document.getElementById('userDropdown').classList.remove('open');
    ['settingCurrentPwd','settingNewPwd','settingConfirmPwd'].forEach(id => {
        const el = document.getElementById(id); if (el) el.value = '';
    });
    if (session.id) {
        try {
            const res = await fetchWithTimeout(`${API_URL}/users/${session.id}`);
            const data = await res.json();
            if (data.success) {
                document.getElementById('walletBalance').textContent =
                    parseFloat(data.user.saldo || 0).toFixed(2).replace('.', ',');
                document.getElementById('profileModalEmail').textContent = data.user.email || session.email || '';
                if (nameInput) nameInput.value = data.user.name || session.name;
            }
        } catch { /* server offline, ignore */ }
    }
}

function closeSettings() {
    document.getElementById('profileModal')?.classList.remove('open');
}

async function changePassword(event) {
    event.preventDefault();
    const session = getStudentSession();
    if (!session?.id) { showToast('Funcionalidade apenas disponível com conta online.', 'info'); return; }
    const current = document.getElementById('settingCurrentPwd').value;
    const novo = document.getElementById('settingNewPwd').value;
    const confirmar = document.getElementById('settingConfirmPwd').value;
    if (!current || !novo || !confirmar) { showToast('Preencha todos os campos.', 'error'); return; }
    if (novo !== confirmar) { showToast('As novas passwords não coincidem.', 'error'); return; }
    if (novo.length < 6) { showToast('A nova password deve ter pelo menos 6 caracteres.', 'error'); return; }
    try {
        const res = await fetchWithTimeout(`${API_URL}/users/${session.id}/password`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ currentPassword: current, newPassword: novo })
        });
        const data = await res.json();
        if (data.success) {
            showToast('Password alterada com sucesso.', 'success');
            ['settingCurrentPwd','settingNewPwd','settingConfirmPwd'].forEach(id => {
                const el = document.getElementById(id); if (el) el.value = '';
            });
        } else {
            showToast(data.message || 'Erro ao alterar password.', 'error');
        }
    } catch {
        showToast('Sem ligação ao servidor.', 'error');
    }
}

async function topupWallet(amount) {
    const session = getStudentSession();
    if (!session?.id) { showToast('Funcionalidade apenas disponível com conta online.', 'info'); return; }
    try {
        const res = await fetchWithTimeout(`${API_URL}/users/${session.id}/topup`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ amount })
        });
        const data = await res.json();
        if (data.success) {
            document.getElementById('walletBalance').textContent =
                parseFloat(data.saldo).toFixed(2).replace('.', ',');
            showToast(`€${amount.toFixed(2)} adicionados à carteira.`, 'success');
        } else {
            showToast(data.message || 'Erro ao carregar saldo.', 'error');
        }
    } catch {
        showToast('Sem ligação ao servidor.', 'error');
    }
}

async function saveAccountInfo(event) {
    event.preventDefault();
    const session = getStudentSession();
    if (!session?.id) { showToast('Funcionalidade apenas disponível com conta online.', 'info'); return; }
    const name = document.getElementById('settingNameInput').value.trim();
    if (!name) { showToast('O nome não pode estar vazio.', 'error'); return; }
    try {
        const res = await fetchWithTimeout(`${API_URL}/users/${session.id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name })
        });
        const data = await res.json();
        if (data.success) {
            const updated = { ...session, name: data.user.name };
            localStorage.setItem('unifood_student', JSON.stringify(updated));
            document.getElementById('userName').textContent = data.user.name;
            document.getElementById('userAvatar').textContent = data.user.name.charAt(0).toUpperCase();
            document.getElementById('profileModalAvatar').textContent = data.user.name.charAt(0).toUpperCase();
            document.getElementById('profileModalName').textContent = data.user.name;
            showToast('Nome atualizado com sucesso.', 'success');
        } else {
            showToast(data.message || 'Erro ao guardar alterações.', 'error');
        }
    } catch {
        showToast('Sem ligação ao servidor.', 'error');
    }
}

async function exportMyData() {
    const session = getStudentSession();
    if (!session?.id) { showToast('Funcionalidade apenas disponível com conta online.', 'info'); return; }
    try {
        const res = await fetchWithTimeout(`${API_URL}/users/${session.id}/export`);
        const data = await res.json();
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = `unifood-dados-${session.name.replace(/\s+/g, '-').toLowerCase()}.json`;
        link.click();
        showToast('Dados exportados com sucesso.', 'success');
    } catch {
        showToast('Sem ligação ao servidor.', 'error');
    }
}

function togglePrivacyPolicy(btn) {
    const block = document.getElementById('privacyPolicyBlock');
    const isHidden = block.style.display === 'none';
    block.style.display = isHidden ? 'block' : 'none';
    btn.querySelector('span').textContent = isHidden ? '▾' : '▸';
}

async function deleteAccount() {
    const session = getStudentSession();
    if (!session?.id) { showToast('Funcionalidade apenas disponível com conta online.', 'info'); return; }
    if (!confirm('Tem a certeza que pretende eliminar a sua conta?\n\nEsta ação é irreversível. Todos os seus dados e reservas serão apagados permanentemente.')) return;
    try {
        const res = await fetchWithTimeout(`${API_URL}/users/${session.id}`, { method: 'DELETE' });
        const data = await res.json();
        if (data.success) {
            closeSettings();
            doLogout();
            showToast('Conta eliminada com sucesso.', 'success');
        } else {
            showToast(data.message || 'Erro ao eliminar conta.', 'error');
        }
    } catch {
        showToast('Sem ligação ao servidor.', 'error');
    }
}

// Notificações
function updateNotifBadge() {
    const session = getStudentSession();
    if (!session?.id) return;
    const acked = JSON.parse(localStorage.getItem('unifood_ack_statuses') || '{}');
    const unread = allMyReservations.filter(r =>
        r.status !== 'pending' && acked[String(r.id)] !== r.status
    );
    const badge = document.getElementById('notifBadge');
    if (badge) {
        badge.textContent = unread.length > 9 ? '9+' : String(unread.length);
        unread.length > 0 ? badge.classList.remove('hidden') : badge.classList.add('hidden');
    }
    const list = document.getElementById('notifList');
    if (!list) return;
    const statusColors = { confirmed: '#048045', collected: '#2563eb', cancelled: '#dc2626' };
    const statusLabels = { confirmed: 'Confirmada', collected: 'Levantada', cancelled: 'Cancelada' };
    list.innerHTML = unread.length === 0
        ? '<li class="notif-empty">Sem notificações novas.</li>'
        : unread.map(r => `
            <li class="notif-item">
                <div class="notif-item-dot" style="background:${statusColors[r.status] || '#6b6b6b'}"></div>
                <div class="notif-item-text"><strong>${r.restaurant}</strong><br>
                Reserva ${r.token} — ${statusLabels[r.status] || r.status}</div>
            </li>`).join('');
}

function toggleNotifPanel() {
    const panel = document.getElementById('notifPanel');
    document.getElementById('userDropdown')?.classList.remove('open');
    panel.classList.toggle('hidden');
    if (!panel.classList.contains('hidden')) {
        const acked = JSON.parse(localStorage.getItem('unifood_ack_statuses') || '{}');
        allMyReservations.forEach(r => { if (r.status !== 'pending') acked[String(r.id)] = r.status; });
        localStorage.setItem('unifood_ack_statuses', JSON.stringify(acked));
        const badge = document.getElementById('notifBadge');
        if (badge) { badge.classList.add('hidden'); badge.textContent = '0'; }
    }
}

// Paginação nas minhas reservas
let _resPage = 0;
const RES_PAGE_SIZE = 10;
let _currentFilteredRes = [];

function renderPagedReservations() {
    const container = document.getElementById('myReservationsList');
    const visible = _currentFilteredRes.slice(0, (_resPage + 1) * RES_PAGE_SIZE);
    renderMyReservations(container, visible, allMyUsedTokens);
    const existing = document.getElementById('resLoadMore');
    if (_currentFilteredRes.length > visible.length) {
        if (!existing) {
            const div = document.createElement('div');
            div.id = 'resLoadMore';
            div.style.textAlign = 'center';
            div.style.marginTop = '12px';
            div.innerHTML = `<button class="btn btn-ghost" style="min-width:180px" onclick="_resPage++;renderPagedReservations()">Carregar mais</button>`;
            container.after(div);
        }
    } else {
        existing?.remove();
    }
}

function resetReservationSteps() { selectedMealType = null; selectedMenuItem = null; selectedTimeSlot = null; goToStep(1); }
document.addEventListener('DOMContentLoaded', function () {
    // Restaurar sessão
    const savedSession = localStorage.getItem('unifood_student');
    if (savedSession) {
        try {
            const user = JSON.parse(savedSession);
            if (user?.name) loginSuccess(user);
        } catch {
            // formato antigo (string simples)
            const name = savedSession;
            if (name) loginSuccess({ name, id: null });
        }
    }

    document.querySelectorAll('.feature-card').forEach(card => {
        card.addEventListener('click', function () {
            showPage(this.dataset.page);
        });
    });

    document.querySelectorAll('.meal-option').forEach(option => {
        option.addEventListener('click', function () {
            document.querySelectorAll('.meal-option').forEach(opt => opt.classList.remove('selected'));
            this.classList.add('selected');
            selectedMealType = this.dataset.type;
        });
    });

    document.querySelectorAll('.payment-method input').forEach(input => {
        input.addEventListener('change', function () {
            document.querySelectorAll('.payment-method').forEach(method => method.classList.remove('selected'));
            this.parentElement.classList.add('selected');
        });
    });
});