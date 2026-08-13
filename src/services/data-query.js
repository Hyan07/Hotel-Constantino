import crypto from 'node:crypto';
import { z } from 'zod';
import { pool, withTransaction } from '../lib/db.js';
import { writeAudit } from './audit.js';
import { HttpError, assertFound } from '../utils/http-error.js';

const guestColumns = [
  'id', 'full_name', 'document_type', 'document_number', 'document_number_normalized', 'document_path',
  'birth_date', 'phone', 'phone_normalized', 'email', 'postal_code', 'street', 'address_number',
  'complement', 'neighborhood', 'city', 'state', 'country', 'nationality', 'emergency_contact_name',
  'emergency_contact_phone', 'preferences', 'accessibility_needs', 'internal_notes', 'created_by',
  'updated_by', 'deleted_at', 'created_at', 'updated_at'
];
const roomColumns = [
  'id', 'room_number', 'category_id', 'floor', 'bed_type', 'bed_count', 'max_capacity',
  'standard_nightly_rate', 'amenities', 'description', 'internal_notes', 'current_status',
  'cleaning_status', 'active', 'created_by', 'updated_by', 'created_at', 'updated_at'
];
const reservationColumns = [
  'id', 'sequential_number', 'code', 'responsible_guest_id', 'room_id', 'check_in_at', 'check_out_at',
  'adults', 'children', 'nightly_rate', 'nights', 'discount', 'surcharge', 'total_amount', 'payment_method',
  'payment_status', 'status', 'origin_channel', 'notes', 'special_requests', 'canceled_reason', 'created_by',
  'updated_by', 'checked_in_by', 'checked_out_by', 'checked_in_at_actual', 'checked_out_at_actual',
  'deleted_at', 'created_at', 'updated_at'
];

const resources = Object.freeze({
  guests: {
    source: 'guests', columns: guestColumns,
    selectRoles: ['admin', 'reception'], insertRoles: ['admin', 'reception'], updateRoles: ['admin', 'reception'],
    writable: guestColumns.filter((column) => !['id', 'document_number_normalized', 'phone_normalized', 'created_by', 'updated_by', 'deleted_at', 'created_at', 'updated_at'].includes(column)),
    booleans: [], json: []
  },
  room_categories: {
    source: 'room_categories',
    columns: ['id', 'name', 'description', 'default_capacity', 'default_nightly_rate', 'active', 'created_at', 'updated_at'],
    selectRoles: ['admin', 'reception', 'housekeeping', 'viewer'], insertRoles: ['admin'], updateRoles: ['admin'],
    writable: ['name', 'description', 'default_capacity', 'default_nightly_rate', 'active'], booleans: ['active'], json: []
  },
  rooms: {
    source: 'rooms', columns: roomColumns,
    selectRoles: ['admin', 'reception', 'housekeeping', 'viewer'], insertRoles: ['admin'], updateRoles: ['admin', 'reception'],
    writable: ['room_number', 'category_id', 'floor', 'bed_type', 'bed_count', 'max_capacity', 'standard_nightly_rate', 'amenities', 'description', 'internal_notes', 'active'],
    booleans: ['active'], json: ['amenities']
  },
  room_overview: {
    source: 'room_overview',
    columns: [...roomColumns, 'category_name', 'current_guest_name', 'next_reservation_code', 'next_check_in', 'expected_release_at'],
    selectRoles: ['admin', 'reception', 'housekeeping', 'viewer'], writable: [], booleans: ['active'], json: ['amenities']
  },
  reservations: {
    source: 'reservations', columns: reservationColumns,
    selectRoles: ['admin', 'reception'], insertRoles: ['admin', 'reception'], updateRoles: ['admin', 'reception'],
    writable: ['responsible_guest_id', 'room_id', 'check_in_at', 'check_out_at', 'adults', 'children', 'nightly_rate', 'discount', 'surcharge', 'payment_method', 'origin_channel', 'notes', 'special_requests', 'status'],
    booleans: [], json: []
  },
  reservation_overview: {
    source: 'reservation_overview',
    columns: [...reservationColumns, 'guest_name', 'guest_phone', 'guest_email', 'room_number', 'category_name', 'amount_paid'],
    selectRoles: ['admin', 'reception'], writable: [], booleans: [], json: []
  },
  reservation_guests: {
    source: 'reservation_guests', columns: ['reservation_id', 'guest_id', 'is_responsible', 'created_at'],
    selectRoles: ['admin', 'reception'], insertRoles: ['admin', 'reception'], deleteRoles: ['admin', 'reception'],
    writable: ['reservation_id', 'guest_id', 'is_responsible'], booleans: ['is_responsible'], json: []
  },
  payments: {
    source: 'payments',
    columns: ['id', 'reservation_id', 'amount', 'method', 'status', 'paid_at', 'transaction_reference', 'notes', 'receipt_path', 'created_by', 'created_at', 'updated_at'],
    selectRoles: ['admin', 'reception'], insertRoles: ['admin', 'reception'], updateRoles: ['admin'],
    writable: ['reservation_id', 'amount', 'method', 'status', 'paid_at', 'transaction_reference', 'notes', 'receipt_path'], booleans: [], json: []
  },
  maintenance: {
    source: 'maintenance',
    columns: ['id', 'room_id', 'reason', 'description', 'start_at', 'expected_release_at', 'released_at', 'responsible_name', 'status', 'created_by', 'updated_by', 'created_at', 'updated_at'],
    selectRoles: ['admin', 'reception', 'housekeeping', 'viewer'], writable: [], booleans: [], json: []
  },
  audit_logs: {
    source: 'audit_logs',
    columns: ['id', 'user_id', 'action', 'table_name', 'record_id', 'old_values', 'new_values', 'ip_address', 'user_agent', 'created_at'],
    selectRoles: ['admin'], writable: [], booleans: [], json: ['old_values', 'new_values']
  }
});

const filterSchema = z.object({
  operator: z.enum(['eq', 'is', 'in', 'ilike', 'gte', 'lte', 'or']),
  column: z.string().optional(),
  value: z.unknown().optional(),
  conditions: z.array(z.object({
    column: z.string(),
    operator: z.enum(['eq', 'ilike']),
    value: z.unknown()
  })).max(10).optional()
});

export const dataQuerySchema = z.object({
  resource: z.enum(Object.keys(resources)),
  operation: z.enum(['select', 'insert', 'update', 'delete']).default('select'),
  columns: z.string().default('*'),
  payload: z.union([z.record(z.string(), z.unknown()), z.array(z.record(z.string(), z.unknown())).max(100)]).optional(),
  filters: z.array(filterSchema).max(20).default([]),
  orders: z.array(z.object({ column: z.string(), ascending: z.boolean().default(true) })).max(5).default([]),
  limit: z.number().int().min(1).max(2000).default(500),
  single: z.boolean().default(false),
  returning: z.boolean().default(false)
});

function assertRole(config, operation, role) {
  const allowed = config[`${operation}Roles`] ?? [];
  if (!allowed.includes(role)) throw new HttpError(403, 'Você não tem permissão para esta operação.', 'FORBIDDEN');
}

function assertColumn(config, column) {
  if (!config.columns.includes(column)) throw new HttpError(400, `Campo não permitido: ${column}.`, 'INVALID_COLUMN');
  return column;
}

function selectClause(config, requested) {
  if (requested.trim() === '*') return config.columns.map((column) => `\`${column}\``).join(', ');
  const columns = requested.split(',').map((column) => column.trim()).filter(Boolean);
  if (!columns.length) throw new HttpError(400, 'Seleção de campos vazia.', 'INVALID_COLUMNS');
  return columns.map((column) => `\`${assertColumn(config, column)}\``).join(', ');
}

function whereClause(config, filters) {
  const clauses = [];
  const parameters = [];
  for (const filter of filters) {
    if (filter.operator === 'or') {
      const conditions = filter.conditions ?? [];
      if (!conditions.length) continue;
      const orParts = conditions.map((condition) => {
        const column = assertColumn(config, condition.column);
        parameters.push(condition.value);
        return condition.operator === 'ilike'
          ? `LOWER(\`${column}\`) LIKE LOWER(?)`
          : `\`${column}\` = ?`;
      });
      clauses.push(`(${orParts.join(' OR ')})`);
      continue;
    }
    const column = assertColumn(config, filter.column ?? '');
    if (filter.operator === 'is') {
      if (filter.value !== null) throw new HttpError(400, 'O operador is aceita somente null.', 'INVALID_FILTER');
      clauses.push(`\`${column}\` IS NULL`);
    } else if (filter.operator === 'in') {
      const values = Array.isArray(filter.value) ? filter.value : [];
      if (!values.length || values.length > 100) throw new HttpError(400, 'Filtro in inválido.', 'INVALID_FILTER');
      clauses.push(`\`${column}\` IN (${values.map(() => '?').join(', ')})`);
      parameters.push(...values);
    } else {
      const operators = { eq: '=', ilike: 'LIKE', gte: '>=', lte: '<=' };
      const sqlOperator = operators[filter.operator];
      clauses.push(filter.operator === 'ilike'
        ? `LOWER(\`${column}\`) ${sqlOperator} LOWER(?)`
        : `\`${column}\` ${sqlOperator} ?`);
      parameters.push(filter.value);
    }
  }
  return { sql: clauses.length ? ` WHERE ${clauses.join(' AND ')}` : '', parameters };
}

function parseJson(value) {
  if (value === null || value === undefined || typeof value !== 'string') return value;
  try { return JSON.parse(value); } catch { return value; }
}

function normalizeRow(config, row) {
  if (!row) return row;
  const result = { ...row };
  for (const column of config.booleans ?? []) {
    if (column in result && result[column] !== null) result[column] = Boolean(result[column]);
  }
  for (const column of config.json ?? []) {
    if (column in result) result[column] = parseJson(result[column]);
  }
  if (result.birth_date instanceof Date) result.birth_date = result.birth_date.toISOString().slice(0, 10);
  return result;
}

function parseDateValue(value) {
  if (value instanceof Date) return value;
  const normalized = typeof value === 'string' && /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}/.test(value)
    ? `${value.replace(' ', 'T')}Z`
    : value;
  return new Date(normalized);
}

function mysqlDate(value, fieldName) {
  if (value === null || value === undefined || value === '') return null;
  const date = parseDateValue(value);
  if (Number.isNaN(date.getTime())) throw new HttpError(400, `Data inválida em ${fieldName}.`, 'INVALID_DATE');
  return date.toISOString().slice(0, 23).replace('T', ' ');
}

function dbValue(config, column, value) {
  if (config.json?.includes(column)) return value === null ? null : JSON.stringify(value);
  if (config.booleans?.includes(column)) return value ? 1 : 0;
  if (column.endsWith('_at') && column !== 'deleted_at') return mysqlDate(value, column);
  return value;
}

function cleanPayload(config, payload) {
  if (!payload || Array.isArray(payload)) throw new HttpError(400, 'Dados inválidos para a operação.', 'INVALID_PAYLOAD');
  const result = {};
  for (const [column, value] of Object.entries(payload)) {
    if (!config.writable.includes(column)) throw new HttpError(400, `Campo não pode ser alterado: ${column}.`, 'INVALID_COLUMN');
    result[column] = dbValue(config, column, value);
  }
  if (!Object.keys(result).length) throw new HttpError(400, 'Nenhum campo foi informado.', 'EMPTY_PAYLOAD');
  return result;
}

async function selectData(input, config) {
  const where = whereClause(config, input.filters);
  const order = input.orders.length
    ? ` ORDER BY ${input.orders.map(({ column, ascending }) => `\`${assertColumn(config, column)}\` ${ascending ? 'ASC' : 'DESC'}`).join(', ')}`
    : '';
  const [rows] = await pool.execute(
    `SELECT ${selectClause(config, input.columns)} FROM \`${config.source}\`${where.sql}${order} LIMIT ?`,
    [...where.parameters, input.limit]
  );
  const normalized = rows.map((row) => normalizeRow(config, row));
  if (input.single) return assertFound(normalized[0]);
  return normalized;
}

function normalizeGuest(values) {
  const result = { ...values };
  if ('full_name' in result) {
    result.full_name = String(result.full_name ?? '').trim().replace(/\s+/g, ' ');
    if (result.full_name.length < 3 || result.full_name.length > 160) throw new HttpError(400, 'Informe o nome completo do hóspede.', 'INVALID_GUEST_NAME');
  }
  if ('document_number' in result) result.document_number_normalized = String(result.document_number ?? '').replace(/[^a-z0-9]/gi, '').toUpperCase() || null;
  if ('phone' in result) result.phone_normalized = String(result.phone ?? '').replace(/\D/g, '') || null;
  if ('email' in result) result.email = String(result.email ?? '').trim().toLowerCase() || null;
  if ('state' in result) result.state = String(result.state ?? '').trim().toUpperCase() || null;
  if (result.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(result.email)) throw new HttpError(400, 'E-mail do hóspede inválido.', 'INVALID_GUEST_EMAIL');
  if (result.state && !/^[A-Z]{2}$/.test(result.state)) throw new HttpError(400, 'Use a sigla de duas letras do estado.', 'INVALID_GUEST_STATE');
  if (result.document_type && !['cpf', 'passport', 'other'].includes(result.document_type)) throw new HttpError(400, 'Tipo de documento inválido.', 'INVALID_DOCUMENT_TYPE');
  return result;
}

function validateSimpleEntity(source, values, before, operation) {
  const merged = { ...(before ?? {}), ...values };
  if (source === 'guests' && operation === 'insert' && !merged.full_name) {
    throw new HttpError(400, 'Informe o nome completo do hóspede.', 'INVALID_GUEST_NAME');
  }
  if (source === 'rooms') {
    if (!String(merged.room_number ?? '').trim() || String(merged.room_number).trim().length > 20) throw new HttpError(400, 'Número do quarto inválido.', 'INVALID_ROOM_NUMBER');
    if (!merged.category_id || !String(merged.bed_type ?? '').trim()) throw new HttpError(400, 'Categoria e tipo de cama são obrigatórios.', 'ROOM_FIELDS_REQUIRED');
    const bedCount = Number(merged.bed_count);
    const capacity = Number(merged.max_capacity);
    const rate = Number(merged.standard_nightly_rate);
    if (!Number.isInteger(bedCount) || bedCount < 1 || bedCount > 10 || !Number.isInteger(capacity) || capacity < 1 || capacity > 20 || !Number.isFinite(rate) || rate < 0) {
      throw new HttpError(400, 'Capacidade, camas ou diária do quarto são inválidas.', 'INVALID_ROOM_VALUES');
    }
    if (!Array.isArray(parseJson(merged.amenities))) throw new HttpError(400, 'Comodidades do quarto devem ser uma lista.', 'INVALID_AMENITIES');
  }
  if (source === 'room_categories') {
    if (String(merged.name ?? '').trim().length < 2) throw new HttpError(400, 'Nome da categoria inválido.', 'INVALID_CATEGORY_NAME');
    const capacity = Number(merged.default_capacity);
    const rate = Number(merged.default_nightly_rate);
    if (!Number.isInteger(capacity) || capacity < 1 || capacity > 20 || !Number.isFinite(rate) || rate < 0) throw new HttpError(400, 'Valores da categoria inválidos.', 'INVALID_CATEGORY_VALUES');
  }
}

async function fetchRow(connection, source, id) {
  const [rows] = await connection.execute(`SELECT * FROM \`${source}\` WHERE id = ? LIMIT 1`, [id]);
  return rows[0] ?? null;
}

async function writeSimpleEntity(input, config, auth, requestMeta) {
  return withTransaction(async (connection) => {
    const values = cleanPayload(config, input.payload);
    const id = input.operation === 'insert' ? crypto.randomUUID() : null;
    let before = null;
    if (input.operation === 'update') {
      const idFilter = input.filters.find((filter) => filter.operator === 'eq' && filter.column === 'id');
      if (!idFilter?.value) throw new HttpError(400, 'A atualização exige um identificador.', 'ID_REQUIRED');
      const [rows] = await connection.execute(`SELECT * FROM \`${config.source}\` WHERE id = ? FOR UPDATE`, [idFilter.value]);
      before = assertFound(rows[0]);
    }

    let normalized = values;
    if (config.source === 'guests') normalized = normalizeGuest(values);
    validateSimpleEntity(config.source, normalized, before, input.operation);
    if (input.operation === 'insert') {
      normalized.id = id;
      if (['guests', 'rooms'].includes(config.source)) {
        normalized.created_by = auth.user.id;
        normalized.updated_by = auth.user.id;
      }
    } else if (['guests', 'rooms'].includes(config.source)) {
      normalized.updated_by = auth.user.id;
    }

    const columns = Object.keys(normalized);
    try {
      if (input.operation === 'insert') {
        await connection.execute(
          `INSERT INTO \`${config.source}\` (${columns.map((column) => `\`${column}\``).join(', ')}) VALUES (${columns.map(() => '?').join(', ')})`,
          columns.map((column) => normalized[column])
        );
      } else {
        await connection.execute(
          `UPDATE \`${config.source}\` SET ${columns.map((column) => `\`${column}\` = ?`).join(', ')} WHERE id = ?`,
          [...columns.map((column) => normalized[column]), before.id]
        );
      }
    } catch (error) {
      if (error.code === 'ER_DUP_ENTRY') throw new HttpError(409, 'Já existe um registro com estes dados únicos.', 'DUPLICATE_RECORD');
      if (error.code === 'ER_NO_REFERENCED_ROW_2') throw new HttpError(400, 'Uma referência informada não existe.', 'INVALID_REFERENCE');
      throw error;
    }

    const rowId = id ?? before.id;
    const after = await fetchRow(connection, config.source, rowId);
    await writeAudit({
      userId: auth.user.id,
      action: input.operation.toUpperCase(),
      tableName: config.source,
      recordId: rowId,
      before,
      after,
      ...requestMeta,
      connection
    });
    return normalizeRow(config, after);
  });
}

function reservationInput(values, existing = null) {
  const merged = { ...(existing ?? {}), ...values };
  const checkIn = parseDateValue(merged.check_in_at);
  const checkOut = parseDateValue(merged.check_out_at);
  if (Number.isNaN(checkIn.getTime()) || Number.isNaN(checkOut.getTime()) || checkOut <= checkIn) {
    throw new HttpError(400, 'A saída deve ser posterior à entrada.', 'INVALID_RESERVATION_PERIOD');
  }
  const adults = Number(merged.adults);
  const children = Number(merged.children ?? 0);
  const nightlyRate = Number(merged.nightly_rate);
  const discount = Number(merged.discount ?? 0);
  const surcharge = Number(merged.surcharge ?? 0);
  if (!Number.isInteger(adults) || adults < 1 || adults > 20 || !Number.isInteger(children) || children < 0 || children > 20) {
    throw new HttpError(400, 'Quantidade de hóspedes inválida.', 'INVALID_GUEST_COUNT');
  }
  if (![nightlyRate, discount, surcharge].every((value) => Number.isFinite(value) && value >= 0)) {
    throw new HttpError(400, 'Valores da reserva inválidos.', 'INVALID_RESERVATION_AMOUNT');
  }
  if ([nightlyRate, discount, surcharge].some((value) => value > 9_999_999_999.99)) {
    throw new HttpError(400, 'Um valor da reserva excede o limite permitido.', 'RESERVATION_AMOUNT_TOO_LARGE');
  }
  if (merged.payment_method && !['cash', 'pix', 'credit_card', 'debit_card', 'bank_transfer', 'invoice', 'other'].includes(merged.payment_method)) {
    throw new HttpError(400, 'Forma de pagamento inválida.', 'INVALID_PAYMENT_METHOD');
  }
  const origin = String(merged.origin_channel ?? 'Direto').trim();
  if (!origin || origin.length > 120) throw new HttpError(400, 'Canal de origem inválido.', 'INVALID_ORIGIN_CHANNEL');
  const nights = Math.max(1, Math.ceil((checkOut.getTime() - checkIn.getTime()) / 86_400_000));
  if (nights > 3650) throw new HttpError(400, 'O período da reserva excede dez anos.', 'RESERVATION_PERIOD_TOO_LONG');
  const totalAmount = Math.max(0, Number((nightlyRate * nights - discount + surcharge).toFixed(2)));
  if (totalAmount > 9_999_999_999.99) throw new HttpError(400, 'O total da reserva excede o limite permitido.', 'RESERVATION_AMOUNT_TOO_LARGE');
  return {
    ...values,
    check_in_at: mysqlDate(checkIn, 'check_in_at'),
    check_out_at: mysqlDate(checkOut, 'check_out_at'),
    adults,
    children,
    nightly_rate: nightlyRate,
    discount,
    surcharge,
    nights,
    total_amount: totalAmount,
    ...('origin_channel' in values ? { origin_channel: origin } : {})
  };
}

async function lockRooms(connection, roomIds) {
  const ids = [...new Set(roomIds.filter(Boolean))].sort();
  if (!ids.length) return;
  await connection.execute(
    `SELECT id FROM rooms WHERE id IN (${ids.map(() => '?').join(', ')}) ORDER BY id FOR UPDATE`,
    ids
  );
}

export async function assertRoomAvailable(connection, { roomId, checkIn, checkOut, excludeReservationId, guestCount }) {
  const [roomRows] = await connection.execute(
    'SELECT id, active, current_status, max_capacity FROM rooms WHERE id = ? LIMIT 1',
    [roomId]
  );
  const room = assertFound(roomRows[0], 'Quarto não encontrado.');
  if (!room.active || ['blocked', 'maintenance'].includes(room.current_status)) {
    throw new HttpError(409, 'O quarto selecionado não está disponível.', 'ROOM_UNAVAILABLE');
  }
  if (guestCount !== undefined && guestCount > Number(room.max_capacity)) {
    throw new HttpError(400, 'A quantidade de hóspedes excede a capacidade do quarto.', 'ROOM_CAPACITY_EXCEEDED');
  }
  const parameters = [roomId, mysqlDate(checkOut, 'check_out_at'), mysqlDate(checkIn, 'check_in_at')];
  let exclusion = '';
  if (excludeReservationId) {
    exclusion = ' AND id <> ?';
    parameters.push(excludeReservationId);
  }
  const [overlaps] = await connection.execute(
    `SELECT id FROM reservations
     WHERE room_id = ? AND deleted_at IS NULL
       AND status IN ('pre_reservation','pending','confirmed','checked_in')
       AND check_in_at < ? AND check_out_at > ?${exclusion}
     LIMIT 1`,
    parameters
  );
  if (overlaps.length) throw new HttpError(409, 'Este quarto já possui uma reserva ativa no período escolhido.', 'RESERVATION_OVERLAP');
  const [maintenance] = await connection.execute(
    `SELECT id FROM maintenance
     WHERE room_id = ? AND status IN ('open','in_progress','waiting_parts')
       AND start_at < ? AND (expected_release_at IS NULL OR expected_release_at > ?)
     LIMIT 1`,
    [roomId, mysqlDate(checkOut, 'check_out_at'), mysqlDate(checkIn, 'check_in_at')]
  );
  if (maintenance.length) throw new HttpError(409, 'O quarto está em manutenção no período selecionado.', 'MAINTENANCE_OVERLAP');
  return true;
}

function reservationCode(sequence) {
  const year = new Intl.DateTimeFormat('en', { year: 'numeric', timeZone: 'America/Sao_Paulo' }).format(new Date());
  return `CH-${year}-${String(sequence).padStart(6, '0')}`;
}

async function writeReservation(input, config, auth, requestMeta) {
  return withTransaction(async (connection) => {
    const values = cleanPayload(config, input.payload);
    let before = null;
    let id = null;
    if (input.operation === 'update') {
      const idFilter = input.filters.find((filter) => filter.operator === 'eq' && filter.column === 'id');
      if (!idFilter?.value) throw new HttpError(400, 'A atualização exige um identificador.', 'ID_REQUIRED');
      const [rows] = await connection.execute('SELECT * FROM reservations WHERE id = ? AND deleted_at IS NULL FOR UPDATE', [idFilter.value]);
      before = assertFound(rows[0], 'Reserva não encontrada.');
      if (!['pre_reservation', 'pending', 'confirmed'].includes(before.status)) {
        throw new HttpError(409, 'Esta reserva não pode mais ser editada.', 'RESERVATION_NOT_EDITABLE');
      }
      delete values.status;
      id = before.id;
    } else {
      id = crypto.randomUUID();
      const status = values.status ?? 'pending';
      if (!['pre_reservation', 'pending', 'confirmed'].includes(status)) {
        throw new HttpError(400, 'Situação inicial inválida.', 'INVALID_RESERVATION_STATUS');
      }
      values.status = status;
    }

    const prepared = reservationInput(values, before);
    const effective = { ...(before ?? {}), ...prepared };
    if (!effective.responsible_guest_id || !effective.room_id) throw new HttpError(400, 'Informe o hóspede e o quarto.', 'RESERVATION_FIELDS_REQUIRED');
    await lockRooms(connection, [before?.room_id, effective.room_id]);
    await assertRoomAvailable(connection, {
      roomId: effective.room_id,
      checkIn: effective.check_in_at,
      checkOut: effective.check_out_at,
      excludeReservationId: before?.id,
      guestCount: Number(effective.adults) + Number(effective.children)
    });

    if (input.operation === 'insert') {
      const insertValues = {
        ...prepared,
        id,
        code: `PENDING-${id}`,
        responsible_guest_id: effective.responsible_guest_id,
        room_id: effective.room_id,
        origin_channel: effective.origin_channel || 'Direto',
        created_by: auth.user.id,
        updated_by: auth.user.id
      };
      const columns = Object.keys(insertValues);
      const [result] = await connection.execute(
        `INSERT INTO reservations (${columns.map((column) => `\`${column}\``).join(', ')}) VALUES (${columns.map(() => '?').join(', ')})`,
        columns.map((column) => insertValues[column])
      );
      const code = reservationCode(result.insertId);
      await connection.execute('UPDATE reservations SET code = ? WHERE id = ?', [code, id]);
    } else {
      prepared.updated_by = auth.user.id;
      const columns = Object.keys(prepared);
      await connection.execute(
        `UPDATE reservations SET ${columns.map((column) => `\`${column}\` = ?`).join(', ')} WHERE id = ?`,
        [...columns.map((column) => prepared[column]), id]
      );
    }

    await connection.execute(
      `UPDATE reservation_guests SET is_responsible = 0 WHERE reservation_id = ? AND guest_id <> ?`,
      [id, effective.responsible_guest_id]
    );
    await connection.execute(
      `INSERT INTO reservation_guests (reservation_id, guest_id, is_responsible)
       VALUES (?, ?, 1) ON DUPLICATE KEY UPDATE is_responsible = 1`,
      [id, effective.responsible_guest_id]
    );
    const after = await fetchRow(connection, 'reservations', id);
    await writeAudit({ userId: auth.user.id, action: input.operation.toUpperCase(), tableName: 'reservations', recordId: id, before, after, ...requestMeta, connection });
    return normalizeRow(config, after);
  });
}

async function insertReservationGuests(input, config, auth) {
  const payloads = Array.isArray(input.payload) ? input.payload : [input.payload];
  return withTransaction(async (connection) => {
    const saved = [];
    for (const payload of payloads) {
      const values = cleanPayload(config, payload);
      if (!values.reservation_id || !values.guest_id) throw new HttpError(400, 'Reserva e hóspede são obrigatórios.', 'INVALID_COMPANION');
      if (values.is_responsible) throw new HttpError(400, 'O responsável só pode ser alterado na reserva.', 'INVALID_RESPONSIBLE_GUEST');
      await connection.execute(
        `INSERT INTO reservation_guests (reservation_id, guest_id, is_responsible)
         VALUES (?, ?, 0) ON DUPLICATE KEY UPDATE is_responsible = is_responsible`,
        [values.reservation_id, values.guest_id]
      );
      saved.push({ reservation_id: values.reservation_id, guest_id: values.guest_id, is_responsible: false });
    }
    return Array.isArray(input.payload) ? saved : saved[0];
  });
}

async function deleteReservationGuests(input) {
  const reservationFilter = input.filters.find((filter) => filter.operator === 'eq' && filter.column === 'reservation_id');
  const responsibleFilter = input.filters.find((filter) => filter.operator === 'eq' && filter.column === 'is_responsible');
  if (!reservationFilter?.value || responsibleFilter?.value !== false) {
    throw new HttpError(400, 'Somente acompanhantes de uma reserva podem ser removidos.', 'INVALID_COMPANION_DELETE');
  }
  await pool.execute('DELETE FROM reservation_guests WHERE reservation_id = ? AND is_responsible = 0', [reservationFilter.value]);
  return null;
}

async function insertPayment(input, config, auth, requestMeta) {
  const values = cleanPayload(config, input.payload);
  const amount = Number(values.amount);
  if (!values.reservation_id || !Number.isFinite(amount) || amount <= 0) throw new HttpError(400, 'Pagamento inválido.', 'INVALID_PAYMENT');
  if (!['cash', 'pix', 'credit_card', 'debit_card', 'bank_transfer', 'invoice', 'other'].includes(values.method)) {
    throw new HttpError(400, 'Forma de pagamento inválida.', 'INVALID_PAYMENT_METHOD');
  }
  if ((values.status ?? 'received') === 'received' && !values.paid_at) values.paid_at = mysqlDate(new Date(), 'paid_at');
  values.status = values.status ?? 'received';
  return withTransaction(async (connection) => {
    const [reservations] = await connection.execute('SELECT id, total_amount FROM reservations WHERE id = ? AND deleted_at IS NULL FOR UPDATE', [values.reservation_id]);
    const reservation = assertFound(reservations[0], 'Reserva não encontrada.');
    const id = crypto.randomUUID();
    const row = { ...values, id, amount, created_by: auth.user.id };
    const columns = Object.keys(row);
    await connection.execute(
      `INSERT INTO payments (${columns.map((column) => `\`${column}\``).join(', ')}) VALUES (${columns.map(() => '?').join(', ')})`,
      columns.map((column) => row[column])
    );
    const [totals] = await connection.execute(
      `SELECT COALESCE(SUM(CASE WHEN status = 'received' THEN amount WHEN status = 'refunded' THEN -amount ELSE 0 END), 0) AS received
       FROM payments WHERE reservation_id = ?`,
      [values.reservation_id]
    );
    const received = Number(totals[0].received);
    const paymentStatus = received <= 0 ? 'pending' : received < Number(reservation.total_amount) ? 'partial' : 'paid';
    await connection.execute('UPDATE reservations SET payment_status = ?, updated_by = ? WHERE id = ?', [paymentStatus, auth.user.id, values.reservation_id]);
    const after = await fetchRow(connection, 'payments', id);
    await writeAudit({ userId: auth.user.id, action: 'INSERT', tableName: 'payments', recordId: id, after, ...requestMeta, connection });
    return normalizeRow(config, after);
  });
}

export async function executeDataQuery(rawInput, auth, requestMeta = {}) {
  const input = dataQuerySchema.parse(rawInput);
  const config = resources[input.resource];
  assertRole(config, input.operation, auth.profile.role);
  if (input.operation === 'select') return selectData(input, config);
  if (input.resource === 'reservations') return writeReservation(input, config, auth, requestMeta);
  if (input.resource === 'reservation_guests' && input.operation === 'insert') return insertReservationGuests(input, config, auth);
  if (input.resource === 'reservation_guests' && input.operation === 'delete') return deleteReservationGuests(input);
  if (input.resource === 'payments' && input.operation === 'insert') return insertPayment(input, config, auth, requestMeta);
  if (['guests', 'rooms', 'room_categories'].includes(input.resource) && ['insert', 'update'].includes(input.operation)) {
    return writeSimpleEntity(input, config, auth, requestMeta);
  }
  throw new HttpError(400, 'Operação não suportada para este recurso.', 'UNSUPPORTED_OPERATION');
}
