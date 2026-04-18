/**
 * features.js — Advanced feature extensions for CityCare Hospital
 * ================================================================
 * Feature 1  : Notification Bell (real API + UI)
 * Feature 2  : Calendar (integrated in dashboard.js — enhanced here)
 * Feature 3  : PDF Download (enhanced jsPDF with full record data)
 * Feature 4  : Dark Mode Toggle (localStorage persistence, animated)
 * Feature 5  : Advanced Filters (doctor name text search)
 * Feature 6  : Login Tracking (handled backend-side)
 * Feature 7  : UI Improvements (toast, spinner, hover, no inline JS)
 *
 * Dependencies: api.js, utils.js, jsPDF (CDN)
 * Load AFTER: utils.js, api.js, auth.js  — BEFORE dashboard.js scripts
 */

'use strict';

// ═══════════════════════════════════════════════════════════════
//  FEATURE 4 — DARK MODE (enhanced, applied before paint)
// ═══════════════════════════════════════════════════════════════

/**
 * Apply saved theme immediately (call before DOMContentLoaded
 * to avoid flash of unstyled content).
 */
(function applyThemeEarly() {
  if (localStorage.getItem('theme') === 'dark') {
    document.documentElement.classList.add('dark-mode');
    document.body && document.body.classList.add('dark-mode');
  }
})();

/**
 * Full dark-mode initialisation (icons, toggle button wiring).
 * Called from DOMContentLoaded.
 */
function initDarkMode() {
  const isDark = localStorage.getItem('theme') === 'dark';
  _applyDarkMode(isDark);

  document.querySelectorAll('.theme-toggle').forEach(btn => {
    btn.removeEventListener('click', _onThemeToggle); // dedup
    btn.addEventListener('click', _onThemeToggle);
    _updateThemeIcon(btn, isDark);
  });
}

function _onThemeToggle() {
  const isDark = !document.body.classList.contains('dark-mode');
  _applyDarkMode(isDark);
  localStorage.setItem('theme', isDark ? 'dark' : 'light');
  document.querySelectorAll('.theme-toggle').forEach(btn => _updateThemeIcon(btn, isDark));
  showToast(isDark ? '🌙 Dark mode enabled' : '☀️ Light mode enabled', 'info');
}

function _applyDarkMode(isDark) {
  document.documentElement.classList.toggle('dark-mode', isDark);
  document.body.classList.toggle('dark-mode', isDark);
}

function _updateThemeIcon(btn, isDark) {
  const icon = btn.querySelector('i');
  if (icon) icon.className = isDark ? 'fas fa-sun' : 'fas fa-moon';
}


// ═══════════════════════════════════════════════════════════════
//  FEATURE 1 — NOTIFICATION BELL (API-backed)
// ═══════════════════════════════════════════════════════════════

let _notifUser = null;
let _notifPollTimer = null;

/**
 * Wire up the notification bell for a given user.
 * Fetches from /api/notifications/<id>, renders the dropdown,
 * updates the badge count, and polls every 60 s.
 */
async function initNotificationBell(user) {
  _notifUser = user;
  const bell  = document.querySelector('.notification-bell');
  const panel = document.getElementById('notifPanel');
  const badge = document.getElementById('notif-badge');
  const markAllBtn = document.getElementById('markAllRead');

  if (!bell || !panel) return;

  // Load immediately
  await _fetchAndRenderNotifs(user);

  // Bell click → open / close panel, mark read when opened
  bell.addEventListener('click', async e => {
    e.stopPropagation();
    const isOpen = panel.classList.toggle('open');
    if (isOpen) {
      await _markAllNotifRead(user);
    }
  });

  // Click outside → close panel
  document.addEventListener('click', e => {
    if (!bell.contains(e.target) && !panel.contains(e.target)) {
      panel.classList.remove('open');
    }
  });

  // Mark-all button
  if (markAllBtn) {
    markAllBtn.addEventListener('click', async e => {
      e.stopPropagation();
      await _markAllNotifRead(user);
    });
  }

  // Individual notif click → mark that one read
  panel.addEventListener('click', async e => {
    const item = e.target.closest('.notif-item[data-id]');
    if (item && item.classList.contains('unread')) {
      const nid = parseInt(item.dataset.id);
      try {
        await NotificationAPI.markRead([nid]);
        item.classList.replace('unread', 'read');
        // Decrement badge
        const current = parseInt(badge?.textContent || '0');
        const next = Math.max(0, current - 1);
        _setBadge(badge, next);
      } catch { /* ignore */ }
    }
  });

  // Poll every 60 seconds
  clearInterval(_notifPollTimer);
  _notifPollTimer = setInterval(() => _fetchAndRenderNotifs(user), 60_000);
}

async function _fetchAndRenderNotifs(user) {
  if (!user) return;
  const badge = document.getElementById('notif-badge');
  try {
    const res = await NotificationAPI.get(user.id);
    const { notifications = [], unread_count = 0 } = res.data || {};
    _setBadge(badge, unread_count);
    _renderNotifDropdown(notifications);
  } catch {
    // Fallback: localStorage
    const stored = JSON.parse(localStorage.getItem('notifications')) || [];
    const mine   = stored.filter(n => n.userId === user.email || n.userId === 'all');
    const unread = mine.filter(n => !n.read).length;
    _setBadge(badge, unread);
    _renderNotifDropdown(mine.slice(0, 15).map(n => ({
      id: n.id, message: n.message, is_read: n.read,
      created_at: n.date
    })));
  }
}

async function _markAllNotifRead(user) {
  if (!user) return;
  const badge = document.getElementById('notif-badge');
  try {
    await NotificationAPI.markRead();
    _setBadge(badge, 0);
    document.querySelectorAll('.notif-item.unread').forEach(el => {
      el.classList.replace('unread', 'read');
    });
  } catch {
    /* ignore */
  }
}

function _setBadge(badge, count) {
  if (!badge) return;
  badge.textContent = count > 99 ? '99+' : count;
  badge.style.display = count > 0 ? 'flex' : 'none';
}

function _renderNotifDropdown(notifs) {
  const list = document.getElementById('notifList');
  if (!list) return;

  if (!notifs || notifs.length === 0) {
    list.innerHTML = '<p class="empty-state"><i class="fas fa-bell-slash"></i> No notifications</p>';
    return;
  }

  list.innerHTML = notifs.slice(0, 20).map(n => `
    <div class="notif-item ${n.is_read ? 'read' : 'unread'}" data-id="${n.id}" role="listitem">
      <div class="notif-icon-wrap">
        <i class="fas fa-hospital-user notif-icon"></i>
      </div>
      <div class="notif-content">
        <p>${_escHtml(n.message)}</p>
        <small><i class="fas fa-clock"></i> ${_fmtTime(n.created_at)}</small>
      </div>
      ${!n.is_read ? '<span class="notif-unread-dot"></span>' : ''}
    </div>
  `).join('');
}

function _escHtml(str) {
  const d = document.createElement('div');
  d.appendChild(document.createTextNode(str || ''));
  return d.innerHTML;
}

function _fmtTime(str) {
  if (!str) return '—';
  const d = new Date(str);
  if (isNaN(d)) return str;
  const now  = new Date();
  const diff = Math.floor((now - d) / 1000);
  if (diff < 60)    return 'Just now';
  if (diff < 3600)  return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
}


// ═══════════════════════════════════════════════════════════════
//  FEATURE 5 — ADVANCED FILTERS (Doctor Name Text Search)
// ═══════════════════════════════════════════════════════════════

/**
 * Wire the patient dashboard filter bar (status + date + doctor name).
 * Hooks into the existing renderPatientAppointments() function.
 */
function initAdvancedFilters() {
  // Patient dashboard: doctor name input (new filter)
  const doctorNameInput = document.getElementById('doctorNameFilter');
  if (doctorNameInput) {
    let debounceTimer;
    doctorNameInput.addEventListener('input', () => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        const user = getCurrentUser?.();
        if (user) renderPatientAppointments(user);
      }, 400);
    });
  }

  // Receptionist dashboard: doctor name text filter
  const rDoctorNameInput = document.getElementById('rDoctorNameFilter');
  if (rDoctorNameInput) {
    let debounceTimer;
    rDoctorNameInput.addEventListener('input', () => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => renderAllAppointments?.(), 400);
    });
  }

  // Real-time status filter on change (patient)
  const statusFilter = document.getElementById('statusFilter');
  if (statusFilter) {
    statusFilter.addEventListener('change', () => {
      const user = getCurrentUser?.();
      if (user) renderPatientAppointments(user);
    });
  }

  // Real-time date filter on change (patient)
  const dateFilter = document.getElementById('dateFilter');
  if (dateFilter) {
    dateFilter.addEventListener('change', () => {
      const user = getCurrentUser?.();
      if (user) renderPatientAppointments(user);
    });
  }
}

/**
 * Extend the existing API calls to include doctor_name filter.
 * Patches AppointmentAPI.getForUser to pick up the new input.
 */
function _patchAppointmentFilters() {
  const _origGetForUser = AppointmentAPI.getForUser.bind(AppointmentAPI);
  AppointmentAPI.getForUser = function(userId, filters = {}) {
    const doctorName = document.getElementById('doctorNameFilter')?.value?.trim();
    if (doctorName) filters.doctor_name = doctorName;
    return _origGetForUser(userId, filters);
  };

  const _origGetAll = AppointmentAPI.getAll.bind(AppointmentAPI);
  AppointmentAPI.getAll = function(filters = {}) {
    const doctorName = document.getElementById('rDoctorNameFilter')?.value?.trim();
    if (doctorName) filters.doctor_name = doctorName;
    return _origGetAll(filters);
  };
}


// ═══════════════════════════════════════════════════════════════
//  FEATURE 3 — PDF DOWNLOAD (Enhanced jsPDF)
// ═══════════════════════════════════════════════════════════════

/**
 * Generate a professional prescription PDF.
 */
function generatePrescriptionPDF({ id, patientName, doctorName, date, diagnosis, prescription, notes }) {
  try {
    const { jsPDF } = window.jspdf;
    if (!jsPDF) throw new Error('jsPDF not loaded');

    const doc = new jsPDF({ unit: 'mm', format: 'a4' });
    const pageW = doc.internal.pageSize.getWidth();

    // ── Header strip ──
    doc.setFillColor(37, 99, 235);
    doc.rect(0, 0, pageW, 35, 'F');
    doc.setFontSize(22); doc.setTextColor(255, 255, 255); doc.setFont('helvetica', 'bold');
    doc.text('CityCare Hospital', 15, 16);
    doc.setFontSize(10); doc.setFont('helvetica', 'normal');
    doc.text('Prescription / Medical Summary', 15, 24);
    doc.text(`Generated: ${new Date().toLocaleDateString('en-IN')}`, 15, 30);

    // ── Patient / Doctor block ──
    doc.setFillColor(241, 245, 249);
    doc.rect(0, 38, pageW, 28, 'F');
    doc.setTextColor(30, 30, 30); doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.text('Patient', 15, 48);
    doc.text('Doctor', 80, 48);
    doc.text('Visit Date', 145, 48);
    doc.setFont('helvetica', 'normal');
    doc.text(patientName || '—', 15, 55);
    doc.text(doctorName || '—', 80, 55);
    doc.text(date || '—', 145, 55);
    doc.text(`Appointment #${id}`, 15, 62);

    // ── Divider ──
    doc.setDrawColor(200); doc.setLineWidth(0.3);
    doc.line(15, 70, pageW - 15, 70);

    // ── Diagnosis ──
    doc.setFontSize(13); doc.setFont('helvetica', 'bold'); doc.setTextColor(37, 99, 235);
    doc.text('Diagnosis', 15, 80);
    doc.setFontSize(10); doc.setFont('helvetica', 'normal'); doc.setTextColor(30, 30, 30);
    const diagLines = doc.splitTextToSize(diagnosis || 'As per consultation', pageW - 30);
    doc.text(diagLines, 15, 88);

    // ── Prescription ──
    const prescY = 88 + diagLines.length * 6 + 6;
    doc.setFontSize(13); doc.setFont('helvetica', 'bold'); doc.setTextColor(37, 99, 235);
    doc.text('Prescription (Rx)', 15, prescY);
    doc.setFontSize(10); doc.setFont('helvetica', 'normal'); doc.setTextColor(30, 30, 30);
    if (prescription) {
      const rxLines = doc.splitTextToSize(prescription, pageW - 30);
      doc.text(rxLines, 15, prescY + 8);
    } else {
      doc.text('• As advised by physician', 15, prescY + 8);
    }

    // ── Notes ──
    if (notes) {
      const notesY = prescY + 24;
      doc.setFontSize(13); doc.setFont('helvetica', 'bold'); doc.setTextColor(37, 99, 235);
      doc.text('Additional Notes', 15, notesY);
      doc.setFontSize(10); doc.setFont('helvetica', 'normal'); doc.setTextColor(30, 30, 30);
      const noteLines = doc.splitTextToSize(notes, pageW - 30);
      doc.text(noteLines, 15, notesY + 8);
    }

    // ── Footer ──
    const footerY = doc.internal.pageSize.getHeight() - 20;
    doc.setDrawColor(200); doc.line(15, footerY, pageW - 15, footerY);
    doc.setFontSize(8); doc.setTextColor(120);
    doc.text('CityCare Hospital — Patient Prescription Copy', 15, footerY + 6);
    doc.text('This document is computer-generated and does not require a signature.', 15, footerY + 11);

    doc.save(`CityCare_Prescription_${id || 'doc'}.pdf`);
    showToast('✅ Prescription PDF downloaded!', 'success');
  } catch (err) {
    console.error('PDF error:', err);
    showToast('❌ Could not generate PDF. Please try again.', 'error');
  }
}

/**
 * Generate a medical record PDF. 
 * Overrides the existing window.downloadRecordPDF.
 */
window.downloadRecordPDF = function(record) {
  generatePrescriptionPDF({
    id:           record.id,
    patientName:  record.patient_name,
    doctorName:   record.doctor_name,
    date:         record.created_at ? new Date(record.created_at).toLocaleDateString('en-IN') : '—',
    diagnosis:    record.diagnosis,
    prescription: record.prescription,
    notes:        record.notes
  });
};

/**
 * Download prescription from appointment row.
 * Overrides the existing window.downloadPrescription.
 * If a medical record with full data is available, use it; otherwise use minimal info.
 */
window.downloadPrescription = async function(apptId, patientName, doctorName, date) {
  toggleLoader(true);
  try {
    // Try to find the full medical record for this appointment
    const user = getCurrentUser?.();
    if (user) {
      const res = await RecordAPI.getForPatient(user.id);
      const records = res.data || [];
      const rec = records.find(r => String(r.appointment_id) === String(apptId));
      if (rec) {
        toggleLoader(false);
        generatePrescriptionPDF({
          id:           apptId,
          patientName:  rec.patient_name || patientName,
          doctorName:   rec.doctor_name  || doctorName,
          date:         date,
          diagnosis:    rec.diagnosis,
          prescription: rec.prescription,
          notes:        rec.notes
        });
        return;
      }
    }
    // Fallback: minimal data
    toggleLoader(false);
    generatePrescriptionPDF({ id: apptId, patientName, doctorName, date,
      diagnosis: 'As per consultation', prescription: null, notes: null });
  } catch {
    toggleLoader(false);
    generatePrescriptionPDF({ id: apptId, patientName, doctorName, date,
      diagnosis: 'As per consultation', prescription: null, notes: null });
  }
};


// ═══════════════════════════════════════════════════════════════
//  FEATURE 7 — UI IMPROVEMENTS
// ═══════════════════════════════════════════════════════════════

/**
 * Replace window.confirm() calls with a styled toast-based dialog.
 * Returns a Promise<boolean>.
 */
function showConfirm(message, confirmLabel = 'Confirm', dangerMode = true) {
  return new Promise(resolve => {
    // Remove existing confirm dialogs
    document.querySelectorAll('.cc-confirm-dialog').forEach(el => el.remove());

    const overlay = document.createElement('div');
    overlay.className = 'cc-confirm-overlay cc-confirm-dialog';
    overlay.innerHTML = `
      <div class="cc-confirm-box" role="dialog" aria-modal="true">
        <div class="cc-confirm-icon">
          <i class="fas ${dangerMode ? 'fa-exclamation-triangle' : 'fa-question-circle'}"></i>
        </div>
        <p class="cc-confirm-msg">${_escHtml(message)}</p>
        <div class="cc-confirm-actions">
          <button class="btn btn-outline cc-cancel-btn">Cancel</button>
          <button class="btn ${dangerMode ? 'btn-danger' : 'btn-primary'} cc-ok-btn">${_escHtml(confirmLabel)}</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);

    overlay.querySelector('.cc-ok-btn').addEventListener('click', () => {
      overlay.remove(); resolve(true);
    });
    overlay.querySelector('.cc-cancel-btn').addEventListener('click', () => {
      overlay.remove(); resolve(false);
    });
    // Click outside to dismiss
    overlay.addEventListener('click', e => {
      if (e.target === overlay) { overlay.remove(); resolve(false); }
    });
    // Focus the OK button
    setTimeout(() => overlay.querySelector('.cc-ok-btn')?.focus(), 50);
  });
}

// Override native confirm for the whole app
window._nativeConfirm = window.confirm;
window.confirm = function(msg) {
  // For synchronous callers (legacy) — can't switch those to async here,
  // but our own code uses showConfirm() which is async-friendly.
  return window._nativeConfirm(msg);
};

/**
 * Override window.cancelAppointment to use showConfirm instead of native confirm().
 */
document.addEventListener('DOMContentLoaded', () => {
  // We patch this after dashboard.js runs (it defines window.cancelAppointment)
  const _origCancel = window.cancelAppointment;
  if (_origCancel) {
    window.cancelAppointment = async function(id) {
      const confirmed = await showConfirm('Cancel this appointment?', 'Cancel Appointment', true);
      if (!confirmed) return;
      toggleLoader(true);
      try {
        await AppointmentAPI.cancel(id);
        showToast('✅ Appointment cancelled', 'warning');
      } catch {
        const appts = JSON.parse(localStorage.getItem('appointments')) || [];
        const idx = appts.findIndex(a => a.id === id);
        if (idx > -1) { appts[idx].status = 'cancelled'; localStorage.setItem('appointments', JSON.stringify(appts)); }
        showToast('Cancelled (Demo Mode)', 'warning');
      } finally {
        toggleLoader(false);
        const user = getCurrentUser?.();
        if (user) renderPatientAppointments?.(user);
      }
    };
  }
});

/**
 * Animate stat numbers (count-up effect).
 */
function animateStatNumbers() {
  document.querySelectorAll('.stat-info h3').forEach(el => {
    const target = parseInt(el.textContent);
    if (isNaN(target) || target === 0) return;
    let current = 0;
    const step  = Math.max(1, Math.ceil(target / 30));
    el.textContent = '0';
    const timer = setInterval(() => {
      current = Math.min(current + step, target);
      el.textContent = current;
      if (current >= target) clearInterval(timer);
    }, 30);
  });
}

/**
 * Add "back to top" scroll helper for long appointment tables.
 */
function initScrollTopButton() {
  const pageContent = document.querySelector('.page-content');
  if (!pageContent) return;

  let topBtn = document.getElementById('scrollTopBtn');
  if (!topBtn) {
    topBtn = document.createElement('button');
    topBtn.id = 'scrollTopBtn';
    topBtn.className = 'scroll-top-btn';
    topBtn.innerHTML = '<i class="fas fa-chevron-up"></i>';
    topBtn.title = 'Back to top';
    document.body.appendChild(topBtn);
  }

  pageContent.addEventListener('scroll', () => {
    topBtn.classList.toggle('visible', pageContent.scrollTop > 300);
  });
  topBtn.addEventListener('click', () => {
    pageContent.scrollTo({ top: 0, behavior: 'smooth' });
  });
}


// ═══════════════════════════════════════════════════════════════
//  BOOTSTRAP — Wire everything up on DOMContentLoaded
// ═══════════════════════════════════════════════════════════════

document.addEventListener('DOMContentLoaded', () => {
  // Dark mode
  initDarkMode();

  // Advanced filters (hooks into existing filter inputs + adds new ones)
  initAdvancedFilters();
  _patchAppointmentFilters();

  // Scroll-to-top button
  initScrollTopButton();

  // Wiring for notification bell — called ALSO from initPatient / initDoctor / initReceptionist
  // but we wire it here as a safety net
  const user = getCurrentUser?.();
  if (user) {
    initNotificationBell(user);
  }

  // Stat number animation — triggered after a small delay to let dashboard.js populate values
  setTimeout(animateStatNumbers, 600);

  // ── Add doctor name filter input to existing filter bars ──
  _injectDoctorNameFilterInputs();
});

/**
 * Inject doctor name text inputs into existing filter bars
 * (patient dashboard + receptionist dashboard).
 */
function _injectDoctorNameFilterInputs() {
  // Patient dashboard: insert before the Apply button
  const patientFilterRow = document.querySelector('#appointments .filter-row');
  if (patientFilterRow && !document.getElementById('doctorNameFilter')) {
    const wrapper = document.createElement('div');
    wrapper.className = 'form-group mb-0';
    wrapper.innerHTML = `
      <label>Doctor Name</label>
      <input type="text" id="doctorNameFilter" class="form-control"
             placeholder="Search doctor…" autocomplete="off">
    `;
    // Insert before the Apply button
    const applyBtn = patientFilterRow.querySelector('#filterBtn');
    if (applyBtn) {
      patientFilterRow.insertBefore(wrapper, applyBtn);
    } else {
      patientFilterRow.appendChild(wrapper);
    }

    // Wire the new input
    let debounce;
    wrapper.querySelector('input').addEventListener('input', () => {
      clearTimeout(debounce);
      debounce = setTimeout(() => {
        const u = getCurrentUser?.();
        if (u) renderPatientAppointments?.(u);
      }, 400);
    });
  }

  // Receptionist dashboard: insert before Apply button
  const recepFilterRow = document.querySelector('#allAppointments .filter-row');
  if (recepFilterRow && !document.getElementById('rDoctorNameFilter')) {
    const wrapper = document.createElement('div');
    wrapper.className = 'form-group mb-0';
    wrapper.innerHTML = `
      <label>Doctor Name</label>
      <input type="text" id="rDoctorNameFilter" class="form-control"
             placeholder="Search doctor…" autocomplete="off">
    `;
    const applyBtn = recepFilterRow.querySelector('#applyFilterBtn');
    if (applyBtn) {
      recepFilterRow.insertBefore(wrapper, applyBtn);
    } else {
      recepFilterRow.appendChild(wrapper);
    }

    let debounce;
    wrapper.querySelector('input').addEventListener('input', () => {
      clearTimeout(debounce);
      debounce = setTimeout(() => renderAllAppointments?.(), 400);
    });
  }
}

// Expose key functions for use from dashboard.js / HTML
window.initNotificationBell       = initNotificationBell;
window.generatePrescriptionPDF    = generatePrescriptionPDF;
window.showConfirm                = showConfirm;
window.animateStatNumbers         = animateStatNumbers;
