const dateFormatter = new Intl.DateTimeFormat('pt-BR', {
  timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric'
});
const dateTimeFormatter = new Intl.DateTimeFormat('pt-BR', {
  timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit'
});
const timeFormatter = new Intl.DateTimeFormat('pt-BR', {
  timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit'
});
const moneyFormatter = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

export function escapeHtml(value = '') {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

export function formatDate(value) {
  if (!value) return '—';
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [year, month, day] = value.split('-');
    return `${day}/${month}/${year}`;
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : dateFormatter.format(date);
}

export function formatDateTime(value) {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : dateTimeFormatter.format(date);
}

export function formatTime(value) {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : timeFormatter.format(date);
}

export function formatMoney(value) {
  return moneyFormatter.format(Number(value) || 0);
}

export function toLocalDateTimeInput(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const parts = new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false
  }).formatToParts(date).reduce((acc, part) => ({ ...acc, [part.type]: part.value }), {});
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
}

export function localInputToIso(value) {
  return value ? new Date(value).toISOString() : null;
}

export function formatCpf(value = '') {
  const digits = String(value).replace(/\D/g, '').slice(0, 11);
  return digits
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d{1,2})$/, '$1-$2');
}

export function maskDocument(value = '') {
  const normalized = String(value).replace(/\s/g, '');
  if (!normalized) return 'Não informado';
  const tail = normalized.slice(-3);
  return `•••.•••.•••-${tail}`;
}

export function formatPhone(value = '') {
  const digits = String(value).replace(/\D/g, '').slice(0, 11);
  if (digits.length <= 10) return digits.replace(/(\d{2})(\d)/, '($1) $2').replace(/(\d{4})(\d)/, '$1-$2');
  return digits.replace(/(\d{2})(\d)/, '($1) $2').replace(/(\d{5})(\d)/, '$1-$2');
}

export function validateCpf(value) {
  const cpf = String(value).replace(/\D/g, '');
  if (cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) return false;
  for (let digit = 9; digit < 11; digit += 1) {
    let sum = 0;
    for (let index = 0; index < digit; index += 1) sum += Number(cpf[index]) * ((digit + 1) - index);
    const check = ((sum * 10) % 11) % 10;
    if (check !== Number(cpf[digit])) return false;
  }
  return true;
}

export function initials(name = '') {
  return String(name).trim().split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase() || 'CH';
}

export function normalizeSearch(value = '') {
  return String(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
}

export function statusClass(value = '') {
  return `status--${String(value).replaceAll('-', '_')}`;
}

export function nightsBetween(checkIn, checkOut) {
  const start = new Date(checkIn).getTime();
  const end = new Date(checkOut).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return 0;
  return Math.max(1, Math.ceil((end - start) / 86_400_000));
}

export const labels = Object.freeze({
  pre_reservation: 'Pré-reserva', pending: 'Pendente', confirmed: 'Confirmada', checked_in: 'Check-in realizado',
  checked_out: 'Check-out realizado', canceled: 'Cancelada', no_show: 'Não compareceu',
  available: 'Disponível', reserved: 'Reservado', occupied: 'Ocupado', awaiting_cleaning: 'Aguardando limpeza',
  cleaning: 'Em limpeza', blocked: 'Bloqueado', maintenance: 'Em manutenção',
  clean: 'Limpo', in_progress: 'Em andamento', inspected: 'Inspecionado',
  paid: 'Pago', partial: 'Parcial', refunded: 'Reembolsado', received: 'Recebido', voided: 'Anulado',
  open: 'Aberta', completed: 'Concluída', waiting_parts: 'Aguardando peças',
  cash: 'Dinheiro', pix: 'Pix', credit_card: 'Cartão de crédito', debit_card: 'Cartão de débito',
  bank_transfer: 'Transferência', invoice: 'Faturado', other: 'Outro',
  admin: 'Administrador', reception: 'Recepção', housekeeping: 'Governança / limpeza', viewer: 'Consulta'
});

export function label(value) {
  return labels[value] ?? value ?? '—';
}
