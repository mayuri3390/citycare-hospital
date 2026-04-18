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
  const token = localStorage.getItem('token');
  if (!user || !token) {
    // Dashboard pages live inside pages/ folder, so login.html is in same dir
    window.location.href = 'login.html';
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

// ── Role Redirect ─────────────────────────────────────────────────────────────

function _redirectByRole(role) {
  // Pages are inside pages/ folder, so dashboard files are siblings
  setTimeout(() => {
    if (role === 'patient') window.location.href = 'patient_dashboard.html';
    else if (role === 'doctor') window.location.href = 'doctor_dashboard.html';
    else if (role === 'receptionist') window.location.href = 'receptionist_dashboard.html';
    else window.location.href = 'login.html'; // fallback
  }, 800);
}

// ── Login ─────────────────────────────────────────────────────────────────────

async function handleLogin(e) {
  e.preventDefault();
  toggleLoader(true);

  const email = document.getElementById('email').value.trim();
  const password = document.getElementById('password').value;

  if (!email || !password) {
    toggleLoader(false);
    showToast('Please enter email and password', 'error');
    return;
  }

  try {
    const data = await AuthAPI.login(email, password);
    toggleLoader(false);
    showToast(data.message || 'Login successful!', 'success');
    _redirectByRole(data.data.user.role);
  } catch (err) {
    toggleLoader(false);
    showToast(err.message || 'Login failed. Please try again.', 'error');
  }
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
    toggleLoader(false);
    showToast(apiErr.message || 'Registration failed', 'error');
  }
}

// ── Logout ────────────────────────────────────────────────────────────────────

function handleLogout() {
  try { AuthAPI.logout(); } catch {}
  localStorage.removeItem('currentUser');
  localStorage.removeItem('token');
  showToast('Logged out successfully', 'success');
  // Always redirect to login page (same pages/ folder)
  setTimeout(() => { window.location.href = 'login.html'; }, 1000);
}

// ── Event bindings ────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  const path = window.location.pathname;
  const isLoginPage    = path.includes('login.html');
  const isRegisterPage = path.includes('register.html');

  // ── If already logged in, redirect away from login/register pages ──
  if (isLoginPage || isRegisterPage) {
    const existing = getCurrentUser();
    if (existing) {
      _redirectByRole(existing.role);
      return; // Stop further binding on these pages
    }
  }

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
