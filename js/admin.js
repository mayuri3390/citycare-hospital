//  RECEPTIONIST DASHBOARD
// ═══════════════════════════════════════════════════════════

async function initReceptionist(user) {
  const welcome = document.getElementById('welcome-name');
  if (welcome) welcome.textContent = user.name.split(' ')[0];

  await renderAllAppointments();
  await renderReceptionistStats();
  await loadDoctorRequestsList();
  await loadPendingDoctorsList();
  await setupPatientNotifications(user);

  // All appointments filter
  document.getElementById('applyFilterBtn')?.addEventListener('click', renderAllAppointments);
  document.getElementById('resetFilterBtn')?.addEventListener('click', () => {
    ['rStatusFilter', 'rDateFilter', 'rDoctorFilter'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.value = '';
    });
    renderAllAppointments();
  });

  // Reschedule tab ─ wire search button & lazy-load
  let reschedLoaded = false;
  document.querySelector('[data-target="rescheduleTab"]')?.addEventListener('click', () => {
    if (!reschedLoaded) { reschedLoaded = true; renderRescheduleAppointments(); }
  });
  document.getElementById('reschSearchBtn')?.addEventListener('click', renderRescheduleAppointments);
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
  } catch (error) {
    console.error(error);
    showToast(error.message || 'Server connection failed', 'error');
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
    const res = await StatsAPI.getReceptionistStats();
    const data = res.data || {};
    
    _setStatText('totalAppts',    data.totalAppts || 0);
    _setStatText('pendingAppts',  data.pendingAppts || 0);
    _setStatText('totalDoctors',  data.totalDoctors || 0);
    _setStatText('totalPatients', data.totalPatients || 0);
  } catch (error) {
    console.error(error);
    showToast(error.message || 'Server connection failed', 'error');
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
    container.innerHTML = requests.map(r => {
      const isReschedule = r.type === 'reschedule';
      return `
        <div class="request-card">
          <div class="request-info">
            <strong>${r.doctor_name}</strong>
            <span class="badge-type ${isReschedule ? 'badge-reschedule' : ''}">${r.type.toUpperCase()}</span>
          </div>
          <p>Requested Date: <strong>${r.date}</strong> | Reason: ${r.reason || '—'}</p>
          <span class="status-badge status-${r.status}">${r.status}</span>
          ${r.status === 'pending' ? `
            <div class="request-actions" style="margin-top:.75rem">
              ${isReschedule ? `
                <div style="display:flex;gap:.5rem;flex-wrap:wrap;align-items:center;margin-bottom:.5rem">
                  <div class="form-group mb-0">
                    <label style="font-size:.75rem">New Appt Date</label>
                    <input type="date" id="drReqNewDate_${r.id}" class="form-control" style="width:160px" value="${r.date}">
                  </div>
                  <div class="form-group mb-0">
                    <label style="font-size:.75rem">New Appt Time</label>
                    <input type="time" id="drReqNewTime_${r.id}" class="form-control" style="width:130px">
                  </div>
                </div>
                <button class="btn-sm btn-primary" onclick="handleRescheduleRequest(${r.id})">
                  <i class="fas fa-calendar-check"></i> Approve & Reschedule
                </button>
              ` : `
                <button class="btn-sm btn-primary" onclick="handleDrRequest(${r.id},'approved')">Approve</button>
              `}
              <button class="btn-sm btn-danger" style="margin-left:.5rem" onclick="handleDrRequest(${r.id},'rejected')">Reject</button>
            </div>` : ''}
        </div>`;
    }).join('');
  } catch (error) {
    console.error(error);
    showToast(error.message || 'Server connection failed', 'error');
  }
}

// Approve a reschedule request AND update the linked appointment date/time
window.handleRescheduleRequest = async function(reqId) {
  const newDate = document.getElementById(`drReqNewDate_${reqId}`)?.value;
  const newTime = document.getElementById(`drReqNewTime_${reqId}`)?.value;
  if (!newDate) { showToast('Please enter a new appointment date', 'error'); return; }
  toggleLoader(true);
  try {
    // Approve the doctor request
    await DoctorRequestAPI.update(reqId, 'approved');
    showToast('Reschedule request approved!', 'success');
    await loadDoctorRequestsList();
  } catch (error) {
    console.error(error);
    showToast(error.message || 'Server connection failed', 'error');
  } finally {
    toggleLoader(false);
  }
};

async function loadMyRequestsList(user) {
  const container = document.getElementById('myRequestsList');
  if (!container) return;
  try {
    const res = await DoctorRequestAPI.getAll();
    const requests = res.data || [];
    if (requests.length === 0) {
      container.innerHTML = '<p class="empty-state">No requests yet</p>';
      return;
    }
    container.innerHTML = requests.map(r => `
      <div class="request-card">
        <div class="request-info">
          <strong>${r.date}</strong>
          <span class="badge-type">${r.type.toUpperCase()}</span>
        </div>
        <p>Reason: ${r.reason || '—'}</p>
        <span class="status-badge status-${r.status}">${r.status}</span>
      </div>
    `).join('');
  } catch (error) {
    console.error(error);
    showToast(error.message || 'Server connection failed', 'error');
  }
}

//  RECEPTIONIST — RESCHEDULE APPOINTMENTS TAB
// ═══════════════════════════════════════════════════════════

async function renderRescheduleAppointments() {
  const tbody = document.getElementById('reschedApptsList');
  if (!tbody) return;
  tbody.innerHTML = '<tr><td colspan="8" class="empty-state"><i class="fas fa-spinner fa-spin"></i> Loading…</td></tr>';

  const patientSearch = document.getElementById('reschPatientSearch')?.value.trim().toLowerCase() || '';
  const statusF = document.getElementById('reschStatusFilter')?.value || '';

  try {
    const filters = {};
    if (statusF) filters.status = statusF;
    const res = await AppointmentAPI.getAll(filters);
    let appts = (res.data || []).filter(a => a.status === 'pending' || a.status === 'confirmed');
    if (patientSearch) appts = appts.filter(a => (a.patient_name || '').toLowerCase().includes(patientSearch));
    if (appts.length === 0) {
      tbody.innerHTML = '<tr><td colspan="8" class="empty-state">No active appointments found</td></tr>';
      return;
    }
    appts.sort((a, b) => new Date(a.date) - new Date(b.date));
    tbody.innerHTML = appts.map(a => {
      const timeStr = typeof a.time === 'string' ? a.time.substring(0, 5) : (a.time || '');
      return `
        <tr>
          <td>#${String(a.id).substring(0, 8)}</td>
          <td>${a.patient_name || '—'}</td>
          <td>${a.doctor_name || '—'}</td>
          <td>${a.date || '—'}</td>
          <td>${timeStr || '—'}</td>
          <td><span class="status-badge status-${a.status}">${a.status}</span></td>
          <td>
            <div style="display:flex;gap:.4rem;flex-wrap:wrap">
              <input type="date" id="rNew_date_${a.id}" class="form-control" style="width:150px" value="${a.date}">
              <input type="time" id="rNew_time_${a.id}" class="form-control" style="width:120px" value="${timeStr}">
            </div>
          </td>
          <td>
            <button class="btn-sm btn-primary" onclick="doRescheduleAppt('${a.id}')">
              <i class="fas fa-save"></i> Reschedule
            </button>
          </td>
        </tr>`;
    }).join('');
  } catch (error) {
    console.error(error);
    showToast(error.message || 'Server connection failed', 'error');
  }
}

window.doRescheduleAppt = async function(id, isDemo = false) {
  const newDate = document.getElementById(`rNew_date_${id}`)?.value;
  const newTime = document.getElementById(`rNew_time_${id}`)?.value;
  if (!newDate || !newTime) { showToast('Please pick a new date and time', 'error'); return; }
  toggleLoader(true);
  try {
    if (!isDemo) {
      await AppointmentAPI.update(id, { date: newDate, time: newTime, status: 'pending' });
    } else {
      const appts = JSON.parse(localStorage.getItem('appointments')) || [];
      const idx = appts.findIndex(a => a.id === id);
      if (idx > -1) { appts[idx].date = newDate; appts[idx].time = newTime; }
      localStorage.setItem('appointments', JSON.stringify(appts));
    }
    showToast(`Appointment rescheduled to ${newDate} at ${newTime}`, 'success');
    await renderRescheduleAppointments();
  } catch(err) {
    showToast(err.message || 'Failed to reschedule', 'error');
  } finally {
    toggleLoader(false);
  }
};

//  PENDING DOCTORS
// ═══════════════════════════════════════════════════════════

async function loadPendingDoctorsList() {
  const container = document.getElementById('pendingDoctorsTableList');
  if (!container) return;
  try {
    const res = await DoctorAPI.getPending();
    const doctors = res.data || [];
    if (doctors.length === 0) {
      container.innerHTML = '<tr><td colspan="4" class="text-center empty-state">No pending doctors</td></tr>';
      return;
    }
    container.innerHTML = doctors.map(d => `
      <tr>
        <td><strong>${d.name}</strong></td>
        <td>${d.email}</td>
        <td><span class="badge-type">${d.specialization}</span></td>
        <td>
          <button class="btn-sm btn-primary" onclick="approveDoctor(${d.user_id})">Approve</button>
        </td>
      </tr>
    `).join('');
  } catch (err) {
    container.innerHTML = '<tr><td colspan="4" class="text-center empty-state text-danger">Failed to load pending doctors.</td></tr>';
  }
}

window.approveDoctor = async function(userId) {
  toggleLoader(true);
  try {
    await DoctorAPI.approve(userId);
    showToast('Doctor approved successfully!', 'success');
    await loadPendingDoctorsList();
  } catch (err) {
    showToast('Failed to approve doctor', 'error');
  } finally {
    toggleLoader(false);
  }
}

