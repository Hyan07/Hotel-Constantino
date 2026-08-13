import { confirmAction, openModal } from '../components/modal.js';
import { showToast } from '../components/toast.js';
import { formField, renderEmpty, renderError, renderLoading } from '../components/ui.js';
import { hotelApi } from '../services/hotel-api.js';
import { hasPermission } from '../store/app-store.js';
import {
  addDays,
  escapeHtml,
  formatCurrency,
  formatDate,
  statusBadge,
  todayInput,
} from '../utils/format.js';

function reservationForm({ reservation, guests, rooms }) {
  const today = todayInput();
  const guestField = reservation
    ? `<div class="form-field"><span>Hóspede principal</span><strong>${escapeHtml(reservation.primaryGuestName)}</strong></div>`
    : formField({
        label: 'Hóspede principal',
        name: 'primaryGuestId',
        required: true,
        value: '',
        options: [
          { value: '', label: 'Selecione' },
          ...guests.map((guest) => ({ value: guest.id, label: guest.fullName })),
        ],
      });
  return `<div class="form-grid">
    ${guestField}
    ${formField({ label: 'Quarto', name: 'roomId', required: true, value: reservation?.roomId ?? '', options: [{ value: '', label: 'Selecione' }, ...rooms.map((room) => ({ value: room.id, label: `${room.roomNumber} · ${room.category} · ${formatCurrency(room.baseRateCents)}` }))] })}
    ${formField({ label: 'Entrada', name: 'checkInDate', type: 'date', value: reservation?.checkInDate ?? today, min: reservation ? undefined : today, required: true })}
    ${formField({ label: 'Saída', name: 'checkOutDate', type: 'date', value: reservation?.checkOutDate ?? addDays(today, 1), required: true })}
    ${formField({ label: 'Adultos', name: 'adults', type: 'number', value: reservation?.adults ?? 1, min: 1, required: true })}
    ${formField({ label: 'Crianças', name: 'children', type: 'number', value: reservation?.children ?? 0, min: 0, required: true })}
    ${formField({ label: 'Desconto (R$)', name: 'discount', type: 'number', value: reservation ? reservation.discountCents / 100 : 0, min: 0, step: '0.01' })}
    ${formField({ label: 'Origem', name: 'source', value: reservation?.source, placeholder: 'Direto, telefone, agência…' })}
    <label class="form-field form-field-wide"><span>Observações</span><textarea name="notes" rows="3" maxlength="1000">${escapeHtml(reservation?.notes ?? '')}</textarea></label>
    ${reservation ? `<input type="hidden" name="version" value="${reservation.version}">` : ''}
  </div>`;
}

function reservationPayload(formData, editing) {
  const text = (name) => formData.get(name)?.toString().trim() || null;
  return {
    ...(!editing ? { primaryGuestId: Number(text('primaryGuestId')) } : {}),
    roomId: Number(text('roomId')),
    checkInDate: text('checkInDate'),
    checkOutDate: text('checkOutDate'),
    adults: Number(text('adults')),
    children: Number(text('children')),
    discountCents: Math.round(Number(text('discount') ?? 0) * 100),
    source: text('source'),
    notes: text('notes'),
    ...(editing ? { version: Number(text('version')) } : {}),
  };
}

function openReservationModal(container, resources, reservation, view) {
  openModal({
    title: reservation ? `Editar reserva ${reservation.code}` : 'Nova reserva',
    content: reservationForm({ reservation, guests: resources.guests, rooms: resources.rooms }),
    submitLabel: reservation ? 'Salvar reserva' : 'Criar reserva',
    size: 'large',
    onSubmit: async (formData) => {
      const payload = reservationPayload(formData, Boolean(reservation));
      if (reservation) await hotelApi.updateReservation(reservation.id, payload);
      else await hotelApi.createReservation(payload);
      showToast(reservation ? 'Reserva atualizada.' : 'Reserva criada.');
      await renderReservationsPage(container, view);
    },
  });
}

function daysFrom(start, value) {
  return Math.round(
    (Date.parse(`${value}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / 86_400_000,
  );
}

function renderTimeline(reservations, rooms, start) {
  const dates = Array.from({ length: 7 }, (_, index) => addDays(start, index));
  const active = reservations.filter((item) => !['cancelada', 'no_show'].includes(item.status));
  return `<div class="timeline" style="--timeline-days: 7"><div class="timeline-head"><span>Quarto</span>${dates.map((date) => `<time datetime="${date}">${formatDate(date).slice(0, 5)}</time>`).join('')}</div>${rooms
    .map((room) => {
      const roomReservations = active.filter(
        (item) =>
          item.roomId === room.id &&
          item.checkInDate < addDays(start, 7) &&
          item.checkOutDate > start,
      );
      return `<div class="timeline-row"><strong>${escapeHtml(room.roomNumber)}</strong><div class="timeline-slots">${dates.map(() => '<span></span>').join('')}${roomReservations
        .map((item) => {
          const columnStart = Math.max(0, daysFrom(start, item.checkInDate)) + 1;
          const columnEnd = Math.min(7, daysFrom(start, item.checkOutDate)) + 1;
          return `<button class="timeline-bar status-${item.status}" style="grid-column:${columnStart}/${columnEnd}" data-edit="${item.id}" title="${escapeHtml(`${item.primaryGuestName} · ${item.code}`)}"><span>${escapeHtml(item.primaryGuestName)}</span></button>`;
        })
        .join('')}</div></div>`;
    })
    .join('')}</div>`;
}

async function runReservationAction(container, reservation, action, view) {
  const labels = {
    confirm: ['Confirmar reserva', 'Confirmar esta reserva?'],
    cancel: ['Cancelar reserva', 'Cancelar esta reserva e liberar o quarto?'],
    'no-show': ['Registrar no-show', 'Registrar que o hóspede não compareceu?'],
    'check-in': ['Realizar check-in', 'Confirmar o check-in e ocupar o quarto?'],
  };
  const confirmed = await confirmAction({
    title: labels[action][0],
    message: labels[action][1],
    confirmLabel: labels[action][0],
    danger: ['cancel', 'no-show'].includes(action),
  });
  if (!confirmed) return;
  try {
    if (action === 'check-in')
      await hotelApi.checkIn(reservation.id, { version: reservation.version });
    else
      await hotelApi.reservationAction(reservation.id, action, {
        version: reservation.version,
        ...(['cancel', 'no-show'].includes(action)
          ? { reason: 'Registrado pela recepção no sistema' }
          : {}),
      });
    showToast(`${labels[action][0]} concluído.`);
    renderReservationsPage(container, view);
  } catch (error) {
    showToast(error.message, 'error');
  }
}

export async function renderReservationsPage(container, view = 'list') {
  renderLoading(container, 'Carregando reservas e disponibilidade…');
  const start = todayInput();
  try {
    const [reservationResponse, guestResponse, roomResponse] = await Promise.all([
      hotelApi.reservations({ pageSize: 100, from: start, to: addDays(start, 30) }),
      hotelApi.guests({ pageSize: 100 }),
      hotelApi.rooms({ pageSize: 100 }),
    ]);
    const resources = { guests: guestResponse.data, rooms: roomResponse.data };
    const canWrite = hasPermission('reservations.write');
    container.innerHTML = `
      <section class="page-toolbar surface"><div class="view-switch" role="group" aria-label="Visualização"><button class="filter-chip ${view === 'list' ? 'is-active' : ''}" data-view="list">Lista</button><button class="filter-chip ${view === 'timeline' ? 'is-active' : ''}" data-view="timeline">Linha do tempo</button></div>${canWrite ? '<button class="button button-primary" data-new>+ Nova reserva</button>' : ''}</section>
      <section class="surface data-card"><header class="data-card-header"><div><p class="eyebrow">Próximos 30 dias</p><h2>${view === 'list' ? 'Reservas' : 'Calendário por quarto'}</h2></div><span class="subtle-label">${reservationResponse.meta.total} registros</span></header>
      ${view === 'timeline' ? renderTimeline(reservationResponse.data, roomResponse.data, start) : reservationResponse.data.length ? `<div class="table-scroll"><table><thead><tr><th>Reserva</th><th>Hóspede</th><th>Quarto</th><th>Período</th><th>Valor</th><th>Situação</th><th><span class="sr-only">Ações</span></th></tr></thead><tbody>${reservationResponse.data.map((item) => `<tr><td><strong>${escapeHtml(item.code)}</strong><small>${escapeHtml(item.source ?? 'Direto')}</small></td><td>${escapeHtml(item.primaryGuestName)}</td><td><span class="room-pill">${escapeHtml(item.roomNumber)}</span></td><td>${formatDate(item.checkInDate)}<small>até ${formatDate(item.checkOutDate)}</small></td><td>${formatCurrency(item.totalCents)}</td><td>${statusBadge(item.status)}</td><td><div class="row-actions">${['pendente', 'confirmada'].includes(item.status) && canWrite ? `<button class="text-button" data-edit="${item.id}">Editar</button>` : ''}${item.status === 'pendente' ? `<button class="text-button" data-action="confirm" data-id="${item.id}">Confirmar</button>` : ''}${item.status === 'confirmada' && hasPermission('stays.checkin') ? `<button class="text-button" data-action="check-in" data-id="${item.id}">Check-in</button>` : ''}${['pendente', 'confirmada'].includes(item.status) && hasPermission('reservations.cancel') ? `<button class="text-button text-danger" data-action="cancel" data-id="${item.id}">Cancelar</button>` : ''}</div></td></tr>`).join('')}</tbody></table></div>` : renderEmpty('Crie uma reserva para começar o fluxo de hospedagem.')}
      </section>`;
    container
      .querySelectorAll('[data-view]')
      .forEach((button) =>
        button.addEventListener('click', () =>
          renderReservationsPage(container, button.dataset.view),
        ),
      );
    container
      .querySelector('[data-new]')
      ?.addEventListener('click', () => openReservationModal(container, resources, null, view));
    container.querySelectorAll('[data-edit]').forEach((button) =>
      button.addEventListener('click', () => {
        const reservation = reservationResponse.data.find(
          (item) => item.id === Number(button.dataset.edit),
        );
        openReservationModal(container, resources, reservation, view);
      }),
    );
    container.querySelectorAll('[data-action]').forEach((button) =>
      button.addEventListener('click', () => {
        const reservation = reservationResponse.data.find(
          (item) => item.id === Number(button.dataset.id),
        );
        runReservationAction(container, reservation, button.dataset.action, view);
      }),
    );
  } catch (error) {
    renderError(container, error, () => renderReservationsPage(container, view));
  }
}
