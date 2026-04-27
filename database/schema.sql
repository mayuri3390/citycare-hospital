-- ============================================================
-- CityCare Hospital — CLEAN SETUP SCRIPT (MySQL 8.0 Compatible)
-- Run this entire file in MySQL Workbench
-- ============================================================

USE citycare_db;

-- ============================================================
-- STEP 1: Fix missing columns on the users table
--         (MySQL 8.0 does NOT support ADD COLUMN IF NOT EXISTS)
--         Uses a stored procedure to safely add if missing
-- ============================================================
DROP PROCEDURE IF EXISTS _citycare_fix_users;

DELIMITER $$
CREATE PROCEDURE _citycare_fix_users()
BEGIN
    -- Add login_count if missing
    IF NOT EXISTS (
        SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = 'citycare_db'
          AND TABLE_NAME   = 'users'
          AND COLUMN_NAME  = 'login_count'
    ) THEN
        ALTER TABLE users ADD COLUMN login_count INT DEFAULT 0;
    END IF;

    -- Add last_login if missing
    IF NOT EXISTS (
        SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = 'citycare_db'
          AND TABLE_NAME   = 'users'
          AND COLUMN_NAME  = 'last_login'
    ) THEN
        ALTER TABLE users ADD COLUMN last_login TIMESTAMP NULL;
    END IF;
END$$
DELIMITER ;

CALL _citycare_fix_users();
DROP PROCEDURE IF EXISTS _citycare_fix_users;

-- ============================================================
-- STEP 2: Create tables that don't exist yet
-- ============================================================

CREATE TABLE IF NOT EXISTS doctors (
    id             INT AUTO_INCREMENT PRIMARY KEY,
    user_id        INT UNIQUE NULL,
    name           VARCHAR(150) NOT NULL,
    specialization VARCHAR(100) NOT NULL DEFAULT 'General',
    availability   VARCHAR(255) DEFAULT 'Mon-Fri 9AM-5PM',
    experience     VARCHAR(50)  DEFAULT '0 Yrs',
    fee            DECIMAL(10,2) DEFAULT 500.00,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL ON UPDATE CASCADE,
    INDEX idx_spec (specialization)
);

CREATE TABLE IF NOT EXISTS appointments (
    id         INT AUTO_INCREMENT PRIMARY KEY,
    patient_id INT NOT NULL,
    doctor_id  INT NOT NULL,
    date       DATE NOT NULL,
    time       TIME NOT NULL,
    status     ENUM('pending','confirmed','completed','cancelled') NOT NULL DEFAULT 'pending',
    notes      TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (patient_id) REFERENCES users(id)   ON DELETE CASCADE ON UPDATE CASCADE,
    FOREIGN KEY (doctor_id)  REFERENCES doctors(id) ON DELETE CASCADE ON UPDATE CASCADE,
    UNIQUE KEY unique_doctor_slot (doctor_id, date, time),
    INDEX idx_patient (patient_id),
    INDEX idx_doctor  (doctor_id),
    INDEX idx_date    (date),
    INDEX idx_status  (status)
);

CREATE TABLE IF NOT EXISTS medical_records (
    id             INT AUTO_INCREMENT PRIMARY KEY,
    patient_id     INT NOT NULL,
    doctor_id      INT NOT NULL,
    appointment_id INT NULL,
    diagnosis      TEXT NOT NULL,
    prescription   TEXT,
    notes          TEXT,
    created_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (patient_id)     REFERENCES users(id)        ON DELETE CASCADE ON UPDATE CASCADE,
    FOREIGN KEY (doctor_id)      REFERENCES doctors(id)      ON DELETE CASCADE ON UPDATE CASCADE,
    FOREIGN KEY (appointment_id) REFERENCES appointments(id) ON DELETE SET NULL,
    INDEX idx_patient_rec (patient_id),
    INDEX idx_doctor_rec  (doctor_id)
);

CREATE TABLE IF NOT EXISTS bills (
    id             INT AUTO_INCREMENT PRIMARY KEY,
    patient_id     INT NOT NULL,
    doctor_id      INT NOT NULL,
    appointment_id INT NOT NULL,
    amount         DECIMAL(10,2) NOT NULL,
    details        TEXT,
    created_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (patient_id) REFERENCES users(id)   ON DELETE CASCADE ON UPDATE CASCADE,
    FOREIGN KEY (doctor_id)  REFERENCES doctors(id) ON DELETE CASCADE ON UPDATE CASCADE,
    FOREIGN KEY (appointment_id) REFERENCES appointments(id) ON DELETE CASCADE,
    INDEX idx_bill_patient (patient_id),
    INDEX idx_bill_doctor  (doctor_id),
    INDEX idx_bill_date    (created_at)
);

CREATE TABLE IF NOT EXISTS notifications (
    id         INT AUTO_INCREMENT PRIMARY KEY,
    user_id    INT NOT NULL,
    message    VARCHAR(500) NOT NULL,
    is_read    BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_user_notif (user_id),
    INDEX idx_is_read    (is_read)
);

CREATE TABLE IF NOT EXISTS doctor_requests (
    id         INT AUTO_INCREMENT PRIMARY KEY,
    doctor_id  INT NOT NULL,
    type       ENUM('leave','reschedule') NOT NULL,
    date       DATE NOT NULL,
    reason     TEXT,
    status     ENUM('pending','approved','rejected') NOT NULL DEFAULT 'pending',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (doctor_id) REFERENCES doctors(id) ON DELETE CASCADE,
    INDEX idx_doctor_req (doctor_id),
    INDEX idx_req_status (status)
);

CREATE TABLE IF NOT EXISTS login_logs (
    id         INT AUTO_INCREMENT PRIMARY KEY,
    user_id    INT,
    ip_address VARCHAR(45)  DEFAULT NULL,
    user_agent VARCHAR(500) DEFAULT NULL,
    login_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_ll_user (user_id),
    INDEX idx_ll_time (login_time)
);

CREATE TABLE IF NOT EXISTS doctor_availability (
    id         INT AUTO_INCREMENT PRIMARY KEY,
    doctor_id  INT NOT NULL,
    date       DATE NOT NULL,
    status     ENUM('available', 'unavailable') NOT NULL DEFAULT 'available',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (doctor_id) REFERENCES doctors(id) ON DELETE CASCADE,
    UNIQUE KEY unique_doctor_date (doctor_id, date)
);

-- ============================================================
-- STEP 3: SEED DATA
-- NOTE: These are placeholder passwords.
--       Register real users via the app to get proper bcrypt hashes.
-- ============================================================
INSERT IGNORE INTO users (name, email, password, role, is_approved) VALUES
('Admin Receptionist', 'admin@citycare.com',   '$2b$12$placeholder_register_via_app', 'receptionist', TRUE),
('Dr. Sarah Smith',    'drsmith@citycare.com', '$2b$12$placeholder_register_via_app', 'doctor',       TRUE),
('Test Patient',       'patient@citycare.com', '$2b$12$placeholder_register_via_app', 'patient',      TRUE);

-- ============================================================
-- STEP 4: VERIFY — All tables + row counts (no errors expected)
-- ============================================================
SHOW TABLES;

SELECT 'users'           AS table_name, COUNT(*) AS row_count FROM users           UNION ALL
SELECT 'doctors',                       COUNT(*)              FROM doctors          UNION ALL
SELECT 'appointments',                  COUNT(*)              FROM appointments     UNION ALL
SELECT 'medical_records',               COUNT(*)              FROM medical_records  UNION ALL
SELECT 'bills',                         COUNT(*)              FROM bills            UNION ALL
SELECT 'notifications',                 COUNT(*)              FROM notifications    UNION ALL
SELECT 'doctor_requests',               COUNT(*)              FROM doctor_requests  UNION ALL
SELECT 'login_logs',                    COUNT(*)              FROM login_logs;

-- ============================================================
-- STEP 5: Verify users table has the correct columns
-- ============================================================
SELECT COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE, COLUMN_DEFAULT
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_SCHEMA = 'citycare_db'
  AND TABLE_NAME   = 'users'
ORDER BY ORDINAL_POSITION;

-- ============================================================
-- USEFUL DASHBOARD QUERIES (Safe to run anytime — read-only)
-- ============================================================

-- Q1. Count of users by role
SELECT role, COUNT(*) AS total_users
FROM users
GROUP BY role;

-- Q2. Most active users (by login count)
SELECT name, role, login_count, last_login
FROM users
ORDER BY login_count DESC
LIMIT 10;

-- Q3. Doctor-wise appointment totals
SELECT d.name AS doctor, d.specialization,
       COUNT(a.id)                                           AS total_appointments,
       SUM(a.status = 'completed')                          AS completed,
       SUM(a.status = 'pending')                            AS pending,
       SUM(a.status = 'cancelled')                          AS cancelled
FROM doctors d
LEFT JOIN appointments a ON d.id = a.doctor_id
GROUP BY d.id, d.name, d.specialization
ORDER BY total_appointments DESC;

-- Q4. Today's appointments
SELECT a.id, u.name AS patient, d.name AS doctor,
       a.time, a.status
FROM appointments a
JOIN users   u ON a.patient_id = u.id
JOIN doctors d ON a.doctor_id  = d.id
WHERE a.date = CURDATE()
ORDER BY a.time;

-- Q5. All appointments with patient & doctor names
SELECT a.id, u.name AS patient, d.name AS doctor,
       a.date, a.time, a.status
FROM appointments a
JOIN users   u ON a.patient_id = u.id
JOIN doctors d ON a.doctor_id  = d.id
ORDER BY a.date DESC, a.time DESC;

-- Q6. Completed appointments only (for Patient History / Billing)
SELECT a.id, u.name AS patient, d.name AS doctor,
       a.date, a.time
FROM appointments a
JOIN users   u ON a.patient_id = u.id
JOIN doctors d ON a.doctor_id  = d.id
WHERE a.status = 'completed'
ORDER BY a.date DESC;

-- Q7. Medical records for a specific patient (change patient_id = 1 as needed)
SELECT mr.id, d.name AS doctor, d.specialization,
       mr.diagnosis, mr.prescription, mr.notes, mr.created_at
FROM medical_records mr
JOIN doctors d ON mr.doctor_id = d.id
WHERE mr.patient_id = 1
ORDER BY mr.created_at DESC;

-- Q8. All medical records with patient and doctor names
SELECT mr.id,
       u.name AS patient,
       d.name AS doctor,
       mr.diagnosis, mr.prescription, mr.notes, mr.created_at
FROM medical_records mr
JOIN users   u ON mr.patient_id = u.id
JOIN doctors d ON mr.doctor_id  = d.id
ORDER BY mr.created_at DESC;

-- Q9. Unread notifications for a user (change user_id = 1 as needed)
SELECT id, message, created_at
FROM notifications
WHERE user_id = 1 AND is_read = FALSE
ORDER BY created_at DESC;

-- Q10. Monthly appointment volume (current year)
SELECT MONTH(date)    AS month_num,
       MONTHNAME(date) AS month_name,
       COUNT(*)        AS total_appointments
FROM appointments
WHERE YEAR(date) = YEAR(CURDATE())
GROUP BY MONTH(date), MONTHNAME(date)
ORDER BY month_num;

-- Q11. All bills with patient and doctor details
SELECT b.id,
       u.name  AS patient,
       u.email AS patient_email,
       d.name  AS doctor,
       d.specialization,
       b.amount,
       b.details,
       b.created_at
FROM bills b
JOIN users   u ON b.patient_id = u.id
JOIN doctors d ON b.doctor_id  = d.id
ORDER BY b.created_at DESC;

-- Q12. Patients who have had at least one completed appointment
--      (used by Patient History & Billing patient search)
SELECT DISTINCT u.id, u.name, u.email,
       COUNT(a.id) AS completed_visits
FROM users u
JOIN appointments a ON a.patient_id = u.id
WHERE u.role = 'patient'
  AND a.status = 'completed'
GROUP BY u.id, u.name, u.email
ORDER BY u.name;

-- Q13. Doctor requests with doctor name
SELECT dr.id, d.name AS doctor, dr.type, dr.date,
       dr.reason, dr.status, dr.created_at
FROM doctor_requests dr
JOIN doctors d ON dr.doctor_id = d.id
ORDER BY dr.created_at DESC;

-- Q14. Login history
SELECT ll.id, u.name, u.role,
       ll.ip_address, ll.login_time
FROM login_logs ll
JOIN users u ON ll.user_id = u.id
ORDER BY ll.login_time DESC
LIMIT 50;

-- Q15. Full system summary (receptionist overview stats)
SELECT
    (SELECT COUNT(*) FROM appointments)                          AS total_appointments,
    (SELECT COUNT(*) FROM appointments WHERE status = 'pending') AS pending_appointments,
    (SELECT COUNT(*) FROM doctors)                               AS total_doctors,
    (SELECT COUNT(DISTINCT patient_id) FROM appointments
      WHERE status = 'completed')                                AS patients_served,
    (SELECT COUNT(*) FROM bills)                                 AS total_bills,
    (SELECT IFNULL(SUM(amount), 0) FROM bills)                   AS total_revenue;