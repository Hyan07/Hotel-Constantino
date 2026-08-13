-- Constantino's Hotel 2.0 - MySQL 8 / MariaDB 10.6+
-- Importe este arquivo no banco já criado no hPanel/phpMyAdmin.

SET NAMES utf8mb4;
SET time_zone = '+00:00';

CREATE TABLE IF NOT EXISTS users (
  id CHAR(36) NOT NULL,
  email VARCHAR(190) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  full_name VARCHAR(120) NOT NULL,
  role ENUM('admin','reception','housekeeping','viewer') NOT NULL DEFAULT 'viewer',
  active TINYINT(1) NOT NULL DEFAULT 1,
  session_version INT UNSIGNED NOT NULL DEFAULT 1,
  last_sign_in_at DATETIME(3) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY users_email_unique (email),
  KEY users_role_active_idx (role, active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS guests (
  id CHAR(36) NOT NULL,
  full_name VARCHAR(160) NOT NULL,
  document_type ENUM('cpf','passport','other') NOT NULL DEFAULT 'cpf',
  document_number VARCHAR(80) NULL,
  document_number_normalized VARCHAR(80) NULL,
  document_path VARCHAR(400) NULL,
  birth_date DATE NULL,
  phone VARCHAR(40) NULL,
  phone_normalized VARCHAR(40) NULL,
  email VARCHAR(190) NULL,
  postal_code VARCHAR(20) NULL,
  street VARCHAR(160) NULL,
  address_number VARCHAR(30) NULL,
  complement VARCHAR(120) NULL,
  neighborhood VARCHAR(120) NULL,
  city VARCHAR(120) NULL,
  state CHAR(2) NULL,
  country VARCHAR(80) NOT NULL DEFAULT 'Brasil',
  nationality VARCHAR(80) NOT NULL DEFAULT 'Brasileira',
  emergency_contact_name VARCHAR(160) NULL,
  emergency_contact_phone VARCHAR(40) NULL,
  preferences TEXT NULL,
  accessibility_needs TEXT NULL,
  internal_notes TEXT NULL,
  created_by CHAR(36) NULL,
  updated_by CHAR(36) NULL,
  deleted_at DATETIME(3) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY guests_document_unique (document_type, document_number_normalized),
  KEY guests_name_idx (full_name),
  KEY guests_phone_idx (phone_normalized),
  KEY guests_email_idx (email),
  CONSTRAINT guests_created_by_fk FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT guests_updated_by_fk FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS room_categories (
  id CHAR(36) NOT NULL,
  name VARCHAR(80) NOT NULL,
  description TEXT NULL,
  default_capacity SMALLINT UNSIGNED NOT NULL DEFAULT 2,
  default_nightly_rate DECIMAL(12,2) NOT NULL,
  active TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY room_categories_name_unique (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS rooms (
  id CHAR(36) NOT NULL,
  room_number VARCHAR(20) NOT NULL,
  category_id CHAR(36) NOT NULL,
  floor SMALLINT NULL,
  bed_type VARCHAR(120) NOT NULL,
  bed_count SMALLINT UNSIGNED NOT NULL DEFAULT 1,
  max_capacity SMALLINT UNSIGNED NOT NULL,
  standard_nightly_rate DECIMAL(12,2) NOT NULL,
  amenities JSON NOT NULL,
  description TEXT NULL,
  internal_notes TEXT NULL,
  current_status ENUM('available','reserved','occupied','awaiting_cleaning','cleaning','blocked','maintenance') NOT NULL DEFAULT 'available',
  cleaning_status ENUM('clean','pending','in_progress','inspected') NOT NULL DEFAULT 'clean',
  active TINYINT(1) NOT NULL DEFAULT 1,
  created_by CHAR(36) NULL,
  updated_by CHAR(36) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY rooms_number_unique (room_number),
  KEY rooms_status_idx (current_status, cleaning_status),
  KEY rooms_category_idx (category_id),
  KEY rooms_floor_idx (floor),
  CONSTRAINT rooms_category_fk FOREIGN KEY (category_id) REFERENCES room_categories(id),
  CONSTRAINT rooms_created_by_fk FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT rooms_updated_by_fk FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS reservations (
  id CHAR(36) NOT NULL,
  sequential_number BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  code VARCHAR(40) NOT NULL,
  responsible_guest_id CHAR(36) NOT NULL,
  room_id CHAR(36) NOT NULL,
  check_in_at DATETIME(3) NOT NULL,
  check_out_at DATETIME(3) NOT NULL,
  adults SMALLINT UNSIGNED NOT NULL DEFAULT 1,
  children SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  nightly_rate DECIMAL(12,2) NOT NULL,
  nights INT UNSIGNED NOT NULL DEFAULT 1,
  discount DECIMAL(12,2) NOT NULL DEFAULT 0,
  surcharge DECIMAL(12,2) NOT NULL DEFAULT 0,
  total_amount DECIMAL(12,2) NOT NULL DEFAULT 0,
  payment_method ENUM('cash','pix','credit_card','debit_card','bank_transfer','invoice','other') NULL,
  payment_status ENUM('pending','partial','paid','refunded','canceled') NOT NULL DEFAULT 'pending',
  status ENUM('pre_reservation','pending','confirmed','checked_in','checked_out','canceled','no_show') NOT NULL DEFAULT 'pending',
  origin_channel VARCHAR(120) NOT NULL DEFAULT 'Direto',
  notes TEXT NULL,
  special_requests TEXT NULL,
  canceled_reason TEXT NULL,
  created_by CHAR(36) NULL,
  updated_by CHAR(36) NULL,
  checked_in_by CHAR(36) NULL,
  checked_out_by CHAR(36) NULL,
  checked_in_at_actual DATETIME(3) NULL,
  checked_out_at_actual DATETIME(3) NULL,
  deleted_at DATETIME(3) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY reservations_sequence_unique (sequential_number),
  UNIQUE KEY reservations_code_unique (code),
  KEY reservations_period_idx (check_in_at, check_out_at),
  KEY reservations_status_idx (status, check_in_at),
  KEY reservations_guest_idx (responsible_guest_id),
  KEY reservations_room_idx (room_id, check_in_at),
  KEY reservations_payment_idx (payment_status),
  CONSTRAINT reservations_guest_fk FOREIGN KEY (responsible_guest_id) REFERENCES guests(id),
  CONSTRAINT reservations_room_fk FOREIGN KEY (room_id) REFERENCES rooms(id),
  CONSTRAINT reservations_created_by_fk FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT reservations_updated_by_fk FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT reservations_checkin_user_fk FOREIGN KEY (checked_in_by) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT reservations_checkout_user_fk FOREIGN KEY (checked_out_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS reservation_guests (
  reservation_id CHAR(36) NOT NULL,
  guest_id CHAR(36) NOT NULL,
  is_responsible TINYINT(1) NOT NULL DEFAULT 0,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (reservation_id, guest_id),
  KEY reservation_guests_guest_idx (guest_id),
  CONSTRAINT reservation_guests_reservation_fk FOREIGN KEY (reservation_id) REFERENCES reservations(id) ON DELETE CASCADE,
  CONSTRAINT reservation_guests_guest_fk FOREIGN KEY (guest_id) REFERENCES guests(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS payments (
  id CHAR(36) NOT NULL,
  reservation_id CHAR(36) NOT NULL,
  amount DECIMAL(12,2) NOT NULL,
  method ENUM('cash','pix','credit_card','debit_card','bank_transfer','invoice','other') NOT NULL,
  status ENUM('pending','received','refunded','voided') NOT NULL DEFAULT 'received',
  paid_at DATETIME(3) NULL,
  transaction_reference VARCHAR(160) NULL,
  notes TEXT NULL,
  receipt_path VARCHAR(400) NULL,
  created_by CHAR(36) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY payments_reservation_idx (reservation_id, status),
  KEY payments_paid_at_idx (paid_at),
  CONSTRAINT payments_reservation_fk FOREIGN KEY (reservation_id) REFERENCES reservations(id),
  CONSTRAINT payments_created_by_fk FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS maintenance (
  id CHAR(36) NOT NULL,
  room_id CHAR(36) NOT NULL,
  reason VARCHAR(160) NOT NULL,
  description TEXT NULL,
  start_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  expected_release_at DATETIME(3) NULL,
  released_at DATETIME(3) NULL,
  responsible_name VARCHAR(160) NULL,
  status ENUM('open','in_progress','waiting_parts','completed','canceled') NOT NULL DEFAULT 'open',
  created_by CHAR(36) NULL,
  updated_by CHAR(36) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY maintenance_room_status_idx (room_id, status),
  KEY maintenance_release_idx (expected_release_at),
  CONSTRAINT maintenance_room_fk FOREIGN KEY (room_id) REFERENCES rooms(id),
  CONSTRAINT maintenance_created_by_fk FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT maintenance_updated_by_fk FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS room_status_history (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  room_id CHAR(36) NOT NULL,
  previous_status ENUM('available','reserved','occupied','awaiting_cleaning','cleaning','blocked','maintenance') NULL,
  new_status ENUM('available','reserved','occupied','awaiting_cleaning','cleaning','blocked','maintenance') NOT NULL,
  previous_cleaning_status ENUM('clean','pending','in_progress','inspected') NULL,
  new_cleaning_status ENUM('clean','pending','in_progress','inspected') NOT NULL,
  reason TEXT NULL,
  changed_by CHAR(36) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY room_history_room_idx (room_id, created_at),
  CONSTRAINT room_history_room_fk FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE CASCADE,
  CONSTRAINT room_history_user_fk FOREIGN KEY (changed_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS private_files (
  id CHAR(36) NOT NULL,
  bucket ENUM('guest-documents','receipts') NOT NULL,
  path VARCHAR(400) NOT NULL,
  file_name VARCHAR(255) NOT NULL,
  mime_type ENUM('application/pdf','image/jpeg','image/png') NOT NULL,
  size_bytes INT UNSIGNED NOT NULL,
  file_data LONGBLOB NOT NULL,
  uploaded_by CHAR(36) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY private_files_path_unique (bucket, path),
  KEY private_files_uploaded_by_idx (uploaded_by),
  CONSTRAINT private_files_user_fk FOREIGN KEY (uploaded_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS audit_logs (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id CHAR(36) NULL,
  action VARCHAR(80) NOT NULL,
  table_name VARCHAR(80) NOT NULL,
  record_id VARCHAR(80) NULL,
  old_values JSON NULL,
  new_values JSON NULL,
  ip_address VARCHAR(64) NULL,
  user_agent VARCHAR(500) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY audit_user_idx (user_id, created_at),
  KEY audit_record_idx (table_name, record_id, created_at),
  KEY audit_created_idx (created_at),
  CONSTRAINT audit_user_fk FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE OR REPLACE VIEW reservation_overview AS
SELECT
  r.*,
  g.full_name AS guest_name,
  g.phone AS guest_phone,
  g.email AS guest_email,
  rm.room_number,
  rc.name AS category_name,
  COALESCE((SELECT SUM(p.amount) FROM payments p WHERE p.reservation_id = r.id AND p.status = 'received'), 0.00) AS amount_paid
FROM reservations r
JOIN guests g ON g.id = r.responsible_guest_id
JOIN rooms rm ON rm.id = r.room_id
JOIN room_categories rc ON rc.id = rm.category_id
WHERE r.deleted_at IS NULL;

CREATE OR REPLACE VIEW room_overview AS
SELECT
  rm.*,
  rc.name AS category_name,
  (
    SELECT g.full_name
    FROM reservations r
    JOIN guests g ON g.id = r.responsible_guest_id
    WHERE r.room_id = rm.id AND r.status = 'checked_in' AND r.deleted_at IS NULL
    ORDER BY r.check_in_at DESC LIMIT 1
  ) AS current_guest_name,
  (
    SELECT r.code FROM reservations r
    WHERE r.room_id = rm.id AND r.status IN ('pending','confirmed') AND r.check_in_at >= UTC_TIMESTAMP() AND r.deleted_at IS NULL
    ORDER BY r.check_in_at LIMIT 1
  ) AS next_reservation_code,
  (
    SELECT r.check_in_at FROM reservations r
    WHERE r.room_id = rm.id AND r.status IN ('pending','confirmed') AND r.check_in_at >= UTC_TIMESTAMP() AND r.deleted_at IS NULL
    ORDER BY r.check_in_at LIMIT 1
  ) AS next_check_in,
  (
    SELECT r.check_out_at FROM reservations r
    WHERE r.room_id = rm.id AND r.status IN ('pending','confirmed') AND r.check_in_at >= UTC_TIMESTAMP() AND r.deleted_at IS NULL
    ORDER BY r.check_in_at LIMIT 1
  ) AS expected_release_at
FROM rooms rm
JOIN room_categories rc ON rc.id = rm.category_id
WHERE rm.active = 1;

INSERT INTO room_categories (id, name, description, default_capacity, default_nightly_rate, active)
VALUES
  (UUID(), 'Standard', 'Conforto essencial para viagens rápidas e estadias a trabalho.', 2, 189.00, 1),
  (UUID(), 'Executivo', 'Mais espaço, estação de trabalho e comodidades ampliadas.', 2, 249.00, 1),
  (UUID(), 'Família', 'Configuração versátil para famílias e pequenos grupos.', 4, 329.00, 1)
ON DUPLICATE KEY UPDATE
  description = VALUES(description),
  default_capacity = VALUES(default_capacity),
  default_nightly_rate = VALUES(default_nightly_rate),
  active = 1;

INSERT IGNORE INTO rooms
  (id, room_number, category_id, floor, bed_type, bed_count, max_capacity, standard_nightly_rate, amenities, description)
SELECT UUID(), seed.room_number, category.id, seed.floor, seed.bed_type, seed.bed_count, seed.capacity, seed.rate, seed.amenities, seed.description
FROM (
  SELECT '101' room_number, 'Standard' category_name, 1 floor, 'Casal' bed_type, 1 bed_count, 2 capacity, 189.00 rate, '["Wi-Fi","Ar-condicionado","TV"]' amenities, 'Quarto acolhedor no primeiro andar.' description
  UNION ALL SELECT '102','Standard',1,'Solteiro',2,2,189.00,'["Wi-Fi","Ar-condicionado","TV"]','Duas camas de solteiro.'
  UNION ALL SELECT '103','Executivo',1,'Queen',1,2,249.00,'["Wi-Fi","Ar-condicionado","Smart TV","Frigobar"]','Quarto executivo com mesa de trabalho.'
  UNION ALL SELECT '104','Família',1,'Casal + solteiro',3,4,329.00,'["Wi-Fi","Ar-condicionado","Smart TV","Frigobar"]','Configuração confortável para famílias.'
  UNION ALL SELECT '201','Standard',2,'Casal',1,2,199.00,'["Wi-Fi","Ar-condicionado","TV"]','Quarto silencioso no segundo andar.'
  UNION ALL SELECT '202','Standard',2,'Solteiro',2,2,199.00,'["Wi-Fi","Ar-condicionado","TV"]','Duas camas de solteiro.'
  UNION ALL SELECT '203','Executivo',2,'Queen',1,2,259.00,'["Wi-Fi","Ar-condicionado","Smart TV","Frigobar"]','Executivo com vista para a cidade.'
  UNION ALL SELECT '204','Família',2,'Casal + solteiro',3,4,339.00,'["Wi-Fi","Ar-condicionado","Smart TV","Frigobar"]','Quarto amplo para famílias.'
  UNION ALL SELECT '301','Executivo',3,'Queen',1,2,269.00,'["Wi-Fi","Ar-condicionado","Smart TV","Frigobar"]','Executivo no andar superior.'
  UNION ALL SELECT '302','Executivo',3,'Queen',1,2,269.00,'["Wi-Fi","Ar-condicionado","Smart TV","Frigobar"]','Executivo no andar superior.'
  UNION ALL SELECT '303','Família',3,'Casal + solteiro',3,4,349.00,'["Wi-Fi","Ar-condicionado","Smart TV","Frigobar"]','Espaçoso e bem iluminado.'
  UNION ALL SELECT '304','Família',3,'Casal + solteiro',3,4,349.00,'["Wi-Fi","Ar-condicionado","Smart TV","Frigobar"]','Espaçoso e bem iluminado.'
) seed
JOIN room_categories category ON category.name = seed.category_name;
