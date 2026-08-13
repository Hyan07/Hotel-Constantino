import { withConnection } from '../db/pool.js';
import { nightsBetween } from '../utils/dates.js';

export async function getReports({ from, to }) {
  const periodDays = nightsBetween(from, to);
  return withConnection(async (connection) => {
    const [[rooms]] = await connection.execute(
      'SELECT COUNT(*) AS total FROM rooms WHERE deleted_at IS NULL',
    );
    const [[occupied]] = await connection.execute(
      `SELECT COALESCE(SUM(
         GREATEST(0, DATEDIFF(LEAST(reservations.check_out_date, ?), GREATEST(reservations.check_in_date, ?)))
       ), 0) AS occupiedRoomNights
         FROM reservations
        WHERE reservations.status IN ('hospedada', 'concluida')
          AND reservations.check_in_date < ? AND reservations.check_out_date > ?`,
      [to, from, to, from],
    );
    const [[finance]] = await connection.execute(
      `SELECT COALESCE(SUM(CASE WHEN direction = 'entrada' AND status = 'lancado' THEN amount_cents ELSE 0 END), 0) AS incomeCents,
              COALESCE(SUM(CASE WHEN direction = 'saida' AND status = 'lancado' THEN amount_cents ELSE 0 END), 0) AS expenseCents
         FROM financial_entries WHERE occurred_on >= ? AND occurred_on < ?`,
      [from, to],
    );
    const [reservationStatuses] = await connection.execute(
      `SELECT status, COUNT(*) AS total, COALESCE(SUM(total_cents), 0) AS bookedCents
         FROM reservations
        WHERE check_in_date < ? AND check_out_date > ?
        GROUP BY status ORDER BY status`,
      [to, from],
    );
    const capacityRoomNights = Number(rooms.total) * periodDays;
    const occupiedRoomNights = Number(occupied.occupiedRoomNights);
    return {
      period: { from, to, days: periodDays },
      occupancy: {
        occupiedRoomNights,
        capacityRoomNights,
        percentage: capacityRoomNights
          ? Math.round((occupiedRoomNights / capacityRoomNights) * 1000) / 10
          : 0,
      },
      finance: {
        incomeCents: Number(finance.incomeCents),
        expenseCents: Number(finance.expenseCents),
        balanceCents: Number(finance.incomeCents) - Number(finance.expenseCents),
      },
      reservations: reservationStatuses.map((row) => ({
        status: row.status,
        total: Number(row.total),
        bookedCents: Number(row.bookedCents),
      })),
    };
  });
}
