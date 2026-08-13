import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, describe, it } from 'node:test';
import request from 'supertest';

const mysqlDescribe = process.env.RUN_DB_TESTS === 'true' ? describe : describe.skip;

mysqlDescribe('fluxo operacional completo com MySQL', () => {
  let app;
  let agent;
  let csrfToken;
  let closePool;
  let todayAtHotel;
  const suffix = randomUUID().slice(0, 8);

  before(async () => {
    process.env.NODE_ENV = 'test';
    process.env.DEV_AUTH_BYPASS = 'false';
    process.env.LOG_LEVEL = 'fatal';
    const [{ createApp }, poolModule, migrationModule, passwordModule, dateModule] =
      await Promise.all([
        import('../src/app.js'),
        import('../src/db/pool.js'),
        import('../src/db/migrations.js'),
        import('../src/utils/password.js'),
        import('../src/utils/dates.js'),
      ]);
    closePool = poolModule.closePool;
    todayAtHotel = dateModule.todayAtHotel;
    await migrationModule.runMigrations();
    const passwordHash = await passwordModule.hashPassword('Integração segura 2026!');
    const pool = poolModule.getPool();
    await pool.execute(
      `INSERT INTO users (full_name, email, password_hash, status)
       VALUES ('Administrador de integração', 'integration@example.invalid', ?, 'active')
       ON DUPLICATE KEY UPDATE password_hash = VALUES(password_hash), status = 'active'`,
      [passwordHash],
    );
    await pool.execute(
      `INSERT IGNORE INTO user_roles (user_id, role_id)
       SELECT users.id, roles.id FROM users JOIN roles ON roles.code = 'administrador'
        WHERE users.email = 'integration@example.invalid'`,
    );
    app = createApp();
    agent = request.agent(app);
    const login = await agent
      .post('/api/v1/auth/login')
      .send({ email: 'integration@example.invalid', password: 'Integração segura 2026!' })
      .expect(200);
    csrfToken = login.body.data.csrfToken;
    assert.ok(
      login.headers['set-cookie'].some((cookie) => cookie.startsWith('constantinos.csrf=')),
    );
    assert.ok(login.headers['set-cookie'].every((cookie) => /SameSite=Strict/u.test(cookie)));
  });

  after(async () => {
    if (closePool) await closePool();
  });

  it('executa reserva, check-in, pagamento, checkout e limpeza', async () => {
    const guestResponse = await agent
      .post('/api/v1/guests')
      .set('x-csrf-token', csrfToken)
      .send({ fullName: `Hóspede Integração ${suffix}`, email: `${suffix}@example.invalid` })
      .expect(201);
    const roomResponse = await agent
      .post('/api/v1/rooms')
      .set('x-csrf-token', csrfToken)
      .send({
        roomNumber: `T-${suffix}`,
        category: 'Teste',
        floor: 9,
        capacity: 2,
        baseRateCents: 10_000,
      })
      .expect(201);

    const today = todayAtHotel();
    const tomorrow = new Date(Date.parse(`${today}T00:00:00Z`) + 86_400_000)
      .toISOString()
      .slice(0, 10);
    const reservationResponse = await agent
      .post('/api/v1/reservations')
      .set('x-csrf-token', csrfToken)
      .set('idempotency-key', `reservation-${suffix}`)
      .send({
        primaryGuestId: guestResponse.body.data.id,
        roomId: roomResponse.body.data.id,
        checkInDate: today,
        checkOutDate: tomorrow,
        adults: 1,
        children: 0,
      })
      .expect(201);
    const confirmed = await agent
      .post(`/api/v1/reservations/${reservationResponse.body.data.id}/confirm`)
      .set('x-csrf-token', csrfToken)
      .send({ version: reservationResponse.body.data.version })
      .expect(200);
    const checkedIn = await agent
      .post(`/api/v1/reservations/${confirmed.body.data.id}/check-in`)
      .set('x-csrf-token', csrfToken)
      .set('idempotency-key', `checkin-${suffix}`)
      .send({ version: confirmed.body.data.version })
      .expect(201);
    const paid = await agent
      .post(`/api/v1/stays/${checkedIn.body.data.id}/payments`)
      .set('x-csrf-token', csrfToken)
      .set('idempotency-key', `payment-${suffix}`)
      .send({ version: checkedIn.body.data.version, amountCents: 10_000, method: 'pix' })
      .expect(201);
    const checkout = await agent
      .post(`/api/v1/stays/${checkedIn.body.data.id}/checkout`)
      .set('x-csrf-token', csrfToken)
      .set('idempotency-key', `checkout-${suffix}`)
      .send({ version: paid.body.data.version })
      .expect(200);
    assert.equal(checkout.body.data.status, 'concluida');

    const tasks = await agent.get('/api/v1/housekeeping?status=pendente').expect(200);
    const task = tasks.body.data.find((item) => item.roomId === roomResponse.body.data.id);
    assert.ok(task);
    const started = await agent
      .post(`/api/v1/housekeeping/${task.id}/start`)
      .set('x-csrf-token', csrfToken)
      .send({ version: task.version })
      .expect(200);
    await agent
      .post(`/api/v1/housekeeping/${task.id}/complete`)
      .set('x-csrf-token', csrfToken)
      .send({ version: started.body.data.version })
      .expect(200);
    const finalRoom = await agent.get(`/api/v1/rooms/${roomResponse.body.data.id}`).expect(200);
    assert.equal(finalRoom.body.data.status, 'disponivel');

    const reservationPayload = {
      primaryGuestId: guestResponse.body.data.id,
      roomId: roomResponse.body.data.id,
      checkInDate: today,
      checkOutDate: tomorrow,
      adults: 1,
      children: 0,
    };
    const concurrentAttempts = await Promise.all([
      agent
        .post('/api/v1/reservations')
        .set('x-csrf-token', csrfToken)
        .set('idempotency-key', `concurrent-a-${suffix}`)
        .send(reservationPayload),
      agent
        .post('/api/v1/reservations')
        .set('x-csrf-token', csrfToken)
        .set('idempotency-key', `concurrent-b-${suffix}`)
        .send(reservationPayload),
    ]);
    assert.deepEqual(concurrentAttempts.map((response) => response.status).sort(), [201, 409]);
    assert.equal(
      concurrentAttempts.find((response) => response.status === 409).body.error.code,
      'RESERVATION_OVERLAP',
    );
  });

  it('aplica as permissões do funcionário no backend', async () => {
    const email = `employee-${suffix}@example.invalid`;
    await agent
      .post('/api/v1/users')
      .set('x-csrf-token', csrfToken)
      .send({
        fullName: `Funcionário Integração ${suffix}`,
        email,
        password: 'Funcionário seguro 2026!',
        roleCodes: ['funcionario'],
      })
      .expect(201);

    const employee = request.agent(app);
    const login = await employee
      .post('/api/v1/auth/login')
      .send({ email, password: 'Funcionário seguro 2026!' })
      .expect(200);

    await employee.get('/api/v1/rooms').expect(200);
    const forbidden = await employee
      .post('/api/v1/rooms')
      .set('x-csrf-token', login.body.data.csrfToken)
      .send({
        roomNumber: `F-${suffix}`,
        category: 'Teste',
        floor: 9,
        capacity: 1,
        baseRateCents: 10_000,
      })
      .expect(403);
    assert.equal(forbidden.body.error.code, 'FORBIDDEN');
  });
});
