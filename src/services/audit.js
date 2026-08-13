import { supabaseAdmin } from '../lib/supabase.js';

export async function writeAudit({ userId, action, tableName, recordId, before, after, ipAddress }) {
  const { error } = await supabaseAdmin.from('audit_logs').insert({
    user_id: userId,
    action,
    table_name: tableName,
    record_id: recordId ?? null,
    old_values: before ?? null,
    new_values: after ?? null,
    ip_address: ipAddress ?? null
  });

  if (error) {
    // Audit failure must remain visible to operations without leaking payloads.
    console.error('Falha ao registrar auditoria:', error.code, error.message);
  }
}
