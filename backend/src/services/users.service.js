import { withConnection, withTransaction } from '../db/pool.js';
import { getUserAccess } from '../db/repositories/auth.repository.js';
import { writeAudit } from '../db/repositories/audit.repository.js';
import { AppError } from '../utils/app-error.js';
import { paginationMeta, parsePagination } from '../utils/pagination.js';
import { hashPassword } from '../utils/password.js';

export async function listUsers(query) {
  const pagination = parsePagination(query);
  return withConnection(async (connection) => {
    const [[count]] = await connection.execute(
      'SELECT COUNT(*) AS total FROM users WHERE deleted_at IS NULL',
    );
    const [rows] = await connection.execute(
      `SELECT users.id, users.full_name AS fullName, users.email, users.status, users.version,
              users.last_login_at AS lastLoginAt, users.created_at AS createdAt,
              GROUP_CONCAT(DISTINCT roles.code ORDER BY roles.code) AS roleCodes
         FROM users
         LEFT JOIN user_roles ON user_roles.user_id = users.id
         LEFT JOIN roles ON roles.id = user_roles.role_id
        WHERE users.deleted_at IS NULL
        GROUP BY users.id
        ORDER BY users.full_name LIMIT ? OFFSET ?`,
      [pagination.pageSize, pagination.offset],
    );
    return {
      data: rows.map((row) => ({
        ...row,
        version: Number(row.version),
        roleCodes: row.roleCodes?.split(',') ?? [],
      })),
      meta: paginationMeta(Number(count.total), pagination),
    };
  });
}

export async function listRoles() {
  return withConnection(async (connection) => {
    const [rows] = await connection.execute(
      `SELECT roles.id, roles.code, roles.name, roles.description,
              GROUP_CONCAT(DISTINCT permissions.code ORDER BY permissions.code) AS permissions
         FROM roles
         LEFT JOIN role_permissions ON role_permissions.role_id = roles.id
         LEFT JOIN permissions ON permissions.id = role_permissions.permission_id
        GROUP BY roles.id ORDER BY roles.name`,
    );
    return rows.map((row) => ({ ...row, permissions: row.permissions?.split(',') ?? [] }));
  });
}

async function roleIds(connection, codes) {
  if (!codes.length) {
    throw new AppError('Selecione pelo menos um perfil.', {
      statusCode: 422,
      code: 'ROLE_REQUIRED',
    });
  }
  const placeholders = codes.map(() => '?').join(', ');
  const [roles] = await connection.execute(
    `SELECT id, code FROM roles WHERE code IN (${placeholders})`,
    codes,
  );
  if (roles.length !== new Set(codes).size) {
    throw new AppError('Um dos perfis informados não existe.', {
      statusCode: 422,
      code: 'INVALID_ROLE',
    });
  }
  return roles;
}

export async function createUser(input, actor) {
  try {
    return await withTransaction(async (connection) => {
      const roles = await roleIds(connection, input.roleCodes);
      const passwordHash = await hashPassword(input.password);
      const [result] = await connection.execute(
        `INSERT INTO users (full_name, email, password_hash, status)
         VALUES (?, ?, ?, 'active')`,
        [input.fullName.trim(), input.email.trim().toLowerCase(), passwordHash],
      );
      for (const role of roles) {
        await connection.execute('INSERT INTO user_roles (user_id, role_id) VALUES (?, ?)', [
          result.insertId,
          role.id,
        ]);
      }
      await writeAudit(connection, {
        actorUserId: actor.userId,
        action: 'user.created',
        entityType: 'user',
        entityId: result.insertId,
        requestId: actor.requestId,
        context: { roleCodes: roles.map((role) => role.code) },
      });
      return getUserAccess(connection, result.insertId);
    });
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') {
      throw new AppError('Já existe um usuário com este e-mail.', {
        statusCode: 409,
        code: 'EMAIL_CONFLICT',
      });
    }
    throw error;
  }
}

export async function updateUser(userId, input, actor) {
  return withTransaction(async (connection) => {
    const [[current]] = await connection.execute(
      'SELECT id, version FROM users WHERE id = ? AND deleted_at IS NULL FOR UPDATE',
      [userId],
    );
    if (!current)
      throw new AppError('Usuário não encontrado.', { statusCode: 404, code: 'NOT_FOUND' });
    if (Number(current.version) !== input.version) {
      throw new AppError('O usuário foi alterado por outra pessoa.', {
        statusCode: 409,
        code: 'VERSION_CONFLICT',
      });
    }
    const roles = await roleIds(connection, input.roleCodes);
    const [currentAdmin] = await connection.execute(
      `SELECT 1 FROM user_roles JOIN roles ON roles.id = user_roles.role_id
        WHERE user_roles.user_id = ? AND roles.code = 'administrador' LIMIT 1`,
      [userId],
    );
    const willBeAdmin = roles.some((role) => role.code === 'administrador');
    if (currentAdmin[0] && (!willBeAdmin || input.status !== 'active')) {
      const [[otherAdmins]] = await connection.execute(
        `SELECT COUNT(DISTINCT users.id) AS total
           FROM users
           JOIN user_roles ON user_roles.user_id = users.id
           JOIN roles ON roles.id = user_roles.role_id
          WHERE roles.code = 'administrador' AND users.status = 'active'
            AND users.deleted_at IS NULL AND users.id <> ?`,
        [userId],
      );
      if (Number(otherAdmins.total) === 0) {
        throw new AppError('Não é possível remover ou desativar o último administrador.', {
          statusCode: 409,
          code: 'LAST_ADMIN_PROTECTED',
        });
      }
    }
    const passwordHash = input.password ? await hashPassword(input.password) : null;
    await connection.execute(
      `UPDATE users
          SET full_name = ?, status = ?, password_hash = COALESCE(?, password_hash),
              version = version + 1
        WHERE id = ? AND version = ?`,
      [input.fullName.trim(), input.status, passwordHash, userId, input.version],
    );
    await connection.execute('DELETE FROM user_roles WHERE user_id = ?', [userId]);
    for (const role of roles) {
      await connection.execute('INSERT INTO user_roles (user_id, role_id) VALUES (?, ?)', [
        userId,
        role.id,
      ]);
    }
    if (input.status !== 'active')
      await connection.execute('DELETE FROM sessions WHERE user_id = ?', [userId]);
    await writeAudit(connection, {
      actorUserId: actor.userId,
      action: 'user.updated',
      entityType: 'user',
      entityId: userId,
      requestId: actor.requestId,
      context: { roleCodes: roles.map((role) => role.code) },
    });
    return getUserAccess(connection, userId);
  });
}

export async function listAuditLogs(query) {
  const pagination = parsePagination(query);
  const conditions = [];
  const parameters = [];
  if (query.entityType) {
    conditions.push('audit_logs.entity_type = ?');
    parameters.push(query.entityType);
  }
  if (query.action) {
    conditions.push('audit_logs.action = ?');
    parameters.push(query.action);
  }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  return withConnection(async (connection) => {
    const [[count]] = await connection.execute(
      `SELECT COUNT(*) AS total FROM audit_logs ${where}`,
      parameters,
    );
    const [rows] = await connection.execute(
      `SELECT audit_logs.id, audit_logs.actor_user_id AS actorUserId,
              users.full_name AS actorName, audit_logs.action,
              audit_logs.entity_type AS entityType, audit_logs.entity_id AS entityId,
              audit_logs.request_id AS requestId, audit_logs.context,
              audit_logs.created_at AS createdAt
         FROM audit_logs LEFT JOIN users ON users.id = audit_logs.actor_user_id
         ${where} ORDER BY audit_logs.created_at DESC, audit_logs.id DESC
        LIMIT ? OFFSET ?`,
      [...parameters, pagination.pageSize, pagination.offset],
    );
    return { data: rows, meta: paginationMeta(Number(count.total), pagination) };
  });
}
