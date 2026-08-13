import { withConnection, withTransaction } from '../db/pool.js';
import { writeAudit } from '../db/repositories/audit.repository.js';
import { AppError } from '../utils/app-error.js';
import { paginationMeta, parsePagination } from '../utils/pagination.js';

function filters(query) {
  const conditions = [];
  const parameters = [];
  if (query.from) {
    conditions.push('occurred_on >= ?');
    parameters.push(query.from);
  }
  if (query.to) {
    conditions.push('occurred_on <= ?');
    parameters.push(query.to);
  }
  if (query.direction) {
    conditions.push('direction = ?');
    parameters.push(query.direction);
  }
  if (query.status) {
    conditions.push('status = ?');
    parameters.push(query.status);
  }
  return { where: conditions.length ? `WHERE ${conditions.join(' AND ')}` : '', parameters };
}

export async function listFinance(query) {
  const pagination = parsePagination(query);
  const { where, parameters } = filters(query);
  return withConnection(async (connection) => {
    const [[count]] = await connection.execute(
      `SELECT COUNT(*) AS total FROM financial_entries ${where}`,
      parameters,
    );
    const [[totals]] = await connection.execute(
      `SELECT COALESCE(SUM(CASE WHEN direction = 'entrada' AND status = 'lancado' THEN amount_cents ELSE 0 END), 0) AS incomeCents,
              COALESCE(SUM(CASE WHEN direction = 'saida' AND status = 'lancado' THEN amount_cents ELSE 0 END), 0) AS expenseCents
         FROM financial_entries ${where}`,
      parameters,
    );
    const [rows] = await connection.execute(
      `SELECT id, direction, category, description, amount_cents AS amountCents,
              occurred_on AS occurredOn, stay_id AS stayId, payment_id AS paymentId,
              status, version, created_at AS createdAt, updated_at AS updatedAt
         FROM financial_entries ${where}
        ORDER BY occurred_on DESC, id DESC LIMIT ? OFFSET ?`,
      [...parameters, pagination.pageSize, pagination.offset],
    );
    return {
      data: rows.map((row) => ({
        ...row,
        amountCents: Number(row.amountCents),
        version: Number(row.version),
      })),
      meta: {
        ...paginationMeta(Number(count.total), pagination),
        incomeCents: Number(totals.incomeCents),
        expenseCents: Number(totals.expenseCents),
        balanceCents: Number(totals.incomeCents) - Number(totals.expenseCents),
      },
    };
  });
}

export async function createFinanceEntry(input, actor) {
  return withTransaction(async (connection) => {
    const [result] = await connection.execute(
      `INSERT INTO financial_entries
        (direction, category, description, amount_cents, occurred_on, created_by)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        input.direction,
        input.category,
        input.description,
        input.amountCents,
        input.occurredOn,
        actor.userId,
      ],
    );
    await writeAudit(connection, {
      actorUserId: actor.userId,
      action: 'finance.created',
      entityType: 'financial_entry',
      entityId: result.insertId,
      requestId: actor.requestId,
    });
    const [[entry]] = await connection.execute(
      `SELECT id, direction, category, description, amount_cents AS amountCents,
              occurred_on AS occurredOn, status, version, created_at AS createdAt
         FROM financial_entries WHERE id = ?`,
      [result.insertId],
    );
    return { ...entry, amountCents: Number(entry.amountCents), version: Number(entry.version) };
  });
}

export async function reverseFinanceEntry(entryId, input, actor) {
  return withTransaction(async (connection) => {
    const [[entry]] = await connection.execute(
      'SELECT id, status, payment_id AS paymentId, version FROM financial_entries WHERE id = ? FOR UPDATE',
      [entryId],
    );
    if (!entry)
      throw new AppError('Lançamento não encontrado.', { statusCode: 404, code: 'NOT_FOUND' });
    if (entry.paymentId) {
      throw new AppError('Estorne o pagamento pela operação específica de pagamentos.', {
        statusCode: 409,
        code: 'PAYMENT_ENTRY_PROTECTED',
      });
    }
    if (entry.status !== 'lancado' || Number(entry.version) !== input.version) {
      throw new AppError('O lançamento já foi alterado ou estornado.', {
        statusCode: 409,
        code: 'VERSION_CONFLICT',
      });
    }
    await connection.execute(
      `UPDATE financial_entries
          SET status = 'estornado', reversed_at = UTC_TIMESTAMP(3), version = version + 1
        WHERE id = ? AND version = ?`,
      [entryId, input.version],
    );
    await writeAudit(connection, {
      actorUserId: actor.userId,
      action: 'finance.reversed',
      entityType: 'financial_entry',
      entityId: entryId,
      requestId: actor.requestId,
      context: { reason: input.reason },
    });
  });
}
