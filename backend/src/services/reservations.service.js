import { randomBytes } from 'node:crypto';
import { withConnection, withTransaction } from '../db/pool.js';
import { writeAudit } from '../db/repositories/audit.repository.js';
import { AppError } from '../utils/app-error.js';
import { nightsBetween } from '../utils/dates.js';
import { paginationMeta, parsePagination } from '../utils/pagination.js';
import { beginIdempotentOperation, completeIdempotentOperation } from './idempotency.service.js';

const activeReservationStatuses = ['pendente', 'confirmada', 'hospedada'];

function mapReservation(row) {
  if (!row) return null;
  return {
    ...row,
    adults: Number(row.adults),
    children: Number(row.children),
    nightlyRateCents: Number(row.nightlyRateCents),
    discountCents: Number(row.discountCents),
    totalCents: Number(row.totalCents),
    version: Number(row.version),
  };
}

function generateReservationCode() {
  const date = new Date().toISOString().slice(0, 10).replaceAll('-', '');
  return `CH-${date}-${randomBytes(4).toString('hex').toUpperCase()}`;
}

async function reservationRow(connection, reservationId, lock = false) {
  const [rows] = await connection.execute(
    `SELECT reservations.id, reservations.code,
            reservations.primary_guest_id AS primaryGuestId, guests.full_name AS primaryGuestName,
            reservations.room_id AS roomId, rooms.room_number AS roomNumber,
            reservations.check_in_date AS checkInDate, reservations.check_out_date AS checkOutDate,
            reservations.adults, reservations.children, reservations.status,
            reservations.nightly_rate_cents AS nightlyRateCents,
            reservations.discount_cents AS discountCents, reservations.total_cents AS totalCents,
            reservations.source, reservations.notes, reservations.cancellation_reason AS cancellationReason,
            reservations.version, reservations.created_at AS createdAt, reservations.updated_at AS updatedAt
       FROM reservations
       JOIN guests ON guests.id = reservations.primary_guest_id
       JOIN rooms ON rooms.id = reservations.room_id
      WHERE reservations.id = ? AND reservations.deleted_at IS NULL
      LIMIT 1${lock ? ' FOR UPDATE' : ''}`,
    [reservationId],
  );
  return mapReservation(rows[0]);
}

export async function getReservation(reservationId, connection) {
  if (connection) return reservationRow(connection, reservationId);
  return withConnection((activeConnection) => reservationRow(activeConnection, reservationId));
}

export async function listReservations(query) {
  const pagination = parsePagination(query);
  const conditions = ['reservations.deleted_at IS NULL'];
  const parameters = [];
  if (query.status) {
    conditions.push('reservations.status = ?');
    parameters.push(query.status);
  }
  if (query.roomId) {
    conditions.push('reservations.room_id = ?');
    parameters.push(Number(query.roomId));
  }
  if (query.from) {
    conditions.push('reservations.check_out_date > ?');
    parameters.push(query.from);
  }
  if (query.to) {
    conditions.push('reservations.check_in_date < ?');
    parameters.push(query.to);
  }
  if (query.search) {
    conditions.push('(reservations.code LIKE ? OR guests.normalized_name LIKE ?)');
    parameters.push(`%${query.search}%`, `%${query.search.toLowerCase()}%`);
  }
  const where = conditions.join(' AND ');
  return withConnection(async (connection) => {
    const [[count]] = await connection.execute(
      `SELECT COUNT(*) AS total
         FROM reservations JOIN guests ON guests.id = reservations.primary_guest_id
        WHERE ${where}`,
      parameters,
    );
    const [rows] = await connection.execute(
      `SELECT reservations.id, reservations.code,
              reservations.primary_guest_id AS primaryGuestId, guests.full_name AS primaryGuestName,
              reservations.room_id AS roomId, rooms.room_number AS roomNumber,
              reservations.check_in_date AS checkInDate, reservations.check_out_date AS checkOutDate,
              reservations.adults, reservations.children, reservations.status,
              reservations.nightly_rate_cents AS nightlyRateCents,
              reservations.discount_cents AS discountCents, reservations.total_cents AS totalCents,
              reservations.source, reservations.notes, reservations.cancellation_reason AS cancellationReason,
              reservations.version, reservations.created_at AS createdAt, reservations.updated_at AS updatedAt
         FROM reservations
         JOIN guests ON guests.id = reservations.primary_guest_id
         JOIN rooms ON rooms.id = reservations.room_id
        WHERE ${where}
        ORDER BY reservations.check_in_date, rooms.room_number
        LIMIT ? OFFSET ?`,
      [...parameters, pagination.pageSize, pagination.offset],
    );
    return {
      data: rows.map(mapReservation),
      meta: paginationMeta(Number(count.total), pagination),
    };
  });
}

export async function ensureRoomAvailability(
  connection,
  { roomId, checkInDate, checkOutDate, adults, children, excludeReservationId = 0 },
) {
  const [[room]] = await connection.execute(
    `SELECT id, room_number AS roomNumber, capacity, base_rate_cents AS baseRateCents,
            status, deleted_at AS deletedAt
       FROM rooms WHERE id = ? FOR UPDATE`,
    [roomId],
  );
  if (!room || room.deletedAt) {
    throw new AppError('Quarto não encontrado.', { statusCode: 404, code: 'ROOM_NOT_FOUND' });
  }
  if (Number(adults) + Number(children) > Number(room.capacity)) {
    throw new AppError('A quantidade de hóspedes excede a capacidade do quarto.', {
      statusCode: 422,
      code: 'ROOM_CAPACITY_EXCEEDED',
    });
  }
  const [conflicts] = await connection.execute(
    `SELECT id, code FROM reservations
      WHERE room_id = ? AND id <> ? AND deleted_at IS NULL
        AND status IN (?, ?, ?)
        AND check_in_date < ? AND check_out_date > ?
      LIMIT 1`,
    [roomId, excludeReservationId, ...activeReservationStatuses, checkOutDate, checkInDate],
  );
  if (conflicts[0]) {
    throw new AppError('O quarto já possui uma reserva ativa nesse período.', {
      statusCode: 409,
      code: 'RESERVATION_OVERLAP',
    });
  }
  return room;
}

export async function createReservation(input, actor, idempotencyKey) {
  return withTransaction(async (connection) => {
    const idempotency = await beginIdempotentOperation(connection, {
      key: idempotencyKey,
      scope: 'reservation.create',
      userId: actor.userId,
      payload: input,
    });
    if (idempotency.replay) return { ...idempotency.body, replay: true };

    const nights = nightsBetween(input.checkInDate, input.checkOutDate);
    const room = await ensureRoomAvailability(connection, input);
    const [[guest]] = await connection.execute(
      'SELECT id FROM guests WHERE id = ? AND deleted_at IS NULL',
      [input.primaryGuestId],
    );
    if (!guest)
      throw new AppError('Hóspede não encontrado.', { statusCode: 404, code: 'GUEST_NOT_FOUND' });

    const discountCents = input.discountCents ?? 0;
    const subtotal = nights * Number(room.baseRateCents);
    if (discountCents > subtotal) {
      throw new AppError('O desconto não pode superar o valor das diárias.', {
        statusCode: 422,
        code: 'INVALID_DISCOUNT',
      });
    }
    const code = generateReservationCode();
    const [result] = await connection.execute(
      `INSERT INTO reservations
        (code, primary_guest_id, room_id, check_in_date, check_out_date, adults, children,
         status, nightly_rate_cents, discount_cents, total_cents, source, notes, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'pendente', ?, ?, ?, ?, ?, ?)`,
      [
        code,
        input.primaryGuestId,
        input.roomId,
        input.checkInDate,
        input.checkOutDate,
        input.adults,
        input.children,
        room.baseRateCents,
        discountCents,
        subtotal - discountCents,
        input.source ?? null,
        input.notes ?? null,
        actor.userId,
      ],
    );
    const guestIds = [...new Set([input.primaryGuestId, ...(input.guestIds ?? [])])];
    for (const guestId of guestIds) {
      const [guestResult] = await connection.execute(
        `INSERT INTO reservation_guests (reservation_id, guest_id, is_primary)
         SELECT ?, id, ? FROM guests WHERE id = ? AND deleted_at IS NULL`,
        [result.insertId, guestId === input.primaryGuestId, guestId],
      );
      if (guestResult.affectedRows !== 1) {
        throw new AppError('Um dos hóspedes informados não foi encontrado.', {
          statusCode: 422,
          code: 'GUEST_NOT_FOUND',
        });
      }
    }
    await writeAudit(connection, {
      actorUserId: actor.userId,
      action: 'reservation.created',
      entityType: 'reservation',
      entityId: result.insertId,
      requestId: actor.requestId,
      context: { roomId: input.roomId },
    });
    const reservation = await reservationRow(connection, result.insertId);
    const body = { data: reservation };
    await completeIdempotentOperation(connection, {
      keyHash: idempotency.keyHash,
      scope: 'reservation.create',
      userId: actor.userId,
      status: 201,
      body,
    });
    return { ...body, replay: false };
  });
}

export async function updateReservation(reservationId, input, actor) {
  return withTransaction(async (connection) => {
    const current = await reservationRow(connection, reservationId, true);
    if (!current)
      throw new AppError('Reserva não encontrada.', { statusCode: 404, code: 'NOT_FOUND' });
    if (!['pendente', 'confirmada'].includes(current.status)) {
      throw new AppError('Esta reserva não pode mais ser alterada.', {
        statusCode: 409,
        code: 'INVALID_RESERVATION_STATUS',
      });
    }
    if (current.version !== input.version) {
      throw new AppError('A reserva foi alterada por outra pessoa.', {
        statusCode: 409,
        code: 'VERSION_CONFLICT',
      });
    }
    const nights = nightsBetween(input.checkInDate, input.checkOutDate);
    const room = await ensureRoomAvailability(connection, {
      ...input,
      excludeReservationId: reservationId,
    });
    const discountCents = input.discountCents ?? 0;
    const subtotal = nights * Number(room.baseRateCents);
    if (discountCents > subtotal) {
      throw new AppError('O desconto não pode superar o valor das diárias.', {
        statusCode: 422,
        code: 'INVALID_DISCOUNT',
      });
    }
    await connection.execute(
      `UPDATE reservations
          SET room_id = ?, check_in_date = ?, check_out_date = ?, adults = ?, children = ?,
              nightly_rate_cents = ?, discount_cents = ?, total_cents = ?, source = ?, notes = ?,
              version = version + 1
        WHERE id = ? AND version = ?`,
      [
        input.roomId,
        input.checkInDate,
        input.checkOutDate,
        input.adults,
        input.children,
        room.baseRateCents,
        discountCents,
        subtotal - discountCents,
        input.source ?? null,
        input.notes ?? null,
        reservationId,
        input.version,
      ],
    );
    await writeAudit(connection, {
      actorUserId: actor.userId,
      action: 'reservation.updated',
      entityType: 'reservation',
      entityId: reservationId,
      requestId: actor.requestId,
      context: { roomId: input.roomId },
    });
    return reservationRow(connection, reservationId);
  });
}

export async function changeReservationStatus(reservationId, targetStatus, input, actor) {
  return withTransaction(async (connection) => {
    const reservation = await reservationRow(connection, reservationId, true);
    if (!reservation)
      throw new AppError('Reserva não encontrada.', { statusCode: 404, code: 'NOT_FOUND' });
    const allowed =
      (targetStatus === 'confirmada' && reservation.status === 'pendente') ||
      (['cancelada', 'no_show'].includes(targetStatus) &&
        ['pendente', 'confirmada'].includes(reservation.status));
    if (!allowed) {
      throw new AppError('Transição de reserva inválida.', {
        statusCode: 409,
        code: 'INVALID_STATUS_TRANSITION',
      });
    }
    if (reservation.version !== input.version) {
      throw new AppError('A reserva foi alterada por outra pessoa.', {
        statusCode: 409,
        code: 'VERSION_CONFLICT',
      });
    }
    await connection.execute(
      `UPDATE reservations
          SET status = ?, cancellation_reason = ?,
              canceled_at = CASE WHEN ? IN ('cancelada', 'no_show') THEN UTC_TIMESTAMP(3) ELSE NULL END,
              version = version + 1
        WHERE id = ? AND version = ?`,
      [targetStatus, input.reason ?? null, targetStatus, reservationId, input.version],
    );
    await writeAudit(connection, {
      actorUserId: actor.userId,
      action: `reservation.${targetStatus}`,
      entityType: 'reservation',
      entityId: reservationId,
      requestId: actor.requestId,
      context: { fromStatus: reservation.status, toStatus: targetStatus, reason: input.reason },
    });
    return reservationRow(connection, reservationId);
  });
}
