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

// ═══════════════════════════════════════════════════════════
//  PATIENT DASHBOARD
// ═══════════════════════════════════════════════════════════

async function initPatient(user) {
  const welcome = document.getElementById('welcome-name');
  if (welcome) welcome.textContent = user.name.split(' ')[0];

  await loadDoctorsList(user);
  await renderPatientAppointments(user);
  await setupPatientNotifications(user);
  initCalendar(user);

  // Book form
  const bookForm = document.getElementById('bookForm');
  if (bookForm) {
    const dateInput = document.getElementById('apptDate');
    if (dateInput) dateInput.setAttribute('min', todayStr());

    bookForm.addEventListener('submit', async e => {
      e.preventDefault();
      const doctorId = document.getElementById('doctorSelect').value;
      const date = document.getElementById('apptDate').value;
      const time = document.getElementById('apptTime').value;

      if (!doctorId || !date || !time) { showToast('All fields are required', 'error'); return; }

      toggleLoader(true);
      try {
        await AppointmentAPI.book({ doctor_id: parseInt(doctorId), date, time });
        showToast('Appointment booked successfully!', 'success');
        bookForm.reset();
        await renderPatientAppointments(user);
        await setupPatientNotifications(user);
        document.querySelector('[data-target="appointments"]')?.click();
      } catch {
        // Demo mode fallback
        const doctors = JSON.parse(localStorage.getItem('doctors')) || [];
        const doctor = doctors.find(d => String(d.id) === String(doctorId));
        const appts = JSON.parse(localStorage.getItem('appointments')) || [];
        appts.push({
          id: generateId(), patient: user.name, patientEmail: user.email,
          doctor: doctor?.name || 'Unknown', doctorEmail: doctor?.email || '',
          date, time, status: 'pending'
        });
        localStorage.setItem('appointments', JSON.stringify(appts));
        addNotification(user.email, `Appointment booked with ${doctor?.name} on ${date}.`);
        showToast('Appointment booked! (Demo Mode)', 'success');
        bookForm.reset();
        renderPatientAppointmentsLocal(user);
        document.querySelector('[data-target="appointments"]')?.click();
      } finally {
        toggleLoader(false);
      }
    });
  }

  // Reschedule form
  const reschedForm = document.getElementById('rescheduleForm');
  if (reschedForm) {
    reschedForm.addEventListener('submit', async e => {
      e.preventDefault();
      const id = document.getElementById('reschedApptId').value;
      const newDate = document.getElementById('reschedDate').value;
      const newTime = document.getElementById('reschedTime').value;
      toggleLoader(true);
      try {
        await AppointmentAPI.update(id, { date: newDate, time: newTime, status: 'pending' });
        showToast('Appointment rescheduled!', 'success');
      } catch {
        // Demo fallback
        const appts = JSON.parse(localStorage.getItem('appointments')) || [];
        const idx = appts.findIndex(a => a.id === id);
        if (idx > -1) { appts[idx].date = newDate; appts[idx].time = newTime; appts[idx].status = 'pending'; }
        localStorage.setItem('appointments', JSON.stringify(appts));
        showToast('Rescheduled! (Demo Mode)', 'success');
      } finally {
        toggleLoader(false);
        document.getElementById('rescheduleFormContainer').style.display = 'none';
        reschedForm.reset();
        await renderPatientAppointments(user);
      }
    });
  }

  // Filter bar
  const filterBtn = document.getElementById('filterBtn');
  if (filterBtn) {
    filterBtn.addEventListener('click', () => renderPatientAppointments(user));
  }

  // Upload form (simulation)
  const uploadForm = document.getElementById('uploadForm');
  if (uploadForm) {
    uploadForm.addEventListener('submit', async e => {
      e.preventDefault();
      toggleLoader(true);
      await sleep(1200);
      toggleLoader(false);
      showToast('Report uploaded securely!', 'success');
      uploadForm.reset();
    });
  }
  // Load medical records
  await renderMedicalRecords(user);
}

async function loadDoctorsList(user) {
  let doctors = [];
  try {
    const res = await DoctorAPI.getAll();
    doctors = res.data || [];
    // Store for demo fallback
    localStorage.setItem('doctors_api', JSON.stringify(doctors));
  } catch {
    doctors = JSON.parse(localStorage.getItem('doctors')) || [];
  }

  const select = document.getElementById('doctorSelect');
  const container = document.getElementById('doctorsGrid');

  if (select) {
    select.innerHTML = '<option value="">Select a Doctor</option>';
    doctors.forEach(d => {
      select.innerHTML += `<option value="${d.id}">${d.name} (${d.specialization || d.spec})</option>`;
    });
  }

  if (container) {
    if (doctors.length === 0) {
      container.innerHTML = '<p class="empty-state">No doctors available.</p>';
      return;
    }
    container.innerHTML = doctors.map(d => `
      <div class="doctor-card" data-id="${d.id}">
        <div class="doctor-avatar"><i class="fas fa-user-md"></i></div>
        <div class="doctor-name">${d.name}</div>
        <div class="doctor-spec">${d.specialization || d.spec}</div>
        <div class="doctor-exp"><i class="fas fa-clock"></i> ${d.experience || 'N/A'}</div>
        <div class="doctor-fee">₹${d.fee || '—'} per visit</div>
        <button class="btn btn-primary book-now-btn" data-id="${d.id}" data-name="${d.name}">
          <i class="fas fa-calendar-plus"></i> Book Now
        </button>
      </div>
    `).join('');

    container.querySelectorAll('.book-now-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelector('[data-target="book"]')?.click();
        const sel = document.getElementById('doctorSelect');
        if (sel) sel.value = btn.dataset.id;
      });
    });
  }

  // Specialization filter
  const specFilter = document.getElementById('specFilter');
  if (specFilter) {
    const specs = [...new Set(doctors.map(d => d.specialization || d.spec).filter(Boolean))];
    specs.forEach(s => {
      specFilter.innerHTML += `<option value="${s}">${s}</option>`;
    });
    specFilter.addEventListener('change', () => {
      const q = specFilter.value.toLowerCase();
      container?.querySelectorAll('.doctor-card').forEach(card => {
        const spec = card.querySelector('.doctor-spec')?.textContent.toLowerCase() || '';
        card.style.display = (!q || spec.includes(q)) ? '' : 'none';
      });
      if (select) {
        select.querySelectorAll('option').forEach(opt => {
          if (opt.value === '') return;
          const found = doctors.find(d => String(d.id) === opt.value);
          const spec2 = (found?.specialization || found?.spec || '').toLowerCase();
          opt.style.display = (!q || spec2.includes(q)) ? '' : 'none';
        });
      }
    });
  }
}

async function renderPatientAppointments(user) {
  const tbody = document.getElementById('patientAppointmentsData');
  if (!tbody) return;

  try {
    const filters = {};
    const sFilter = document.getElementById('statusFilter')?.value;
    const dFilter = document.getElementById('dateFilter')?.value;
    const docFilter = document.getElementById('doctorFilter')?.value;
    if (sFilter) filters.status = sFilter;
    if (dFilter) filters.date = dFilter;
    if (docFilter) filters.doctor_id = docFilter;

    const res = await AppointmentAPI.getForUser(user.id, filters);
    _renderApptRows(tbody, res.data || [], 'patient');
    _populateCalendarDots(res.data || []);
  } catch {
    renderPatientAppointmentsLocal(user);
  }
}

function renderPatientAppointmentsLocal(user) {
  const tbody = document.getElementById('patientAppointmentsData');
  if (!tbody) return;
  const appts = (JSON.parse(localStorage.getItem('appointments')) || [])
    .filter(a => a.patientEmail === user.email);
  _renderApptRows(tbody, appts.map(a => ({
    id: a.id, date: a.date, time: a.time, status: a.status,
    doctor_name: a.doctor, patient_name: a.patient
  })), 'patient');
}

function _renderApptRows(tbody, appts, role) {
  if (appts.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" class="empty-state">No appointments found</td></tr>';
    return;
  }
  tbody.innerHTML = appts.map(a => {
    const statusClass = `status-${a.status}`;
    let actions = '';
    if (role === 'patient') {
      if (a.status !== 'cancelled' && a.status !== 'completed') {
        actions += `<button class="btn-sm btn-primary" onclick="openRescheduleForm('${a.id}','${a.date}','${a.time}')"><i class="fas fa-edit"></i> Reschedule</button>`;
        actions += `<button class="btn-sm btn-danger" onclick="cancelAppointment('${a.id}')"><i class="fas fa-times"></i> Cancel</button>`;
      }
      if (a.status === 'completed') {
        actions += `<button class="btn-sm btn-outline" onclick="downloadPrescription('${a.id}','${a.patient_name}','${a.doctor_name}','${a.date}')"><i class="fas fa-file-pdf"></i> PDF</button>`;
      }
    } else if (role === 'doctor') {
      if (a.status === 'pending' || a.status === 'confirmed') {
        actions = `
          <select class="action-select form-control" onchange="updateApptStatus('${a.id}', this.value)">
            <option value="">Action</option>
            <option value="confirmed">Confirm</option>
            <option value="completed">Complete</option>
            <option value="cancelled">Cancel</option>
          </select>`;
      }
    } else {
      actions = `
        <select class="action-select form-control" onchange="updateApptStatus('${a.id}', this.value)">
          <option value="">Update</option>
          <option value="pending">Pending</option>
          <option value="confirmed">Confirm</option>
          <option value="completed">Complete</option>
          <option value="cancelled">Cancel</option>
        </select>`;
    }

    const timeStr = typeof a.time === 'string' ? a.time.substring(0, 5) : a.time;

    return `
      <tr>
        <td>#${String(a.id).substring(0, 8)}</td>
        ${role !== 'patient' ? `<td>${a.patient_name || '—'}</td>` : ''}
        <td>${a.doctor_name || '—'}</td>
        ${role !== 'doctor' ? '' : ''}
        <td>${a.date || '—'}</td>
        <td>${timeStr || '—'}</td>
        <td><span class="status-badge ${statusClass}">${a.status}</span></td>
        <td class="action-cell">${actions}</td>
      </tr>`;
  }).join('');
}

async function setupPatientNotifications(user) {
  try {
    const res = await NotificationAPI.get(user.id);
    const { notifications, unread_count } = res.data;
    _updateNotifBell(unread_count);
    _renderNotifList(notifications || []);
  } catch {
    updateNotificationBell(); // localStorage fallback
  }
}

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

async function renderMedicalRecords(user) {
  const container = document.getElementById('medicalRecordsContainer');
  if (!container) return;
  try {
    const res = await RecordAPI.getForPatient(user.id);
    const records = res.data || [];
    if (records.length === 0) {
      container.innerHTML = '<p class="empty-state">No medical records found.</p>';
      return;
    }
    container.innerHTML = records.map(r => `
      <div class="record-card card">
        <div class="record-header">
          <span><i class="fas fa-user-md"></i> ${r.doctor_name}</span>
          <span class="record-date">${formatDate(r.created_at)}</span>
        </div>
        <div class="record-body">
          <p><strong>Diagnosis:</strong> ${r.diagnosis}</p>
          ${r.prescription ? `<p><strong>Prescription:</strong> ${r.prescription}</p>` : ''}
          ${r.notes ? `<p><strong>Notes:</strong> ${r.notes}</p>` : ''}
        </div>
        <button class="btn btn-outline" onclick="downloadRecordPDF(${JSON.stringify(r).replace(/"/g,'&quot;')})">
          <i class="fas fa-download"></i> Download PDF
        </button>
      </div>
    `).join('');
  } catch {
    container.innerHTML = '<p class="empty-state">Connect backend to see records.</p>';
  }
}

// ═══════════════════════════════════════════════════════════
//  DOCTOR DASHBOARD
// ═══════════════════════════════════════════════════════════

async function initDoctor(user) {
  const welcome = document.getElementById('welcome-name');
  if (welcome) welcome.textContent = user.name.split(' ')[0];

  // Get doctor profile
  let doctorId = user.doctor_id;
  if (!doctorId) {
    try {
      const res = await DoctorAPI.getAll();
      const doc = (res.data || []).find(d => d.user_id === user.id || d.name === user.name);
      if (doc) doctorId = doc.id;
    } catch {
      const docs = JSON.parse(localStorage.getItem('doctors')) || [];
      const doc = docs.find(d => d.name === user.name);
      if (doc) doctorId = doc.id;
    }
  }
  user._doctorId = doctorId;

  await renderDoctorAppointments(user);
  await renderDoctorStats(user);
  await setupPatientNotifications(user);

  // Today filter button
  const todayBtn = document.getElementById('showTodayBtn');
  if (todayBtn) {
    todayBtn.addEventListener('click', async () => {
      const dateFilter = document.getElementById('doctorDateFilter');
      if (dateFilter) { dateFilter.value = todayStr(); }
      await renderDoctorAppointments(user);
    });
  }

  const dateFilter = document.getElementById('doctorDateFilter');
  if (dateFilter) {
    dateFilter.addEventListener('change', () => renderDoctorAppointments(user));
  }

  // Medical record form
  const recordForm = document.getElementById('recordForm');
  if (recordForm) {
    recordForm.addEventListener('submit', async e => {
      e.preventDefault();
      const apptId = document.getElementById('recordApptId').value;
      const patientId = document.getElementById('recordPatientId').value;
      const diagnosis = document.getElementById('recordDiagnosis').value;
      const prescription = document.getElementById('recordPrescription').value;
      const notes = document.getElementById('recordNotes').value;

      toggleLoader(true);
      try {
        await RecordAPI.create({
          patient_id: parseInt(patientId),
          doctor_id: user._doctorId,
          appointment_id: apptId ? parseInt(apptId) : null,
          diagnosis, prescription, notes
        });
        showToast('Medical record saved!', 'success');
        recordForm.reset();
        await renderDoctorAppointments(user);
      } catch (err) {
        showToast(err.message || 'Failed to save record', 'error');
      } finally {
        toggleLoader(false);
      }
    });
  }

  // Doctor request form
  const drReqForm = document.getElementById('doctorRequestForm');
  if (drReqForm) {
    drReqForm.addEventListener('submit', async e => {
      e.preventDefault();
      const type = document.getElementById('reqType').value;
      const date = document.getElementById('reqDate').value;
      const reason = document.getElementById('reqReason').value;
      toggleLoader(true);
      try {
        await DoctorRequestAPI.create({ type, date, reason });
        showToast('Request submitted!', 'success');
        drReqForm.reset();
      } catch (err) {
        showToast(err.message || 'Failed to submit request', 'error');
      } finally {
        toggleLoader(false);
      }
    });
  }
}

async function renderDoctorAppointments(user) {
  const tbody = document.getElementById('doctorApptsData');
  if (!tbody) return;

  const dateFilter = document.getElementById('doctorDateFilter')?.value || '';

  try {
    const filters = dateFilter ? { date: dateFilter } : {};
    const res = await AppointmentAPI.getForDoctor(user._doctorId, filters);
    const appts = res.data || [];
    _renderDoctorApptRows(tbody, appts);
  } catch {
    // Demo fallback
    const allAppts = JSON.parse(localStorage.getItem('appointments')) || [];
    const myAppts = allAppts.filter(a => a.doctor === user.name)
      .map(a => ({ id: a.id, date: a.date, time: a.time, status: a.status, patient_name: a.patient, patient_id: null }));
    _renderDoctorApptRows(tbody, myAppts);
  }
}

function _renderDoctorApptRows(tbody, appts) {
  if (appts.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" class="empty-state">No appointments</td></tr>';
    return;
  }
  appts.sort((a, b) => {
    const o = { pending: 1, confirmed: 2, completed: 3, cancelled: 4 };
    return (o[a.status] || 5) - (o[b.status] || 5);
  });

  tbody.innerHTML = appts.map(a => {
    const timeStr = typeof a.time === 'string' ? a.time.substring(0, 5) : a.time;
    const canAct = a.status === 'pending' || a.status === 'confirmed';
    return `
      <tr>
        <td>#${String(a.id).substring(0, 8)}</td>
        <td>${a.patient_name || '—'}</td>
        <td>${a.date || '—'}</td>
        <td>${timeStr || '—'}</td>
        <td><span class="status-badge status-${a.status}">${a.status}</span></td>
        <td>
          ${canAct ? `
            <select class="action-select form-control" onchange="updateApptStatus('${a.id}', this.value)">
              <option value="">Action</option>
              <option value="confirmed">Confirm</option>
              <option value="completed">Complete</option>
              <option value="cancelled">Cancel</option>
            </select>` : ''}
          ${a.status === 'pending' || a.status === 'confirmed' ? `
            <button class="btn-sm btn-outline" style="margin-top:4px" onclick="openRecordForm('${a.id}','${a.patient_id || ''}','${a.patient_name || ''}')">
              <i class="fas fa-notes-medical"></i> Record
            </button>` : ''}
        </td>
      </tr>`;
  }).join('');
}

async function renderDoctorStats(user) {
  try {
    const res = await AppointmentAPI.getForDoctor(user._doctorId);
    const appts = res.data || [];
    const today = todayStr();

    _setStatText('statTotal', appts.length);
    _setStatText('statToday', appts.filter(a => a.date === today).length);
    _setStatText('statPending', appts.filter(a => a.status === 'pending').length);
    _setStatText('statCompleted', appts.filter(a => a.status === 'completed').length);

    _renderDoctorChart(appts);
  } catch {
    const appts = (JSON.parse(localStorage.getItem('appointments')) || []).filter(a => a.doctor === user.name);
    const today = todayStr();
    _setStatText('statTotal', appts.length);
    _setStatText('statToday', appts.filter(a => a.date === today).length);
    _setStatText('statPending', appts.filter(a => a.status === 'pending').length);
    _setStatText('statCompleted', appts.filter(a => a.status === 'completed').length);
    _renderDoctorChart(appts.map(a => ({ status: a.status })));
  }
}

function _renderDoctorChart(appts) {
  const ctx = document.getElementById('doctorChart');
  if (!ctx) return;
  if (window.doctorChartInstance) window.doctorChartInstance.destroy();

  window.doctorChartInstance = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: ['Pending', 'Confirmed', 'Completed', 'Cancelled'],
      datasets: [{
        data: [
          appts.filter(a => a.status === 'pending').length,
          appts.filter(a => a.status === 'confirmed').length,
          appts.filter(a => a.status === 'completed').length,
          appts.filter(a => a.status === 'cancelled').length
        ],
        backgroundColor: ['#f59e0b', '#10b981', '#2563eb', '#ef4444'],
        borderWidth: 0
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { position: 'bottom', labels: { padding: 15, font: { family: 'Poppins' } } }
      }
    }
  });
}

// ═══════════════════════════════════════════════════════════
//  RECEPTIONIST DASHBOARD
// ═══════════════════════════════════════════════════════════

async function initReceptionist(user) {
  const welcome = document.getElementById('welcome-name');
  if (welcome) welcome.textContent = user.name.split(' ')[0];

  await renderAllAppointments();
  await renderReceptionistStats();
  await loadDoctorRequestsList();
  await setupPatientNotifications(user);

  // Filter
  document.getElementById('applyFilterBtn')?.addEventListener('click', renderAllAppointments);
  document.getElementById('resetFilterBtn')?.addEventListener('click', () => {
    ['rStatusFilter', 'rDateFilter', 'rDoctorFilter'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.value = '';
    });
    renderAllAppointments();
  });
}

async function renderAllAppointments() {
  const tbody = document.getElementById('allApptsData');
  if (!tbody) return;

  const filters = {};
  const s = document.getElementById('rStatusFilter')?.value;
  const d = document.getElementById('rDateFilter')?.value;
  const doc = document.getElementById('rDoctorFilter')?.value;
  if (s) filters.status = s;
  if (d) filters.date = d;
  if (doc) filters.doctor_id = doc;

  try {
    const res = await AppointmentAPI.getAll(filters);
    _renderReceptionistRows(tbody, res.data || []);
  } catch {
    const appts = JSON.parse(localStorage.getItem('appointments')) || [];
    _renderReceptionistRows(tbody, appts.map(a => ({
      id: a.id, date: a.date, time: a.time, status: a.status,
      patient_name: a.patient, doctor_name: a.doctor
    })));
  }
}

function _renderReceptionistRows(tbody, appts) {
  appts.sort((a, b) => new Date(b.date) - new Date(a.date));
  if (appts.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" class="empty-state">No appointments</td></tr>';
    return;
  }
  tbody.innerHTML = appts.map(a => {
    const timeStr = typeof a.time === 'string' ? a.time.substring(0, 5) : a.time;
    return `
      <tr>
        <td>#${String(a.id).substring(0, 8)}</td>
        <td>${a.patient_name || '—'}</td>
        <td>${a.doctor_name || '—'}</td>
        <td>${a.date || '—'}</td>
        <td>${timeStr || '—'}</td>
        <td><span class="status-badge status-${a.status}">${a.status}</span></td>
        <td>
          <select class="action-select form-control" onchange="updateApptStatus('${a.id}', this.value)">
            <option value="">Update</option>
            <option value="pending">Pending</option>
            <option value="confirmed">Confirm</option>
            <option value="completed">Complete</option>
            <option value="cancelled">Cancel</option>
          </select>
        </td>
      </tr>`;
  }).join('');
}

async function renderReceptionistStats() {
  try {
    const [apptRes, docRes] = await Promise.allSettled([
      AppointmentAPI.getAll(),
      DoctorAPI.getAll()
    ]);
    const appts = apptRes.status === 'fulfilled' ? (apptRes.value.data || []) : [];
    const docs  = docRes.status === 'fulfilled'  ? (docRes.value.data  || []) : [];

    _setStatText('totalAppts',    appts.length);
    _setStatText('pendingAppts',  appts.filter(a => a.status === 'pending').length);
    _setStatText('totalDoctors',  docs.length);
    _setStatText('totalPatients', appts.reduce((s, a) => { s.add(a.patient_id); return s; }, new Set()).size);
  } catch {
    const appts = JSON.parse(localStorage.getItem('appointments')) || [];
    const docs  = JSON.parse(localStorage.getItem('doctors')) || [];
    const users = (JSON.parse(localStorage.getItem('users')) || []).filter(u => u.role === 'patient');
    _setStatText('totalAppts',    appts.length);
    _setStatText('pendingAppts',  appts.filter(a => a.status === 'pending').length);
    _setStatText('totalDoctors',  docs.length);
    _setStatText('totalPatients', users.length);
  }
}

async function loadDoctorRequestsList() {
  const container = document.getElementById('drRequestsList');
  if (!container) return;
  try {
    const res = await DoctorRequestAPI.getAll();
    const requests = res.data || [];
    if (requests.length === 0) {
      container.innerHTML = '<p class="empty-state">No doctor requests</p>';
      return;
    }
    container.innerHTML = requests.map(r => `
      <div class="request-card">
        <div class="request-info">
          <strong>${r.doctor_name}</strong>
          <span class="badge-type">${r.type.toUpperCase()}</span>
        </div>
        <p>Date: ${r.date} | Reason: ${r.reason || '—'}</p>
        <span class="status-badge status-${r.status}">${r.status}</span>
        ${r.status === 'pending' ? `
          <div class="request-actions">
            <button class="btn-sm btn-primary" onclick="handleDrRequest(${r.id},'approved')">Approve</button>
            <button class="btn-sm btn-danger" onclick="handleDrRequest(${r.id},'rejected')">Reject</button>
          </div>` : ''}
      </div>
    `).join('');
  } catch {
    container.innerHTML = '<p class="empty-state">Connect backend to view requests.</p>';
  }
}

// ═══════════════════════════════════════════════════════════
//  SHARED ACTIONS (window-scoped for inline onclick)
// ═══════════════════════════════════════════════════════════

window.updateApptStatus = async function (id, status) {
  if (!status) return;
  toggleLoader(true);
  try {
    await AppointmentAPI.update(id, { status });
    showToast(`Appointment marked as ${status}`, 'success');
  } catch {
    // Demo fallback
    const appts = JSON.parse(localStorage.getItem('appointments')) || [];
    const idx = appts.findIndex(a => a.id === id);
    if (idx > -1) { appts[idx].status = status; localStorage.setItem('appointments', JSON.stringify(appts)); }
    showToast(`Status updated! (Demo)`, 'success');
  } finally {
    toggleLoader(false);
    const user = getCurrentUser();
    if (user?.role === 'patient') renderPatientAppointments(user);
    else if (user?.role === 'doctor') { renderDoctorAppointments(user); renderDoctorStats(user); }
    else if (user?.role === 'receptionist') { renderAllAppointments(); renderReceptionistStats(); }
  }
};

window.cancelAppointment = async function (id) {
  if (!confirm('Cancel this appointment?')) return;
  toggleLoader(true);
  try {
    await AppointmentAPI.cancel(id);
    showToast('Appointment cancelled', 'warning');
  } catch {
    const appts = JSON.parse(localStorage.getItem('appointments')) || [];
    const idx = appts.findIndex(a => a.id === id);
    if (idx > -1) { appts[idx].status = 'cancelled'; localStorage.setItem('appointments', JSON.stringify(appts)); }
    showToast('Cancelled (Demo)', 'warning');
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
  } catch {
    showToast('jsPDF not available', 'error');
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
  } catch {
    showToast('jsPDF not available', 'error');
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
  } catch {
    showToast('Failed to update request', 'error');
  } finally {
    toggleLoader(false);
  }
};

// ═══════════════════════════════════════════════════════════
//  CALENDAR
// ═══════════════════════════════════════════════════════════

let _calendarAppts = [];

function initCalendar(user) {
  const calEl = document.getElementById('appointmentCalendar');
  if (!calEl) return;

  let currentDate = new Date();

  function renderCalendar(date) {
    const year = date.getFullYear();
    const month = date.getMonth();
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const today = new Date();

    const monthName = date.toLocaleString('default', { month: 'long', year: 'numeric' });
    const apptDates = new Set(_calendarAppts.map(a => a.date));
    const todayISO = todayStr();

    let html = `
      <div class="calendar-header">
        <button class="cal-nav" id="calPrev"><i class="fas fa-chevron-left"></i></button>
        <h4>${monthName}</h4>
        <button class="cal-nav" id="calNext"><i class="fas fa-chevron-right"></i></button>
      </div>
      <div class="calendar-grid">
        ${['Su','Mo','Tu','We','Th','Fr','Sa'].map(d => `<div class="cal-day-name">${d}</div>`).join('')}
    `;

    for (let i = 0; i < firstDay; i++) html += '<div class="cal-day empty"></div>';
    for (let d = 1; d <= daysInMonth; d++) {
      const iso = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const hasAppt = apptDates.has(iso);
      const isToday = iso === todayISO;
      html += `<div class="cal-day${isToday ? ' today' : ''}${hasAppt ? ' has-appt' : ''}" data-date="${iso}">${d}${hasAppt ? '<span class="cal-dot"></span>' : ''}</div>`;
    }
    html += '</div>';
    calEl.innerHTML = html;

    document.getElementById('calPrev')?.addEventListener('click', () => {
      currentDate = new Date(year, month - 1, 1);
      renderCalendar(currentDate);
    });
    document.getElementById('calNext')?.addEventListener('click', () => {
      currentDate = new Date(year, month + 1, 1);
      renderCalendar(currentDate);
    });

    calEl.querySelectorAll('.cal-day.has-appt').forEach(el => {
      el.addEventListener('click', () => {
        const selected = el.dataset.date;
        const matched = _calendarAppts.filter(a => a.date === selected);
        _showCalendarPopup(selected, matched, el);
      });
    });
  }

  renderCalendar(currentDate);
}

function _populateCalendarDots(appts) {
  _calendarAppts = appts;
}

function _showCalendarPopup(date, appts, target) {
  let popup = document.getElementById('calPopup');
  if (!popup) {
    popup = document.createElement('div');
    popup.id = 'calPopup';
    popup.className = 'cal-popup';
    document.body.appendChild(popup);
  }
  popup.innerHTML = `
    <div class="cal-popup-header">
      <strong>${date}</strong>
      <button onclick="document.getElementById('calPopup').style.display='none'"><i class="fas fa-times"></i></button>
    </div>
    ${appts.map(a => `
      <div class="cal-popup-item">
        <span class="status-badge status-${a.status}">${a.status}</span>
        <span>${a.doctor_name || a.doctor} — ${String(a.time).substring(0, 5)}</span>
      </div>
    `).join('')}
  `;
  const rect = target.getBoundingClientRect();
  popup.style.display = 'block';
  popup.style.top = `${rect.bottom + window.scrollY + 5}px`;
  popup.style.left = `${Math.min(rect.left, window.innerWidth - 260)}px`;
}

// ═══════════════════════════════════════════════════════════
//  NOTIFICATION PANEL TOGGLE
// ═══════════════════════════════════════════════════════════

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
          } catch {
            // localStorage fallback
            const notifs = JSON.parse(localStorage.getItem('notifications')) || [];
            notifs.forEach(n => { if (n.userId === user.email) n.read = true; });
            localStorage.setItem('notifications', JSON.stringify(notifs));
            updateNotificationBell();
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

// ═══════════════════════════════════════════════════════════
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
