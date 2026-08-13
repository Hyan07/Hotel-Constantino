import { confirmAction, openModal } from '../components/modal.js';
import { showToast } from '../components/toast.js';
import { formField, renderEmpty, renderError, renderLoading } from '../components/ui.js';
import { hotelApi } from '../services/hotel-api.js';
import { hasPermission } from '../store/app-store.js';
import { escapeHtml, formatCurrency, statusBadge } from '../utils/format.js';

function roomForm(room = {}) {
  return `<div class="form-grid">
    ${room.id ? '' : formField({ label: 'Número', name: 'roomNumber', value: room.roomNumber, required: true })}
    ${formField({ label: 'Categoria', name: 'category', value: room.category, required: true })}
    ${formField({ label: 'Andar', name: 'floor', type: 'number', value: room.floor ?? 1, required: true })}
    ${formField({ label: 'Capacidade', name: 'capacity', type: 'number', value: room.capacity ?? 2, min: 1, required: true })}
    ${formField({ label: 'Diária (R$)', name: 'baseRate', type: 'number', value: room.baseRateCents ? room.baseRateCents / 100 : '', min: 0.01, step: '0.01', required: true })}
    ${formField({ label: 'Comodidades', name: 'amenities', value: Array.isArray(room.amenities) ? room.amenities.join(', ') : '', placeholder: 'Wi-Fi, Ar-condicionado' })}
    <label class="form-field form-field-wide"><span>Observações</span><textarea name="notes" rows="3" maxlength="1000">${escapeHtml(room.notes ?? '')}</textarea></label>
    ${room.version ? `<input type="hidden" name="version" value="${room.version}">` : ''}
  </div>`;
}

function roomPayload(formData) {
  const text = (name) => formData.get(name)?.toString().trim() || null;
  const payload = {
    category: text('category'),
    floor: Number(text('floor')),
    capacity: Number(text('capacity')),
    baseRateCents: Math.round(Number(text('baseRate')) * 100),
    amenities: (text('amenities') ?? '')
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean),
    notes: text('notes'),
  };
  if (text('roomNumber')) payload.roomNumber = text('roomNumber');
  if (text('version')) payload.version = Number(text('version'));
  return payload;
}

function openRoomModal(container, room) {
  openModal({
    title: room ? `Editar quarto ${room.roomNumber}` : 'Novo quarto',
    content: roomForm(room),
    submitLabel: room ? 'Salvar quarto' : 'Cadastrar quarto',
    onSubmit: async (formData) => {
      if (room) await hotelApi.updateRoom(room.id, roomPayload(formData));
      else await hotelApi.createRoom(roomPayload(formData));
      showToast(room ? 'Quarto atualizado.' : 'Quarto cadastrado.');
      await renderRoomsPage(container);
    },
  });
}

function statusActions(room) {
  if (room.status === 'disponivel') {
    return `<button class="menu-button" data-status="bloqueado">Bloquear</button><button class="menu-button" data-status="manutencao">Manutenção</button>`;
  }
  if (room.status === 'bloqueado') {
    return '<button class="menu-button" data-status="disponivel">Liberar</button><button class="menu-button" data-status="manutencao">Manutenção</button>';
  }
  if (room.status === 'manutencao') {
    return '<button class="menu-button" data-status="aguardando_limpeza">Enviar para limpeza</button>';
  }
  return '';
}

export async function renderRoomsPage(container, status = '') {
  renderLoading(container, 'Carregando inventário…');
  try {
    const response = await hotelApi.rooms({ pageSize: 100, status });
    const canWrite = hasPermission('rooms.write');
    container.innerHTML = `
      <section class="page-toolbar surface"><div class="filter-group"><button class="filter-chip ${status === '' ? 'is-active' : ''}" data-filter="">Todos</button>${['disponivel', 'ocupado', 'aguardando_limpeza', 'em_limpeza', 'manutencao', 'bloqueado'].map((value) => `<button class="filter-chip ${status === value ? 'is-active' : ''}" data-filter="${value}">${value.replaceAll('_', ' ')}</button>`).join('')}</div>${canWrite ? '<button class="button button-primary" data-new>+ Novo quarto</button>' : ''}</section>
      <section class="room-grid">${response.data.length ? response.data.map((room) => `<article class="surface room-card"><header><span class="room-number">${escapeHtml(room.roomNumber)}</span>${statusBadge(room.status)}</header><div><p class="eyebrow">${escapeHtml(room.category)} · ${room.capacity} pessoas</p><strong>${formatCurrency(room.baseRateCents)}<small>/ diária</small></strong><p>${escapeHtml(Array.isArray(room.amenities) ? room.amenities.join(' · ') : '')}</p></div>${canWrite ? `<footer><button class="text-button" data-edit="${room.id}">Editar</button>${statusActions(room)}</footer>` : ''}</article>`).join('') : renderEmpty('Nenhum quarto corresponde ao filtro selecionado.')}</section>`;
    container
      .querySelectorAll('[data-filter]')
      .forEach((button) =>
        button.addEventListener('click', () => renderRoomsPage(container, button.dataset.filter)),
      );
    container
      .querySelector('[data-new]')
      ?.addEventListener('click', () => openRoomModal(container));
    container.querySelectorAll('[data-edit]').forEach((button) =>
      button.addEventListener('click', () => {
        const room = response.data.find((item) => item.id === Number(button.dataset.edit));
        openRoomModal(container, room);
      }),
    );
    container.querySelectorAll('[data-status]').forEach((button) =>
      button.addEventListener('click', async () => {
        const card = button.closest('.room-card');
        const roomNumber = card.querySelector('.room-number').textContent;
        const room = response.data.find((item) => item.roomNumber === roomNumber);
        const confirmed = await confirmAction({
          title: 'Alterar situação do quarto',
          message: `Confirmar a mudança do quarto ${room.roomNumber} para ${button.textContent.toLowerCase()}?`,
          confirmLabel: 'Confirmar mudança',
        });
        if (!confirmed) return;
        try {
          await hotelApi.roomStatus(room.id, {
            status: button.dataset.status,
            reason: 'Alteração operacional pela tela de quartos',
            version: room.version,
          });
          showToast('Situação do quarto atualizada.');
          renderRoomsPage(container, status);
        } catch (error) {
          showToast(error.message, 'error');
        }
      }),
    );
  } catch (error) {
    renderError(container, error, () => renderRoomsPage(container, status));
  }
}
