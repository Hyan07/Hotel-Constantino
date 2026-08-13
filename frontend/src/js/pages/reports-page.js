import { renderError, renderLoading } from '../components/ui.js';
import { hotelApi } from '../services/hotel-api.js';
import { addDays, escapeHtml, formatCurrency, formatDate, todayInput } from '../utils/format.js';

function monthStart() {
  return `${todayInput().slice(0, 7)}-01`;
}

export async function renderReportsPage(
  container,
  from = monthStart(),
  to = addDays(todayInput(), 1),
) {
  renderLoading(container, 'Calculando relatórios…');
  try {
    const { data } = await hotelApi.reports({ from, to });
    container.innerHTML = `<section class="page-toolbar surface"><form class="period-form" data-period><label>De<input type="date" name="from" value="${from}" required></label><label>Até<input type="date" name="to" value="${to}" required></label><button class="button button-secondary" type="submit">Aplicar período</button></form></section>
      <section class="report-hero surface"><div><p class="eyebrow">${formatDate(from)} a ${formatDate(addDays(to, -1))}</p><h2>Desempenho do período</h2><p>Indicadores calculados a partir das reservas, hospedagens e lançamentos confirmados.</p></div><div class="report-occupancy"><strong>${data.occupancy.percentage}%</strong><small>${data.occupancy.occupiedRoomNights} de ${data.occupancy.capacityRoomNights} quartos/noite</small></div></section>
      <section class="finance-summary"><article class="surface"><small>Receitas</small><strong class="money-positive">${formatCurrency(data.finance.incomeCents)}</strong></article><article class="surface"><small>Despesas</small><strong class="money-negative">${formatCurrency(data.finance.expenseCents)}</strong></article><article class="surface"><small>Resultado</small><strong>${formatCurrency(data.finance.balanceCents)}</strong></article></section>
      <section class="surface data-card"><header class="data-card-header"><div><p class="eyebrow">Reservas</p><h2>Distribuição por situação</h2></div></header>${data.reservations.length ? `<div class="table-scroll"><table><thead><tr><th>Situação</th><th>Quantidade</th><th class="align-right">Valor reservado</th></tr></thead><tbody>${data.reservations.map((item) => `<tr><td>${escapeHtml(item.status.replaceAll('_', ' '))}</td><td>${item.total}</td><td class="align-right">${formatCurrency(item.bookedCents)}</td></tr>`).join('')}</tbody></table></div>` : '<p class="empty-copy padded">Sem reservas no período.</p>'}</section>`;
    container.querySelector('[data-period]').addEventListener('submit', (event) => {
      event.preventDefault();
      const data = new FormData(event.currentTarget);
      renderReportsPage(container, data.get('from'), data.get('to'));
    });
  } catch (error) {
    renderError(container, error, () => renderReportsPage(container, from, to));
  }
}
