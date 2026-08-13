import { closeModal, confirmAction, openModal } from '../components/modal.js';
import { showToast } from '../components/toast.js';
import { formField, renderEmpty, renderError, renderLoading } from '../components/ui.js';
import { hotelApi } from '../services/hotel-api.js';
import { hasPermission } from '../store/app-store.js';
import {
  escapeHtml,
  formatCurrency,
  formatDate,
  formatDateTime,
  statusBadge,
} from '../utils/format.js';

function chargeModal(container, stay) {
  closeModal();
  openModal({
    title: `Registrar consumo · quarto ${stay.roomNumber}`,
    content: `<div class="form-grid">
      ${formField({ label: 'Categoria', name: 'category', value: 'frigobar', required: true })}
      ${formField({ label: 'Descrição', name: 'description', required: true })}
      ${formField({ label: 'Quantidade', name: 'quantity', type: 'number', value: 1, min: 1, required: true })}
      ${formField({ label: 'Valor unitário (R$)', name: 'amount', type: 'number', min: 0.01, step: '0.01', required: true })}
    </div>`,
    submitLabel: 'Registrar consumo',
    onSubmit: async (data) => {
      await hotelApi.addCharge(stay.id, {
        category: data.get('category'),
        description: data.get('description'),
        quantity: Number(data.get('quantity')),
        unitAmountCents: Math.round(Number(data.get('amount')) * 100),
        version: stay.version,
      });
      showToast('Consumo registrado.');
      renderStaysPage(container, 'ativa');
    },
  });
}

function paymentModal(container, stay) {
  closeModal();
  openModal({
    title: `Registrar pagamento · quarto ${stay.roomNumber}`,
    content: `<div class="form-grid">
      ${formField({ label: 'Valor (R$)', name: 'amount', type: 'number', value: (stay.balanceCents / 100).toFixed(2), min: 0.01, max: (stay.balanceCents / 100).toFixed(2), step: '0.01', required: true })}
      ${formField({
        label: 'Forma de pagamento',
        name: 'method',
        required: true,
        options: [
          { value: 'pix', label: 'PIX' },
          { value: 'dinheiro', label: 'Dinheiro' },
          { value: 'credito', label: 'Cartão de crédito' },
          { value: 'debito', label: 'Cartão de débito' },
          { value: 'transferencia', label: 'Transferência' },
          { value: 'outro', label: 'Outro' },
        ],
      })}
      ${formField({ label: 'Referência', name: 'reference', placeholder: 'Opcional' })}
    </div>`,
    submitLabel: 'Confirmar pagamento',
    onSubmit: async (data) => {
      await hotelApi.addPayment(stay.id, {
        amountCents: Math.round(Number(data.get('amount')) * 100),
        method: data.get('method'),
        reference: data.get('reference') || null,
        version: stay.version,
      });
      showToast('Pagamento registrado.');
      renderStaysPage(container, 'ativa');
    },
  });
}

async function checkoutStay(container, stay) {
  closeModal();
  const confirmed = await confirmAction({
    title: 'Realizar checkout',
    message: `Confirmar o checkout do quarto ${stay.roomNumber}? O quarto será enviado para limpeza.`,
    confirmLabel: 'Confirmar checkout',
  });
  if (!confirmed) return;
  try {
    await hotelApi.checkout(stay.id, { version: stay.version });
    showToast('Checkout concluído e limpeza solicitada.');
    renderStaysPage(container, 'ativa');
  } catch (error) {
    showToast(error.message, 'error');
  }
}

async function openStayDetails(container, stayId) {
  try {
    const { data: stay } = await hotelApi.stay(stayId);
    const dialog = openModal({
      title: `Hospedagem · quarto ${stay.roomNumber}`,
      content: `<div class="stay-summary"><div><small>Hóspede</small><strong>${escapeHtml(stay.primaryGuestName)}</strong></div><div><small>Entrada</small><strong>${formatDateTime(stay.checkedInAt)}</strong></div><div><small>Saída prevista</small><strong>${formatDate(stay.expectedCheckoutDate)}</strong></div>${statusBadge(stay.status)}</div>
        <div class="balance-panel"><div><small>Total</small><strong>${formatCurrency(stay.totalCents)}</strong></div><div><small>Pago</small><strong>${formatCurrency(stay.paidCents)}</strong></div><div><small>Saldo</small><strong>${formatCurrency(stay.balanceCents)}</strong></div></div>
        ${stay.status === 'ativa' ? `<div class="inline-actions">${hasPermission('charges.write') ? '<button class="button button-secondary" type="button" data-charge>+ Consumo</button>' : ''}${hasPermission('payments.write') && stay.balanceCents > 0 ? '<button class="button button-secondary" type="button" data-payment>+ Pagamento</button>' : ''}${hasPermission('stays.checkout') ? '<button class="button button-primary" type="button" data-checkout>Checkout</button>' : ''}</div>` : ''}
        <div class="detail-columns"><section><h3>Consumos</h3>${stay.charges.length ? `<ul class="ledger-list">${stay.charges.map((item) => `<li><span><strong>${escapeHtml(item.description)}</strong><small>${item.quantity} × ${formatCurrency(item.unitAmountCents)}</small></span><b>${formatCurrency(item.totalCents)}</b></li>`).join('')}</ul>` : '<p class="empty-copy">Nenhum consumo.</p>'}</section><section><h3>Pagamentos</h3>${stay.payments.length ? `<ul class="ledger-list">${stay.payments.map((item) => `<li><span><strong>${escapeHtml(item.method.toUpperCase())}</strong><small>${formatDateTime(item.receivedAt)}</small></span><b>${formatCurrency(item.amountCents)}</b></li>`).join('')}</ul>` : '<p class="empty-copy">Nenhum pagamento.</p>'}</section></div>`,
      submitLabel: 'Fechar',
      size: 'large',
      onSubmit: async () => true,
    });
    dialog
      .querySelector('[data-charge]')
      ?.addEventListener('click', () => chargeModal(container, stay));
    dialog
      .querySelector('[data-payment]')
      ?.addEventListener('click', () => paymentModal(container, stay));
    dialog
      .querySelector('[data-checkout]')
      ?.addEventListener('click', () => checkoutStay(container, stay));
  } catch (error) {
    showToast(error.message, 'error');
  }
}

export async function renderStaysPage(container, status = 'ativa') {
  renderLoading(container, 'Carregando hospedagens…');
  try {
    const response = await hotelApi.stays({ status, pageSize: 100 });
    container.innerHTML = `<section class="page-toolbar surface"><div class="view-switch"><button class="filter-chip ${status === 'ativa' ? 'is-active' : ''}" data-status="ativa">Em andamento</button><button class="filter-chip ${status === 'concluida' ? 'is-active' : ''}" data-status="concluida">Concluídas</button></div></section>
      <section class="surface data-card"><header class="data-card-header"><div><p class="eyebrow">Operação</p><h2>Hospedagens</h2></div><span class="subtle-label">${response.meta.total} registros</span></header>${response.data.length ? `<div class="table-scroll"><table><thead><tr><th>Quarto</th><th>Hóspede</th><th>Reserva</th><th>Saída</th><th>Total</th><th>Saldo</th><th>Situação</th><th><span class="sr-only">Ações</span></th></tr></thead><tbody>${response.data.map((stay) => `<tr><td><span class="room-pill">${escapeHtml(stay.roomNumber)}</span></td><td><strong>${escapeHtml(stay.primaryGuestName)}</strong></td><td>${escapeHtml(stay.reservationCode)}</td><td>${formatDate(stay.expectedCheckoutDate)}</td><td>${formatCurrency(stay.totalCents)}</td><td class="${stay.balanceCents > 0 ? 'money-due' : ''}">${formatCurrency(stay.balanceCents)}</td><td>${statusBadge(stay.status)}</td><td><button class="text-button" data-manage="${stay.id}">Gerenciar</button></td></tr>`).join('')}</tbody></table></div>` : renderEmpty(status === 'ativa' ? 'Nenhuma hospedagem ativa no momento.' : 'Nenhum checkout concluído.')}</section>`;
    container
      .querySelectorAll('[data-status]')
      .forEach((button) =>
        button.addEventListener('click', () => renderStaysPage(container, button.dataset.status)),
      );
    container
      .querySelectorAll('[data-manage]')
      .forEach((button) =>
        button.addEventListener('click', () =>
          openStayDetails(container, Number(button.dataset.manage)),
        ),
      );
  } catch (error) {
    renderError(container, error, () => renderStaysPage(container, status));
  }
}
