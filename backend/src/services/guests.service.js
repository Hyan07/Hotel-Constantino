import { withConnection, withTransaction } from '../db/pool.js';
import { writeAudit } from '../db/repositories/audit.repository.js';
import { AppError } from '../utils/app-error.js';
import { normalizeDocument, validateDocument } from '../utils/documents.js';
import { paginationMeta, parsePagination } from '../utils/pagination.js';

function normalizeName(value) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/gu, '')
    .toLowerCase()
    .replace(/\s+/gu, ' ')
    .trim();
}

function mapGuest(row) {
  if (!row) return null;
  return { ...row, version: Number(row.version) };
}

export async function listGuests(query) {
  const pagination = parsePagination(query);
  const search = query.search?.trim();
  const conditions = ['deleted_at IS NULL'];
  const parameters = [];
  if (search) {
    conditions.push('(normalized_name LIKE ? OR email LIKE ? OR document_number = ?)');
    const normalized = normalizeName(search);
    parameters.push(`%${normalized}%`, `%${search.toLowerCase()}%`, normalizeDocument(search));
  }
  const where = conditions.join(' AND ');

  return withConnection(async (connection) => {
    const [[count]] = await connection.execute(
      `SELECT COUNT(*) AS total FROM guests WHERE ${where}`,
      parameters,
    );
    const [rows] = await connection.query(
      `SELECT id, full_name AS fullName, document_type AS documentType,
              document_number AS documentNumber, birth_date AS birthDate, email, phone,
              city, state_code AS stateCode, country_code AS countryCode, notes, version,
              created_at AS createdAt, updated_at AS updatedAt
         FROM guests
        WHERE ${where}
        ORDER BY full_name, id
        LIMIT ? OFFSET ?`,
      [...parameters, pagination.pageSize, pagination.offset],
    );
    return { data: rows.map(mapGuest), meta: paginationMeta(Number(count.total), pagination) };
  });
}

export async function getGuest(guestId, connection) {
  const runner = connection ?? (await import('../db/pool.js')).getPool();
  const [rows] = await runner.execute(
    `SELECT id, full_name AS fullName, document_type AS documentType,
            document_number AS documentNumber, birth_date AS birthDate, email, phone,
            city, state_code AS stateCode, country_code AS countryCode, notes, version,
            created_at AS createdAt, updated_at AS updatedAt
       FROM guests WHERE id = ? AND deleted_at IS NULL LIMIT 1`,
    [guestId],
  );
  return mapGuest(rows[0]);
}

export async function createGuest(input, actor) {
  const documentNumber = validateDocument(input.documentType, input.documentNumber);
  try {
    return await withTransaction(async (connection) => {
      const [result] = await connection.execute(
        `INSERT INTO guests
          (full_name, normalized_name, document_type, document_number, birth_date,
           email, phone, city, state_code, country_code, notes)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          input.fullName.trim(),
          normalizeName(input.fullName),
          input.documentType ?? null,
          documentNumber,
          input.birthDate ?? null,
          input.email?.toLowerCase() ?? null,
          input.phone ?? null,
          input.city ?? null,
          input.stateCode?.toUpperCase() ?? null,
          input.countryCode?.toUpperCase() ?? 'BR',
          input.notes ?? null,
        ],
      );
      await writeAudit(connection, {
        actorUserId: actor.userId,
        action: 'guest.created',
        entityType: 'guest',
        entityId: result.insertId,
        requestId: actor.requestId,
      });
      return getGuest(result.insertId, connection);
    });
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') {
      throw new AppError('Já existe um hóspede com este documento.', {
        statusCode: 409,
        code: 'DOCUMENT_CONFLICT',
      });
    }
    throw error;
  }
}

export async function updateGuest(guestId, input, actor) {
  return withTransaction(async (connection) => {
    const current = await getGuest(guestId, connection);
    if (!current)
      throw new AppError('Hóspede não encontrado.', { statusCode: 404, code: 'NOT_FOUND' });
    if (Number(input.version) !== current.version) {
      throw new AppError('O hóspede foi alterado por outra pessoa. Atualize os dados.', {
        statusCode: 409,
        code: 'VERSION_CONFLICT',
      });
    }

    const merged = { ...current, ...input };
    const documentNumber = validateDocument(merged.documentType, merged.documentNumber);
    try {
      const [result] = await connection.execute(
        `UPDATE guests
            SET full_name = ?, normalized_name = ?, document_type = ?, document_number = ?,
                birth_date = ?, email = ?, phone = ?, city = ?, state_code = ?,
                country_code = ?, notes = ?, version = version + 1
          WHERE id = ? AND version = ? AND deleted_at IS NULL`,
        [
          merged.fullName.trim(),
          normalizeName(merged.fullName),
          merged.documentType ?? null,
          documentNumber,
          merged.birthDate ?? null,
          merged.email?.toLowerCase() ?? null,
          merged.phone ?? null,
          merged.city ?? null,
          merged.stateCode?.toUpperCase() ?? null,
          merged.countryCode?.toUpperCase() ?? 'BR',
          merged.notes ?? null,
          guestId,
          input.version,
        ],
      );
      if (result.affectedRows !== 1) {
        throw new AppError('O hóspede foi alterado por outra pessoa.', {
          statusCode: 409,
          code: 'VERSION_CONFLICT',
        });
      }
    } catch (error) {
      if (error.code === 'ER_DUP_ENTRY') {
        throw new AppError('Já existe um hóspede com este documento.', {
          statusCode: 409,
          code: 'DOCUMENT_CONFLICT',
        });
      }
      throw error;
    }
    await writeAudit(connection, {
      actorUserId: actor.userId,
      action: 'guest.updated',
      entityType: 'guest',
      entityId: guestId,
      requestId: actor.requestId,
    });
    return getGuest(guestId, connection);
  });
}

export async function archiveGuest(guestId, version, actor) {
  return withTransaction(async (connection) => {
    const [[active]] = await connection.execute(
      `SELECT COUNT(*) AS total FROM reservations
        WHERE primary_guest_id = ? AND status IN ('pendente', 'confirmada', 'hospedada')`,
      [guestId],
    );
    if (Number(active.total) > 0) {
      throw new AppError('O hóspede possui reserva ou hospedagem ativa.', {
        statusCode: 409,
        code: 'GUEST_IN_USE',
      });
    }
    const [result] = await connection.execute(
      'UPDATE guests SET deleted_at = UTC_TIMESTAMP(3), version = version + 1 WHERE id = ? AND version = ? AND deleted_at IS NULL',
      [guestId, version],
    );
    if (result.affectedRows !== 1) {
      throw new AppError('Hóspede não encontrado ou alterado por outra pessoa.', {
        statusCode: 409,
        code: 'VERSION_CONFLICT',
      });
    }
    await writeAudit(connection, {
      actorUserId: actor.userId,
      action: 'guest.archived',
      entityType: 'guest',
      entityId: guestId,
      requestId: actor.requestId,
    });
  });
}
