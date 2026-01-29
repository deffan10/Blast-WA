-- Migration script for Multi-Session WhatsApp
-- Run this on production database BEFORE running pm2 restart

-- =====================================================
-- STEP 1: Backup existing data (optional but recommended)
-- =====================================================
-- CREATE TABLE whatsapp_sessions_backup AS SELECT * FROM whatsapp_sessions;
-- CREATE TABLE blast_logs_backup AS SELECT * FROM blast_logs;

-- =====================================================
-- STEP 2: Add new columns to whatsapp_sessions
-- =====================================================
-- Check if column exists first, add if not
SET @dbname = DATABASE();
SET @tablename = 'whatsapp_sessions';

-- Add 'label' column
SET @columnname = 'label';
SET @preparedStatement = (SELECT IF(
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = @tablename AND COLUMN_NAME = @columnname) > 0,
  'SELECT 1',
  'ALTER TABLE whatsapp_sessions ADD COLUMN label VARCHAR(100) DEFAULT NULL'
));
PREPARE alterIfNotExists FROM @preparedStatement;
EXECUTE alterIfNotExists;
DEALLOCATE PREPARE alterIfNotExists;

-- Add 'is_active' column
SET @columnname = 'is_active';
SET @preparedStatement = (SELECT IF(
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = @tablename AND COLUMN_NAME = @columnname) > 0,
  'SELECT 1',
  'ALTER TABLE whatsapp_sessions ADD COLUMN is_active TINYINT(1) DEFAULT 1'
));
PREPARE alterIfNotExists FROM @preparedStatement;
EXECUTE alterIfNotExists;
DEALLOCATE PREPARE alterIfNotExists;

-- =====================================================
-- STEP 3: Add sent_via column to blast_logs
-- =====================================================
SET @tablename = 'blast_logs';
SET @columnname = 'sent_via';
SET @preparedStatement = (SELECT IF(
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = @tablename AND COLUMN_NAME = @columnname) > 0,
  'SELECT 1',
  'ALTER TABLE blast_logs ADD COLUMN sent_via VARCHAR(20) DEFAULT NULL'
));
PREPARE alterIfNotExists FROM @preparedStatement;
EXECUTE alterIfNotExists;
DEALLOCATE PREPARE alterIfNotExists;

-- =====================================================
-- STEP 4: Migrate existing session 'default' to 'wa_1'
-- =====================================================
UPDATE whatsapp_sessions 
SET session_id = 'wa_1', label = 'WhatsApp 1' 
WHERE session_id = 'default';

-- =====================================================
-- STEP 5: Verify migration
-- =====================================================
SELECT '=== WhatsApp Sessions ===' AS info;
SELECT * FROM whatsapp_sessions;

SELECT '=== WhatsApp Sessions Structure ===' AS info;
DESCRIBE whatsapp_sessions;

SELECT '=== Blast Logs Structure (sent_via column) ===' AS info;
SHOW COLUMNS FROM blast_logs LIKE 'sent_via';

SELECT '=== Migration Complete ===' AS info;
