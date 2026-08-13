import crypto from 'node:crypto';
import { pool, withTransaction } from '../lib/db.js';
import { HttpError, assertFound } from '../utils/http-error.js';
import { writeAudit } from './audit.js';
import { assertRoomAvailable } from './data-query.js';

const roleSets = Object.freeze({
  reception: ['admin', 'reception'],
  operations: ['admin', 'reception', 'housekeeping']
});

function requireRole(auth, allowed) {
  if (!allowed.includes(auth.profile.role)) throw new HttpError(403, 'Você não tem permissão para esta ação.', 'FORBIDDEN');
}

function dbDate(value, name) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) throw new HttpError(400, `Data inválida em ${name}.`, 'INVALID_DATE');
  return date.toISOString().slice(0, 23).replace('T', ' ');
}

function asDate(value) {
  if (value instanceof Date) return value;
  const normalized = typeof value === 'string' && /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}/.test(value)
    ? `${value.replace(' ', 'T')}Z`
    : value;
  return new Date(normalized);
}

function saoPauloDay(value = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    year: 'numeric', month: '2-digit', day: '2-digit', timeZone: 'America/Sao_Paulo'
  }).format(asDate(value));
}

async function updateRoomState(connection, roomId, changes, auth, reason = null, requestMeta = {}) {
  const [rows] = await connection.execute('SELECT * FROM rooms WHERE id = ? FOR UPDATE', [roomId]);
  const before = assertFound(rows[0], 'Quarto não encontrado.');
  const afterState = {
    current_status: changes.current_status ?? before.current_status,
    cleaning_status: changes.cleaning_status ?? before.cleaning_status,
    internal_notes: changes.internal_notes === undefined ? before.internal_notes : changes.internal_notes
  };
  await connection.execute(
    `UPDATE rooms SET current_status = ?, cleaning_status = ?, internal_notes = ?, updated_by = ? WHERE id = ?`,
    [afterState.current_status, afterState.cleaning_status, afterState.internal_notes, auth.user.id, roomId]
  );
  if (before.current_status !== afterState.current_status || before.cleaning_status !== afterState.cleaning_status) {
    await connection.execute(
      `INSERT INTO room_status_history
        (room_id, previous_status, new_status, previous_cleaning_status, new_cleaning_status, reason, changed_by)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [roomId, before.current_status, afterState.current_status, before.cleaning_status, afterState.cleaning_status, reason, auth.user.id]
    );
  }
  const [afterRows] = await connection.execute('SELECT * FROM rooms WHERE id = ? LIMIT 1', [roomId]);
  await writeAudit({
    userId: auth.user.id,
    action: 'UPDATE',
    tableName: 'rooms',
    recordId: roomId,
    before,
    after: afterRows[0],
    ...requestMeta,
    connection
  });
  return afterRows[0];
}

async function dashboardSummary() {
  const [[roomCounts], [reservationCounts]] = await Promise.all([
    pool.execute(
      `SELECT
         COUNT(*) AS total,
         SUM(current_status = 'available') AS available,
         SUM(current_status = 'reserved') AS reserved,
         SUM(current_status = 'occupied') AS occupied,
         SUM(current_status = 'awaiting_cleaning') AS awaiting_cleaning,
         SUM(current_status = 'maintenance') AS maintenance
       FROM rooms WHERE active = 1`
    ),
    pool.execute(
      `SELECT
         SUM(DATE(created_at - INTERVAL 3 HOUR) = DATE(UTC_TIMESTAMP() - INTERVAL 3 HOUR)) AS reservations_today,
         SUM(DATE(check_in_at - INTERVAL 3 HOUR) = DATE(UTC_TIMESTAMP() - INTERVAL 3 HOUR) AND status IN ('pending','confirmed')) AS checkins_today,
         SUM(DATE(check_out_at - INTERVAL 3 HOUR) = DATE(UTC_TIMESTAMP() - INTERVAL 3 HOUR) AND status = 'checked_in') AS checkouts_today,
         SUM(status IN ('pre_reservation','pending')) AS pending
       FROM reservations WHERE deleted_at IS NULL`
    )
  ]);
  const rooms = roomCounts[0] ?? {};
  const reservations = reservationCounts[0] ?? {};
  const total = Number(rooms.total ?? 0);
  const occupied = Number(rooms.occupied ?? 0);
  return {
    rooms: {
      total,
      available: Number(rooms.available ?? 0),
      reserved: Number(rooms.reserved ?? 0),
      occupied,
      awaitingCleaning: Number(rooms.awaiting_cleaning ?? 0),
      maintenance: Number(rooms.maintenance ?? 0),
      occupancyRate: total ? Number(((occupied / total) * 100).toFixed(1)) : 0
    },
    reservationsToday: Number(reservations.reservations_today ?? 0),
    checkinsToday: Number(reservations.checkins_today ?? 0),
    checkoutsToday: Number(reservations.checkouts_today ?? 0),
    pendingReservations: Number(reservations.pending ?? 0)
  };
}

async function roomAvailability(args) {
  if (!args.p_room_id || !args.p_check_in || !args.p_check_out) throw new HttpError(400, 'Informe quarto, entrada e saída.', 'AVAILABILITY_FIELDS_REQUIRED');
  try {
    return await withTransaction(async (connection) => {
      await connection.execute('SELECT id FROM rooms WHERE id = ? FOR UPDATE', [args.p_room_id]);
      await assertRoomAvailable(connection, {
        roomId: args.p_room_id,
        checkIn: args.p_check_in,
        checkOut: args.p_check_out,
        excludeReservationId: args.p_exclude_reservation ?? null
      });
      return true;
    });
  } catch (error) {
    if (['ROOM_UNAVAILABLE', 'RESERVATION_OVERLAP', 'MAINTENANCE_OVERLAP', 'NOT_FOUND'].includes(error.code)) return false;
    throw error;
  }
}

async function transitionReservation(args, auth, requestMeta) {
  requireRole(auth, roleSets.reception);
  const transitions = {
    confirm: { target: 'confirmed', from: ['pre_reservation', 'pending'] },
    check_in: { target: 'checked_in', from: ['pending', 'confirmed'] },
    check_out: { target: 'checked_out', from: ['checked_in'] },
    cancel: { target: 'canceled', from: ['pre_reservation', 'pending', 'confirmed', 'checked_in'] },
    no_show: { target: 'no_show', from: ['pre_reservation', 'pending', 'confirmed'] }
  };
  const transition = transitions[args.p_action];
  if (!transition) throw new HttpError(400, 'Ação de reserva inválida.', 'INVALID_RESERVATION_ACTION');
  return withTransaction(async (connection) => {
    const [rows] = await connection.execute('SELECT * FROM reservations WHERE id = ? AND deleted_at IS NULL FOR UPDATE', [args.p_reservation_id]);
    const before = assertFound(rows[0], 'Reserva não encontrada.');
    if (!transition.from.includes(before.status)) throw new HttpError(409, 'A situação atual não permite esta ação.', 'INVALID_RESERVATION_TRANSITION');
    await connection.execute('SELECT id FROM rooms WHERE id = ? FOR UPDATE', [before.room_id]);
    const fields = ['status = ?', 'updated_by = ?'];
    const values = [transition.target, auth.user.id];
    if (args.p_action === 'cancel') {
      const reason = String(args.p_reason ?? '').trim();
      if (reason.length < 3) throw new HttpError(400, 'Informe o motivo do cancelamento.', 'CANCEL_REASON_REQUIRED');
      fields.push('canceled_reason = ?'); values.push(reason);
    }
    if (args.p_action === 'check_in') {
      fields.push('checked_in_at_actual = UTC_TIMESTAMP(3)', 'checked_in_by = ?'); values.push(auth.user.id);
    }
    if (args.p_action === 'check_out') {
      fields.push('checked_out_at_actual = UTC_TIMESTAMP(3)', 'checked_out_by = ?'); values.push(auth.user.id);
    }
    values.push(before.id);
    await connection.execute(`UPDATE reservations SET ${fields.join(', ')} WHERE id = ?`, values);

    if (args.p_action === 'check_in') {
      await updateRoomState(connection, before.room_id, { current_status: 'occupied' }, auth, `Check-in ${before.code}`, requestMeta);
    } else if (args.p_action === 'check_out') {
      await updateRoomState(connection, before.room_id, { current_status: 'awaiting_cleaning', cleaning_status: 'pending' }, auth, `Check-out ${before.code}`, requestMeta);
    } else if (['cancel', 'no_show'].includes(args.p_action) && before.status !== 'checked_in') {
      const [roomRows] = await connection.execute('SELECT current_status FROM rooms WHERE id = ?', [before.room_id]);
      if (roomRows[0]?.current_status === 'reserved') {
        await updateRoomState(connection, before.room_id, { current_status: 'available' }, auth, `${args.p_action} ${before.code}`, requestMeta);
      }
    } else if (args.p_action === 'confirm' && saoPauloDay(before.check_in_at) === saoPauloDay()) {
      const [roomRows] = await connection.execute('SELECT current_status FROM rooms WHERE id = ?', [before.room_id]);
      if (roomRows[0]?.current_status === 'available') {
        await updateRoomState(connection, before.room_id, { current_status: 'reserved' }, auth, `Reserva ${before.code} confirmada`, requestMeta);
      }
    }
    const [afterRows] = await connection.execute('SELECT * FROM reservations WHERE id = ?', [before.id]);
    const after = afterRows[0];
    await writeAudit({ userId: auth.user.id, action: `RESERVATION_${args.p_action.toUpperCase()}`, tableName: 'reservations', recordId: before.id, before, after, ...requestMeta, connection });
    return after;
  });
}

async function changeReservationRoom(args, auth, requestMeta) {
  requireRole(auth, roleSets.reception);
  return withTransaction(async (connection) => {
    const [rows] = await connection.execute('SELECT * FROM reservations WHERE id = ? AND deleted_at IS NULL FOR UPDATE', [args.p_reservation_id]);
    const before = assertFound(rows[0], 'Reserva não encontrada.');
    if (!['pre_reservation', 'pending', 'confirmed', 'checked_in'].includes(before.status)) throw new HttpError(409, 'Uma reserva encerrada não pode trocar de quarto.', 'RESERVATION_CLOSED');
    if (!args.p_new_room_id || args.p_new_room_id === before.room_id) return before;
    const ids = [before.room_id, args.p_new_room_id].sort();
    await connection.execute(`SELECT id FROM rooms WHERE id IN (?, ?) ORDER BY id FOR UPDATE`, ids);
    await assertRoomAvailable(connection, {
      roomId: args.p_new_room_id,
      checkIn: before.check_in_at,
      checkOut: before.check_out_at,
      excludeReservationId: before.id,
      guestCount: Number(before.adults) + Number(before.children)
    });
    await connection.execute('UPDATE reservations SET room_id = ?, updated_by = ? WHERE id = ?', [args.p_new_room_id, auth.user.id, before.id]);
    if (before.status === 'checked_in') {
      await updateRoomState(connection, before.room_id, { current_status: 'awaiting_cleaning', cleaning_status: 'pending' }, auth, `Troca da reserva ${before.code}`, requestMeta);
      await updateRoomState(connection, args.p_new_room_id, { current_status: 'occupied' }, auth, `Troca da reserva ${before.code}`, requestMeta);
    } else if (saoPauloDay(before.check_in_at) === saoPauloDay()) {
      const [oldRooms] = await connection.execute('SELECT current_status FROM rooms WHERE id = ?', [before.room_id]);
      if (oldRooms[0]?.current_status === 'reserved') await updateRoomState(connection, before.room_id, { current_status: 'available' }, auth, `Troca da reserva ${before.code}`, requestMeta);
      const [newRooms] = await connection.execute('SELECT current_status FROM rooms WHERE id = ?', [args.p_new_room_id]);
      if (newRooms[0]?.current_status === 'available') await updateRoomState(connection, args.p_new_room_id, { current_status: 'reserved' }, auth, `Troca da reserva ${before.code}`, requestMeta);
    }
    const [afterRows] = await connection.execute('SELECT * FROM reservations WHERE id = ?', [before.id]);
    await writeAudit({ userId: auth.user.id, action: 'CHANGE_RESERVATION_ROOM', tableName: 'reservations', recordId: before.id, before, after: afterRows[0], ...requestMeta, connection });
    return afterRows[0];
  });
}

async function updateRoomCleaning(args, auth, requestMeta) {
  requireRole(auth, roleSets.operations);
  if (!['clean', 'pending', 'in_progress', 'inspected'].includes(args.p_cleaning_status)) throw new HttpError(400, 'Situação de limpeza inválida.', 'INVALID_CLEANING_STATUS');
  return withTransaction(async (connection) => {
    const [rows] = await connection.execute('SELECT * FROM rooms WHERE id = ? AND active = 1 FOR UPDATE', [args.p_room_id]);
    const room = assertFound(rows[0], 'Quarto não encontrado.');
    const currentStatus = args.p_cleaning_status === 'in_progress'
      ? 'cleaning'
      : ['clean', 'inspected'].includes(args.p_cleaning_status) && ['awaiting_cleaning', 'cleaning'].includes(room.current_status)
        ? 'available'
        : room.current_status;
    const reason = String(args.p_reason ?? '').trim();
    const notes = reason ? [room.internal_notes, `[Limpeza] ${reason}`].filter(Boolean).join('\n') : room.internal_notes;
    return updateRoomState(connection, room.id, { current_status: currentStatus, cleaning_status: args.p_cleaning_status, internal_notes: notes }, auth, reason || 'Atualização de limpeza', requestMeta);
  });
}

async function setRoomOperationalStatus(args, auth, requestMeta) {
  requireRole(auth, roleSets.reception);
  if (!['available', 'blocked'].includes(args.p_status)) throw new HttpError(400, 'Situação operacional inválida.', 'INVALID_ROOM_STATUS');
  return withTransaction(async (connection) => {
    const [rows] = await connection.execute('SELECT * FROM rooms WHERE id = ? AND active = 1 FOR UPDATE', [args.p_room_id]);
    const room = assertFound(rows[0], 'Quarto não encontrado.');
    if (args.p_status === 'blocked') {
      if (room.current_status !== 'available') throw new HttpError(409, 'Somente um quarto disponível pode ser bloqueado.', 'ROOM_NOT_AVAILABLE');
      const [reservations] = await connection.execute(
        `SELECT id FROM reservations WHERE room_id = ? AND deleted_at IS NULL
         AND status IN ('pre_reservation','pending','confirmed','checked_in') LIMIT 1`,
        [room.id]
      );
      if (reservations.length) throw new HttpError(409, 'O quarto possui reservas ativas e não pode ser bloqueado.', 'ROOM_HAS_RESERVATIONS');
    } else if (room.current_status !== 'blocked') {
      throw new HttpError(409, 'Somente um bloqueio manual pode ser liberado por esta ação.', 'ROOM_NOT_BLOCKED');
    }
    const reason = String(args.p_reason ?? '').trim();
    const notes = reason ? [room.internal_notes, `[Situação] ${reason}`].filter(Boolean).join('\n') : room.internal_notes;
    return updateRoomState(connection, room.id, { current_status: args.p_status, internal_notes: notes }, auth, reason || 'Alteração operacional', requestMeta);
  });
}

async function blockRoomForMaintenance(args, auth, requestMeta) {
  requireRole(auth, roleSets.reception);
  const reason = String(args.p_reason ?? '').trim();
  if (reason.length < 3 || reason.length > 160) throw new HttpError(400, 'Informe o motivo da manutenção.', 'MAINTENANCE_REASON_REQUIRED');
  const startAt = asDate(args.p_start_at);
  const releaseAt = args.p_expected_release_at ? asDate(args.p_expected_release_at) : null;
  if (Number.isNaN(startAt.getTime()) || (releaseAt && (Number.isNaN(releaseAt.getTime()) || releaseAt <= startAt))) {
    throw new HttpError(400, 'Período de manutenção inválido.', 'INVALID_MAINTENANCE_PERIOD');
  }
  return withTransaction(async (connection) => {
    const [rooms] = await connection.execute('SELECT * FROM rooms WHERE id = ? AND active = 1 FOR UPDATE', [args.p_room_id]);
    const room = assertFound(rooms[0], 'Quarto não encontrado.');
    if (!['available', 'blocked'].includes(room.current_status)) throw new HttpError(409, 'O quarto não pode entrar em manutenção nesta situação.', 'ROOM_NOT_MAINTAINABLE');
    const [reservations] = await connection.execute(
      `SELECT id FROM reservations WHERE room_id = ? AND deleted_at IS NULL
       AND status IN ('pre_reservation','pending','confirmed','checked_in')
       AND check_in_at < COALESCE(?, '9999-12-31 23:59:59') AND check_out_at > ? LIMIT 1`,
      [room.id, releaseAt ? dbDate(releaseAt, 'expected_release_at') : null, dbDate(startAt, 'start_at')]
    );
    if (reservations.length) throw new HttpError(409, 'O quarto possui reserva ativa no período da manutenção.', 'MAINTENANCE_RESERVATION_OVERLAP');
    const id = crypto.randomUUID();
    await connection.execute(
      `INSERT INTO maintenance
        (id, room_id, reason, description, start_at, expected_release_at, responsible_name, status, created_by, updated_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'open', ?, ?)`,
      [id, room.id, reason, args.p_description || null, dbDate(startAt, 'start_at'), releaseAt ? dbDate(releaseAt, 'expected_release_at') : null, args.p_responsible_name || null, auth.user.id, auth.user.id]
    );
    await updateRoomState(connection, room.id, { current_status: 'maintenance' }, auth, reason, requestMeta);
    const [afterRows] = await connection.execute('SELECT * FROM maintenance WHERE id = ?', [id]);
    await writeAudit({ userId: auth.user.id, action: 'INSERT', tableName: 'maintenance', recordId: id, after: afterRows[0], ...requestMeta, connection });
    return afterRows[0];
  });
}

async function completeRoomMaintenance(args, auth, requestMeta) {
  requireRole(auth, roleSets.operations);
  return withTransaction(async (connection) => {
    const [rows] = await connection.execute(
      `SELECT * FROM maintenance WHERE id = ? AND status NOT IN ('completed','canceled') FOR UPDATE`,
      [args.p_maintenance_id]
    );
    const before = assertFound(rows[0], 'Manutenção ativa não encontrada.');
    await connection.execute('SELECT id FROM rooms WHERE id = ? FOR UPDATE', [before.room_id]);
    const notes = String(args.p_notes ?? '').trim();
    const description = notes ? [before.description, `[Conclusão] ${notes}`].filter(Boolean).join('\n') : before.description;
    await connection.execute(
      `UPDATE maintenance SET status = 'completed', released_at = UTC_TIMESTAMP(3), description = ?, updated_by = ? WHERE id = ?`,
      [description, auth.user.id, before.id]
    );
    await updateRoomState(connection, before.room_id, { current_status: 'awaiting_cleaning', cleaning_status: 'pending' }, auth, 'Manutenção concluída', requestMeta);
    const [afterRows] = await connection.execute('SELECT * FROM maintenance WHERE id = ?', [before.id]);
    await writeAudit({ userId: auth.user.id, action: 'COMPLETE_MAINTENANCE', tableName: 'maintenance', recordId: before.id, before, after: afterRows[0], ...requestMeta, connection });
    return afterRows[0];
  });
}

async function recordSensitiveAccess(args, auth, requestMeta) {
  requireRole(auth, roleSets.reception);
  if (args.p_table_name !== 'guests' || !args.p_record_id) throw new HttpError(400, 'Acesso sensível inválido.', 'INVALID_SENSITIVE_ACCESS');
  await withTransaction(async (connection) => {
    const [guests] = await connection.execute('SELECT id FROM guests WHERE id = ? AND deleted_at IS NULL LIMIT 1', [args.p_record_id]);
    assertFound(guests[0], 'Hóspede não encontrado.');
    await writeAudit({
      userId: auth.user.id,
      action: 'VIEW_SENSITIVE',
      tableName: 'guests',
      recordId: args.p_record_id,
      after: { context: args.p_context ?? null },
      ...requestMeta,
      connection
    });
  });
  return null;
}

export async function executeOperation(name, args, auth, requestMeta = {}) {
  const operations = {
    get_dashboard_summary: () => dashboardSummary(),
    is_room_available: () => roomAvailability(args),
    transition_reservation: () => transitionReservation(args, auth, requestMeta),
    change_reservation_room: () => changeReservationRoom(args, auth, requestMeta),
    update_room_cleaning: () => updateRoomCleaning(args, auth, requestMeta),
    set_room_operational_status: () => setRoomOperationalStatus(args, auth, requestMeta),
    block_room_for_maintenance: () => blockRoomForMaintenance(args, auth, requestMeta),
    complete_room_maintenance: () => completeRoomMaintenance(args, auth, requestMeta),
    record_sensitive_access: () => recordSensitiveAccess(args, auth, requestMeta)
  };
  const operation = operations[name];
  if (!operation) throw new HttpError(404, 'Operação não encontrada.', 'OPERATION_NOT_FOUND');
  return operation();
}
