INSERT INTO roles (code, name, description, is_system)
VALUES
  ('administrador', 'Administrador', 'Acesso integral ao sistema e às configurações.', TRUE),
  ('funcionario', 'Funcionário', 'Acesso às rotinas operacionais autorizadas.', TRUE)
ON DUPLICATE KEY UPDATE name = VALUES(name), description = VALUES(description)
;

INSERT INTO permissions (code, description)
VALUES
  ('dashboard.read', 'Consultar a visão geral operacional'),
  ('guests.read', 'Consultar hóspedes'),
  ('guests.write', 'Cadastrar e atualizar hóspedes'),
  ('rooms.read', 'Consultar quartos'),
  ('rooms.write', 'Atualizar inventário e situação dos quartos'),
  ('reservations.read', 'Consultar reservas'),
  ('reservations.write', 'Criar e atualizar reservas'),
  ('reservations.cancel', 'Cancelar reservas e registrar no-show'),
  ('stays.read', 'Consultar hospedagens'),
  ('stays.checkin', 'Realizar check-in'),
  ('stays.checkout', 'Realizar checkout'),
  ('charges.write', 'Registrar consumos'),
  ('payments.write', 'Registrar pagamentos'),
  ('housekeeping.read', 'Consultar limpeza e manutenção'),
  ('housekeeping.write', 'Executar rotinas de limpeza e manutenção'),
  ('finance.read', 'Consultar financeiro'),
  ('finance.write', 'Registrar entradas e saídas'),
  ('reports.read', 'Consultar relatórios'),
  ('users.read', 'Consultar usuários e permissões'),
  ('users.write', 'Administrar usuários e permissões'),
  ('audit.read', 'Consultar auditoria')
ON DUPLICATE KEY UPDATE description = VALUES(description)
;

INSERT IGNORE INTO role_permissions (role_id, permission_id)
SELECT roles.id, permissions.id
  FROM roles
 CROSS JOIN permissions
 WHERE roles.code = 'administrador'
;

INSERT IGNORE INTO role_permissions (role_id, permission_id)
SELECT roles.id, permissions.id
  FROM roles
  JOIN permissions ON permissions.code IN (
    'dashboard.read',
    'guests.read',
    'guests.write',
    'rooms.read',
    'reservations.read',
    'reservations.write',
    'stays.read',
    'stays.checkin',
    'stays.checkout',
    'charges.write',
    'payments.write',
    'housekeeping.read',
    'housekeeping.write',
    'reports.read'
  )
 WHERE roles.code = 'funcionario'
;
