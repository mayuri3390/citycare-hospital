/**
 * utils.js — Core utility functions for CityCare Hospital
 * Provides: DB init, ID gen, toast, loader, theme, notifications
 */

// ── LocalStorage DB Init ──────────────────────────────────────────────────────

const INITIAL_DATA = {
  users: [],
  doctors: [
    { id: 'd1', name: 'Dr. Sarah Smith',   spec: 'Cardiologist',  experience: '10 Yrs', fee: 800 },
    { id: 'd2', name: 'Dr. John Doe',       spec: 'Dermatologist', experience: '5 Yrs',  fee: 600 },
    { id: 'd3', name: 'Dr. Emily Chen',     spec: 'Pediatrician',  experience: '8 Yrs',  fee: 700 },
    { id: 'd4', name: 'Dr. Michael Brown',  spec: 'Neurologist',   experience: '12 Yrs', fee: 1000 },
    { id: 'd5', name: 'Dr. Jessica White',  spec: 'Orthopedist',   experience: '6 Yrs',  fee: 750 }
  ],
  appointments: [],
  doctorRequests: [],
  notifications: []
};

function initDB() {
  try {
    for (const key in INITIAL_DATA) {
      if (!localStorage.getItem(key)) {
        localStorage.setItem(key, JSON.stringify(INITIAL_DATA[key]));
      }
    }
    let users = JSON.parse(localStorage.getItem('users')) || [];
    if (users.length === 0) {
      users = [
        { id: 'u1', name: 'Admin',          email: 'admin@citycare.com',   password: 'CityPass@123', role: 'receptionist' },
        { id: 'u2', name: 'Dr. Sarah Smith', email: 'drsmith@citycare.com', password: 'CityPass@123', role: 'doctor' },
        { id: 'u3', name: 'Test Patient',    email: 'patient@citycare.com', password: 'CityPass@123', role: 'patient' }
      ];
      localStorage.setItem('users', JSON.stringify(users));
    }
  } catch (err) {
    console.error('LocalStorage init error:', err);
  }
}

// ── ID Generator ──────────────────────────────────────────────────────────────

function generateId() {
  return `id_${Date.now().toString(36)}_${Math.random().toString(36).substr(2, 6)}`;
}

// ── Toast Notification ────────────────────────────────────────────────────────

function showToast(message, type = 'success') {
  let container = document.getElementById('toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    container.className = 'toast-container';
    document.body.appendChild(container);
  }

  const icons = { success: 'fa-check-circle', error: 'fa-exclamation-circle', warning: 'fa-exclamation-triangle', info: 'fa-info-circle' };
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `
    <i class="fas ${icons[type] || icons.info}"></i>
    <span>${message}</span>
    <button class="toast-close" onclick="this.parentElement.remove()"><i class="fas fa-times"></i></button>
  `;

  container.appendChild(toast);
  // Auto-dismiss after 4s
  setTimeout(() => {
    toast.style.animation = 'fadeOutRight 0.3s ease-out forwards';
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}

// ── Loader ────────────────────────────────────────────────────────────────────

function toggleLoader(show) {
  let loader = document.getElementById('global-loader');
  if (!loader) {
    loader = document.createElement('div');
    loader.id = 'global-loader';
    loader.className = 'loader-overlay';
    loader.innerHTML = `
      <div class="loader-card">
        <div class="spinner"></div>
        <p>Please wait…</p>
      </div>`;
    document.body.appendChild(loader);
  }
  loader.classList.toggle('active', show);
}

// ── Theme ─────────────────────────────────────────────────────────────────────

function toggleTheme() {
  document.body.classList.toggle('dark-mode');
  const isDark = document.body.classList.contains('dark-mode');
  localStorage.setItem('theme', isDark ? 'dark' : 'light');
  updateThemeIcon(isDark);
}

function updateThemeIcon(isDark) {
  document.querySelectorAll('.theme-toggle i').forEach(icon => {
    icon.className = isDark ? 'fas fa-sun' : 'fas fa-moon';
  });
}

function initTheme() {
  const isDark = localStorage.getItem('theme') === 'dark';
  if (isDark) document.body.classList.add('dark-mode');
  updateThemeIcon(isDark);
}

// ── LocalStorage Notification Helpers (demo mode) ─────────────────────────────

function addNotification(userId, message) {
  const notifs = JSON.parse(localStorage.getItem('notifications')) || [];
  notifs.unshift({ id: generateId(), userId, message, read: false, date: new Date().toISOString() });
  localStorage.setItem('notifications', JSON.stringify(notifs));
  updateNotificationBell();
}

function updateNotificationBell() {
  const user = getCurrentUser?.();
  if (!user) return;
  const notifs = JSON.parse(localStorage.getItem('notifications')) || [];
  const unread = notifs.filter(n => n.userId === user.email && !n.read).length;
  const badge = document.getElementById('notif-badge');
  if (badge) {
    badge.textContent = unread;
    badge.style.display = unread > 0 ? 'flex' : 'none';
  }
  // Render list
  const list = document.getElementById('notifList');
  if (list) {
    if (notifs.length === 0) {
      list.innerHTML = '<p class="empty-state">No notifications</p>';
    } else {
      const mine = notifs.filter(n => n.userId === user.email || n.userId === 'all');
      list.innerHTML = mine.slice(0, 10).map(n => `
        <div class="notif-item ${n.read ? 'read' : 'unread'}">
          <i class="fas fa-bell notif-icon"></i>
          <div>
            <p>${n.message}</p>
            <small>${new Date(n.date).toLocaleString()}</small>
          </div>
        </div>
      `).join('');
    }
  }
}

// ── Bootstrap ─────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  initDB();
  initTheme();  // Apply saved theme on load

  // Sidebar mobile toggle
  const menuToggle = document.querySelector('.menu-toggle');
  const sidebar = document.querySelector('.sidebar');
  if (menuToggle && sidebar) {
    menuToggle.addEventListener('click', () => sidebar.classList.toggle('active'));
    document.addEventListener('click', e => {
      if (window.innerWidth <= 992 && !sidebar.contains(e.target) && !menuToggle.contains(e.target)) {
        sidebar.classList.remove('active');
      }
    });
  }

  // Sidebar overlay — close sidebar on mobile
  const overlay = document.getElementById('sidebarOverlay');
  if (overlay) {
    overlay.addEventListener('click', () => sidebar?.classList.remove('active'));
  }
});

