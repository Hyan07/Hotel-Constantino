import { withConnection } from '../db/pool.js';
import { todayAtHotel } from '../utils/dates.js';

export async function getDashboard() {
  const today = todayAtHotel();
  return withConnection(async (connection) => {
    const [roomRows] = await connection.execute(
      'SELECT status, COUNT(*) AS total FROM rooms WHERE deleted_at IS NULL GROUP BY status',
    );
    const [[activeStayCount]] = await connection.execute(
      "SELECT COUNT(*) AS total FROM stays WHERE status = 'ativa'",
    );
    const [arrivals] = await connection.execute(
      `SELECT reservations.id, reservations.code, guests.full_name AS guestName,
              rooms.room_number AS roomNumber, reservations.check_in_date AS checkInDate,
              reservations.status, reservations.version
         FROM reservations
         JOIN guests ON guests.id = reservations.primary_guest_id
         JOIN rooms ON rooms.id = reservations.room_id
        WHERE reservations.check_in_date = ? AND reservations.status IN ('pendente', 'confirmada')
        ORDER BY rooms.room_number LIMIT 20`,
      [today],
    );
    const [departures] = await connection.execute(
      `SELECT stays.id, guests.full_name AS guestName, rooms.room_number AS roomNumber,
              stays.expected_checkout_date AS expectedCheckoutDate, stays.balance_cents AS balanceCents,
              stays.version
         FROM stays
         JOIN reservations ON reservations.id = stays.reservation_id
         JOIN guests ON guests.id = reservations.primary_guest_id
         JOIN rooms ON rooms.id = stays.room_id
        WHERE stays.expected_checkout_date = ? AND stays.status = 'ativa'
        ORDER BY rooms.room_number LIMIT 20`,
      [today],
    );
    const [pendingTasks] = await connection.execute(
      `SELECT housekeeping_tasks.id, rooms.room_number AS roomNumber,
              housekeeping_tasks.task_type AS taskType, housekeeping_tasks.status,
              housekeeping_tasks.priority, housekeeping_tasks.version
         FROM housekeeping_tasks
         JOIN rooms ON rooms.id = housekeeping_tasks.room_id
        WHERE housekeeping_tasks.status IN ('pendente', 'em_andamento')
        ORDER BY FIELD(priority, 'urgente', 'alta', 'normal', 'baixa'), created_at LIMIT 20`,
    );
    const [[monthFinance]] = await connection.execute(
      `SELECT COALESCE(SUM(CASE WHEN direction = 'entrada' AND status = 'lancado' THEN amount_cents ELSE 0 END), 0) AS incomeCents,
              COALESCE(SUM(CASE WHEN direction = 'saida' AND status = 'lancado' THEN amount_cents ELSE 0 END), 0) AS expenseCents
         FROM financial_entries
        WHERE occurred_on >= DATE_FORMAT(?, '%Y-%m-01') AND occurred_on <= ?`,
      [today, today],
    );
    const roomCounts = Object.fromEntries(roomRows.map((row) => [row.status, Number(row.total)]));
    const totalRooms = Object.values(roomCounts).reduce((sum, value) => sum + value, 0);
    const occupiedRooms = Number(activeStayCount.total);
    return {
      date: today,
      occupancy: {
        occupiedRooms,
        totalRooms,
        percentage: totalRooms ? Math.round((occupiedRooms / totalRooms) * 1000) / 10 : 0,
      },
      roomCounts,
      arrivals,
      departures: departures.map((row) => ({ ...row, balanceCents: Number(row.balanceCents) })),
      pendingTasks,
      finance: {
        incomeCents: Number(monthFinance.incomeCents),
        expenseCents: Number(monthFinance.expenseCents),
      },
    };
  });
}
