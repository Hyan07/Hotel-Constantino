import { withConnection, withTransaction } from '../db/pool.js';
import { writeAudit } from '../db/repositories/audit.repository.js';
import { AppError } from '../utils/app-error.js';
import { paginationMeta, parsePagination } from '../utils/pagination.js';

export const roomTransitions = Object.freeze({
  disponivel: new Set(['bloqueado', 'manutencao']),
  bloqueado: new Set(['disponivel', 'manutencao']),
  manutencao: new Set(['aguardando_limpeza']),
  aguardando_limpeza: new Set(['em_limpeza']),
  em_limpeza: new Set(['disponivel']),
  ocupado: new Set(),
});

function mapRoom(row) {
  if (!row) return null;
  return {
    ...row,
    capacity: Number(row.capacity),
    baseRateCents: Number(row.baseRateCents),
    version: Number(row.version),
  };
}

export async function listRooms(query) {
  const pagination = parsePagination(query);
  const conditions = ['deleted_at IS NULL'];
  const parameters = [];
  if (query.status) {
    conditions.push('status = ?');
    parameters.push(query.status);
  }
  if (query.category) {
    conditions.push('category = ?');
    parameters.push(query.category);
  }
  const where = conditions.join(' AND ');
  return withConnection(async (connection) => {
    const [[count]] = await connection.execute(
      `SELECT COUNT(*) AS total FROM rooms WHERE ${where}`,
      parameters,
    );
    const [rows] = await connection.query(
      `SELECT id, room_number AS roomNumber, category, floor, capacity,
              base_rate_cents AS baseRateCents, status, amenities, notes, version,
              created_at AS createdAt, updated_at AS updatedAt
         FROM rooms WHERE ${where}
        ORDER BY floor, room_number LIMIT ? OFFSET ?`,
      [...parameters, pagination.pageSize, pagination.offset],
    );
    return { data: rows.map(mapRoom), meta: paginationMeta(Number(count.total), pagination) };
  });
}

export async function getRoom(roomId, connection) {
  const runner = connection ?? (await import('../db/pool.js')).getPool();
  const [rows] = await runner.execute(
    `SELECT id, room_number AS roomNumber, category, floor, capacity,
            base_rate_cents AS baseRateCents, status, amenities, notes, version,
            created_at AS createdAt, updated_at AS updatedAt
       FROM rooms WHERE id = ? AND deleted_at IS NULL LIMIT 1`,
    [roomId],
  );
  return mapRoom(rows[0]);
}

export async function createRoom(input, actor) {
  try {
    return await withTransaction(async (connection) => {
      const [result] = await connection.execute(
        `INSERT INTO rooms
          (room_number, category, floor, capacity, base_rate_cents, status, amenities, notes)
         VALUES (?, ?, ?, ?, ?, 'disponivel', ?, ?)`,
        [
          input.roomNumber,
          input.category,
          input.floor,
          input.capacity,
          input.baseRateCents,
          JSON.stringify(input.amenities ?? []),
          input.notes ?? null,
        ],
      );
      await writeAudit(connection, {
        actorUserId: actor.userId,
        action: 'room.created',
        entityType: 'room',
        entityId: result.insertId,
        requestId: actor.requestId,
      });
      return getRoom(result.insertId, connection);
    });
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') {
      throw new AppError('Já existe um quarto com este número.', {
        statusCode: 409,
        code: 'ROOM_NUMBER_CONFLICT',
      });
    }
    throw error;
  }
}

export async function updateRoom(roomId, input, actor) {
  return withTransaction(async (connection) => {
    const [result] = await connection.execute(
      `UPDATE rooms
          SET category = ?, floor = ?, capacity = ?, base_rate_cents = ?,
              amenities = ?, notes = ?, version = version + 1
        WHERE id = ? AND version = ? AND deleted_at IS NULL`,
      [
        input.category,
        input.floor,
        input.capacity,
        input.baseRateCents,
        JSON.stringify(input.amenities ?? []),
        input.notes ?? null,
        roomId,
        input.version,
      ],
    );
    if (result.affectedRows !== 1) {
      throw new AppError('O quarto foi alterado por outra pessoa.', {
        statusCode: 409,
        code: 'VERSION_CONFLICT',
      });
    }
    await writeAudit(connection, {
      actorUserId: actor.userId,
      action: 'room.updated',
      entityType: 'room',
      entityId: roomId,
      requestId: actor.requestId,
    });
    return getRoom(roomId, connection);
  });
}

export async function changeRoomStatus(roomId, input, actor) {
  return withTransaction(async (connection) => {
    const [[room]] = await connection.execute(
      'SELECT id, status, version FROM rooms WHERE id = ? AND deleted_at IS NULL FOR UPDATE',
      [roomId],
    );
    if (!room) throw new AppError('Quarto não encontrado.', { statusCode: 404, code: 'NOT_FOUND' });
    if (Number(room.version) !== input.version) {
      throw new AppError('O quarto foi alterado por outra pessoa.', {
        statusCode: 409,
        code: 'VERSION_CONFLICT',
      });
    }
    if (!roomTransitions[room.status]?.has(input.status)) {
      throw new AppError(`Não é permitido mudar de ${room.status} para ${input.status}.`, {
        statusCode: 409,
        code: 'INVALID_STATUS_TRANSITION',
      });
    }
    await connection.execute(
      'UPDATE rooms SET status = ?, version = version + 1 WHERE id = ? AND version = ?',
      [input.status, roomId, input.version],
    );
    await connection.execute(
      `INSERT INTO room_status_history (room_id, from_status, to_status, reason, changed_by)
       VALUES (?, ?, ?, ?, ?)`,
      [roomId, room.status, input.status, input.reason ?? null, actor.userId],
    );
    await writeAudit(connection, {
      actorUserId: actor.userId,
      action: 'room.status_changed',
      entityType: 'room',
      entityId: roomId,
      requestId: actor.requestId,
      context: { fromStatus: room.status, toStatus: input.status, reason: input.reason },
    });
    return getRoom(roomId, connection);
  });
}
