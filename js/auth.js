/**
 * auth.js — Authentication module for CityCare Hospital
 * Uses Flask backend API; falls back to localStorage for offline demo.
 */

// ── Auth helpers ──────────────────────────────────────────────────────────────

function getCurrentUser() {
  try {
    return JSON.parse(localStorage.getItem('currentUser'));
  } catch {
    return null;
  }
}

function checkAuth(allowedRoles) {
  const user = getCurrentUser();
  if (!user) {
    window.location.href = '../pages/login.html';
    return null;
  }
  if (allowedRoles && !allowedRoles.includes(user.role)) {
    showToast('Unauthorized access', 'error');
    window.location.href = '../index.html';
    return null;
  }

  const profileName = document.getElementById('profile-name');
  if (profileName) profileName.textContent = user.name;
  const avatarInitials = document.getElementById('avatar-initials');
  if (avatarInitials) avatarInitials.textContent = user.name.charAt(0).toUpperCase();

  return user;
}

// ── Login ─────────────────────────────────────────────────────────────────────

async function handleLogin(e) {
  e.preventDefault();
  toggleLoader(true);

  const email = document.getElementById('email').value.trim();
  const password = document.getElementById('password').value;

  try {
    // Try real API first
    const data = await AuthAPI.login(email, password);
    toggleLoader(false);
    showToast(data.message || 'Login successful!', 'success');
    _redirectByRole(data.data.user.role);
  } catch (apiErr) {
    // Fallback: localStorage demo mode
    try {
      const users = JSON.parse(localStorage.getItem('users')) || [];
      const user = users.find(u => u.email === email && u.password === password);
      toggleLoader(false);
      if (user) {
        localStorage.setItem('currentUser', JSON.stringify(user));
        showToast('Login successful! (Demo Mode)', 'success');
        _redirectByRole(user.role);
      } else {
        showToast(apiErr.message || 'Invalid email or password', 'error');
      }
    } catch {
      toggleLoader(false);
      showToast('Login failed. Please try again.', 'error');
    }
  }
}

function _redirectByRole(role) {
  setTimeout(() => {
    if (role === 'patient') window.location.href = 'patient_dashboard.html';
    else if (role === 'doctor') window.location.href = 'doctor_dashboard.html';
    else if (role === 'receptionist') window.location.href = 'receptionist_dashboard.html';
  }, 1000);
}

// ── Register ──────────────────────────────────────────────────────────────────

async function handleRegister(e) {
  e.preventDefault();
  toggleLoader(true);

  const name = document.getElementById('name').value.trim();
  const email = document.getElementById('email').value.trim();
  const password = document.getElementById('password').value;
  const role = document.getElementById('role').value;
  const specialization = document.getElementById('specialization')?.value || '';

  try {
    const data = await AuthAPI.register({ name, email, password, role, specialization });
    toggleLoader(false);
    showToast(data.message || 'Registered successfully!', 'success');
    setTimeout(() => { window.location.href = 'login.html'; }, 1500);
  } catch (apiErr) {
    // Fallback: localStorage demo mode
    const users = JSON.parse(localStorage.getItem('users')) || [];
    if (users.find(u => u.email === email)) {
      toggleLoader(false);
      showToast('Email already in use', 'error');
      return;
    }
    const newUser = { id: generateId(), name, email, password, role };
    users.push(newUser);
    localStorage.setItem('users', JSON.stringify(users));

    if (role === 'doctor') {
      const doctors = JSON.parse(localStorage.getItem('doctors')) || [];
      doctors.push({ id: generateId(), name, spec: specialization || 'General', experience: '0 Yrs', user_id: newUser.id });
      localStorage.setItem('doctors', JSON.stringify(doctors));
    }
    toggleLoader(false);
    showToast('Registered! (Demo Mode) Please login.', 'success');
    setTimeout(() => { window.location.href = 'login.html'; }, 1500);
  }
}

// ── Logout ────────────────────────────────────────────────────────────────────

function handleLogout() {
  try { AuthAPI.logout(); } catch {}
  localStorage.removeItem('currentUser');
  localStorage.removeItem('token');
  showToast('Logged out successfully', 'success');
  setTimeout(() => { window.location.href = 'login.html'; }, 1000);
}

// ── Event bindings ────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  const loginForm = document.getElementById('loginForm');
  if (loginForm) loginForm.addEventListener('submit', handleLogin);

  const registerForm = document.getElementById('registerForm');
  if (registerForm) {
    registerForm.addEventListener('submit', handleRegister);
    // Show/hide specialization field
    const roleSelect = document.getElementById('role');
    const specGroup = document.getElementById('specializationGroup');
    if (roleSelect && specGroup) {
      roleSelect.addEventListener('change', () => {
        specGroup.style.display = roleSelect.value === 'doctor' ? 'block' : 'none';
      });
    }
  }

  const logoutBtn = document.getElementById('logoutBtn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', e => {
      e.preventDefault();
      handleLogout();
    });
  }
});
