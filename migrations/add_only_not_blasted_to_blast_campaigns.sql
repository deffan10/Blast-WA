-- Migration: Add only_not_blasted to blast_campaigns
-- Aman untuk campaign existing: kolom pakai DEFAULT 0 (false), jadi campaign lama tetap berperilaku sama.
-- Jalankan sekali (bisa di phpMyAdmin / MySQL client):
--   mysql -u user -p nama_database < migrations/add_only_not_blasted_to_blast_campaigns.sql

SET @dbname = DATABASE();
SET @tablename = 'blast_campaigns';
SET @columnname = 'only_not_blasted';

SET @preparedStatement = (SELECT IF(
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
   WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = @tablename AND COLUMN_NAME = @columnname) > 0,
  'SELECT 1',
  'ALTER TABLE blast_campaigns ADD COLUMN only_not_blasted TINYINT(1) NOT NULL DEFAULT 0 COMMENT ''1 = hanya kirim ke kontak yang belum pernah di-blast''' 
));
PREPARE alterIfNotExists FROM @preparedStatement;
EXECUTE alterIfNotExists;
DEALLOCATE PREPARE alterIfNotExists;
