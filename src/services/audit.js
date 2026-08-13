import { pool } from '../lib/db.js';

export async function writeAudit({ userId, action, tableName, recordId, before, after, ipAddress, userAgent, connection }) {
  const executor = connection ?? pool;
  try {
    await executor.execute(
      `INSERT INTO audit_logs
        (user_id, action, table_name, record_id, old_values, new_values, ip_address, user_agent)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        userId ?? null,
        action,
        tableName,
        recordId ?? null,
        before === undefined || before === null ? null : JSON.stringify(before),
        after === undefined || after === null ? null : JSON.stringify(after),
        ipAddress ?? null,
        userAgent ? String(userAgent).slice(0, 500) : null
      ]
    );
  } catch (error) {
    // Audit failure must remain visible to operations without leaking payloads.
    console.error('Falha ao registrar auditoria:', error.code, error.message);
    if (connection) throw error;
  }
}
