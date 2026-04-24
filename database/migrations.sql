-- ====================================================================
-- CityCare Hospital — MIGRATION: Advanced Features (Run ONCE)
-- ====================================================================

USE citycare_db;

-- 1. Add login tracking columns to users (safe: IF NOT EXISTS simulation)
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS login_count INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_login  TIMESTAMP NULL;

-- 2. Create login_logs table
CREATE TABLE IF NOT EXISTS login_logs (
    id         INT AUTO_INCREMENT PRIMARY KEY,
    user_id    INT NOT NULL,
    ip_address VARCHAR(45) DEFAULT NULL,
    user_agent VARCHAR(500) DEFAULT NULL,
    login_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_ll_user (user_id),
    INDEX idx_ll_time (login_time)
);

-- 4. Create bills table (NEW — Receptionist Billing Feature)
CREATE TABLE IF NOT EXISTS bills (
    id         INT AUTO_INCREMENT PRIMARY KEY,
    patient_id INT NOT NULL,
    doctor_id  INT NOT NULL,
    amount     DECIMAL(10,2) NOT NULL,
    details    TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (patient_id) REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE,
    FOREIGN KEY (doctor_id)  REFERENCES doctors(id) ON DELETE CASCADE ON UPDATE CASCADE,
    INDEX idx_bill_patient (patient_id),
    INDEX idx_bill_doctor  (doctor_id),
    INDEX idx_bill_date    (created_at)
);

-- 5. Verify all tables
SELECT 'Migration applied successfully' AS status;
SELECT TABLE_NAME FROM information_schema.TABLES
WHERE TABLE_SCHEMA = 'citycare_db'
ORDER BY TABLE_NAME;
