CREATE TABLE IF NOT EXISTS users (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  full_name VARCHAR(160) NOT NULL,
  email VARCHAR(254) NOT NULL,
  password_hash VARCHAR(512) NULL,
  status ENUM('active', 'inactive', 'locked') NOT NULL DEFAULT 'active',
  failed_login_attempts SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  locked_until DATETIME(3) NULL,
  last_login_at DATETIME(3) NULL,
  version INT UNSIGNED NOT NULL DEFAULT 1,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  deleted_at DATETIME(3) NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_users_email (email),
  KEY idx_users_status (status, deleted_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
;

CREATE TABLE IF NOT EXISTS roles (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  code VARCHAR(64) NOT NULL,
  name VARCHAR(100) NOT NULL,
  description VARCHAR(255) NULL,
  is_system BOOLEAN NOT NULL DEFAULT FALSE,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_roles_code (code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
;

CREATE TABLE IF NOT EXISTS permissions (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  code VARCHAR(100) NOT NULL,
  description VARCHAR(255) NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_permissions_code (code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
;

CREATE TABLE IF NOT EXISTS user_roles (
  user_id BIGINT UNSIGNED NOT NULL,
  role_id BIGINT UNSIGNED NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (user_id, role_id),
  CONSTRAINT fk_user_roles_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
  CONSTRAINT fk_user_roles_role FOREIGN KEY (role_id) REFERENCES roles (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
;

CREATE TABLE IF NOT EXISTS role_permissions (
  role_id BIGINT UNSIGNED NOT NULL,
  permission_id BIGINT UNSIGNED NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (role_id, permission_id),
  CONSTRAINT fk_role_permissions_role FOREIGN KEY (role_id) REFERENCES roles (id) ON DELETE CASCADE,
  CONSTRAINT fk_role_permissions_permission FOREIGN KEY (permission_id) REFERENCES permissions (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
;

CREATE TABLE IF NOT EXISTS sessions (
  id_hash CHAR(64) NOT NULL,
  user_id BIGINT UNSIGNED NOT NULL,
  csrf_hash CHAR(64) NOT NULL,
  expires_at DATETIME(3) NOT NULL,
  last_seen_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id_hash),
  KEY idx_sessions_user (user_id),
  KEY idx_sessions_expiry (expires_at),
  CONSTRAINT fk_sessions_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
;

CREATE TABLE IF NOT EXISTS guests (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  full_name VARCHAR(180) NOT NULL,
  normalized_name VARCHAR(180) NOT NULL,
  document_type ENUM('cpf', 'passport', 'other') NULL,
  document_number VARCHAR(40) NULL,
  birth_date DATE NULL,
  email VARCHAR(254) NULL,
  phone VARCHAR(32) NULL,
  city VARCHAR(120) NULL,
  state_code CHAR(2) NULL,
  country_code CHAR(2) NOT NULL DEFAULT 'BR',
  notes VARCHAR(1000) NULL,
  version INT UNSIGNED NOT NULL DEFAULT 1,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  deleted_at DATETIME(3) NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_guests_document (document_type, document_number),
  KEY idx_guests_name (normalized_name),
  KEY idx_guests_email (email),
  KEY idx_guests_active (deleted_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
;

CREATE TABLE IF NOT EXISTS rooms (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  room_number VARCHAR(20) NOT NULL,
  category VARCHAR(80) NOT NULL,
  floor SMALLINT NOT NULL,
  capacity SMALLINT UNSIGNED NOT NULL,
  base_rate_cents BIGINT UNSIGNED NOT NULL,
  status ENUM('disponivel', 'ocupado', 'aguardando_limpeza', 'em_limpeza', 'manutencao', 'bloqueado') NOT NULL DEFAULT 'disponivel',
  amenities JSON NULL,
  notes VARCHAR(1000) NULL,
  version INT UNSIGNED NOT NULL DEFAULT 1,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  deleted_at DATETIME(3) NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_rooms_number (room_number),
  KEY idx_rooms_status (status, deleted_at),
  KEY idx_rooms_category (category)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
;

CREATE TABLE IF NOT EXISTS room_status_history (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  room_id BIGINT UNSIGNED NOT NULL,
  from_status VARCHAR(32) NULL,
  to_status VARCHAR(32) NOT NULL,
  reason VARCHAR(500) NULL,
  changed_by BIGINT UNSIGNED NULL,
  changed_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY idx_room_history_room_date (room_id, changed_at),
  CONSTRAINT fk_room_history_room FOREIGN KEY (room_id) REFERENCES rooms (id) ON DELETE RESTRICT,
  CONSTRAINT fk_room_history_user FOREIGN KEY (changed_by) REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
;

CREATE TABLE IF NOT EXISTS reservations (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  code VARCHAR(32) NOT NULL,
  primary_guest_id BIGINT UNSIGNED NOT NULL,
  room_id BIGINT UNSIGNED NOT NULL,
  check_in_date DATE NOT NULL,
  check_out_date DATE NOT NULL,
  adults SMALLINT UNSIGNED NOT NULL DEFAULT 1,
  children SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  status ENUM('pendente', 'confirmada', 'hospedada', 'concluida', 'cancelada', 'no_show') NOT NULL DEFAULT 'pendente',
  nightly_rate_cents BIGINT UNSIGNED NOT NULL,
  discount_cents BIGINT UNSIGNED NOT NULL DEFAULT 0,
  total_cents BIGINT UNSIGNED NOT NULL,
  source VARCHAR(80) NULL,
  notes VARCHAR(1000) NULL,
  cancellation_reason VARCHAR(500) NULL,
  version INT UNSIGNED NOT NULL DEFAULT 1,
  created_by BIGINT UNSIGNED NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  canceled_at DATETIME(3) NULL,
  deleted_at DATETIME(3) NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_reservations_code (code),
  KEY idx_reservations_room_dates (room_id, check_in_date, check_out_date, status),
  KEY idx_reservations_guest (primary_guest_id),
  KEY idx_reservations_status_dates (status, check_in_date, check_out_date),
  CONSTRAINT chk_reservation_dates CHECK (check_out_date > check_in_date),
  CONSTRAINT fk_reservations_guest FOREIGN KEY (primary_guest_id) REFERENCES guests (id) ON DELETE RESTRICT,
  CONSTRAINT fk_reservations_room FOREIGN KEY (room_id) REFERENCES rooms (id) ON DELETE RESTRICT,
  CONSTRAINT fk_reservations_user FOREIGN KEY (created_by) REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
;

CREATE TABLE IF NOT EXISTS reservation_guests (
  reservation_id BIGINT UNSIGNED NOT NULL,
  guest_id BIGINT UNSIGNED NOT NULL,
  is_primary BOOLEAN NOT NULL DEFAULT FALSE,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (reservation_id, guest_id),
  CONSTRAINT fk_reservation_guests_reservation FOREIGN KEY (reservation_id) REFERENCES reservations (id) ON DELETE CASCADE,
  CONSTRAINT fk_reservation_guests_guest FOREIGN KEY (guest_id) REFERENCES guests (id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
;

CREATE TABLE IF NOT EXISTS stays (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  reservation_id BIGINT UNSIGNED NOT NULL,
  room_id BIGINT UNSIGNED NOT NULL,
  status ENUM('ativa', 'concluida') NOT NULL DEFAULT 'ativa',
  checked_in_at DATETIME(3) NOT NULL,
  expected_checkout_date DATE NOT NULL,
  checked_out_at DATETIME(3) NULL,
  accommodation_cents BIGINT UNSIGNED NOT NULL DEFAULT 0,
  charges_cents BIGINT UNSIGNED NOT NULL DEFAULT 0,
  discount_cents BIGINT UNSIGNED NOT NULL DEFAULT 0,
  total_cents BIGINT UNSIGNED NOT NULL DEFAULT 0,
  paid_cents BIGINT UNSIGNED NOT NULL DEFAULT 0,
  balance_cents BIGINT NOT NULL DEFAULT 0,
  notes VARCHAR(1000) NULL,
  version INT UNSIGNED NOT NULL DEFAULT 1,
  created_by BIGINT UNSIGNED NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_stays_reservation (reservation_id),
  KEY idx_stays_room_status (room_id, status),
  KEY idx_stays_status_checkout (status, expected_checkout_date),
  CONSTRAINT fk_stays_reservation FOREIGN KEY (reservation_id) REFERENCES reservations (id) ON DELETE RESTRICT,
  CONSTRAINT fk_stays_room FOREIGN KEY (room_id) REFERENCES rooms (id) ON DELETE RESTRICT,
  CONSTRAINT fk_stays_user FOREIGN KEY (created_by) REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
;

CREATE TABLE IF NOT EXISTS stay_guests (
  stay_id BIGINT UNSIGNED NOT NULL,
  guest_id BIGINT UNSIGNED NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (stay_id, guest_id),
  CONSTRAINT fk_stay_guests_stay FOREIGN KEY (stay_id) REFERENCES stays (id) ON DELETE CASCADE,
  CONSTRAINT fk_stay_guests_guest FOREIGN KEY (guest_id) REFERENCES guests (id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
;

CREATE TABLE IF NOT EXISTS charges (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  stay_id BIGINT UNSIGNED NOT NULL,
  category VARCHAR(80) NOT NULL,
  description VARCHAR(255) NOT NULL,
  quantity SMALLINT UNSIGNED NOT NULL DEFAULT 1,
  unit_amount_cents BIGINT UNSIGNED NOT NULL,
  total_cents BIGINT UNSIGNED NOT NULL,
  occurred_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  created_by BIGINT UNSIGNED NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  voided_at DATETIME(3) NULL,
  PRIMARY KEY (id),
  KEY idx_charges_stay (stay_id, voided_at),
  KEY idx_charges_occurred (occurred_at),
  CONSTRAINT fk_charges_stay FOREIGN KEY (stay_id) REFERENCES stays (id) ON DELETE RESTRICT,
  CONSTRAINT fk_charges_user FOREIGN KEY (created_by) REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
;

CREATE TABLE IF NOT EXISTS payments (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  stay_id BIGINT UNSIGNED NOT NULL,
  amount_cents BIGINT UNSIGNED NOT NULL,
  method ENUM('dinheiro', 'pix', 'credito', 'debito', 'transferencia', 'outro') NOT NULL,
  reference VARCHAR(120) NULL,
  idempotency_key_hash CHAR(64) NOT NULL,
  status ENUM('confirmado', 'estornado') NOT NULL DEFAULT 'confirmado',
  received_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  created_by BIGINT UNSIGNED NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  reversed_at DATETIME(3) NULL,
  version INT UNSIGNED NOT NULL DEFAULT 1,
  PRIMARY KEY (id),
  UNIQUE KEY uq_payments_idempotency (idempotency_key_hash),
  KEY idx_payments_stay_status (stay_id, status),
  KEY idx_payments_received (received_at),
  CONSTRAINT fk_payments_stay FOREIGN KEY (stay_id) REFERENCES stays (id) ON DELETE RESTRICT,
  CONSTRAINT fk_payments_user FOREIGN KEY (created_by) REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
;

CREATE TABLE IF NOT EXISTS financial_entries (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  direction ENUM('entrada', 'saida') NOT NULL,
  category VARCHAR(80) NOT NULL,
  description VARCHAR(255) NOT NULL,
  amount_cents BIGINT UNSIGNED NOT NULL,
  occurred_on DATE NOT NULL,
  stay_id BIGINT UNSIGNED NULL,
  payment_id BIGINT UNSIGNED NULL,
  status ENUM('lancado', 'estornado') NOT NULL DEFAULT 'lancado',
  created_by BIGINT UNSIGNED NULL,
  version INT UNSIGNED NOT NULL DEFAULT 1,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  reversed_at DATETIME(3) NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_finance_payment (payment_id),
  KEY idx_finance_date_direction (occurred_on, direction, status),
  KEY idx_finance_stay (stay_id),
  CONSTRAINT fk_finance_stay FOREIGN KEY (stay_id) REFERENCES stays (id) ON DELETE RESTRICT,
  CONSTRAINT fk_finance_payment FOREIGN KEY (payment_id) REFERENCES payments (id) ON DELETE RESTRICT,
  CONSTRAINT fk_finance_user FOREIGN KEY (created_by) REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
;

CREATE TABLE IF NOT EXISTS housekeeping_tasks (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  room_id BIGINT UNSIGNED NOT NULL,
  task_type ENUM('limpeza', 'manutencao') NOT NULL,
  status ENUM('pendente', 'em_andamento', 'concluida', 'cancelada') NOT NULL DEFAULT 'pendente',
  priority ENUM('baixa', 'normal', 'alta', 'urgente') NOT NULL DEFAULT 'normal',
  notes VARCHAR(1000) NULL,
  assigned_to BIGINT UNSIGNED NULL,
  created_by BIGINT UNSIGNED NULL,
  started_at DATETIME(3) NULL,
  completed_at DATETIME(3) NULL,
  version INT UNSIGNED NOT NULL DEFAULT 1,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY idx_housekeeping_status (status, priority, created_at),
  KEY idx_housekeeping_room (room_id, status),
  CONSTRAINT fk_housekeeping_room FOREIGN KEY (room_id) REFERENCES rooms (id) ON DELETE RESTRICT,
  CONSTRAINT fk_housekeeping_assignee FOREIGN KEY (assigned_to) REFERENCES users (id) ON DELETE SET NULL,
  CONSTRAINT fk_housekeeping_creator FOREIGN KEY (created_by) REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
;

CREATE TABLE IF NOT EXISTS idempotency_keys (
  key_hash CHAR(64) NOT NULL,
  scope VARCHAR(80) NOT NULL,
  user_id BIGINT UNSIGNED NOT NULL,
  request_hash CHAR(64) NOT NULL,
  response_status SMALLINT UNSIGNED NULL,
  response_body JSON NULL,
  locked_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  expires_at DATETIME(3) NOT NULL,
  completed_at DATETIME(3) NULL,
  PRIMARY KEY (key_hash, scope, user_id),
  KEY idx_idempotency_expiry (expires_at),
  CONSTRAINT fk_idempotency_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
;

CREATE TABLE IF NOT EXISTS audit_logs (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  actor_user_id BIGINT UNSIGNED NULL,
  action VARCHAR(100) NOT NULL,
  entity_type VARCHAR(80) NOT NULL,
  entity_id VARCHAR(80) NULL,
  request_id VARCHAR(80) NULL,
  context JSON NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY idx_audit_entity (entity_type, entity_id, created_at),
  KEY idx_audit_actor (actor_user_id, created_at),
  KEY idx_audit_action_date (action, created_at),
  CONSTRAINT fk_audit_actor FOREIGN KEY (actor_user_id) REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
;
