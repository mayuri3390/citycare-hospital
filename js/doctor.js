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
    } catch (error) {
    console.error(error);
    showToast(error.message || 'Server connection failed', 'error');
  }
  }
  user._doctorId = doctorId;

  await renderDoctorAppointments(user);
  await renderDoctorStats(user);
  await setupPatientNotifications(user);
  await loadMyRequestsList(user);
  initCalendar(user);

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
        await loadMyRequestsList(user);
      } catch (err) {
        showToast(err.message || 'Failed to submit request', 'error');
      } finally {
        toggleLoader(false);
      }
    });
  }

  // ── Wire Patient History tab (lazy-load on first click) ──
  let historyLoaded = false;
  document.querySelector('[data-target="patientHistory"]')?.addEventListener('click', () => {
    if (!historyLoaded) {
      historyLoaded = true;
      renderPatientHistory(user);
    }
  });
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
    _populateCalendarDots(appts);
  } catch (error) {
    console.error(error);
    showToast(error.message || 'Server connection failed', 'error');
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
  } catch (error) {
    console.error(error);
    showToast(error.message || 'Server connection failed', 'error');
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

//  DOCTOR — PATIENT HISTORY TAB
// ═══════════════════════════════════════════════════════════

async function renderPatientHistory(user) {
  const container = document.getElementById('patientHistoryContainer');
  if (!container) return;
  container.innerHTML = '<p class="empty-state"><i class="fas fa-spinner fa-spin"></i> Loading…</p>';

  let appts = [];
  let fromDemo = false;

  try {
    const res = await AppointmentAPI.getForDoctor(user._doctorId);
    appts = res.data || [];
  } catch (error) {
    console.error(error);
    showToast(error.message || 'Server connection failed', 'error');
  }

  if (appts.length === 0) {
    container.innerHTML = '<p class="empty-state"><i class="fas fa-users"></i> No patient history found.</p>';
    return;
  }

  // Group by patient (by patient_name as key)
  const patientMap = {};
  appts.forEach(a => {
    const key = a.patient_name || 'Unknown';
    if (!patientMap[key]) patientMap[key] = { name: key, id: a.patient_id, appts: [] };
    patientMap[key].appts.push(a);
  });
  const patients = Object.values(patientMap).sort((a, b) => a.name.localeCompare(b.name));

  function renderList(list) {
    if (list.length === 0) {
      container.innerHTML = '<p class="empty-state">No matching patients.</p>';
      return;
    }
    container.innerHTML = list.map(p => {
      const completedCount = p.appts.filter(a => a.status === 'completed').length;
      const lastVisit = p.appts.slice().sort((a,b) => new Date(b.date)-new Date(a.date))[0]?.date || '—';
      return `
        <div class="card" style="margin-bottom:1rem">
          <div class="card-header" style="cursor:pointer;display:flex;justify-content:space-between;align-items:center"
               onclick="this.nextElementSibling.style.display=this.nextElementSibling.style.display==='none'?'':'none'">
            <span class="card-title"><i class="fas fa-user-circle"></i> ${p.name}</span>
            <div style="display:flex;gap:.75rem;align-items:center">
              <span class="badge-type">${p.appts.length} visit(s)</span>
              <span style="font-size:.8rem;color:var(--text-muted)">Last: ${lastVisit}</span>
              <span style="font-size:.8rem;color:#10b981">${completedCount} completed</span>
              <i class="fas fa-chevron-down" style="color:var(--text-muted)"></i>
            </div>
          </div>
          <div class="card-body" style="padding:0">
            <div class="table-responsive">
              <table>
                <thead>
                  <tr><th>#ID</th><th>Date</th><th>Time</th><th>Status</th></tr>
                </thead>
                <tbody>
                  ${p.appts.sort((a,b)=>new Date(b.date)-new Date(a.date)).map(a => `
                    <tr>
                      <td>#${String(a.id).substring(0,8)}</td>
                      <td>${a.date || '—'}</td>
                      <td>${String(a.time||'—').substring(0,5)}</td>
                      <td><span class="status-badge status-${a.status}">${a.status}</span></td>
                    </tr>`).join('')}
                </tbody>
              </table>
            </div>
          </div>
        </div>`;
    }).join('');
  }

  renderList(patients);

  // Wire search
  const searchInput = document.getElementById('patientHistorySearch');
  if (searchInput) {
    searchInput.removeEventListener('input', searchInput._phHandler);
    searchInput._phHandler = () => {
      const q = searchInput.value.toLowerCase();
      renderList(q ? patients.filter(p => p.name.toLowerCase().includes(q) || String(p.id).includes(q)) : patients);
    };
    searchInput.addEventListener('input', searchInput._phHandler);
  }
}

