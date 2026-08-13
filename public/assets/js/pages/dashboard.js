import { getSupabase } from '../modules/supabase.js';
import { can, getState, setState } from '../modules/state.js';
import { emptyState, friendlyError, toast } from '../modules/ui.js';
import { escapeHtml, formatDate, formatMoney, formatTime, label, statusClass } from '../modules/format.js';

const metricIcons = Object.freeze({
  rooms: '<svg viewBox="0 0 24 24"><path d="M3 20v-8a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v8M3 17h18M7 10V7a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v3"/></svg>',
  available: '<svg viewBox="0 0 24 24"><path d="M20 11a8 8 0 1 1-3.6-6.7"/><path d="m9 11 2 2 7-7"/></svg>',
  occupied: '<svg viewBox="0 0 24 24"><circle cx="8" cy="15" r="3"/><path d="m10.2 12.8 8.3-8.3 2 2-1.5 1.5 1.5 1.5-2 2-1.5-1.5-4.8 4.8"/></svg>',
  occupancy: '<svg viewBox="0 0 24 24"><path d="M4 19V9M10 19V5M16 19v-7M22 19V3"/></svg>'
});

function metric(labelText, value, hint, icon, tone = '') {
  return `<article class="metric-card ${tone ? `metric-card--${tone}` : ''}"><div class="metric-card__top"><span class="metric-card__label">${escapeHtml(labelText)}</span><span class="metric-card__icon" aria-hidden="true">${icon}</span></div><strong class="metric-card__value">${escapeHtml(value)}</strong><span class="metric-card__hint"><span class="metric-card__trend">↗</span>${escapeHtml(hint)}</span></article>`;
}

function asCount(value) {
  const count = Number(value);
  return Number.isFinite(count) ? Math.max(0, count) : 0;
}

function percentage(value, total) {
  if (!total) return 0;
  return Math.min(100, Math.max(0, Math.round((value / total) * 100)));
}

function roomMixRow(labelText, value, total, color) {
  const count = asCount(value);
  const width = count ? Math.max(4, percentage(count, total)) : 0;
  return `<div class="room-mix__row" style="--mix-color:${color};--mix-width:${width}%"><span class="room-mix__label"><i class="room-mix__dot"></i>${escapeHtml(labelText)}</span><span class="room-mix__track"><i class="room-mix__fill"></i></span><strong class="room-mix__value">${count}</strong></div>`;
}

async function loadDashboardData() {
  const supabase = await getSupabase();
  const now = new Date();
  const weekAhead = new Date(now.getTime() + 7 * 86_400_000);

  const [summaryResult, upcomingResult, alertsResult] = await Promise.all([
    supabase.rpc('get_dashboard_summary'),
    supabase.from('reservation_overview')
      .select('id, code, status, check_in_at, check_out_at, guest_name, room_number, total_amount, payment_status')
      .gte('check_out_at', now.toISOString())
      .lte('check_in_at', weekAhead.toISOString())
      .in('status', ['pending', 'confirmed', 'checked_in'])
      .order('check_in_at')
      .limit(8),
    supabase.from('reservation_overview')
      .select('id, code, guest_name, room_number, total_amount, amount_paid, payment_status, check_in_at')
      .in('payment_status', ['pending', 'partial'])
      .in('status', ['pending', 'confirmed', 'checked_in'])
      .order('check_in_at')
      .limit(6)
  ]);

  if (summaryResult.error) throw summaryResult.error;
  return {
    summary: summaryResult.data,
    upcoming: upcomingResult.error ? [] : (upcomingResult.data ?? []),
    alerts: alertsResult.error ? [] : (alertsResult.data ?? [])
  };
}

function upcomingHtml(items) {
  if (!items.length) return emptyState({ icon: '✓', title: 'Agenda tranquila', message: 'Não há chegadas ou saídas previstas nos próximos sete dias.' });
  return `<div class="timeline">${items.map((item) => `
    <div class="timeline-item">
      <span class="timeline-time">${formatDate(item.check_in_at).slice(0, 5)}<br>${formatTime(item.check_in_at)}</span>
      <span class="timeline-dot"></span>
      <div class="timeline-copy"><strong>${escapeHtml(item.guest_name)} · Quarto ${escapeHtml(item.room_number)}</strong><small>${escapeHtml(item.code)} · Saída ${formatDate(item.check_out_at)} às ${formatTime(item.check_out_at)}</small></div>
      <span class="status-badge ${statusClass(item.status)}">${escapeHtml(label(item.status))}</span>
    </div>`).join('')}</div>`;
}

function alertsHtml(items) {
  if (!items.length) return emptyState({ icon: '✓', title: 'Pagamentos em dia', message: 'Nenhuma reserva ativa apresenta pendência de pagamento.' });
  return `<div class="timeline">${items.map((item) => {
    const balance = Number(item.total_amount) - Number(item.amount_paid || 0);
    return `<div class="timeline-item">
      <span class="timeline-time">${formatDate(item.check_in_at).slice(0, 5)}</span><span class="timeline-dot"></span>
      <div class="timeline-copy"><strong>${escapeHtml(item.guest_name)}</strong><small>${escapeHtml(item.code)} · Falta ${formatMoney(balance)}</small></div>
      <span class="status-badge ${statusClass(item.payment_status)}">${escapeHtml(label(item.payment_status))}</span>
    </div>`;
  }).join('')}</div>`;
}

function bindDashboardActions(root) {
  root.querySelectorAll('[data-dashboard-action]').forEach((button) => {
    button.addEventListener('click', () => {
      const action = button.dataset.dashboardAction;
      if (action === 'new-reservation') window.dispatchEvent(new CustomEvent('hotel:new-reservation'));
      if (action === 'new-guest') window.dispatchEvent(new CustomEvent('hotel:new-guest'));
      if (action === 'check-in') window.dispatchEvent(new CustomEvent('hotel:navigate', { detail: { route: 'reservations', filter: 'confirmed' } }));
      if (action === 'check-out') window.dispatchEvent(new CustomEvent('hotel:navigate', { detail: { route: 'reservations', filter: 'checked_in' } }));
      if (action === 'room-status') window.dispatchEvent(new CustomEvent('hotel:navigate', { detail: { route: 'rooms' } }));
    });
  });
}

export async function renderDashboard(container) {
  try {
    const { summary, upcoming, alerts } = await loadDashboardData();
    setState({ dashboard: { summary, upcoming, alerts } });
    window.dispatchEvent(new CustomEvent('hotel:notifications', { detail: { upcoming, alerts } }));

    const rooms = summary.rooms ?? {};
    const roomTotal = asCount(rooms.total);
    const occupancyRate = Math.min(100, Math.max(0, asCount(rooms.occupancyRate)));
    container.innerHTML = `
      <div class="page-heading">
        <div><h2>Boa jornada, ${escapeHtml(getState().profile.full_name.split(' ')[0])}.</h2><p>Acompanhe a operação de hoje e antecipe os próximos movimentos.</p></div>
        <div class="heading-actions"><span class="status-badge status--available">Atualizado agora</span></div>
      </div>

      <section class="metric-grid" aria-label="Indicadores dos quartos">
        ${metric('Total de quartos', roomTotal, 'Inventário ativo', metricIcons.rooms)}
        ${metric('Disponíveis', asCount(rooms.available), 'Prontos para receber', metricIcons.available, 'green')}
        ${metric('Ocupados', asCount(rooms.occupied), 'Hospedagens em andamento', metricIcons.occupied, 'amber')}
        ${metric('Ocupação atual', `${occupancyRate}%`, 'Percentual neste momento', metricIcons.occupancy, 'coral')}
      </section>

      <section class="dashboard-overview-grid">
        <article class="panel panel--overview">
          <header class="panel__header"><div><h3>Visão operacional dos quartos</h3><p>Distribuição atual da capacidade do hotel</p></div><button class="button button--ghost button--small" data-dashboard-action="room-status">Ver quartos</button></header>
          <div class="panel__body">
            <div class="overview-layout">
              <div class="occupancy-ring" style="--occupancy:${occupancyRate}%"><div class="occupancy-ring__copy"><strong>${occupancyRate}%</strong><span>de ocupação</span></div></div>
              <div class="room-mix" aria-label="Distribuição dos quartos por situação">
                ${roomMixRow('Disponíveis', rooms.available, roomTotal, '#00b69b')}
                ${roomMixRow('Reservados', rooms.reserved, roomTotal, '#f4a340')}
                ${roomMixRow('Ocupados', rooms.occupied, roomTotal, '#4880ff')}
                ${roomMixRow('Aguardando limpeza', rooms.awaitingCleaning, roomTotal, '#8b72e8')}
                ${roomMixRow('Em manutenção', rooms.maintenance, roomTotal, '#ef476f')}
              </div>
            </div>
            <div class="mini-metric-row">
              <div class="mini-metric"><strong>${asCount(summary.reservationsToday)}</strong><span>Reservas hoje</span></div>
              <div class="mini-metric"><strong>${asCount(summary.checkinsToday)}</strong><span>Check-ins previstos</span></div>
              <div class="mini-metric"><strong>${asCount(summary.checkoutsToday)}</strong><span>Check-outs previstos</span></div>
              <div class="mini-metric"><strong>${asCount(summary.pendingReservations)}</strong><span>Reservas pendentes</span></div>
            </div>
          </div>
        </article>

        <article class="panel">
          <header class="panel__header"><div><h3>Atalhos da operação</h3><p>Ações frequentes da recepção</p></div></header>
          <div class="panel__body"><div class="quick-actions">
            ${can('admin', 'reception') ? `
              <button class="quick-action" data-dashboard-action="new-reservation"><span class="quick-action__icon">+</span><span><strong>Nova reserva</strong><small>Consultar período e cadastrar</small></span></button>
              <button class="quick-action" data-dashboard-action="new-guest"><span class="quick-action__icon">◎</span><span><strong>Novo hóspede</strong><small>Cadastrar com segurança</small></span></button>
              <button class="quick-action" data-dashboard-action="check-in"><span class="quick-action__icon">→</span><span><strong>Realizar check-in</strong><small>Ver chegadas confirmadas</small></span></button>
              <button class="quick-action" data-dashboard-action="check-out"><span class="quick-action__icon">←</span><span><strong>Realizar check-out</strong><small>Ver hospedagens ativas</small></span></button>` : ''}
            <button class="quick-action" data-dashboard-action="room-status"><span class="quick-action__icon">▦</span><span><strong>Situação dos quartos</strong><small>Disponibilidade e limpeza</small></span></button>
          </div></div>
        </article>
      </section>

      <section class="dashboard-grid">
        <article class="panel">
          <header class="panel__header"><div><h3>Próximas chegadas e saídas</h3><p>Agenda dos próximos sete dias</p></div><button class="button button--ghost button--small" data-dashboard-action="check-in">Ver reservas</button></header>
          <div class="panel__body">${upcomingHtml(upcoming)}</div>
        </article>
        <article class="panel">
          <header class="panel__header"><div><h3>Pagamentos que pedem atenção</h3><p>${alerts.length} reserva(s) com saldo pendente ou parcial</p></div></header>
          <div class="panel__body">${alertsHtml(alerts)}</div>
        </article>
      </section>`;
    bindDashboardActions(container);
  } catch (error) {
    container.innerHTML = emptyState({ icon: '!', title: 'Não foi possível carregar o painel', message: friendlyError(error), actionLabel: 'Tentar novamente', actionId: 'retry-dashboard' });
    container.querySelector('#retry-dashboard')?.addEventListener('click', () => renderDashboard(container));
    toast(friendlyError(error), { title: 'Falha ao carregar', type: 'error' });
  }
}
