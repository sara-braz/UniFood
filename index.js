const API_URL = API;

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
function showLoading(msg = 'A processar…') {
    document.getElementById('loadingText').textContent = msg;
    document.getElementById('loadingOverlay').classList.add('active');
}

function hideLoading() {
    document.getElementById('loadingOverlay').classList.remove('active');
}

// Tokens locais (demo offline)
function saveLocalToken(token) {
    const tokens = JSON.parse(localStorage.getItem('unifood_local_tokens') || '[]');
    if (!tokens.includes(token)) tokens.push(token);
    localStorage.setItem('unifood_local_tokens', JSON.stringify(tokens));
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

    // 1. Credenciais estáticas (config.js)
    const staticUser = DEMO_USERS.find(u => u.email === email && u.password === password);
    if (staticUser) {
        loginSuccess(staticUser.name);
        return;
    }

    // 2. Utilizadores registados localmente
    const localUser = getLocalUsers().find(u => u.email === email && u.password === password);
    if (localUser) {
        loginSuccess(localUser.name);
        return;
    }

    // 3. Backend
    showLoading('A entrar…');
    fetch(`${API_URL}/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, role: 'student' })
    })
    .then(r => r.json())
    .then(data => {
        hideLoading();
        if (data.success) loginSuccess(data.user.name || email.split('@')[0]);
        else showError('loginError', data.message || 'Email ou palavra-passe incorretos.');
    })
    .catch(() => {
        hideLoading();
        showError('loginError', 'Email ou palavra-passe incorretos.');
    });
}

function loginSuccess(name) {
    localStorage.setItem('unifood_student', name);
    document.getElementById('userName').textContent = name;
    document.getElementById('userAvatar').textContent = name.charAt(0).toUpperCase();
    document.getElementById('userInfo').style.display = 'flex';
    showPage('mainMenuPage');
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
    showLoading('A criar conta…');
    fetch(`${API_URL}/signup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, password, student_number: number, role: 'student' })
    })
    .then(r => r.json())
    .then(data => {
        hideLoading();
        if (data.success) {
            saveLocalUser({ name, email, password });
            alert('Conta criada com sucesso! Pode entrar agora.');
            switchTab('login');
        } else {
            showError('signupError', data.message || 'Erro ao criar conta.');
        }
    })
    .catch(() => {
        hideLoading();
        saveLocalUser({ name, email, password });
        alert('Conta criada (modo demo). Pode entrar agora.');
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

// Fechar dropdown ao clicar fora
document.addEventListener('click', function (e) {
    const userInfo = document.getElementById('userInfo');
    if (!userInfo.contains(e.target)) {
        document.getElementById('userDropdown').classList.remove('open');
    }
});

// Navegação
function showPage(pageId) {
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.getElementById(pageId).classList.add('active');
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

function selectRestaurant(card, name) {
    document.querySelectorAll('.restaurant-select-card').forEach(c => c.classList.remove('selected'));
    card.classList.add('selected');
    selectedRestaurantName = name;
}

function nextStep(stepNumber) {
    // Validações antes de avançar
    if (stepNumber === 2 && !selectedRestaurantName) {
        alert('Por favor selecione um restaurante.');
        return;
    }
    if (stepNumber === 2) {
        document.getElementById('selectedRestaurantLabel').textContent = '📍 ' + selectedRestaurantName;
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
    showLoading('A criar reserva…');
    const restaurant_id = 2;

    fetch(`${API_URL}/reservations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ student_id: 1, restaurant_id, menu_id: null })
    })
    .then(r => r.json())
    .then(data => {
        hideLoading();
        const token = data.success ? data.reservation.qr_token : generateLocalToken();
        saveLocalToken(token);
        showQRStep(token);
    })
    .catch(() => {
        hideLoading();
        const token = generateLocalToken();
        saveLocalToken(token);
        showQRStep(token);
    });
}

function generateLocalToken() {
    return Math.random().toString(36).substring(2, 8).toUpperCase();
}

function showQRStep(token) {
    currentReservation = { token };
    document.getElementById('qrTokenDisplay').textContent = token;

    // Limpar e gerar QR
    const container = document.getElementById('qrCodeContainer');
    container.innerHTML = '';
    new QRCode(container, {
        text: token,
        width: 180,
        height: 180,
        colorDark: '#048045',
        colorLight: '#ffffff',
        correctLevel: QRCode.CorrectLevel.H
    });

    goToStep(4);
}

function downloadQR() {
    const canvas = document.querySelector('#qrCodeContainer canvas');
    if (!canvas) return;
    const link = document.createElement('a');
    link.download = `unifood-reserva-${currentReservation?.token || 'qr'}.png`;
    link.href = canvas.toDataURL();
    link.click();
}

function prevStep(n) { goToStep(n); }

function resetReservationSteps() { goToStep(1); }
document.addEventListener('DOMContentLoaded', function () {
    // Restaurar sessão
    const savedName = localStorage.getItem('unifood_student');
    if (savedName) {
        loginSuccess(savedName);
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
        });
    });

    document.querySelectorAll('.payment-method input').forEach(input => {
        input.addEventListener('change', function () {
            document.querySelectorAll('.payment-method').forEach(method => method.classList.remove('selected'));
            this.parentElement.classList.add('selected');
        });
    });
});