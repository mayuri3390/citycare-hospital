// ═══════════════════════════════════════════════════════════
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
    ['rStatusFilter', 'rDateFilter'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.value = '';
    });
    renderAllAppointments();
  });

  // Reschedule tab — lazy-load
  let reschedLoaded = false;
  document.querySelector('[data-target="rescheduleTab"]')?.addEventListener('click', () => {
    if (!reschedLoaded) { reschedLoaded = true; renderRescheduleAppointments(); }
  });
  document.getElementById('reschSearchBtn')?.addEventListener('click', renderRescheduleAppointments);

  // Billing tab — lazy-load
  let billingLoaded = false;
  document.querySelector('[data-target="billingTab"]')?.addEventListener('click', () => {
    if (!billingLoaded) { billingLoaded = true; _initBillingTab(); }
  });

  // Manual Appointment and Doctor Availability tabs
  _initManualApptTab();
  _initDoctorAvailTab();
}

// ─── Manual Appointments & Availability ───────────────────────────────────────

async function _initManualApptTab() {
  _populateDoctorDropdown('manualApptDoctorId');

  // Wire patient search with debounce
  _wirePatientSearchForManualAppt();

  const form = document.getElementById('manualApptForm');
  if (!form) return;

  // Toggle Existing vs New Patient
  const radios = form.querySelectorAll('input[name="patientType"]');
  const existingSection = document.getElementById('existingPatientSection');
  const newSection = document.getElementById('newPatientSection');

  radios.forEach(r => {
    r.addEventListener('change', () => {
      if (r.value === 'new') {
        existingSection.style.display = 'none';
        newSection.style.display = 'block';
      } else {
        existingSection.style.display = 'block';
        newSection.style.display = 'none';
      }
    });
  });

  if (form && !form.dataset.initialized) {
    form.dataset.initialized = 'true';
    form.addEventListener('submit', async e => {
      e.preventDefault();
      
      const patientType = form.querySelector('input[name="patientType"]:checked').value;
      const payload = {
        doctor_id: parseInt(document.getElementById('manualApptDoctorId').value),
        date: document.getElementById('manualApptDate').value,
        time: document.getElementById('manualApptTime').value
      };

      if (patientType === 'existing') {
        payload.patient_id = parseInt(document.getElementById('manualApptPatientId').value);
        if (!payload.patient_id || isNaN(payload.patient_id)) {
          showToast('Please select a valid patient from the search dropdown.', 'error');
          return;
        }
      } else {
        payload.patient_name = document.getElementById('newPatientName').value.trim();
        payload.patient_email = document.getElementById('newPatientEmail').value.trim();
        payload.patient_phone = document.getElementById('newPatientPhone').value.trim();
        if (!payload.patient_name || !payload.patient_email) {
          showToast('Please enter name and email for the new patient.', 'error');
          return;
        }
      }

      if (!payload.doctor_id || isNaN(payload.doctor_id)) {
        showToast('Please select a doctor.', 'error');
        return;
      }

      toggleLoader(true);
      try {
        await AppointmentAPI.bookManual(payload);
        showToast('Manual appointment booked!', 'success');
        
        // Reset form and UI
        form.reset();
        document.getElementById('manualApptPatientId').value = '';
        document.getElementById('manualApptPatientSearch').value = '';
        document.getElementById('manualApptPatientInfo').style.display = 'none';
        existingSection.style.display = 'block';
        newSection.style.display = 'none';
        
        await renderAllAppointments();
      } catch (err) {
        showToast(err.message || 'Failed to book appointment', 'error');
      } finally {
        toggleLoader(false);
      }
    });
  }
}

function _wirePatientSearchForManualAppt() {
  const searchInput = document.getElementById('manualApptPatientSearch');
  const dropdown    = document.getElementById('manualApptPatientDropdown');
  const hiddenId    = document.getElementById('manualApptPatientId');
  const infoBox     = document.getElementById('manualApptPatientInfo');
  const nameDisplay = document.getElementById('manualApptPatientNameDisplay');
  const emailDisplay= document.getElementById('manualApptPatientEmailDisplay');
  if (!searchInput || !dropdown) return;

  const doSearch = debounce(async () => {
    const q = searchInput.value.trim();
    if (q.length < 2) { dropdown.style.display = 'none'; return; }
    try {
      const res = await PatientAPI.search(q);
      const patients = res.data || [];
      if (patients.length === 0) {
        dropdown.innerHTML = '<div style="padding:.75rem 1rem;color:var(--text-muted)">No matching patients found</div>';
      } else {
        dropdown.innerHTML = patients.map(p => `
          <div class="patient-option"
               data-id="${p.id}" data-name="${p.name}" data-email="${p.email || ''}"
               style="padding:.65rem 1rem;cursor:pointer;border-bottom:1px solid var(--border);transition:background .2s"
               onmouseover="this.style.background='var(--secondary)'"
               onmouseout="this.style.background=''">
            <i class="fas fa-user-circle" style="color:var(--primary);margin-right:.4rem"></i>
            <strong>${p.name}</strong>
            <small style="color:var(--text-muted);margin-left:.5rem">${p.email || ''}</small>
          </div>`).join('');
      }
      dropdown.style.display = 'block';

      dropdown.querySelectorAll('.patient-option').forEach(opt => {
        opt.addEventListener('click', () => {
          hiddenId.value             = opt.dataset.id;
          searchInput.value          = opt.dataset.name;
          nameDisplay.textContent    = opt.dataset.name;
          emailDisplay.textContent   = opt.dataset.email;
          infoBox.style.display      = 'flex';
          dropdown.style.display     = 'none';
        });
      });
    } catch (err) {
      console.error(err);
    }
  }, 300);

  searchInput.addEventListener('input', doSearch);
  document.addEventListener('click', e => {
    if (!searchInput.contains(e.target) && !dropdown.contains(e.target)) {
      dropdown.style.display = 'none';
    }
  });
}

async function _initDoctorAvailTab() {
  _populateDoctorDropdown('availDoctorId');

  const form = document.getElementById('doctorAvailForm');
  if (form && !form.dataset.initialized) {
    form.dataset.initialized = 'true';
    form.addEventListener('submit', async e => {
      e.preventDefault();
      const doctorId = document.getElementById('availDoctorId').value;
      const payload = {
        date: document.getElementById('availDate').value,
        status: document.getElementById('availStatus').value
      };
      toggleLoader(true);
      try {
        await DoctorAPI.updateAvailability(doctorId, payload);
        showToast('Doctor availability updated!', 'success');
        form.reset();
      } catch (err) {
        showToast(err.message || 'Failed to update availability', 'error');
      } finally {
        toggleLoader(false);
      }
    });
  }
}

// ─── All Appointments ─────────────────────────────────────────────────────────

async function renderAllAppointments() {
  const tbody = document.getElementById('allApptsData');
  if (!tbody) return;

  const filters = {};
  const s = document.getElementById('rStatusFilter')?.value;
  const d = document.getElementById('rDateFilter')?.value;
  if (s) filters.status = s;
  if (d) filters.date = d;

  try {
    const res = await AppointmentAPI.getAll(filters);
    _renderReceptionistRows(tbody, res.data || []);
  } catch (err) {
    console.error(err);
    showToast(err.message || 'Failed to load appointments', 'error');
  }
}

function _renderReceptionistRows(tbody, appts) {
  appts.sort((a, b) => new Date(b.date) - new Date(a.date));
  if (appts.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" class="empty-state">No appointments found</td></tr>';
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

// ─── Stats ────────────────────────────────────────────────────────────────────

async function renderReceptionistStats() {
  try {
    const res  = await StatsAPI.getReceptionistStats();
    const data = res.data || {};
    _setStatText('totalAppts',    data.totalAppts    || 0);
    _setStatText('pendingAppts',  data.pendingAppts  || 0);
    _setStatText('totalDoctors',  data.totalDoctors  || 0);
    _setStatText('totalPatients', data.totalPatients || 0);
  } catch (err) {
    console.error(err);
  }
}

// ─── Doctor Requests ──────────────────────────────────────────────────────────

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
                  <i class="fas fa-calendar-check"></i> Approve &amp; Reschedule
                </button>
              ` : `
                <button class="btn-sm btn-primary" onclick="handleDrRequest(${r.id},'approved')">Approve</button>
              `}
              <button class="btn-sm btn-danger" style="margin-left:.5rem" onclick="handleDrRequest(${r.id},'rejected')">Reject</button>
            </div>` : ''}
        </div>`;
    }).join('');
  } catch (err) {
    console.error(err);
    showToast(err.message || 'Failed to load requests', 'error');
  }
}

window.handleRescheduleRequest = async function(reqId) {
  const newDate = document.getElementById(`drReqNewDate_${reqId}`)?.value;
  if (!newDate) { showToast('Please enter a new appointment date', 'error'); return; }
  toggleLoader(true);
  try {
    await DoctorRequestAPI.update(reqId, 'approved');
    showToast('Reschedule request approved!', 'success');
    await loadDoctorRequestsList();
  } catch (err) {
    showToast(err.message || 'Failed to update request', 'error');
  } finally {
    toggleLoader(false);
  }
};



async function renderRescheduleAppointments() {
  const tbody = document.getElementById('reschedApptsList');
  if (!tbody) return;
  tbody.innerHTML = '<tr><td colspan="8" class="empty-state"><i class="fas fa-spinner fa-spin"></i> Loading…</td></tr>';

  const patientSearch = (document.getElementById('reschPatientSearch')?.value || '').trim().toLowerCase();
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
              <input type="date" id="rNew_date_${a.id}" class="form-control"
                     style="width:150px" value="${a.date}">
              <input type="time" id="rNew_time_${a.id}" class="form-control"
                     style="width:120px" value="${timeStr}">
            </div>
          </td>
          <td>
            <button class="btn-sm btn-primary" onclick="doRescheduleAppt('${a.id}')">
              <i class="fas fa-save"></i> Save
            </button>
          </td>
        </tr>`;
    }).join('');
  } catch (err) {
    console.error(err);
    showToast(err.message || 'Failed to load appointments', 'error');
  }
}

window.doRescheduleAppt = async function(id) {
  const newDate = document.getElementById(`rNew_date_${id}`)?.value;
  const newTime = document.getElementById(`rNew_time_${id}`)?.value;
  if (!newDate || !newTime) { showToast('Please pick a new date and time', 'error'); return; }
  toggleLoader(true);
  try {
    await AppointmentAPI.update(id, { date: newDate, time: newTime });
    showToast(`Appointment rescheduled to ${newDate} at ${newTime}`, 'success');
    await renderRescheduleAppointments();
  } catch (err) {
    showToast(err.message || 'Failed to reschedule', 'error');
  } finally {
    toggleLoader(false);
  }
};

// ─── Pending Doctors ──────────────────────────────────────────────────────────

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
    container.innerHTML = '<tr><td colspan="4" class="text-center empty-state">Failed to load pending doctors.</td></tr>';
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
};

// ═══════════════════════════════════════════════════════════
//  BILLING TAB
// ═══════════════════════════════════════════════════════════

async function _initBillingTab() {
  // Wire patient search with debounce
  _wirePatientSearchForBilling();

  // Auto-calculate total
  ['billConsultFee', 'billExtraCharges'].forEach(id => {
    document.getElementById(id)?.addEventListener('input', _calcBillTotal);
  });

  // Submit bill
  const form = document.getElementById('createBillForm');
  if (form) {
    form.addEventListener('submit', _handleCreateBill);
  }

  // Refresh bills btn
  document.getElementById('refreshBillsBtn')?.addEventListener('click', _loadBillsList);

  // Initial load of bills list
  await _loadBillsList();
}

function _calcBillTotal() {
  const consult = parseFloat(document.getElementById('billConsultFee')?.value || '0') || 0;
  const extra   = parseFloat(document.getElementById('billExtraCharges')?.value || '0') || 0;
  const total   = consult + extra;
  const el = document.getElementById('billTotal');
  if (el) el.value = total > 0 ? `₹ ${total.toFixed(2)}` : '';
}

function _wirePatientSearchForBilling() {
  const searchInput = document.getElementById('billPatientSearch');
  const dropdown    = document.getElementById('billPatientDropdown');
  const hiddenId    = document.getElementById('billPatientId');
  const infoBox     = document.getElementById('billPatientInfo');
  const nameDisplay = document.getElementById('billPatientNameDisplay');
  const emailDisplay= document.getElementById('billPatientEmailDisplay');
  if (!searchInput || !dropdown) return;

  const doSearch = debounce(async () => {
    const q = searchInput.value.trim();
    if (q.length < 2) { dropdown.style.display = 'none'; return; }
    try {
      const res = await PatientAPI.search(q);
      const patients = res.data || [];
      if (patients.length === 0) {
        dropdown.innerHTML = '<div style="padding:.75rem 1rem;color:var(--text-muted)">No matching patients found</div>';
      } else {
        dropdown.innerHTML = patients.map(p => `
          <div class="patient-option"
               data-id="${p.id}" data-name="${p.name}" data-email="${p.email || ''}"
               style="padding:.65rem 1rem;cursor:pointer;border-bottom:1px solid var(--border);transition:background .2s"
               onmouseover="this.style.background='var(--secondary)'"
               onmouseout="this.style.background=''">
            <i class="fas fa-user-circle" style="color:var(--primary);margin-right:.4rem"></i>
            <strong>${p.name}</strong>
            <small style="color:var(--text-muted);margin-left:.5rem">${p.email || ''}</small>
          </div>`).join('');
      }
      dropdown.style.display = 'block';

      dropdown.querySelectorAll('.patient-option').forEach(opt => {
        opt.addEventListener('click', () => {
          hiddenId.value             = opt.dataset.id;
          searchInput.value          = opt.dataset.name;
          nameDisplay.textContent    = opt.dataset.name;
          emailDisplay.textContent   = opt.dataset.email;
          infoBox.style.display      = 'flex';
          dropdown.style.display     = 'none';

          // Fetch completed appointments for this patient
          _loadCompletedAppointments(opt.dataset.id);
        });
      });
    } catch (err) {
      console.error(err);
    }
  }, 300);

  searchInput.addEventListener('input', doSearch);
  document.addEventListener('click', e => {
    if (!searchInput.contains(e.target) && !dropdown.contains(e.target)) {
      dropdown.style.display = 'none';
    }
  });
}

async function _loadCompletedAppointments(patientId) {
  const sel = document.getElementById('billAppointmentId');
  if (!sel) return;
  sel.innerHTML = '<option value="">Loading...</option>';
  try {
    const res = await AppointmentAPI.getForUser(patientId);
    const completedAppts = (res.data || []).filter(a => a.status === 'completed');
    if (completedAppts.length === 0) {
      sel.innerHTML = '<option value="">No completed appointments</option>';
    } else {
      sel.innerHTML = '<option value="">Select Appointment</option>' +
        completedAppts.map(a => `<option value="${a.id}" data-doctorid="${a.doctor_id}">#${a.id} - ${a.date} with ${a.doctor_name}</option>`).join('');
    }

    sel.addEventListener('change', (e) => {
      const option = e.target.options[e.target.selectedIndex];
      if (option && option.dataset.doctorid) {
        document.getElementById('billDoctorId').value = option.dataset.doctorid;
      } else {
        document.getElementById('billDoctorId').value = '';
      }
    });

  } catch (err) {
    sel.innerHTML = '<option value="">Failed to load</option>';
  }
}

async function _handleCreateBill(e) {
  e.preventDefault();
  const patientId   = document.getElementById('billPatientId')?.value;
  const appointmentId = document.getElementById('billAppointmentId')?.value;
  const doctorId    = document.getElementById('billDoctorId')?.value;
  const consultFee  = parseFloat(document.getElementById('billConsultFee')?.value || '0') || 0;
  const extraCharges= parseFloat(document.getElementById('billExtraCharges')?.value || '0') || 0;
  const details     = document.getElementById('billDetails')?.value.trim() || '';
  const totalAmount = consultFee + extraCharges;

  if (!patientId) { showToast('Please select a patient', 'error'); return; }
  if (!appointmentId || !doctorId) { showToast('Please select a completed appointment', 'error'); return; }
  if (totalAmount <= 0) { showToast('Amount must be greater than zero', 'error'); return; }

  const billDetails = [
    details,
    `Consultation Fee: ₹${consultFee.toFixed(2)}`,
    extraCharges > 0 ? `Extra Charges: ₹${extraCharges.toFixed(2)}` : ''
  ].filter(Boolean).join(' | ');

  toggleLoader(true);
  try {
    await BillingAPI.createBill({
      patient_id: parseInt(patientId),
      doctor_id:  parseInt(doctorId),
      appointment_id: parseInt(appointmentId),
      amount:     totalAmount,
      details:    billDetails
    });
    showToast(`Bill of ₹${totalAmount.toFixed(2)} generated successfully!`, 'success');
    // Reset form
    document.getElementById('createBillForm').reset();
    document.getElementById('billPatientId').value = '';
    document.getElementById('billPatientInfo').style.display = 'none';
    document.getElementById('billTotal').value = '';
    await _loadBillsList();
  } catch (err) {
    showToast(err.message || 'Failed to create bill', 'error');
  } finally {
    toggleLoader(false);
  }
}

async function _loadBillsList() {
  const container = document.getElementById('billsListContainer');
  if (!container) return;
  container.innerHTML = '<p class="empty-state"><i class="fas fa-spinner fa-spin"></i> Loading…</p>';
  try {
    const res  = await BillingAPI.getBills();
    const bills = res.data || [];
    if (bills.length === 0) {
      container.innerHTML = '<p class="empty-state"><i class="fas fa-file-invoice"></i> No bills generated yet.</p>';
      return;
    }
    container.innerHTML = `
      <div class="table-responsive" style="margin:0">
        <table>
          <thead>
            <tr>
              <th>#ID</th><th>Patient</th><th>Doctor</th>
              <th>Amount</th><th>Date</th><th>Action</th>
            </tr>
          </thead>
          <tbody>
            ${bills.map(b => `
              <tr>
                <td>#${String(b.id).substring(0,8)}</td>
                <td>${b.patient_name || '—'}</td>
                <td>${b.doctor_name  || '—'}</td>
                <td><strong style="color:var(--primary)">₹${Number(b.amount).toFixed(2)}</strong></td>
                <td>${formatDate(b.created_at)}</td>
                <td>
                  <button class="btn-sm btn-outline" onclick="printBill(${JSON.stringify(b).replace(/"/g,'&quot;')})">
                    <i class="fas fa-print"></i> Print
                  </button>
                </td>
              </tr>`).join('')}
          </tbody>
        </table>
      </div>`;
  } catch (err) {
    console.error(err);
    container.innerHTML = `<p class="empty-state" style="color:var(--danger)"><i class="fas fa-exclamation-circle"></i> ${err.message || 'Failed to load bills'}</p>`;
  }
}

window.printBill = function(bill) {
  const win = window.open('', '_blank', 'width=700,height=600');
  if (!win) { showToast('Popup blocked — allow popups to print', 'warning'); return; }
  win.document.write(`
    <!DOCTYPE html><html><head>
    <title>Bill #${bill.id} — CityCare Hospital</title>
    <style>
      body{font-family:'Segoe UI',sans-serif;padding:2rem;color:#1e293b}
      h1{color:#2563eb;margin-bottom:.25rem}
      .divider{border:none;border-top:2px solid #2563eb;margin:1rem 0}
      .row{display:flex;justify-content:space-between;margin:.4rem 0}
      .label{color:#64748b;font-size:.9rem}
      .amount{font-size:1.4rem;font-weight:700;color:#2563eb}
      .footer{margin-top:2rem;font-size:.8rem;color:#94a3b8;border-top:1px solid #e2e8f0;padding-top:1rem}
    </style></head><body>
    <h1>CityCare Hospital</h1>
    <p style="color:#64748b">Medical Bill / Invoice</p>
    <hr class="divider">
    <div class="row"><span class="label">Bill ID</span><span>#${bill.id}</span></div>
    <div class="row"><span class="label">Patient</span><span>${bill.patient_name}</span></div>
    <div class="row"><span class="label">Doctor</span><span>${bill.doctor_name}</span></div>
    <div class="row"><span class="label">Specialization</span><span>${bill.specialization || '—'}</span></div>
    <div class="row"><span class="label">Date</span><span>${bill.created_at ? bill.created_at.split('T')[0] : '—'}</span></div>
    ${bill.details ? `<div class="row"><span class="label">Details</span><span>${bill.details}</span></div>` : ''}
    <hr class="divider">
    <div class="row"><span class="label">Total Amount</span><span class="amount">₹${Number(bill.amount).toFixed(2)}</span></div>
    <div class="footer">Generated by CityCare Hospital Management System &bull; Thank you for your trust.</div>
    <script>window.print();<\/script>
    </body></html>`);
  win.document.close();
};

let _globalDoctorsList = null;

async function _populateDoctorDropdown(elementId) {
  if (!_globalDoctorsList) {
    try {
      const res = await DoctorAPI.getAll();
      let doctors = res.data || [];
      const seen = new Set();
      _globalDoctorsList = doctors.filter(d => {
        if (seen.has(d.name)) return false;
        seen.add(d.name);
        return true;
      });
    } catch (err) {
      console.error('Failed to load doctors:', err);
      _globalDoctorsList = [];
    }
  }

  const sel = document.getElementById(elementId);
  if (sel && sel.options.length <= 1) {
    sel.innerHTML = '<option value="">Select Doctor</option>' + 
      _globalDoctorsList.map(d => `<option value="${d.id}">${d.name} (${d.specialization || 'General'})</option>`).join('');
  }
}

