// ═══════════════════════════════════════════════════════════
//  DOCTOR DASHBOARD
// ═══════════════════════════════════════════════════════════

async function initDoctor(user) {
  const welcome = document.getElementById('welcome-name');
  if (welcome) welcome.textContent = user.name.split(' ')[0];

  // Resolve doctorId from doctor list
  let doctorId = user.doctor_id;
  if (!doctorId) {
    try {
      const res = await DoctorAPI.getAll();
      const doc = (res.data || []).find(d => d.user_id === user.id || d.name === user.name);
      if (doc) doctorId = doc.id;
    } catch (err) {
      console.error(err);
    }
  }
  user._doctorId = doctorId;

  await renderDoctorAppointments(user);
  await renderDoctorStats(user);
  await setupPatientNotifications(user);
  await loadMyRequestsList(user);
  _initAddRecordPatientSearch(user);

  // Today filter button
  const todayBtn = document.getElementById('showTodayBtn');
  if (todayBtn) {
    todayBtn.addEventListener('click', async () => {
      const df = document.getElementById('doctorDateFilter');
      if (df) df.value = todayStr();
      await renderDoctorAppointments(user);
    });
  }

  // Date filter change
  const dateFilter = document.getElementById('doctorDateFilter');
  if (dateFilter) {
    dateFilter.addEventListener('change', () => renderDoctorAppointments(user));
  }

  // Inline record form (from Appointments tab)
  const recordForm = document.getElementById('recordForm');
  if (recordForm) {
    recordForm.addEventListener('submit', async e => {
      e.preventDefault();
      const apptId   = document.getElementById('recordApptId').value;
      const patientId = document.getElementById('recordPatientId').value;
      const diagnosis = document.getElementById('recordDiagnosis').value.trim();
      const prescription = document.getElementById('recordPrescription').value.trim();
      const notes = document.getElementById('recordNotes').value.trim();

      if (!diagnosis) { showToast('Diagnosis is required', 'error'); return; }
      if (!patientId) { showToast('Patient ID missing. Re-open the record form.', 'error'); return; }

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
        document.getElementById('recordFormContainer').style.display = 'none';
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
      const type   = document.getElementById('reqType').value;
      const date   = document.getElementById('reqDate').value;
      const reason = document.getElementById('reqReason').value;
      toggleLoader(true);
      try {
        await DoctorRequestAPI.create({ type, date, reason });
        showToast('Request submitted!', 'success');
        drReqForm.reset();
        await loadMyRequestsList(user);
      } catch (err) {
        showToast(err.message || 'Failed to submit request', 'error');
      } finally {
        toggleLoader(false);
      }
    });
  }

  // Patient History tab — lazy-load + wire search with debounce
  let historyTabReady = false;
  document.querySelector('[data-target="patientHistory"]')?.addEventListener('click', () => {
    if (!historyTabReady) {
      historyTabReady = true;
      _initPatientHistorySearch(user);
    }
  });
}

// ─── Appointments rendering ──────────────────────────────────────────────────

async function renderDoctorAppointments(user) {
  const tbody = document.getElementById('doctorApptsData');
  if (!tbody) return;
  const dateFilter = document.getElementById('doctorDateFilter')?.value || '';
  try {
    const filters = dateFilter ? { date: dateFilter } : {};
    const res = await AppointmentAPI.getForDoctor(user._doctorId, filters);
    _renderDoctorApptRows(tbody, res.data || []);
  } catch (err) {
    console.error(err);
    showToast(err.message || 'Failed to load appointments', 'error');
  }
}

function _renderDoctorApptRows(tbody, appts) {
  if (appts.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" class="empty-state">No appointments found</td></tr>';
    return;
  }
  // Sort: pending first, then confirmed, completed, cancelled
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
        <td style="display:flex;gap:.4rem;flex-wrap:wrap;align-items:center">
          ${canAct ? `
            <select class="action-select form-control" style="width:auto"
                    onchange="updateApptStatus('${a.id}', this.value)">
              <option value="">Action</option>
              <option value="confirmed">Confirm</option>
              <option value="completed">Complete</option>
              <option value="cancelled">Cancel</option>
            </select>
            <button class="btn-sm btn-outline" style="margin-top:2px"
                    onclick="openRecordForm('${a.id}','${a.patient_id || ''}','${(a.patient_name || '').replace(/'/g,"\\'")}')">
              <i class="fas fa-notes-medical"></i> Record
            </button>` : '—'}
        </td>
      </tr>`;
  }).join('');
}

// ─── Stats & Chart ───────────────────────────────────────────────────────────

async function renderDoctorStats(user) {
  try {
    const res = await AppointmentAPI.getForDoctor(user._doctorId);
    const appts = res.data || [];
    const today = todayStr();
    _setStatText('statTotal',     appts.length);
    _setStatText('statToday',     appts.filter(a => a.date === today).length);
    _setStatText('statPending',   appts.filter(a => a.status === 'pending').length);
    _setStatText('statCompleted', appts.filter(a => a.status === 'completed').length);
    _renderDoctorChart(appts);
  } catch (err) {
    console.error(err);
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

// ─── Add Record tab — patient search dropdown ─────────────────────────────────

function _initAddRecordPatientSearch(user) {
  const searchInput = document.getElementById('rec2PatientSearch');
  const dropdown    = document.getElementById('rec2PatientDropdown');
  const hiddenId    = document.getElementById('rec2PatientId');
  const infoBox     = document.getElementById('rec2PatientInfo');
  const nameDisplay = document.getElementById('rec2PatientNameDisplay');
  const emailDisplay= document.getElementById('rec2PatientEmailDisplay');
  if (!searchInput || !dropdown) return;

  let lastResults = [];

  const doSearch = debounce(async () => {
    const q = searchInput.value.trim();
    // Only search if 2+ chars
    if (q.length < 2) { dropdown.style.display = 'none'; return; }
    try {
      const res = await PatientAPI.search(q);
      lastResults = res.data || [];
      if (lastResults.length === 0) {
        dropdown.innerHTML = '<div style="padding:.75rem 1rem;color:var(--text-muted)">No matching patients found</div>';
      } else {
        dropdown.innerHTML = lastResults.map(p => `
          <div class="patient-option" data-id="${p.id}" data-name="${p.name}" data-email="${p.email || ''}"
               style="padding:.65rem 1rem;cursor:pointer;border-bottom:1px solid var(--border);
                      transition:background .2s"
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
          hiddenId.value      = opt.dataset.id;
          searchInput.value   = opt.dataset.name;
          nameDisplay.textContent  = opt.dataset.name;
          emailDisplay.textContent = opt.dataset.email;
          infoBox.style.display   = 'block';
          dropdown.style.display  = 'none';
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

  // Submit handler for Add Record form
  const form = document.getElementById('recordForm2');
  if (form) {
    form.addEventListener('submit', async e => {
      e.preventDefault();
      const patientId  = hiddenId.value;
      const diagnosis  = document.getElementById('rec2Diagnosis').value.trim();
      const prescription = document.getElementById('rec2Prescription').value.trim();
      const notes      = document.getElementById('rec2Notes').value.trim();

      if (!patientId) { showToast('Please select a patient from the dropdown', 'error'); return; }
      if (!diagnosis)  { showToast('Diagnosis is required', 'error'); return; }

      toggleLoader(true);
      try {
        await RecordAPI.create({
          patient_id: parseInt(patientId),
          doctor_id:  user._doctorId,
          diagnosis, prescription, notes
        });
        showToast('Record saved successfully!', 'success');
        form.reset();
        hiddenId.value = '';
        infoBox.style.display = 'none';
      } catch (err) {
        showToast(err.message || 'Failed to save record', 'error');
      } finally {
        toggleLoader(false);
      }
    });
  }
}

// ─── Patient History tab ──────────────────────────────────────────────────────

function _initPatientHistorySearch(user) {
  const searchInput = document.getElementById('patientHistorySearch');
  if (!searchInput) return;

  // Show all visited patients on first load (empty search)
  _searchAndRenderPatients('', user);

  searchInput.addEventListener('input', debounce(e => {
    _searchAndRenderPatients(e.target.value.trim(), user);
  }, 300));
}

async function _searchAndRenderPatients(query, user) {
  const listPanel = document.getElementById('patientListPanel');
  const listContainer = document.getElementById('patientListContainer');
  const defaultMsg = document.getElementById('patientHistoryContainer');

  if (!listPanel || !listContainer) return;

  listContainer.innerHTML = '<p class="empty-state"><i class="fas fa-spinner fa-spin"></i> Searching…</p>';
  listPanel.style.display = 'block';
  if (defaultMsg) defaultMsg.style.display = 'none';

  try {
    const res = await PatientAPI.search(query);
    const patients = res.data || [];

    if (patients.length === 0) {
      listContainer.innerHTML = `<p class="empty-state"><i class="fas fa-users"></i> ${query ? 'No matching patients found.' : 'No patients found.'}</p>`;
      return;
    }

    listContainer.innerHTML = patients.map(p => `
      <div class="patient-item" style="display:flex;justify-content:space-between;align-items:center;
           padding:.75rem 1rem;border-bottom:1px solid var(--border);cursor:pointer;
           transition:background .2s"
           onmouseover="this.style.background='var(--secondary)'"
           onmouseout="this.style.background=''"
           onclick="loadPatientDetail(${p.id}, '${p.name.replace(/'/g,"\\'")}', '${(p.email||'').replace(/'/g,"\\'")}')">
        <div>
          <i class="fas fa-user-circle" style="color:var(--primary);margin-right:.5rem"></i>
          <strong>${p.name}</strong>
          <small style="color:var(--text-muted);margin-left:.5rem">${p.email || ''}</small>
        </div>
        <span class="btn-sm btn-outline" style="pointer-events:none">
          View History <i class="fas fa-chevron-right"></i>
        </span>
      </div>`).join('');
  } catch (err) {
    console.error(err);
    listContainer.innerHTML = `<p class="empty-state" style="color:var(--danger)">
      <i class="fas fa-exclamation-circle"></i> ${err.message || 'Failed to load patients'}
    </p>`;
  }
}

window.loadPatientDetail = async function(patientId, name, email) {
  // Hide list panel, show detail panel
  const listPanel   = document.getElementById('patientListPanel');
  const detailPanel = document.getElementById('patientDetailPanel');
  if (listPanel)   listPanel.style.display   = 'none';
  if (detailPanel) detailPanel.style.display = 'block';

  document.getElementById('histPatientName').textContent  = name;
  document.getElementById('histPatientEmail').textContent = email;

  const apptsTbody     = document.getElementById('histApptsTbody');
  const recordsContainer = document.getElementById('histRecordsContainer');
  if (apptsTbody)      apptsTbody.innerHTML = '<tr><td colspan="5" class="empty-state"><i class="fas fa-spinner fa-spin"></i> Loading…</td></tr>';
  if (recordsContainer) recordsContainer.innerHTML = '<p class="empty-state"><i class="fas fa-spinner fa-spin"></i> Loading…</p>';

  try {
    const res  = await PatientAPI.getHistory(patientId);
    const data = res.data || {};
    const appts   = data.appointments || [];
    const records = data.records || [];

    // Render completed appointments
    if (apptsTbody) {
      if (appts.length === 0) {
        apptsTbody.innerHTML = '<tr><td colspan="5" class="empty-state">No completed appointments</td></tr>';
      } else {
        apptsTbody.innerHTML = appts.map(a => `
          <tr>
            <td>#${String(a.id).substring(0, 8)}</td>
            <td>${a.date || '—'}</td>
            <td>${String(a.time || '—').substring(0, 5)}</td>
            <td>${a.doctor_name || '—'}</td>
            <td>${a.specialization || '—'}</td>
          </tr>`).join('');
      }
    }

    // Render medical records as cards (latest first — already sorted by backend)
    if (recordsContainer) {
      if (records.length === 0) {
        recordsContainer.innerHTML = '<p class="empty-state"><i class="fas fa-file-medical"></i> No medical records found.</p>';
      } else {
        recordsContainer.innerHTML = records.map(r => `
          <div class="record-card card" style="margin-bottom:1rem">
            <div class="record-header" style="display:flex;justify-content:space-between;
                 padding:.75rem 1rem;border-bottom:1px solid var(--border)">
              <span><i class="fas fa-user-md" style="color:var(--primary)"></i> <strong>${r.doctor_name}</strong>
                <small style="color:var(--text-muted);margin-left:.4rem">${r.specialization || ''}</small>
              </span>
              <span class="record-date" style="color:var(--text-muted);font-size:.85rem">${formatDate(r.created_at)}</span>
            </div>
            <div class="record-body" style="padding:1rem">
              <p><strong>Diagnosis:</strong> ${r.diagnosis}</p>
              ${r.prescription ? `<p><strong>Prescription:</strong> ${r.prescription}</p>` : ''}
              ${r.notes ? `<p><strong>Notes:</strong> ${r.notes}</p>` : ''}
            </div>
          </div>`).join('');
      }
    }
  } catch (err) {
    console.error(err);
    showToast(err.message || 'Failed to load patient history', 'error');
    if (apptsTbody)       apptsTbody.innerHTML = `<tr><td colspan="5" class="empty-state" style="color:var(--danger)">${err.message}</td></tr>`;
    if (recordsContainer) recordsContainer.innerHTML = `<p class="empty-state" style="color:var(--danger)">${err.message}</p>`;
  }
};

window.closePatientDetail = function() {
  const listPanel   = document.getElementById('patientListPanel');
  const detailPanel = document.getElementById('patientDetailPanel');
  if (detailPanel) detailPanel.style.display = 'none';
  if (listPanel)   listPanel.style.display   = 'block';
};

// ─── My Requests List ────────────────────────────────────────────────────────

window.loadMyRequestsList = async function(user) {
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
  } catch (err) {
    console.error(err);
    showToast(err.message || 'Failed to load requests', 'error');
  }
};
