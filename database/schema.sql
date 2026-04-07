-- ============================================================
-- CityCare Hospital Management System - FINAL ADVANCED SCHEMA
-- ============================================================

CREATE DATABASE IF NOT EXISTS citycare_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE citycare_db;

-- ============================================================
-- TABLE: USERS (WITH LOGIN TRACKING)
-- ============================================================
CREATE TABLE IF NOT EXISTS users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(150) NOT NULL,
    email VARCHAR(255) NOT NULL UNIQUE,
    password VARCHAR(255) NOT NULL,
    role ENUM('patient', 'doctor', 'receptionist') NOT NULL DEFAULT 'patient',
    login_count INT DEFAULT 0,
    last_login TIMESTAMP NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_email (email),
    INDEX idx_role (role)
);

-- ============================================================
-- TABLE: DOCTORS
-- ============================================================
CREATE TABLE IF NOT EXISTS doctors (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT UNIQUE NULL,
    name VARCHAR(150) NOT NULL,
    specialization VARCHAR(100) NOT NULL DEFAULT 'General',
    availability VARCHAR(255) DEFAULT 'Mon-Fri 9AM-5PM',
    experience VARCHAR(50) DEFAULT '0 Yrs',
    fee DECIMAL(10, 2) DEFAULT 500.00,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL ON UPDATE CASCADE,
    INDEX idx_spec (specialization)
);

-- ============================================================
-- TABLE: APPOINTMENTS
-- ============================================================
CREATE TABLE IF NOT EXISTS appointments (
    id INT AUTO_INCREMENT PRIMARY KEY,
    patient_id INT NOT NULL,
    doctor_id INT NOT NULL,
    date DATE NOT NULL,
    time TIME NOT NULL,
    status ENUM('pending', 'confirmed', 'completed', 'cancelled') NOT NULL DEFAULT 'pending',
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (patient_id) REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE,
    FOREIGN KEY (doctor_id) REFERENCES doctors(id) ON DELETE CASCADE ON UPDATE CASCADE,
    INDEX idx_patient (patient_id),
    INDEX idx_doctor (doctor_id),
    INDEX idx_date (date),
    INDEX idx_status (status)
);

-- ============================================================
-- TABLE: MEDICAL RECORDS
-- ============================================================
CREATE TABLE IF NOT EXISTS medical_records (
    id INT AUTO_INCREMENT PRIMARY KEY,
    patient_id INT NOT NULL,
    doctor_id INT NOT NULL,
    appointment_id INT NULL,
    diagnosis TEXT NOT NULL,
    prescription TEXT,
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (patient_id) REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE,
    FOREIGN KEY (doctor_id) REFERENCES doctors(id) ON DELETE CASCADE ON UPDATE CASCADE,
    FOREIGN KEY (appointment_id) REFERENCES appointments(id) ON DELETE SET NULL,
    INDEX idx_patient_rec (patient_id),
    INDEX idx_doctor_rec (doctor_id)
);

-- ============================================================
-- TABLE: NOTIFICATIONS
-- ============================================================
CREATE TABLE IF NOT EXISTS notifications (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    message VARCHAR(500) NOT NULL,
    is_read BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_user_notif (user_id),
    INDEX idx_is_read (is_read)
);

-- ============================================================
-- TABLE: DOCTOR REQUESTS
-- ============================================================
CREATE TABLE IF NOT EXISTS doctor_requests (
    id INT AUTO_INCREMENT PRIMARY KEY,
    doctor_id INT NOT NULL,
    type ENUM('leave', 'reschedule') NOT NULL,
    date DATE NOT NULL,
    reason TEXT,
    status ENUM('pending', 'approved', 'rejected') NOT NULL DEFAULT 'pending',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (doctor_id) REFERENCES doctors(id) ON DELETE CASCADE,
    INDEX idx_doctor_req (doctor_id),
    INDEX idx_req_status (status)
);

-- ============================================================
-- OPTIONAL: LOGIN HISTORY TABLE (ADVANCED FEATURE 🔥)
-- ============================================================
CREATE TABLE IF NOT EXISTS login_logs (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT,
    login_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- ============================================================
-- SEED DATA: USERS
-- ============================================================
INSERT IGNORE INTO users (name, email, password, role) VALUES
('Admin Receptionist', 'admin@citycare.com', '$2b$12$dummy_hash_replace_via_app', 'receptionist'),
('Dr. Sarah Smith', 'drsmith@citycare.com', '$2b$12$dummy_hash_replace_via_app', 'doctor'),
('Test Patient', 'patient@citycare.com', '$2b$12$dummy_hash_replace_via_app', 'patient');

-- ============================================================
-- SEED DATA: DOCTORS
-- ============================================================
INSERT IGNORE INTO doctors (user_id, name, specialization, availability, experience, fee) VALUES
(2, 'Dr. Sarah Smith', 'Cardiologist', 'Mon-Fri 9AM-5PM', '10 Yrs', 800.00),
(NULL, 'Dr. John Doe', 'Dermatologist', 'Mon-Wed 10AM-4PM', '5 Yrs', 600.00),
(NULL, 'Dr. Emily Chen', 'Pediatrician', 'Tue-Sat 9AM-3PM', '8 Yrs', 700.00),
(NULL, 'Dr. Michael Brown', 'Neurologist', 'Mon-Thu 11AM-6PM', '12 Yrs', 1000.00),
(NULL, 'Dr. Jessica White', 'Orthopedist', 'Wed-Sun 9AM-5PM', '6 Yrs', 750.00);

-- ============================================================
-- ADVANCED QUERIES SECTION (FOR DASHBOARD & FEATURES)
-- ============================================================

-- 1. COUNT USERS BY ROLE
SELECT role, COUNT(*) AS total_users FROM users GROUP BY role;

-- 2. MOST ACTIVE USERS
SELECT name, login_count FROM users ORDER BY login_count DESC LIMIT 5;

-- 3. DOCTOR-WISE APPOINTMENTS
SELECT d.name, COUNT(a.id) AS total
FROM doctors d
LEFT JOIN appointments a ON d.id = a.doctor_id
GROUP BY d.id;

-- 4. TODAY'S APPOINTMENTS
SELECT * FROM appointments WHERE date = CURDATE();

-- 5. FILTER APPOINTMENTS
SELECT a.id, u.name AS patient, d.name AS doctor, a.date, a.time, a.status
FROM appointments a
JOIN users u ON a.patient_id = u.id
JOIN doctors d ON a.doctor_id = d.id;

-- 6. PATIENT HISTORY
SELECT * FROM medical_records WHERE patient_id = 1;

-- 7. UNREAD NOTIFICATIONS
SELECT * FROM notifications WHERE user_id = 1 AND is_read = FALSE;

-- 8. MONTHLY APPOINTMENTS
SELECT MONTH(date) AS month, COUNT(*) FROM appointments GROUP BY MONTH(date);

-- ============================================================
-- FINAL CHECK
-- ============================================================
SHOW TABLES;