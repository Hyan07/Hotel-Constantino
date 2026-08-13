import { withConnection, withTransaction } from '../db/pool.js';
import { writeAudit } from '../db/repositories/audit.repository.js';
import { AppError } from '../utils/app-error.js';
import { todayAtHotel } from '../utils/dates.js';
import { paginationMeta, parsePagination } from '../utils/pagination.js';
import { hashValue } from '../utils/tokens.js';
import { beginIdempotentOperation, completeIdempotentOperation } from './idempotency.service.js';

function mapStay(row) {
  if (!row) return null;
  return {
    ...row,
    accommodationCents: Number(row.accommodationCents),
    chargesCents: Number(row.chargesCents),
    discountCents: Number(row.discountCents),
    totalCents: Number(row.totalCents),
    paidCents: Number(row.paidCents),
    balanceCents: Number(row.balanceCents),
    version: Number(row.version),
  };
}

async function stayRow(connection, stayId, lock = false) {
  const [rows] = await connection.execute(
    `SELECT stays.id, stays.reservation_id AS reservationId, reservations.code AS reservationCode,
            reservations.primary_guest_id AS primaryGuestId, guests.full_name AS primaryGuestName,
            stays.room_id AS roomId, rooms.room_number AS roomNumber, stays.status,
            stays.checked_in_at AS checkedInAt, stays.expected_checkout_date AS expectedCheckoutDate,
            stays.checked_out_at AS checkedOutAt,
            stays.accommodation_cents AS accommodationCents, stays.charges_cents AS chargesCents,
            stays.discount_cents AS discountCents, stays.total_cents AS totalCents,
            stays.paid_cents AS paidCents, stays.balance_cents AS balanceCents,
            stays.notes, stays.version, stays.created_at AS createdAt, stays.updated_at AS updatedAt
       FROM stays
       JOIN reservations ON reservations.id = stays.reservation_id
       JOIN guests ON guests.id = reservations.primary_guest_id
       JOIN rooms ON rooms.id = stays.room_id
      WHERE stays.id = ?
      LIMIT 1${lock ? ' FOR UPDATE' : ''}`,
    [stayId],
  );
  return mapStay(rows[0]);
}

export async function getStay(stayId) {
  return withConnection(async (connection) => {
    const stay = await stayRow(connection, stayId);
    if (!stay) return null;
    const [charges] = await connection.execute(
      `SELECT id, category, description, quantity, unit_amount_cents AS unitAmountCents,
              total_cents AS totalCents, occurred_at AS occurredAt, voided_at AS voidedAt
         FROM charges WHERE stay_id = ? ORDER BY occurred_at DESC, id DESC`,
      [stayId],
    );
    const [payments] = await connection.execute(
      `SELECT id, amount_cents AS amountCents, method, reference, status,
              received_at AS receivedAt, reversed_at AS reversedAt
         FROM payments WHERE stay_id = ? ORDER BY received_at DESC, id DESC`,
      [stayId],
    );
    return {
      ...stay,
      charges: charges.map((item) => ({
        ...item,
        quantity: Number(item.quantity),
        unitAmountCents: Number(item.unitAmountCents),
        totalCents: Number(item.totalCents),
      })),
      payments: payments.map((item) => ({ ...item, amountCents: Number(item.amountCents) })),
    };
  });
}

export async function listStays(query) {
  const pagination = parsePagination(query);
  const conditions = [];
  const parameters = [];
  if (query.status) {
    conditions.push('stays.status = ?');
    parameters.push(query.status);
  }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  return withConnection(async (connection) => {
    const [[count]] = await connection.execute(
      `SELECT COUNT(*) AS total FROM stays ${where}`,
      parameters,
    );
    const [rows] = await connection.query(
      `SELECT stays.id, stays.reservation_id AS reservationId, reservations.code AS reservationCode,
              reservations.primary_guest_id AS primaryGuestId, guests.full_name AS primaryGuestName,
              stays.room_id AS roomId, rooms.room_number AS roomNumber, stays.status,
              stays.checked_in_at AS checkedInAt, stays.expected_checkout_date AS expectedCheckoutDate,
              stays.checked_out_at AS checkedOutAt,
              stays.accommodation_cents AS accommodationCents, stays.charges_cents AS chargesCents,
              stays.discount_cents AS discountCents, stays.total_cents AS totalCents,
              stays.paid_cents AS paidCents, stays.balance_cents AS balanceCents,
              stays.notes, stays.version, stays.created_at AS createdAt, stays.updated_at AS updatedAt
         FROM stays
         JOIN reservations ON reservations.id = stays.reservation_id
         JOIN guests ON guests.id = reservations.primary_guest_id
         JOIN rooms ON rooms.id = stays.room_id
         ${where}
        ORDER BY FIELD(stays.status, 'ativa', 'concluida'), stays.expected_checkout_date, stays.id DESC
        LIMIT ? OFFSET ?`,
      [...parameters, pagination.pageSize, pagination.offset],
    );
    return { data: rows.map(mapStay), meta: paginationMeta(Number(count.total), pagination) };
  });
}

async function recalculateStay(connection, stayId) {
  const [[totals]] = await connection.execute(
    `SELECT reservations.total_cents AS accommodationCents,
            COALESCE(SUM(CASE WHEN charges.voided_at IS NULL THEN charges.total_cents ELSE 0 END), 0) AS chargesCents
       FROM stays
       JOIN reservations ON reservations.id = stays.reservation_id
       LEFT JOIN charges ON charges.stay_id = stays.id
      WHERE stays.id = ?
      GROUP BY reservations.total_cents`,
    [stayId],
  );
  const [[payments]] = await connection.execute(
    `SELECT COALESCE(SUM(amount_cents), 0) AS paidCents
       FROM payments WHERE stay_id = ? AND status = 'confirmado'`,
    [stayId],
  );
  const accommodationCents = Number(totals.accommodationCents);
  const chargesCents = Number(totals.chargesCents);
  const paidCents = Number(payments.paidCents);
  const totalCents = accommodationCents + chargesCents;
  const balanceCents = totalCents - paidCents;
  await connection.execute(
    `UPDATE stays
        SET accommodation_cents = ?, charges_cents = ?, total_cents = ?,
            paid_cents = ?, balance_cents = ?, version = version + 1
      WHERE id = ?`,
    [accommodationCents, chargesCents, totalCents, paidCents, balanceCents, stayId],
  );
  return { accommodationCents, chargesCents, totalCents, paidCents, balanceCents };
}

export async function checkIn(reservationId, input, actor, idempotencyKey) {
  return withTransaction(async (connection) => {
    const idempotency = await beginIdempotentOperation(connection, {
      key: idempotencyKey,
      scope: 'stay.checkin',
      userId: actor.userId,
      payload: { reservationId, ...input },
    });
    if (idempotency.replay) return { ...idempotency.body, replay: true };

    const [[reservation]] = await connection.execute(
      `SELECT id, room_id AS roomId, check_in_date AS checkInDate,
              check_out_date AS checkOutDate, total_cents AS totalCents, version
         FROM reservations WHERE id = ? AND status = 'confirmada' AND deleted_at IS NULL
         FOR UPDATE`,
      [reservationId],
    );
    if (!reservation) {
      throw new AppError('A reserva não está confirmada ou não foi encontrada.', {
        statusCode: 409,
        code: 'CHECKIN_NOT_ALLOWED',
      });
    }
    if (Number(reservation.version) !== input.version) {
      throw new AppError('A reserva foi alterada por outra pessoa.', {
        statusCode: 409,
        code: 'VERSION_CONFLICT',
      });
    }
    const today = todayAtHotel();
    if (today < reservation.checkInDate || today >= reservation.checkOutDate) {
      throw new AppError('O check-in está fora do período da reserva.', {
        statusCode: 409,
        code: 'CHECKIN_OUTSIDE_PERIOD',
      });
    }
    const [[room]] = await connection.execute(
      'SELECT id, status FROM rooms WHERE id = ? FOR UPDATE',
      [reservation.roomId],
    );
    if (room.status !== 'disponivel') {
      throw new AppError(`O quarto está ${room.status} e não pode receber check-in.`, {
        statusCode: 409,
        code: 'ROOM_NOT_READY',
      });
    }
    const [[tasks]] = await connection.execute(
      `SELECT COUNT(*) AS total FROM housekeeping_tasks
        WHERE room_id = ? AND status IN ('pendente', 'em_andamento')`,
      [room.id],
    );
    if (Number(tasks.total) > 0) {
      throw new AppError('O quarto possui limpeza ou manutenção pendente.', {
        statusCode: 409,
        code: 'ROOM_NOT_RELEASED',
      });
    }
    const [result] = await connection.execute(
      `INSERT INTO stays
        (reservation_id, room_id, checked_in_at, expected_checkout_date,
         accommodation_cents, total_cents, balance_cents, notes, created_by)
       VALUES (?, ?, UTC_TIMESTAMP(3), ?, ?, ?, ?, ?, ?)`,
      [
        reservation.id,
        reservation.roomId,
        reservation.checkOutDate,
        reservation.totalCents,
        reservation.totalCents,
        reservation.totalCents,
        input.notes ?? null,
        actor.userId,
      ],
    );
    await connection.execute(
      `INSERT INTO stay_guests (stay_id, guest_id)
       SELECT ?, guest_id FROM reservation_guests WHERE reservation_id = ?`,
      [result.insertId, reservation.id],
    );
    await connection.execute(
      "UPDATE reservations SET status = 'hospedada', version = version + 1 WHERE id = ?",
      [reservation.id],
    );
    await connection.execute(
      "UPDATE rooms SET status = 'ocupado', version = version + 1 WHERE id = ? AND status = 'disponivel'",
      [room.id],
    );
    await connection.execute(
      `INSERT INTO room_status_history (room_id, from_status, to_status, reason, changed_by)
       VALUES (?, 'disponivel', 'ocupado', 'Check-in', ?)`,
      [room.id, actor.userId],
    );
    await writeAudit(connection, {
      actorUserId: actor.userId,
      action: 'stay.checked_in',
      entityType: 'stay',
      entityId: result.insertId,
      requestId: actor.requestId,
      context: { reservationId, roomId: room.id },
    });
    const stay = await stayRow(connection, result.insertId);
    const body = { data: stay };
    await completeIdempotentOperation(connection, {
      keyHash: idempotency.keyHash,
      scope: 'stay.checkin',
      userId: actor.userId,
      status: 201,
      body,
    });
    return { ...body, replay: false };
  });
}

export async function addCharge(stayId, input, actor) {
  return withTransaction(async (connection) => {
    const stay = await stayRow(connection, stayId, true);
    if (!stay || stay.status !== 'ativa') {
      throw new AppError('A hospedagem não está ativa.', {
        statusCode: 409,
        code: 'STAY_NOT_ACTIVE',
      });
    }
    if (stay.version !== input.version) {
      throw new AppError('A hospedagem foi alterada por outra pessoa.', {
        statusCode: 409,
        code: 'VERSION_CONFLICT',
      });
    }
    const totalCents = input.quantity * input.unitAmountCents;
    const [result] = await connection.execute(
      `INSERT INTO charges
        (stay_id, category, description, quantity, unit_amount_cents, total_cents, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        stayId,
        input.category,
        input.description,
        input.quantity,
        input.unitAmountCents,
        totalCents,
        actor.userId,
      ],
    );
    await recalculateStay(connection, stayId);
    await writeAudit(connection, {
      actorUserId: actor.userId,
      action: 'charge.created',
      entityType: 'charge',
      entityId: result.insertId,
      requestId: actor.requestId,
      context: { stayId },
    });
    return stayRow(connection, stayId);
  });
}

export async function addPayment(stayId, input, actor, idempotencyKey) {
  return withTransaction(async (connection) => {
    const idempotency = await beginIdempotentOperation(connection, {
      key: idempotencyKey,
      scope: 'payment.create',
      userId: actor.userId,
      payload: { stayId, ...input },
    });
    if (idempotency.replay) return { ...idempotency.body, replay: true };
    const stay = await stayRow(connection, stayId, true);
    if (!stay || stay.status !== 'ativa') {
      throw new AppError('A hospedagem não está ativa.', {
        statusCode: 409,
        code: 'STAY_NOT_ACTIVE',
      });
    }
    if (stay.version !== input.version) {
      throw new AppError('A hospedagem foi alterada por outra pessoa.', {
        statusCode: 409,
        code: 'VERSION_CONFLICT',
      });
    }
    await recalculateStay(connection, stayId);
    const current = await stayRow(connection, stayId, true);
    if (input.amountCents > current.balanceCents) {
      throw new AppError('O pagamento supera o saldo da hospedagem.', {
        statusCode: 422,
        code: 'PAYMENT_EXCEEDS_BALANCE',
      });
    }
    const [result] = await connection.execute(
      `INSERT INTO payments
        (stay_id, amount_cents, method, reference, idempotency_key_hash, created_by)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        stayId,
        input.amountCents,
        input.method,
        input.reference ?? null,
        hashValue(idempotencyKey),
        actor.userId,
      ],
    );
    await connection.execute(
      `INSERT INTO financial_entries
        (direction, category, description, amount_cents, occurred_on, stay_id, payment_id, created_by)
       VALUES ('entrada', 'hospedagem', 'Pagamento de hospedagem', ?, ?, ?, ?, ?)`,
      [input.amountCents, todayAtHotel(), stayId, result.insertId, actor.userId],
    );
    await recalculateStay(connection, stayId);
    await writeAudit(connection, {
      actorUserId: actor.userId,
      action: 'payment.created',
      entityType: 'payment',
      entityId: result.insertId,
      requestId: actor.requestId,
      context: { stayId },
    });
    const updated = await stayRow(connection, stayId);
    const body = { data: updated };
    await completeIdempotentOperation(connection, {
      keyHash: idempotency.keyHash,
      scope: 'payment.create',
      userId: actor.userId,
      status: 201,
      body,
    });
    return { ...body, replay: false };
  });
}

export async function checkOut(stayId, input, actor, idempotencyKey) {
  return withTransaction(async (connection) => {
    const idempotency = await beginIdempotentOperation(connection, {
      key: idempotencyKey,
      scope: 'stay.checkout',
      userId: actor.userId,
      payload: { stayId, ...input },
    });
    if (idempotency.replay) return { ...idempotency.body, replay: true };
    const stay = await stayRow(connection, stayId, true);
    if (!stay || stay.status !== 'ativa') {
      throw new AppError('A hospedagem não está ativa.', {
        statusCode: 409,
        code: 'STAY_NOT_ACTIVE',
      });
    }
    if (stay.version !== input.version) {
      throw new AppError('A hospedagem foi alterada por outra pessoa.', {
        statusCode: 409,
        code: 'VERSION_CONFLICT',
      });
    }
    await recalculateStay(connection, stayId);
    const current = await stayRow(connection, stayId, true);
    if (current.balanceCents > 0) {
      throw new AppError('Há saldo pendente. Registre o pagamento antes do checkout.', {
        statusCode: 409,
        code: 'BALANCE_DUE',
        details: { balanceCents: current.balanceCents },
      });
    }
    const [[room]] = await connection.execute('SELECT status FROM rooms WHERE id = ? FOR UPDATE', [
      current.roomId,
    ]);
    if (room.status !== 'ocupado') {
      throw new AppError('O estado do quarto não permite checkout.', {
        statusCode: 409,
        code: 'ROOM_STATE_CONFLICT',
      });
    }
    await connection.execute(
      `UPDATE stays SET status = 'concluida', checked_out_at = UTC_TIMESTAMP(3),
              notes = COALESCE(?, notes), version = version + 1
        WHERE id = ?`,
      [input.notes ?? null, stayId],
    );
    await connection.execute(
      "UPDATE reservations SET status = 'concluida', version = version + 1 WHERE id = ?",
      [current.reservationId],
    );
    await connection.execute(
      "UPDATE rooms SET status = 'aguardando_limpeza', version = version + 1 WHERE id = ?",
      [current.roomId],
    );
    await connection.execute(
      `INSERT INTO room_status_history (room_id, from_status, to_status, reason, changed_by)
       VALUES (?, 'ocupado', 'aguardando_limpeza', 'Checkout', ?)`,
      [current.roomId, actor.userId],
    );
    await connection.execute(
      `INSERT INTO housekeeping_tasks (room_id, task_type, status, priority, notes, created_by)
       VALUES (?, 'limpeza', 'pendente', 'alta', 'Limpeza após checkout', ?)`,
      [current.roomId, actor.userId],
    );
    await writeAudit(connection, {
      actorUserId: actor.userId,
      action: 'stay.checked_out',
      entityType: 'stay',
      entityId: stayId,
      requestId: actor.requestId,
      context: { reservationId: current.reservationId, roomId: current.roomId },
    });
    const updated = await stayRow(connection, stayId);
    const body = { data: updated };
    await completeIdempotentOperation(connection, {
      keyHash: idempotency.keyHash,
      scope: 'stay.checkout',
      userId: actor.userId,
      status: 200,
      body,
    });
    return { ...body, replay: false };
  });
}

export async function listCharges(query) {
  const pagination = parsePagination(query);
  const parameters = [];
  const where = query.stayId ? 'WHERE charges.stay_id = ?' : '';
  if (query.stayId) parameters.push(Number(query.stayId));
  return withConnection(async (connection) => {
    const [[count]] = await connection.execute(
      `SELECT COUNT(*) AS total FROM charges ${where}`,
      parameters,
    );
    const [rows] = await connection.query(
      `SELECT charges.id, charges.stay_id AS stayId, charges.category, charges.description,
              charges.quantity, charges.unit_amount_cents AS unitAmountCents,
              charges.total_cents AS totalCents, charges.occurred_at AS occurredAt,
              charges.voided_at AS voidedAt
         FROM charges ${where} ORDER BY charges.occurred_at DESC LIMIT ? OFFSET ?`,
      [...parameters, pagination.pageSize, pagination.offset],
    );
    return { data: rows, meta: paginationMeta(Number(count.total), pagination) };
  });
}

export async function listPayments(query) {
  const pagination = parsePagination(query);
  const parameters = [];
  const where = query.stayId ? 'WHERE payments.stay_id = ?' : '';
  if (query.stayId) parameters.push(Number(query.stayId));
  return withConnection(async (connection) => {
    const [[count]] = await connection.execute(
      `SELECT COUNT(*) AS total FROM payments ${where}`,
      parameters,
    );
    const [rows] = await connection.query(
      `SELECT payments.id, payments.stay_id AS stayId, payments.amount_cents AS amountCents,
              payments.method, payments.reference, payments.status, payments.received_at AS receivedAt
         FROM payments ${where} ORDER BY payments.received_at DESC LIMIT ? OFFSET ?`,
      [...parameters, pagination.pageSize, pagination.offset],
    );
    return { data: rows, meta: paginationMeta(Number(count.total), pagination) };
  });
}
