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
        initCalendar(user); // Refresh calendar dots
        document.querySelector('[data-target="appointments"]')?.click();
      } catch (error) {
    console.error(error);
    showToast(error.message || 'Server connection failed', 'error');
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
      } catch (error) {
    console.error(error);
    showToast(error.message || 'Server connection failed', 'error');
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

  // Upload form — saves to localStorage and displays in My Reports
  const uploadForm = document.getElementById('uploadForm');
  if (uploadForm) {
    uploadForm.addEventListener('submit', async e => {
      e.preventDefault();
      const docType = document.getElementById('uploadDocType')?.value.trim();
      const fileInput = document.getElementById('uploadFile');
      const file = fileInput?.files?.[0];
      if (!docType || !file) { showToast('Please fill all fields', 'error'); return; }
      toggleLoader(true);
      await sleep(800);
      // Save report metadata to localStorage
      const reports = JSON.parse(localStorage.getItem(`reports_${user.id}`)) || [];
      reports.push({
        id: Date.now(),
        docType,
        fileName: file.name,
        fileSize: (file.size / 1024).toFixed(1) + ' KB',
        uploadedAt: new Date().toISOString()
      });
      localStorage.setItem(`reports_${user.id}`, JSON.stringify(reports));
      toggleLoader(false);
      showToast(`✅ "${file.name}" uploaded successfully!`, 'success');
      uploadForm.reset();
      renderMyReports(user);
    });
  }
  // Load medical records & reports
  await renderMedicalRecords(user);
  renderMyReports(user);
}

async function loadDoctorsList(user) {
  let doctors = [];
  try {
    const res = await DoctorAPI.getAll();
    doctors = res.data || [];
    // ── FIX: Deduplicate by doctor name, prefer newest (real) entries ──
    doctors.sort((a, b) => b.id - a.id);
    const seen = new Set();
    doctors = doctors.filter(d => {
      const name = d.name.trim().toLowerCase();
      if (seen.has(name)) return false;
      seen.add(name);
      return true;
    });
    // Store for demo fallback
    localStorage.setItem('doctors_api', JSON.stringify(doctors));
  } catch (error) {
    console.error(error);
    showToast(error.message || 'Server connection failed', 'error');
  }

  const select = document.getElementById('doctorSelect');
  const container = document.getElementById('doctorsGrid');
  // ── FIX: Populate doctorFilter dropdown on My Appointments tab ──
  const doctorFilter = document.getElementById('doctorFilter');

  if (select) {
    select.innerHTML = '<option value="">Select a Doctor</option>';
    doctors.forEach(d => {
      select.innerHTML += `<option value="${d.id}">${d.name} (${d.specialization || d.spec})</option>`;
    });
  }

  if (doctorFilter) {
    doctorFilter.innerHTML = '<option value="">All Doctors</option>';
    doctors.forEach(d => {
      doctorFilter.innerHTML += `<option value="${d.id}">${d.name}</option>`;
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
    specFilter.innerHTML = '<option value="">All Specializations</option>';
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
  } catch (error) {
    console.error(error);
    showToast(error.message || 'Server connection failed', 'error');
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
  } catch (error) {
    console.error(error);
    showToast(error.message || 'Server connection failed', 'error');
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
  } catch (error) {
    console.error(error);
    showToast(error.message || 'Server connection failed', 'error');
  }
}

// ── NEW: Render My Reports (patient-uploaded documents) ────────────
function renderMyReports(user) {
  const container = document.getElementById('myReportsList');
  if (!container) return;
  const reports = JSON.parse(localStorage.getItem(`reports_${user.id}`)) || [];
  if (reports.length === 0) {
    container.innerHTML = '<p class="empty-state"><i class="fas fa-folder-open"></i> No reports uploaded yet.</p>';
    return;
  }
  container.innerHTML = reports.slice().reverse().map(r => `
    <div class="record-card card">
      <div class="record-header">
        <span><i class="fas fa-file-alt"></i> ${r.docType}</span>
        <span class="record-date">${formatDate(r.uploadedAt)}</span>
      </div>
      <div class="record-body">
        <p><strong>File:</strong> ${r.fileName}</p>
        <p><strong>Size:</strong> ${r.fileSize}</p>
      </div>
      <div style="display:flex;gap:.5rem;margin-top:.5rem">
        <button class="btn btn-outline" onclick="deleteReport(${r.id}, ${user.id})">
          <i class="fas fa-trash"></i> Delete
        </button>
      </div>
    </div>
  `).join('');
}

window.deleteReport = function(reportId, userId) {
  const reports = JSON.parse(localStorage.getItem(`reports_${userId}`)) || [];
  const updated = reports.filter(r => r.id !== reportId);
  localStorage.setItem(`reports_${userId}`, JSON.stringify(updated));
  const user = getCurrentUser();
  if (user) renderMyReports(user);
  showToast('Report deleted', 'warning');
};

