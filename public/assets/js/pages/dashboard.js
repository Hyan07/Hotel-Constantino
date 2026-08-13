import { getSupabase } from '../modules/supabase.js';
import { can, getState, setState } from '../modules/state.js';
import { emptyState, friendlyError, toast } from '../modules/ui.js';
import { escapeHtml, formatDate, formatMoney, formatTime, label, statusClass } from '../modules/format.js';

function metric(labelText, value, hint, dot = '') {
  return `<article class="metric-card"><div class="metric-card__label"><span>${escapeHtml(labelText)}</span><span class="metric-dot ${dot}"></span></div><strong class="metric-card__value">${escapeHtml(value)}</strong><span class="metric-card__hint">${escapeHtml(hint)}</span></article>`;
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
    container.innerHTML = `
      <div class="page-heading">
        <div><h2>Boa jornada, ${escapeHtml(getState().profile.full_name.split(' ')[0])}.</h2><p>Acompanhe a operação de hoje e antecipe os próximos movimentos.</p></div>
        <div class="heading-actions"><span class="status-badge status--available">Atualizado agora</span></div>
      </div>

      <section class="metric-grid" aria-label="Indicadores dos quartos">
        ${metric('Total de quartos', rooms.total ?? 0, 'Quartos ativos')}
        ${metric('Disponíveis', rooms.available ?? 0, 'Prontos para receber', 'metric-dot--gold')}
        ${metric('Reservados', rooms.reserved ?? 0, 'Aguardando chegada', 'metric-dot--warning')}
        ${metric('Ocupados', rooms.occupied ?? 0, 'Hospedagens ativas')}
        ${metric('Aguardando limpeza', rooms.awaitingCleaning ?? 0, 'Prioridade da governança', 'metric-dot--warning')}
        ${metric('Em manutenção', rooms.maintenance ?? 0, 'Temporariamente indisponíveis', 'metric-dot--danger')}
        ${metric('Ocupação atual', `${rooms.occupancyRate ?? 0}%`, 'Quartos ocupados agora', 'metric-dot--gold')}
        ${metric('Reservas do dia', summary.reservationsToday ?? 0, 'Criadas hoje')}
        ${metric('Check-ins previstos', summary.checkinsToday ?? 0, 'Chegadas de hoje')}
        ${metric('Check-outs previstos', summary.checkoutsToday ?? 0, 'Saídas de hoje')}
        ${metric('Reservas pendentes', summary.pendingReservations ?? 0, 'Precisam de atenção', 'metric-dot--warning')}
        ${metric('Pagamentos pendentes', alerts.length, 'Reservas ativas com saldo', alerts.length ? 'metric-dot--danger' : '')}
      </section>

      <section class="dashboard-grid">
        <div class="stack">
          <article class="panel">
            <header class="panel__header"><div><h3>Próximas chegadas e saídas</h3><p>Agenda dos próximos sete dias</p></div><button class="button button--ghost button--small" data-dashboard-action="check-in">Ver reservas</button></header>
            <div class="panel__body">${upcomingHtml(upcoming)}</div>
          </article>
          <article class="panel">
            <header class="panel__header"><div><h3>Pagamentos que pedem atenção</h3><p>Saldos pendentes ou parciais</p></div></header>
            <div class="panel__body">${alertsHtml(alerts)}</div>
          </article>
        </div>
        <aside class="stack">
          <article class="panel">
            <header class="panel__header"><div><h3>Atalhos da operação</h3><p>Ações frequentes da recepção</p></div></header>
            <div class="panel__body"><div class="quick-actions">
              ${can('admin', 'reception') ? `
                <button class="quick-action" data-dashboard-action="new-reservation"><span class="quick-action__icon">+</span><span><strong>Nova reserva</strong><small>Consultar período e cadastrar</small></span></button>
                <button class="quick-action" data-dashboard-action="new-guest"><span class="quick-action__icon">♙</span><span><strong>Novo hóspede</strong><small>Cadastrar com segurança</small></span></button>
                <button class="quick-action" data-dashboard-action="check-in"><span class="quick-action__icon">→</span><span><strong>Realizar check-in</strong><small>Ver chegadas confirmadas</small></span></button>
                <button class="quick-action" data-dashboard-action="check-out"><span class="quick-action__icon">←</span><span><strong>Realizar check-out</strong><small>Ver hospedagens ativas</small></span></button>` : ''}
              <button class="quick-action" data-dashboard-action="room-status"><span class="quick-action__icon">▤</span><span><strong>Situação dos quartos</strong><small>Disponibilidade e limpeza</small></span></button>
            </div></div>
          </article>
          <article class="panel">
            <header class="panel__header"><div><h3>Leitura rápida</h3><p>Estado atual da hospedagem</p></div></header>
            <div class="panel__body">
              <div class="detail-grid">
                <div class="detail-item"><small>Capacidade disponível</small><strong>${Math.max(0, (rooms.total ?? 0) - (rooms.occupied ?? 0) - (rooms.maintenance ?? 0))} quartos</strong></div>
                <div class="detail-item"><small>Fila de limpeza</small><strong>${rooms.awaitingCleaning ?? 0} quartos</strong></div>
              </div>
              ${(rooms.awaitingCleaning ?? 0) > 0 ? '<div class="alert alert--warning">Há quartos aguardando limpeza. Priorize-os antes das próximas chegadas.</div>' : '<div class="alert alert--success">Não há quartos aguardando limpeza neste momento.</div>'}
            </div>
          </article>
        </aside>
      </section>`;
    bindDashboardActions(container);
  } catch (error) {
    container.innerHTML = emptyState({ icon: '!', title: 'Não foi possível carregar o painel', message: friendlyError(error), actionLabel: 'Tentar novamente', actionId: 'retry-dashboard' });
    container.querySelector('#retry-dashboard')?.addEventListener('click', () => renderDashboard(container));
    toast(friendlyError(error), { title: 'Falha ao carregar', type: 'error' });
  }
}
