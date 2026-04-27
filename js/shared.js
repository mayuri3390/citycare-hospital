/**
 * dashboard.js — Role-based dashboard logic for CityCare Hospital
 * Connects to Flask API; falls back to localStorage (demo mode).
 */

// ── Bootstrap ─────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  const path = window.location.pathname;
  if (path.includes('patient_dashboard'))      { const u = checkAuth(['patient']);      if (u) initPatient(u); }
  else if (path.includes('doctor_dashboard'))  { const u = checkAuth(['doctor']);       if (u) initDoctor(u);  }
  else if (path.includes('receptionist_dashboard')) { const u = checkAuth(['receptionist']); if (u) initReceptionist(u); }

  // Sidebar tab navigation
  document.querySelectorAll('.tab-btn').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
      tab.classList.add('active');
      const target = document.getElementById(tab.dataset.target);
      if (target) target.classList.add('active');
    });
  });
});

//  SHARED ACTIONS (window-scoped for inline onclick)
// ═══════════════════════════════════════════════════════════

window.updateApptStatus = async function (id, status) {
  if (!status) return;
  toggleLoader(true);
  try {
    await AppointmentAPI.update(id, { status });
    showToast(`Appointment marked as ${status}`, 'success');
  } catch (error) {
    console.error(error);
    showToast(error.message || 'Server connection failed', 'error');
  } finally {
    toggleLoader(false);
    const user = getCurrentUser();
    if (user?.role === 'patient')      renderPatientAppointments(user);
    else if (user?.role === 'doctor')  { renderDoctorAppointments(user); renderDoctorStats(user); }
    else if (user?.role === 'receptionist') { renderAllAppointments(); renderReceptionistStats(); }
  }
};

window.cancelAppointment = async function (id) {
  if (!confirm('Cancel this appointment?')) return;
  toggleLoader(true);
  try {
    await AppointmentAPI.cancel(id);
    showToast('Appointment cancelled', 'warning');
  } catch (error) {
    console.error(error);
    showToast(error.message || 'Server connection failed', 'error');
  } finally {
    toggleLoader(false);
    const user = getCurrentUser();
    if (user) renderPatientAppointments(user);
  }
};

window.openRescheduleForm = function (id, date, time) {
  document.getElementById('rescheduleFormContainer').style.display = 'block';
  document.getElementById('reschedApptId').value = id;
  document.getElementById('reschedDate').value = date;
  document.getElementById('reschedDate').setAttribute('min', todayStr());
  document.getElementById('reschedTime').value = time;
  document.getElementById('rescheduleFormContainer').scrollIntoView({ behavior: 'smooth' });
};

window.downloadPrescription = function (id, patient, doctor, date) {
  try {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    doc.setFontSize(22); doc.setTextColor(37, 99, 235);
    doc.text('CityCare Hospital', 20, 20);
    doc.setFontSize(12); doc.setTextColor(0, 0, 0);
    doc.text(`Appointment #${id}`, 20, 30);
    doc.line(20, 35, 190, 35);
    doc.setFontSize(14); doc.text('Prescription', 20, 45);
    doc.setFontSize(12);
    doc.text(`Patient: ${patient}`, 20, 60);
    doc.text(`Doctor: ${doctor}`, 20, 70);
    doc.text(`Date: ${date}`, 20, 80);
    doc.text(`Diagnosis: As per consultation`, 20, 95);
    doc.text('Rx:', 20, 110);
    doc.text('- Paracetamol 500mg — 1×3 daily', 25, 120);
    doc.text('- Vitamin C 500mg — 1×1 daily', 25, 130);
    doc.text('- Rest for 2 days', 25, 140);
    doc.text(`\nIssued by CityCare Hospital`, 20, 160);
    doc.save(`Prescription_${id}.pdf`);
    showToast('Prescription downloaded!', 'success');
  } catch (error) {
    console.error(error);
    showToast(error.message || 'Server connection failed', 'error');
  }
};

window.downloadRecordPDF = function (record) {
  try {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    doc.setFontSize(22); doc.setTextColor(37, 99, 235);
    doc.text('CityCare Hospital', 20, 20);
    doc.setFontSize(14); doc.setTextColor(0, 0, 0);
    doc.text('Medical Record', 20, 35);
    doc.line(20, 40, 190, 40);
    doc.setFontSize(12);
    doc.text(`Patient: ${record.patient_name}`, 20, 55);
    doc.text(`Doctor: ${record.doctor_name}`, 20, 65);
    doc.text(`Date: ${formatDate(record.created_at)}`, 20, 75);
    doc.text(`Diagnosis: ${record.diagnosis}`, 20, 90);
    if (record.prescription) doc.text(`Prescription: ${record.prescription}`, 20, 105);
    if (record.notes) doc.text(`Notes: ${record.notes}`, 20, 120);
    doc.save(`MedRecord_${record.id}.pdf`);
    showToast('Record downloaded!', 'success');
  } catch (error) {
    console.error(error);
    showToast(error.message || 'Server connection failed', 'error');
  }
};

window.openRecordForm = function (apptId, patientId, patientName) {
  const container = document.getElementById('recordFormContainer');
  if (container) {
    container.style.display = 'block';
    document.getElementById('recordApptId').value = apptId;
    document.getElementById('recordPatientId').value = patientId;
    document.getElementById('recordPatientName').textContent = patientName;
    container.scrollIntoView({ behavior: 'smooth' });
  }
};

window.handleDrRequest = async function (id, status) {
  toggleLoader(true);
  try {
    await DoctorRequestAPI.update(id, status);
    showToast(`Request ${status}`, status === 'approved' ? 'success' : 'warning');
    await loadDoctorRequestsList();
  } catch (error) {
    console.error(error);
    showToast(error.message || 'Server connection failed', 'error');
  } finally {
    toggleLoader(false);
  }
};

//  NOTIFICATION PANEL TOGGLE & LOGIC
// ═══════════════════════════════════════════════════════════

window.setupPatientNotifications = async function(user) {
  try {
    const res = await NotificationAPI.get(user.id);
    const data = res.data || {};
    const notifications = data.notifications || [];
    const unread_count = data.unread_count || 0;
    _updateNotifBell(unread_count);
    _renderNotifList(notifications);
  } catch (error) {
    console.error(error);
  }
};

function _updateNotifBell(count) {
  const badge = document.getElementById('notif-badge');
  if (!badge) return;
  badge.textContent = count;
  badge.style.display = count > 0 ? 'flex' : 'none';
}

function _renderNotifList(notifs) {
  const list = document.getElementById('notifList');
  if (!list) return;
  if (notifs.length === 0) {
    list.innerHTML = '<p class="empty-state">No notifications</p>';
    return;
  }
  list.innerHTML = notifs.map(n => `
    <div class="notif-item ${n.is_read ? 'read' : 'unread'}" data-id="${n.id}">
      <i class="fas fa-bell notif-icon"></i>
      <div>
        <p>${n.message}</p>
        <small>${formatDate(n.created_at)}</small>
      </div>
    </div>
  `).join('');
}

document.addEventListener('DOMContentLoaded', () => {
  const bell = document.querySelector('.notification-bell');
  const panel = document.getElementById('notifPanel');
  if (bell && panel) {
    bell.addEventListener('click', async () => {
      panel.classList.toggle('open');
      if (panel.classList.contains('open')) {
        // Mark all as read
        const user = getCurrentUser();
        if (user) {
          try {
            await NotificationAPI.markRead();
            _updateNotifBell(0);
          } catch (error) {
    console.error(error);
    showToast(error.message || 'Server connection failed', 'error');
  }
        }
      }
    });
    document.addEventListener('click', e => {
      if (!bell.contains(e.target) && !panel.contains(e.target)) {
        panel.classList.remove('open');
      }
    });
  }
});

//  UTILITY
// ═══════════════════════════════════════════════════════════

function todayStr() {
  return new Date().toISOString().split('T')[0];
}

function formatDate(str) {
  if (!str) return '—';
  const d = new Date(str);
  return isNaN(d) ? str : d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

function _setStatText(id, val) {
  const el = document.getElementById(id);
  if (el) el.textContent = val;
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}
