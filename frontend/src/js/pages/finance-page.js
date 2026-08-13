import { openModal } from '../components/modal.js';
import { showToast } from '../components/toast.js';
import { formField, renderEmpty, renderError, renderLoading } from '../components/ui.js';
import { hotelApi } from '../services/hotel-api.js';
import { hasPermission } from '../store/app-store.js';
import {
  escapeHtml,
  formatCurrency,
  formatDate,
  statusBadge,
  todayInput,
} from '../utils/format.js';

function openFinanceModal(container) {
  openModal({
    title: 'Novo lançamento financeiro',
    content: `<div class="form-grid">
      ${formField({
        label: 'Tipo',
        name: 'direction',
        required: true,
        options: [
          { value: 'saida', label: 'Saída / despesa' },
          { value: 'entrada', label: 'Entrada manual' },
        ],
      })}
      ${formField({ label: 'Categoria', name: 'category', required: true, placeholder: 'Ex.: fornecedor, manutenção' })}
      ${formField({ label: 'Valor (R$)', name: 'amount', type: 'number', min: 0.01, step: '0.01', required: true })}
      ${formField({ label: 'Data', name: 'occurredOn', type: 'date', value: todayInput(), required: true })}
      <label class="form-field form-field-wide"><span>Descrição *</span><textarea name="description" rows="3" maxlength="255" required></textarea></label>
    </div>`,
    submitLabel: 'Registrar lançamento',
    onSubmit: async (data) => {
      await hotelApi.createFinance({
        direction: data.get('direction'),
        category: data.get('category'),
        amountCents: Math.round(Number(data.get('amount')) * 100),
        occurredOn: data.get('occurredOn'),
        description: data.get('description'),
      });
      showToast('Lançamento registrado.');
      renderFinancePage(container);
    },
  });
}

export async function renderFinancePage(container, direction = '') {
  renderLoading(container, 'Carregando movimentação financeira…');
  try {
    const response = await hotelApi.finance({ pageSize: 100, direction });
    const canWrite = hasPermission('finance.write');
    container.innerHTML = `<section class="finance-summary"><article class="surface"><small>Entradas</small><strong class="money-positive">${formatCurrency(response.meta.incomeCents)}</strong></article><article class="surface"><small>Saídas</small><strong class="money-negative">${formatCurrency(response.meta.expenseCents)}</strong></article><article class="surface"><small>Saldo</small><strong>${formatCurrency(response.meta.balanceCents)}</strong></article></section>
      <section class="page-toolbar surface"><div class="filter-group"><button class="filter-chip ${!direction ? 'is-active' : ''}" data-filter="">Tudo</button><button class="filter-chip ${direction === 'entrada' ? 'is-active' : ''}" data-filter="entrada">Entradas</button><button class="filter-chip ${direction === 'saida' ? 'is-active' : ''}" data-filter="saida">Saídas</button></div>${canWrite ? '<button class="button button-primary" data-new>+ Novo lançamento</button>' : ''}</section>
      <section class="surface data-card"><header class="data-card-header"><div><p class="eyebrow">Caixa</p><h2>Movimentação</h2></div><span class="subtle-label">${response.meta.total} lançamentos</span></header>${response.data.length ? `<div class="table-scroll"><table><thead><tr><th>Data</th><th>Descrição</th><th>Categoria</th><th>Origem</th><th>Situação</th><th class="align-right">Valor</th></tr></thead><tbody>${response.data.map((entry) => `<tr><td>${formatDate(entry.occurredOn)}</td><td><strong>${escapeHtml(entry.description)}</strong></td><td>${escapeHtml(entry.category)}</td><td>${entry.paymentId ? 'Pagamento' : 'Manual'}</td><td>${statusBadge(entry.status)}</td><td class="align-right ${entry.direction === 'entrada' ? 'money-positive' : 'money-negative'}">${entry.direction === 'entrada' ? '+' : '−'} ${formatCurrency(entry.amountCents)}</td></tr>`).join('')}</tbody></table></div>` : renderEmpty('Nenhum lançamento para o filtro selecionado.')}</section>`;
    container
      .querySelectorAll('[data-filter]')
      .forEach((button) =>
        button.addEventListener('click', () => renderFinancePage(container, button.dataset.filter)),
      );
    container
      .querySelector('[data-new]')
      ?.addEventListener('click', () => openFinanceModal(container));
  } catch (error) {
    renderError(container, error, () => renderFinancePage(container, direction));
  }
}
