import { createHash } from 'node:crypto';
import { env } from '../../config/env.js';
import { withTransaction } from '../pool.js';

const hotelTimeZone = 'America/Sao_Paulo';

function hotelDate(offsetDays = 0) {
  const date = new Date(Date.now() + offsetDays * 86_400_000);
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: hotelTimeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function normalizeName(value) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/gu, '')
    .toLowerCase()
    .replace(/\s+/gu, ' ')
    .trim();
}

async function findId(connection, table, column, value) {
  const allowed = new Set(['users:email', 'roles:code', 'guests:email', 'rooms:room_number']);
  if (!allowed.has(`${table}:${column}`)) throw new Error('Busca de seed não autorizada.');
  const [rows] = await connection.execute(
    `SELECT id FROM \`${table}\` WHERE \`${column}\` = ? LIMIT 1`,
    [value],
  );
  return rows[0].id;
}

export async function runDevelopmentSeed() {
  if (env.isProduction) throw new Error('Dados de demonstração são proibidos em produção.');

  return withTransaction(async (connection) => {
    await connection.execute(
      `INSERT INTO users (full_name, email, password_hash, status)
       VALUES (?, ?, NULL, 'active')
       ON DUPLICATE KEY UPDATE full_name = VALUES(full_name), status = 'active', deleted_at = NULL`,
      ['Administrador local', 'dev-admin@localhost.invalid'],
    );
    const devUserId = await findId(connection, 'users', 'email', 'dev-admin@localhost.invalid');
    const adminRoleId = await findId(connection, 'roles', 'code', 'administrador');
    await connection.execute('INSERT IGNORE INTO user_roles (user_id, role_id) VALUES (?, ?)', [
      devUserId,
      adminRoleId,
    ]);

    const roomDefinitions = Array.from({ length: 24 }, (_, index) => {
      const floor = Math.floor(index / 8) + 1;
      const sequence = (index % 8) + 1;
      const category = sequence <= 4 ? 'Standard' : sequence <= 7 ? 'Deluxe' : 'Suíte';
      const capacity = category === 'Standard' ? 2 : category === 'Deluxe' ? 3 : 4;
      const baseRateCents =
        category === 'Standard' ? 24_900 : category === 'Deluxe' ? 34_900 : 49_900;
      return {
        number: `${floor}0${sequence}`,
        floor,
        category,
        capacity,
        baseRateCents,
        amenities:
          category === 'Standard'
            ? ['Wi-Fi', 'Ar-condicionado']
            : ['Wi-Fi', 'Ar-condicionado', 'Frigobar'],
      };
    });

    for (const room of roomDefinitions) {
      await connection.execute(
        `INSERT INTO rooms
          (room_number, category, floor, capacity, base_rate_cents, status, amenities)
         VALUES (?, ?, ?, ?, ?, 'disponivel', ?)
         ON DUPLICATE KEY UPDATE
          category = VALUES(category), floor = VALUES(floor), capacity = VALUES(capacity),
          base_rate_cents = VALUES(base_rate_cents), amenities = VALUES(amenities), deleted_at = NULL`,
        [
          room.number,
          room.category,
          room.floor,
          room.capacity,
          room.baseRateCents,
          JSON.stringify(room.amenities),
        ],
      );
    }

    const guestDefinitions = [
      ['Ana Martins', 'ana.martins@example.invalid', '(11) 90000-0001', 'São Paulo', 'SP'],
      ['Bruno Almeida', 'bruno.almeida@example.invalid', '(21) 90000-0002', 'Rio de Janeiro', 'RJ'],
      [
        'Carla Nogueira',
        'carla.nogueira@example.invalid',
        '(31) 90000-0003',
        'Belo Horizonte',
        'MG',
      ],
      ['Diego Santos', 'diego.santos@example.invalid', '(41) 90000-0004', 'Curitiba', 'PR'],
    ];

    for (const [name, email, phone, city, stateCode] of guestDefinitions) {
      await connection.execute(
        `INSERT INTO guests (full_name, normalized_name, email, phone, city, state_code)
         VALUES (?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
           full_name = VALUES(full_name), normalized_name = VALUES(normalized_name),
           phone = VALUES(phone), city = VALUES(city), state_code = VALUES(state_code), deleted_at = NULL`,
        [name, normalizeName(name), email, phone, city, stateCode],
      );
    }

    const guestIds = Object.fromEntries(
      await Promise.all(
        guestDefinitions.map(async ([name, email]) => [
          name,
          await findId(connection, 'guests', 'email', email),
        ]),
      ),
    );
    const roomIds = {};
    for (const number of ['101', '102', '201', '202', '203', '301']) {
      roomIds[number] = await findId(connection, 'rooms', 'room_number', number);
    }

    const reservations = [
      ['DEV-RSV-001', 'Ana Martins', '101', hotelDate(0), hotelDate(2), 'confirmada', 24_900],
      ['DEV-RSV-002', 'Bruno Almeida', '102', hotelDate(1), hotelDate(4), 'confirmada', 24_900],
      ['DEV-RSV-003', 'Carla Nogueira', '201', hotelDate(-1), hotelDate(2), 'hospedada', 24_900],
      ['DEV-RSV-004', 'Diego Santos', '202', hotelDate(-4), hotelDate(0), 'concluida', 24_900],
    ];

    for (const [code, guestName, roomNumber, checkIn, checkOut, status, rate] of reservations) {
      const nights = Math.round(
        (new Date(`${checkOut}T00:00:00Z`) - new Date(`${checkIn}T00:00:00Z`)) / 86_400_000,
      );
      await connection.execute(
        `INSERT INTO reservations
          (code, primary_guest_id, room_id, check_in_date, check_out_date, adults, children,
           status, nightly_rate_cents, total_cents, source, created_by)
         VALUES (?, ?, ?, ?, ?, 2, 0, ?, ?, ?, 'Seed de desenvolvimento', ?)
         ON DUPLICATE KEY UPDATE
           primary_guest_id = VALUES(primary_guest_id), room_id = VALUES(room_id),
           check_in_date = VALUES(check_in_date), check_out_date = VALUES(check_out_date),
           status = VALUES(status), nightly_rate_cents = VALUES(nightly_rate_cents),
           total_cents = VALUES(total_cents), deleted_at = NULL`,
        [
          code,
          guestIds[guestName],
          roomIds[roomNumber],
          checkIn,
          checkOut,
          status,
          rate,
          nights * rate,
          devUserId,
        ],
      );
      const [[reservation]] = await connection.execute(
        'SELECT id FROM reservations WHERE code = ?',
        [code],
      );
      await connection.execute(
        'INSERT IGNORE INTO reservation_guests (reservation_id, guest_id, is_primary) VALUES (?, ?, TRUE)',
        [reservation.id, guestIds[guestName]],
      );
    }

    const [[activeReservation]] = await connection.execute(
      "SELECT id, total_cents AS totalCents FROM reservations WHERE code = 'DEV-RSV-003'",
    );
    await connection.execute(
      `INSERT INTO stays
        (reservation_id, room_id, status, checked_in_at, expected_checkout_date,
         accommodation_cents, total_cents, balance_cents, created_by)
       VALUES (?, ?, 'ativa', UTC_TIMESTAMP(3) - INTERVAL 1 DAY, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE status = 'ativa', checked_out_at = NULL,
         accommodation_cents = VALUES(accommodation_cents), total_cents = VALUES(total_cents),
         balance_cents = VALUES(balance_cents)`,
      [
        activeReservation.id,
        roomIds['201'],
        hotelDate(2),
        activeReservation.totalCents,
        activeReservation.totalCents,
        activeReservation.totalCents,
        devUserId,
      ],
    );

    const [[completedReservation]] = await connection.execute(
      "SELECT id, total_cents AS totalCents FROM reservations WHERE code = 'DEV-RSV-004'",
    );
    await connection.execute(
      `INSERT INTO stays
        (reservation_id, room_id, status, checked_in_at, expected_checkout_date, checked_out_at,
         accommodation_cents, total_cents, paid_cents, balance_cents, created_by)
       VALUES (?, ?, 'concluida', UTC_TIMESTAMP(3) - INTERVAL 4 DAY, ?, UTC_TIMESTAMP(3), ?, ?, ?, 0, ?)
       ON DUPLICATE KEY UPDATE status = 'concluida', checked_out_at = UTC_TIMESTAMP(3),
         accommodation_cents = VALUES(accommodation_cents), total_cents = VALUES(total_cents),
         paid_cents = VALUES(paid_cents), balance_cents = 0`,
      [
        completedReservation.id,
        roomIds['202'],
        hotelDate(0),
        completedReservation.totalCents,
        completedReservation.totalCents,
        completedReservation.totalCents,
        devUserId,
      ],
    );

    const [[completedStay]] = await connection.execute(
      'SELECT id, total_cents AS totalCents FROM stays WHERE reservation_id = ?',
      [completedReservation.id],
    );
    const paymentKeyHash = createHash('sha256').update('development-seed-payment').digest('hex');
    await connection.execute(
      `INSERT IGNORE INTO payments
        (stay_id, amount_cents, method, reference, idempotency_key_hash, created_by)
       VALUES (?, ?, 'pix', 'SEED-PIX', ?, ?)`,
      [completedStay.id, completedStay.totalCents, paymentKeyHash, devUserId],
    );
    const [[payment]] = await connection.execute(
      'SELECT id FROM payments WHERE idempotency_key_hash = ?',
      [paymentKeyHash],
    );
    await connection.execute(
      `INSERT IGNORE INTO financial_entries
        (direction, category, description, amount_cents, occurred_on, stay_id, payment_id, created_by)
       VALUES ('entrada', 'hospedagem', 'Pagamento de hospedagem (dados de desenvolvimento)', ?, ?, ?, ?, ?)`,
      [completedStay.totalCents, hotelDate(0), completedStay.id, payment.id, devUserId],
    );

    await connection.execute(
      `UPDATE rooms SET status = CASE room_number
         WHEN '201' THEN 'ocupado'
         WHEN '202' THEN 'aguardando_limpeza'
         WHEN '203' THEN 'em_limpeza'
         WHEN '301' THEN 'manutencao'
         ELSE status END
       WHERE room_number IN ('201', '202', '203', '301')`,
    );
    await connection.execute(
      `INSERT INTO housekeeping_tasks (room_id, task_type, status, priority, notes, created_by)
       SELECT ?, 'limpeza', 'pendente', 'alta', '[seed] Limpeza após checkout', ?
       WHERE NOT EXISTS (SELECT 1 FROM housekeeping_tasks WHERE notes = '[seed] Limpeza após checkout')`,
      [roomIds['202'], devUserId],
    );
    await connection.execute(
      `INSERT INTO housekeeping_tasks
        (room_id, task_type, status, priority, notes, created_by, started_at)
       SELECT ?, 'limpeza', 'em_andamento', 'normal', '[seed] Limpeza em andamento', ?, UTC_TIMESTAMP(3)
       WHERE NOT EXISTS (SELECT 1 FROM housekeeping_tasks WHERE notes = '[seed] Limpeza em andamento')`,
      [roomIds['203'], devUserId],
    );
    await connection.execute(
      `INSERT INTO housekeeping_tasks (room_id, task_type, status, priority, notes, created_by)
       SELECT ?, 'manutencao', 'pendente', 'normal', '[seed] Revisão preventiva do ar-condicionado', ?
       WHERE NOT EXISTS (
         SELECT 1 FROM housekeeping_tasks WHERE notes = '[seed] Revisão preventiva do ar-condicionado'
       )`,
      [roomIds['301'], devUserId],
    );

    return {
      rooms: roomDefinitions.length,
      guests: guestDefinitions.length,
      reservations: reservations.length,
    };
  });
}
