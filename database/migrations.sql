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

-- 3. Sample: verify migration worked
SELECT 'Migration applied successfully' AS status;
SELECT TABLE_NAME FROM information_schema.TABLES
WHERE TABLE_SCHEMA = 'citycare_db'
ORDER BY TABLE_NAME;
