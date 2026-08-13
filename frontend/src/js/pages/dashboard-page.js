import { renderError, renderLoading } from '../components/ui.js';
import { hotelApi } from '../services/hotel-api.js';
import { escapeHtml, formatCurrency, formatDate, statusBadge } from '../utils/format.js';

function goTo(page) {
  window.dispatchEvent(new CustomEvent('app:navigate', { detail: page }));
}

export async function renderDashboardPage(container) {
  renderLoading(container, 'Atualizando a operação do hotel…');
  try {
    const { data } = await hotelApi.dashboard();
    const percentage = Math.min(100, Math.max(0, Number(data.occupancy.percentage)));
    container.innerHTML = `
      <section class="dashboard-hero surface">
        <div class="occupancy-panel">
          <div class="occupancy-ring" style="--occupancy: ${percentage * 3.6}deg" role="img" aria-label="Ocupação de ${percentage}%">
            <span><strong>${percentage}%</strong><small>ocupação</small></span>
          </div>
          <div><p class="eyebrow">Hoje · ${formatDate(data.date)}</p><h2>${data.occupancy.occupiedRooms} de ${data.occupancy.totalRooms} quartos ocupados</h2><p>Visão operacional atualizada diretamente pelo sistema.</p></div>
        </div>
        <div class="metric-strip">
          <article><small>Disponíveis</small><strong>${data.roomCounts.disponivel ?? 0}</strong></article>
          <article><small>Limpeza</small><strong>${(data.roomCounts.aguardando_limpeza ?? 0) + (data.roomCounts.em_limpeza ?? 0)}</strong></article>
          <article><small>Manutenção</small><strong>${data.roomCounts.manutencao ?? 0}</strong></article>
          <article><small>Receita no mês</small><strong>${formatCurrency(data.finance.incomeCents)}</strong></article>
        </div>
      </section>
      <section class="dashboard-columns">
        <article class="surface section-card">
          <header class="section-heading"><div><p class="eyebrow">Recepção</p><h2>Chegadas de hoje</h2></div><button class="text-button" data-page="reservations">Ver reservas</button></header>
          ${data.arrivals.length ? `<div class="compact-list">${data.arrivals.map((item) => `<div><span class="room-pill">${escapeHtml(item.roomNumber)}</span><span><strong>${escapeHtml(item.guestName)}</strong><small>${escapeHtml(item.code)}</small></span>${statusBadge(item.status)}</div>`).join('')}</div>` : '<p class="empty-copy">Nenhuma chegada prevista para hoje.</p>'}
        </article>
        <article class="surface section-card">
          <header class="section-heading"><div><p class="eyebrow">Recepção</p><h2>Saídas de hoje</h2></div><button class="text-button" data-page="stays">Ver hospedagens</button></header>
          ${data.departures.length ? `<div class="compact-list">${data.departures.map((item) => `<div><span class="room-pill">${escapeHtml(item.roomNumber)}</span><span><strong>${escapeHtml(item.guestName)}</strong><small>Saldo ${formatCurrency(item.balanceCents)}</small></span>${item.balanceCents ? '<span class="attention-label">Pendente</span>' : '<span class="success-label">Quitado</span>'}</div>`).join('')}</div>` : '<p class="empty-copy">Nenhuma saída prevista para hoje.</p>'}
        </article>
      </section>
      <section class="surface section-card">
        <header class="section-heading"><div><p class="eyebrow">Governança</p><h2>Pendências prioritárias</h2></div><button class="text-button" data-page="housekeeping">Abrir governança</button></header>
        ${data.pendingTasks.length ? `<div class="task-grid">${data.pendingTasks.map((task) => `<article><span class="room-pill">${escapeHtml(task.roomNumber)}</span><div><strong>${task.taskType === 'limpeza' ? 'Limpeza' : 'Manutenção'}</strong><small>Prioridade ${escapeHtml(task.priority)}</small></div>${statusBadge(task.status)}</article>`).join('')}</div>` : '<p class="empty-copy">Nenhuma pendência aberta.</p>'}
      </section>`;
    container
      .querySelectorAll('[data-page]')
      .forEach((button) => button.addEventListener('click', () => goTo(button.dataset.page)));
  } catch (error) {
    renderError(container, error, () => renderDashboardPage(container));
  }
}
