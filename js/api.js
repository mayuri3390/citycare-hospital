/**
 * api.js — Centralized API service for CityCare Hospital
 * All fetch calls go through this module.
 */

const API_BASE = 'http://localhost:5000/api';

// ── Token Management ──────────────────────────────────────────────────────────

function getToken() {
  return localStorage.getItem('token');
}

function setToken(token) {
  localStorage.setItem('token', token);
}

function removeToken() {
  localStorage.removeItem('token');
}

// ── Base Fetch ────────────────────────────────────────────────────────────────

async function apiFetch(endpoint, options = {}) {
  const token = getToken();
  const headers = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(options.headers || {})
  };

  const config = { ...options, headers };

  try {
    const response = await fetch(`${API_BASE}${endpoint}`, config);
    const json = await response.json();

    if (!response.ok) {
      throw new Error(json.error || `HTTP ${response.status}`);
    }
    return json;
  } catch (err) {
    // Rethrow for callers to handle
    throw err;
  }
}

// ── Auth ──────────────────────────────────────────────────────────────────────

const AuthAPI = {
  async login(email, password) {
    const data = await apiFetch('/login', {
      method: 'POST',
      body: JSON.stringify({ email, password })
    });
    if (data.data?.token) {
      setToken(data.data.token);
      localStorage.setItem('currentUser', JSON.stringify(data.data.user));
    }
    return data;
  },

  async register(payload) {
    return apiFetch('/register', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
  },

  logout() {
    removeToken();
    localStorage.removeItem('currentUser');
  }
};

// ── Doctors ───────────────────────────────────────────────────────────────────

const DoctorAPI = {
  getAll(specialization = '') {
    const qs = specialization ? `?specialization=${encodeURIComponent(specialization)}` : '';
    return apiFetch(`/doctors${qs}`);
  },
  getOne(id) {
    return apiFetch(`/doctors/${id}`);
  },
  getSpecializations() {
    return apiFetch('/doctors/specializations');
  }
};

// ── Appointments ──────────────────────────────────────────────────────────────

const AppointmentAPI = {
  book(payload) {
    return apiFetch('/appointments', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
  },
  getForUser(userId, filters = {}) {
    const qs = new URLSearchParams(filters).toString();
    return apiFetch(`/appointments/user/${userId}${qs ? `?${qs}` : ''}`);
  },
  getForDoctor(doctorId, filters = {}) {
    const qs = new URLSearchParams(filters).toString();
    return apiFetch(`/appointments/doctor/${doctorId}${qs ? `?${qs}` : ''}`);
  },
  getAll(filters = {}) {
    const qs = new URLSearchParams(filters).toString();
    return apiFetch(`/appointments/all${qs ? `?${qs}` : ''}`);
  },
  update(id, payload) {
    return apiFetch(`/appointments/${id}`, {
      method: 'PUT',
      body: JSON.stringify(payload)
    });
  },
  cancel(id) {
    return apiFetch(`/appointments/${id}`, { method: 'DELETE' });
  }
};

// ── Medical Records ───────────────────────────────────────────────────────────

const RecordAPI = {
  create(payload) {
    return apiFetch('/records', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
  },
  getForPatient(patientId) {
    return apiFetch(`/records/${patientId}`);
  }
};

// ── Notifications ─────────────────────────────────────────────────────────────

const NotificationAPI = {
  get(userId) {
    return apiFetch(`/notifications/${userId}`);
  },
  markRead(ids = null) {
    return apiFetch('/notifications/read', {
      method: 'PUT',
      body: JSON.stringify(ids ? { ids } : {})
    });
  }
};

// ── Doctor Requests ───────────────────────────────────────────────────────────

const DoctorRequestAPI = {
  create(payload) {
    return apiFetch('/doctor-request', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
  },
  getAll() {
    return apiFetch('/doctor-request');
  },
  update(id, status) {
    return apiFetch(`/doctor-request/${id}`, {
      method: 'PUT',
      body: JSON.stringify({ status })
    });
  }
};
