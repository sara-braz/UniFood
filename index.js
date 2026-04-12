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

    // 2. Backend
    fetch(`${API_URL}/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, role: 'student' })
    })
    .then(r => r.json())
    .then(data => {
        if (data.success) loginSuccess(data.name || email.split('@')[0]);
        else showError('loginError', data.message || 'Email ou palavra-passe incorretos.');
    })
    .catch(() => {
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

    fetch(`${API_URL}/signup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, password, student_number: number, role: 'student' })
    })
    .then(r => r.json())
    .then(data => {
        if (data.success) {
            alert('Conta criada com sucesso! Pode entrar agora.');
            switchTab('login');
        } else {
            showError('signupError', data.message || 'Erro ao criar conta.');
        }
    })
    .catch(() => {
        showError('signupError', 'Sem ligação ao servidor. O registo requer conexão ao backend.');
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

function showReservationPage() {
    showPage('reservationPage');
    resetReservationSteps();
}

function showMenuPage() {
    showPage('menusPage');
}

function nextStep(stepNumber) {
    document.querySelectorAll('.step').forEach(step => {
        step.classList.remove('active');
        if (parseInt(step.dataset.step) <= stepNumber) step.classList.add('active');
    });
    document.querySelectorAll('.step-content').forEach(c => c.classList.remove('active'));
    document.getElementById('step' + stepNumber).classList.add('active');
}

function prevStep(n) { nextStep(n); }

function resetReservationSteps() { nextStep(1); }

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