export function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

export function formatCurrency(cents) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(
    Number(cents ?? 0) / 100,
  );
}

export function formatDate(value) {
  if (!value) return '—';
  const [year, month, day] = String(value).slice(0, 10).split('-').map(Number);
  return new Intl.DateTimeFormat('pt-BR').format(new Date(year, month - 1, day));
}

export function formatDateTime(value) {
  if (!value) return '—';
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
    timeZone: 'America/Sao_Paulo',
  }).format(new Date(value));
}

export function todayInput() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

export function addDays(date, days) {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
}

export function moneyInputToCents(value) {
  const normalized = String(value ?? '').replace(',', '.');
  return Math.round(Number(normalized) * 100);
}

export function statusLabel(value) {
  const labels = {
    disponivel: 'Disponível',
    ocupado: 'Ocupado',
    aguardando_limpeza: 'Aguardando limpeza',
    em_limpeza: 'Em limpeza',
    manutencao: 'Manutenção',
    bloqueado: 'Bloqueado',
    pendente: 'Pendente',
    confirmada: 'Confirmada',
    hospedada: 'Hospedada',
    concluida: 'Concluída',
    cancelada: 'Cancelada',
    no_show: 'No-show',
    ativa: 'Ativa',
    em_andamento: 'Em andamento',
    active: 'Ativo',
    inactive: 'Inativo',
    locked: 'Bloqueado',
    entrada: 'Entrada',
    saida: 'Saída',
    lancado: 'Lançado',
    estornado: 'Estornado',
  };
  return labels[value] ?? value ?? '—';
}

export function statusBadge(value) {
  return `<span class="status-badge status-${escapeHtml(value)}">${escapeHtml(statusLabel(value))}</span>`;
}
