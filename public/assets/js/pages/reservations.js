import { getSupabase } from '../modules/supabase.js';
import { can, getState } from '../modules/state.js';
import {
  emptyState, friendlyError, openDrawer, closeDrawer, confirmAction, setDrawerBusy,
  setFormError, clearFormError, toast
} from '../modules/ui.js';
import {
  escapeHtml, formatDate, formatDateTime, formatMoney, formatPhone, formatTime,
  label, localInputToIso, nightsBetween, normalizeSearch, statusClass, toLocalDateTimeInput
} from '../modules/format.js';

const pageState = {
  container: null,
  reservations: [],
  rooms: [],
  guests: [],
  categories: [],
  view: 'list',
  search: '',
  status: '',
  room: '',
  category: '',
  channel: '',
  from: '',
  to: '',
  month: new Date()
};

const activeStatuses = ['pre_reservation', 'pending', 'confirmed', 'checked_in'];

async function loadData() {
  const supabase = await getSupabase();
  const [reservations, rooms, guests, categories] = await Promise.all([
    supabase.from('reservation_overview').select('*').order('check_in_at', { ascending: false }).limit(600),
    supabase.from('room_overview').select('*').order('room_number'),
    supabase.from('guests').select('id, full_name, document_type, document_number, phone, email').is('deleted_at', null).order('full_name').limit(1000),
    supabase.from('room_categories').select('*').eq('active', true).order('name')
  ]);
  if (reservations.error) throw reservations.error;
  if (rooms.error) throw rooms.error;
  if (guests.error) throw guests.error;
  if (categories.error) throw categories.error;
  pageState.reservations = reservations.data ?? [];
  pageState.rooms = rooms.data ?? [];
  pageState.guests = guests.data ?? [];
  pageState.categories = categories.data ?? [];
}

function filteredReservations() {
  const query = normalizeSearch(pageState.search);
  return pageState.reservations.filter((item) => {
    const haystack = normalizeSearch([item.code, item.guest_name, item.guest_phone, item.guest_email, item.room_number, item.category_name].join(' '));
    if (query && !haystack.includes(query)) return false;
    if (pageState.status && item.status !== pageState.status) return false;
    if (pageState.room && item.room_id !== pageState.room) return false;
    if (pageState.category && item.category_name !== pageState.category) return false;
    if (pageState.channel && item.origin_channel !== pageState.channel) return false;
    if (pageState.from && new Date(item.check_out_at) < new Date(`${pageState.from}T00:00:00`)) return false;
    if (pageState.to && new Date(item.check_in_at) > new Date(`${pageState.to}T23:59:59`)) return false;
    return true;
  });
}

function tableHtml(items) {
  if (!items.length) return emptyState({ icon: '▣', title: 'Nenhuma reserva encontrada', message: 'Ajuste os filtros ou cadastre uma nova reserva para este período.', actionLabel: can('admin', 'reception') ? 'Nova reserva' : null, actionId: 'empty-new-reservation' });
  return `<div class="data-table-wrap"><table class="data-table">
    <thead><tr><th>Reserva / hóspede</th><th>Período</th><th>Quarto</th><th>Valor</th><th>Pagamento</th><th>Situação</th><th>Ações</th></tr></thead>
    <tbody>${items.map((item) => `<tr>
      <td data-label="Reserva / hóspede" class="primary-cell"><strong>${escapeHtml(item.guest_name)}</strong><small>${escapeHtml(item.code)} · ${escapeHtml(formatPhone(item.guest_phone || ''))}</small></td>
      <td data-label="Período"><strong>${formatDate(item.check_in_at)} → ${formatDate(item.check_out_at)}</strong><br><small>${item.nights} diária${item.nights === 1 ? '' : 's'}</small></td>
      <td data-label="Quarto"><strong>${escapeHtml(item.room_number)}</strong><br><small>${escapeHtml(item.category_name)}</small></td>
      <td data-label="Valor"><strong>${formatMoney(item.total_amount)}</strong><br><small>Pago: ${formatMoney(item.amount_paid)}</small></td>
      <td data-label="Pagamento"><span class="status-badge ${statusClass(item.payment_status)}">${escapeHtml(label(item.payment_status))}</span></td>
      <td data-label="Situação"><span class="status-badge ${statusClass(item.status)}">${escapeHtml(label(item.status))}</span></td>
      <td data-label="Ações"><div class="table-actions"><button class="table-action" data-reservation-view="${item.id}">Ver</button>${can('admin', 'reception') && ['pre_reservation','pending','confirmed'].includes(item.status) ? `<button class="table-action" data-reservation-edit="${item.id}">Editar</button>` : ''}</div></td>
    </tr>`).join('')}</tbody>
  </table></div>`;
}

function cardsHtml(items) {
  if (!items.length) return tableHtml(items);
  return `<div class="card-grid">${items.map((item) => `<article class="reservation-card">
    <div class="room-card__top"><div><strong>${escapeHtml(item.code)}</strong><div class="room-card__category">Quarto ${escapeHtml(item.room_number)} · ${escapeHtml(item.category_name)}</div></div><span class="status-badge ${statusClass(item.status)}">${escapeHtml(label(item.status))}</span></div>
    <div class="room-card__meta"><span>Hóspede <strong>${escapeHtml(item.guest_name)}</strong></span><span>Entrada <strong>${formatDateTime(item.check_in_at)}</strong></span><span>Saída <strong>${formatDateTime(item.check_out_at)}</strong></span><span>Total <strong>${formatMoney(item.total_amount)}</strong></span></div>
    <div class="room-card__actions"><button class="button button--secondary button--small" data-reservation-view="${item.id}">Ver detalhes</button>${can('admin', 'reception') && ['pre_reservation','pending','confirmed'].includes(item.status) ? `<button class="button button--ghost button--small" data-reservation-edit="${item.id}">Editar</button>` : ''}</div>
  </article>`).join('')}</div>`;
}

function calendarHtml(items) {
  const year = pageState.month.getFullYear();
  const month = pageState.month.getMonth();
  const first = new Date(year, month, 1);
  const start = new Date(year, month, 1 - first.getDay());
  const days = Array.from({ length: 42 }, (_, index) => new Date(start.getFullYear(), start.getMonth(), start.getDate() + index));
  const todayKey = new Date().toDateString();
  return `<div class="calendar"><div class="calendar__header">${['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'].map((day) => `<span>${day}</span>`).join('')}</div><div class="calendar__grid">${days.map((day) => {
    const dayStart = new Date(day.getFullYear(), day.getMonth(), day.getDate());
    const dayEnd = new Date(day.getFullYear(), day.getMonth(), day.getDate() + 1);
    const events = items.filter((item) => new Date(item.check_in_at) < dayEnd && new Date(item.check_out_at) > dayStart && !['canceled','no_show'].includes(item.status));
    return `<div class="calendar-day ${day.getMonth() !== month ? 'is-outside' : ''} ${day.toDateString() === todayKey ? 'is-today' : ''}"><span class="calendar-day__number">${day.getDate()}</span>${events.slice(0, 4).map((event) => `<button class="calendar-event" data-reservation-view="${event.id}" title="${escapeHtml(event.guest_name)} · Quarto ${escapeHtml(event.room_number)}">${escapeHtml(event.room_number)} · ${escapeHtml(event.guest_name)}</button>`).join('')}${events.length > 4 ? `<small>+${events.length - 4} reservas</small>` : ''}</div>`;
  }).join('')}</div></div>`;
}

function contentHtml(items) {
  if (pageState.view === 'calendar') return calendarHtml(items);
  if (pageState.view === 'cards') return cardsHtml(items);
  return tableHtml(items);
}

function renderContent() {
  const host = pageState.container.querySelector('#reservations-content');
  const items = filteredReservations();
  host.innerHTML = contentHtml(items);
  pageState.container.querySelector('#result-count').textContent = `${items.length} reserva${items.length === 1 ? '' : 's'}`;
  bindRowActions(host);
  host.querySelector('#empty-new-reservation')?.addEventListener('click', () => openReservationForm());
}

function bindFilters() {
  const root = pageState.container;
  const mapping = {
    'reservation-search': 'search', 'filter-status': 'status', 'filter-room': 'room',
    'filter-category': 'category', 'filter-channel': 'channel', 'filter-from': 'from', 'filter-to': 'to'
  };
  Object.entries(mapping).forEach(([id, key]) => {
    const element = root.querySelector(`#${id}`);
    element.addEventListener(element.type === 'search' ? 'input' : 'change', () => {
      pageState[key] = element.value;
      renderContent();
    });
  });
  root.querySelectorAll('[data-view]').forEach((button) => button.addEventListener('click', () => {
    pageState.view = button.dataset.view;
    root.querySelectorAll('[data-view]').forEach((item) => item.classList.toggle('is-active', item === button));
    root.querySelector('#calendar-controls').hidden = pageState.view !== 'calendar';
    renderContent();
  }));
  root.querySelector('#calendar-prev').addEventListener('click', () => {
    pageState.month = new Date(pageState.month.getFullYear(), pageState.month.getMonth() - 1, 1);
    updateMonthLabel(); renderContent();
  });
  root.querySelector('#calendar-next').addEventListener('click', () => {
    pageState.month = new Date(pageState.month.getFullYear(), pageState.month.getMonth() + 1, 1);
    updateMonthLabel(); renderContent();
  });
  root.querySelector('#clear-reservation-filters').addEventListener('click', () => {
    ['search','status','room','category','channel','from','to'].forEach((key) => { pageState[key] = ''; });
    Object.keys(mapping).forEach((id) => { root.querySelector(`#${id}`).value = ''; });
    renderContent();
  });
  root.querySelector('#new-reservation-button')?.addEventListener('click', () => openReservationForm());
}

function updateMonthLabel() {
  const value = new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' }).format(pageState.month);
  pageState.container.querySelector('#calendar-month').textContent = value[0].toUpperCase() + value.slice(1);
}

function bindRowActions(root) {
  root.querySelectorAll('[data-reservation-view]').forEach((button) => button.addEventListener('click', () => openReservationDetails(button.dataset.reservationView)));
  root.querySelectorAll('[data-reservation-edit]').forEach((button) => button.addEventListener('click', () => openReservationForm(button.dataset.reservationEdit)));
}

function defaultPeriod() {
  const checkIn = new Date();
  checkIn.setHours(14, 0, 0, 0);
  if (checkIn < new Date()) checkIn.setDate(checkIn.getDate() + 1);
  const checkOut = new Date(checkIn);
  checkOut.setDate(checkOut.getDate() + 1);
  checkOut.setHours(12, 0, 0, 0);
  return { checkIn, checkOut };
}

async function reservationFormHtml(reservation = null, preferredGuestId = null) {
  const period = defaultPeriod();
  const companionIds = new Set();
  if (reservation) {
    const supabase = await getSupabase();
    const { data } = await supabase.from('reservation_guests').select('guest_id, is_responsible').eq('reservation_id', reservation.id);
    (data ?? []).filter((item) => !item.is_responsible).forEach((item) => companionIds.add(item.guest_id));
  }
  const selectedGuest = preferredGuestId || reservation?.responsible_guest_id || '';
  const selectedRoom = reservation?.room_id || '';
  return `<form id="reservation-form" novalidate>
    <div class="form-section"><h3>Hospedagem</h3><p>Defina o responsável, o quarto e o período.</p></div>
    <div class="form-grid">
      <label class="field field--full"><span>Hóspede responsável *</span><select name="responsible_guest_id" required><option value="">Selecione o hóspede</option>${pageState.guests.map((guest) => `<option value="${guest.id}" ${guest.id === selectedGuest ? 'selected' : ''}>${escapeHtml(guest.full_name)} · ${escapeHtml(guest.document_number ? guest.document_number.slice(-4).padStart(7, '•') : formatPhone(guest.phone || ''))}</option>`).join('')}</select><small>Não encontrou? <button type="button" class="button button--ghost button--small" id="reservation-new-guest">Cadastrar hóspede</button></small></label>
      <label class="field"><span>Entrada *</span><input name="check_in_at" type="datetime-local" value="${toLocalDateTimeInput(reservation?.check_in_at || period.checkIn)}" required></label>
      <label class="field"><span>Saída *</span><input name="check_out_at" type="datetime-local" value="${toLocalDateTimeInput(reservation?.check_out_at || period.checkOut)}" required></label>
      <label class="field field--full"><span>Quarto *</span><select name="room_id" required><option value="">Selecione um quarto</option>${pageState.rooms.map((room) => `<option value="${room.id}" data-rate="${room.standard_nightly_rate}" ${room.id === selectedRoom ? 'selected' : ''}>Quarto ${escapeHtml(room.room_number)} · ${escapeHtml(room.category_name)} · ${formatMoney(room.standard_nightly_rate)}</option>`).join('')}</select><small id="availability-feedback">A disponibilidade será validada pelo banco antes de salvar.</small></label>
      <label class="field"><span>Adultos *</span><input name="adults" type="number" min="1" max="20" value="${reservation?.adults ?? 1}" required></label>
      <label class="field"><span>Crianças</span><input name="children" type="number" min="0" max="20" value="${reservation?.children ?? 0}" required></label>
      <label class="field field--full"><span>Acompanhantes cadastrados</span><select name="companions" multiple size="4">${pageState.guests.filter((guest) => guest.id !== selectedGuest).map((guest) => `<option value="${guest.id}" ${companionIds.has(guest.id) ? 'selected' : ''}>${escapeHtml(guest.full_name)}</option>`).join('')}</select><small>Use Ctrl/Cmd para selecionar mais de um.</small></label>
    </div>
    <div class="form-section"><h3>Valores e situação</h3><p>O total é recalculado automaticamente.</p></div>
    <div class="form-grid form-grid--3">
      <label class="field"><span>Valor da diária *</span><input name="nightly_rate" type="number" min="0" step="0.01" value="${reservation?.nightly_rate ?? ''}" required></label>
      <label class="field"><span>Desconto</span><input name="discount" type="number" min="0" step="0.01" value="${reservation?.discount ?? 0}"></label>
      <label class="field"><span>Acréscimos</span><input name="surcharge" type="number" min="0" step="0.01" value="${reservation?.surcharge ?? 0}"></label>
      ${reservation ? `<div class="field"><span class="field-label">Situação atual</span><div class="detail-item"><strong>${escapeHtml(label(reservation.status))}</strong></div></div>` : `<label class="field"><span>Situação inicial *</span><select name="status" required>${['pre_reservation','pending','confirmed'].map((status) => `<option value="${status}" ${status === 'pending' ? 'selected' : ''}>${label(status)}</option>`).join('')}</select></label>`}
      <label class="field"><span>Forma de pagamento</span><select name="payment_method"><option value="">A definir</option>${['cash','pix','credit_card','debit_card','bank_transfer','invoice','other'].map((method) => `<option value="${method}" ${method === reservation?.payment_method ? 'selected' : ''}>${label(method)}</option>`).join('')}</select></label>
      <label class="field"><span>Canal de origem *</span><input name="origin_channel" list="origin-channels" value="${escapeHtml(reservation?.origin_channel || 'Direto')}" required><datalist id="origin-channels"><option value="Direto"><option value="Telefone"><option value="WhatsApp"><option value="Booking.com"><option value="Expedia"><option value="Agência"></datalist></label>
    </div>
    <div class="form-summary"><div><span>Quantidade de diárias</span><strong id="summary-nights">1</strong></div><div><span>Valor total</span><strong id="summary-total">${formatMoney(reservation?.total_amount || 0)}</strong></div></div>
    <div class="form-section"><h3>Observações</h3><p>Registre informações que ajudem a equipe a acolher melhor.</p></div>
    <div class="form-grid">
      <label class="field field--full"><span>Pedidos especiais</span><textarea name="special_requests" maxlength="2000">${escapeHtml(reservation?.special_requests || '')}</textarea></label>
      <label class="field field--full"><span>Observações internas</span><textarea name="notes" maxlength="4000">${escapeHtml(reservation?.notes || '')}</textarea></label>
    </div>
    <div class="form-actions"><button type="button" class="button button--secondary" id="cancel-reservation-form">Cancelar</button><button type="submit" class="button button--primary">${reservation ? 'Salvar alterações' : 'Criar reserva'}</button></div>
  </form>`;
}

export async function openReservationForm(reservationId = null, preferredGuestId = null) {
  const reservation = reservationId ? pageState.reservations.find((item) => item.id === reservationId) : null;
  if (reservationId && !reservation) return;
  const html = await reservationFormHtml(reservation, preferredGuestId);
  openDrawer({ title: reservation ? `Editar ${reservation.code}` : 'Nova reserva', eyebrow: 'Reservas', content: html, onOpen: bindReservationForm });

  function bindReservationForm(root) {
    const form = root.querySelector('#reservation-form');
    const roomSelect = form.elements.room_id;
    const nightlyRate = form.elements.nightly_rate;
    const availability = root.querySelector('#availability-feedback');

    const updateSummary = async () => {
      const nights = nightsBetween(form.elements.check_in_at.value, form.elements.check_out_at.value);
      const total = Math.max(0, (Number(nightlyRate.value) * nights) - Number(form.elements.discount.value || 0) + Number(form.elements.surcharge.value || 0));
      root.querySelector('#summary-nights').textContent = String(nights || 0);
      root.querySelector('#summary-total').textContent = formatMoney(total);
      availability.textContent = 'A disponibilidade será validada pelo banco antes de salvar.';
      availability.className = '';
      if (roomSelect.value && nights > 0) {
        const supabase = await getSupabase();
        const { data, error } = await supabase.rpc('is_room_available', {
          p_room_id: roomSelect.value,
          p_check_in: localInputToIso(form.elements.check_in_at.value),
          p_check_out: localInputToIso(form.elements.check_out_at.value),
          p_exclude_reservation: reservation?.id ?? null
        });
        if (!error) {
          availability.textContent = data ? 'Quarto disponível neste período.' : 'Este quarto não está disponível neste período.';
          availability.style.color = data ? 'var(--success)' : 'var(--danger)';
        }
      }
    };

    roomSelect.addEventListener('change', () => {
      const option = roomSelect.selectedOptions[0];
      if (option?.dataset.rate && !reservation) nightlyRate.value = option.dataset.rate;
      updateSummary();
    });
    ['check_in_at','check_out_at','nightly_rate','discount','surcharge'].forEach((name) => form.elements[name].addEventListener('change', updateSummary));
    updateSummary();
    root.querySelector('#cancel-reservation-form').addEventListener('click', closeDrawer);
    root.querySelector('#reservation-new-guest').addEventListener('click', () => window.dispatchEvent(new CustomEvent('hotel:new-guest', { detail: { returnToReservation: true } })));

    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      clearFormError(form);
      if (!form.reportValidity()) return;
      const checkIn = localInputToIso(form.elements.check_in_at.value);
      const checkOut = localInputToIso(form.elements.check_out_at.value);
      if (!nightsBetween(checkIn, checkOut)) return setFormError(form, 'A data de saída deve ser posterior à entrada.');
      setDrawerBusy(true, reservation ? 'Salvando…' : 'Criando…');
      try {
        const supabase = await getSupabase();
        const { data: available, error: availabilityError } = await supabase.rpc('is_room_available', {
          p_room_id: roomSelect.value, p_check_in: checkIn, p_check_out: checkOut, p_exclude_reservation: reservation?.id ?? null
        });
        if (availabilityError) throw availabilityError;
        if (!available) throw Object.assign(new Error('Este quarto já possui uma reserva ativa no período escolhido.'), { code: '23P01' });

        const payload = {
          responsible_guest_id: form.elements.responsible_guest_id.value,
          room_id: roomSelect.value,
          check_in_at: checkIn,
          check_out_at: checkOut,
          adults: Number(form.elements.adults.value),
          children: Number(form.elements.children.value || 0),
          nightly_rate: Number(nightlyRate.value),
          discount: Number(form.elements.discount.value || 0),
          surcharge: Number(form.elements.surcharge.value || 0),
          payment_method: form.elements.payment_method.value || null,
          origin_channel: form.elements.origin_channel.value.trim(),
          notes: form.elements.notes.value.trim() || null,
          special_requests: form.elements.special_requests.value.trim() || null
        };
        if (!reservation) payload.status = form.elements.status.value;
        const query = reservation
          ? supabase.from('reservations').update(payload).eq('id', reservation.id).select().single()
          : supabase.from('reservations').insert(payload).select().single();
        const { data: saved, error } = await query;
        if (error) throw error;

        const selectedCompanions = Array.from(form.elements.companions.selectedOptions).map((option) => option.value).filter((id) => id !== payload.responsible_guest_id);
        if (reservation) {
          const { error: deleteError } = await supabase.from('reservation_guests').delete().eq('reservation_id', saved.id).eq('is_responsible', false);
          if (deleteError) throw deleteError;
        }
        if (selectedCompanions.length) {
          const { error: companionError } = await supabase.from('reservation_guests').insert(selectedCompanions.map((guestId) => ({ reservation_id: saved.id, guest_id: guestId, is_responsible: false })));
          if (companionError) throw companionError;
        }
        toast(reservation ? 'Reserva atualizada com sucesso.' : `Reserva ${saved.code} criada com sucesso.`);
        closeDrawer();
        await refreshReservations();
      } catch (error) {
        setFormError(form, friendlyError(error));
      } finally {
        setDrawerBusy(false);
      }
    });
  }
}

async function transitionReservation(reservation, action) {
  const copy = {
    confirm: ['Confirmar reserva', `Confirmar a reserva ${reservation.code}?`, 'Confirmar', false],
    check_in: ['Realizar check-in', `Registrar a entrada de ${reservation.guest_name} no quarto ${reservation.room_number}?`, 'Realizar check-in', false],
    check_out: ['Realizar check-out', `Registrar a saída de ${reservation.guest_name}? O quarto ficará aguardando limpeza.`, 'Realizar check-out', false],
    no_show: ['Marcar não comparecimento', `Marcar a reserva ${reservation.code} como não comparecimento?`, 'Marcar', true]
  }[action];
  if (!copy) return;
  const accepted = await confirmAction({ title: copy[0], message: copy[1], confirmLabel: copy[2], danger: copy[3] });
  if (!accepted) return;
  try {
    const supabase = await getSupabase();
    const { error } = await supabase.rpc('transition_reservation', { p_reservation_id: reservation.id, p_action: action, p_reason: null });
    if (error) throw error;
    toast(`${copy[0]} concluído.`);
    closeDrawer();
    await refreshReservations();
  } catch (error) { toast(friendlyError(error), { title: 'Não foi possível concluir', type: 'error' }); }
}

function cancelReservation(reservation) {
  openDrawer({
    title: `Cancelar ${reservation.code}`,
    eyebrow: 'Ação destrutiva',
    content: `<form id="cancel-reservation"><div class="alert alert--warning">O quarto será liberado para novas reservas neste período.</div><label class="field"><span>Motivo do cancelamento *</span><textarea name="reason" minlength="3" maxlength="1000" required></textarea></label><div class="form-actions"><button type="button" class="button button--secondary" id="cancel-back">Voltar</button><button type="submit" class="button button--danger">Cancelar reserva</button></div></form>`,
    onOpen(root) {
      const form = root.querySelector('form');
      root.querySelector('#cancel-back').addEventListener('click', () => openReservationDetails(reservation.id));
      form.addEventListener('submit', async (event) => {
        event.preventDefault(); if (!form.reportValidity()) return; setDrawerBusy(true, 'Cancelando…');
        try {
          const supabase = await getSupabase();
          const { error } = await supabase.rpc('transition_reservation', { p_reservation_id: reservation.id, p_action: 'cancel', p_reason: form.elements.reason.value });
          if (error) throw error;
          toast('Reserva cancelada e quarto liberado.'); closeDrawer(); await refreshReservations();
        } catch (error) { setFormError(form, friendlyError(error)); } finally { setDrawerBusy(false); }
      });
    }
  });
}

function registerPayment(reservation) {
  const balance = Math.max(0, Number(reservation.total_amount) - Number(reservation.amount_paid || 0));
  openDrawer({
    title: 'Registrar pagamento', eyebrow: reservation.code,
    content: `<form id="payment-form"><div class="form-summary"><div><span>Total da reserva</span><strong>${formatMoney(reservation.total_amount)}</strong></div><div><span>Já recebido</span><strong>${formatMoney(reservation.amount_paid)}</strong></div><div><span>Saldo atual</span><strong>${formatMoney(balance)}</strong></div></div><div class="form-grid"><label class="field"><span>Valor recebido *</span><input name="amount" type="number" min="0.01" max="${balance || reservation.total_amount}" step="0.01" value="${balance || ''}" required></label><label class="field"><span>Forma *</span><select name="method" required>${['cash','pix','credit_card','debit_card','bank_transfer','invoice','other'].map((method) => `<option value="${method}">${label(method)}</option>`).join('')}</select></label><label class="field field--full"><span>Referência da transação</span><input name="transaction_reference" maxlength="160"></label><label class="field field--full"><span>Observações</span><textarea name="notes" maxlength="1000"></textarea></label></div><div class="form-actions"><button type="button" class="button button--secondary" id="payment-back">Voltar</button><button type="submit" class="button button--primary">Registrar pagamento</button></div></form>`,
    onOpen(root) {
      const form = root.querySelector('form');
      root.querySelector('#payment-back').addEventListener('click', () => openReservationDetails(reservation.id));
      form.addEventListener('submit', async (event) => {
        event.preventDefault(); if (!form.reportValidity()) return; setDrawerBusy(true, 'Registrando…');
        try {
          const supabase = await getSupabase();
          const { error } = await supabase.from('payments').insert({
            reservation_id: reservation.id, amount: Number(form.elements.amount.value), method: form.elements.method.value,
            status: 'received', paid_at: new Date().toISOString(), transaction_reference: form.elements.transaction_reference.value.trim() || null,
            notes: form.elements.notes.value.trim() || null
          });
          if (error) throw error;
          toast('Pagamento registrado com sucesso.'); closeDrawer(); await refreshReservations();
        } catch (error) { setFormError(form, friendlyError(error)); } finally { setDrawerBusy(false); }
      });
    }
  });
}

function changeOccupiedRoom(reservation) {
  openDrawer({
    title: 'Alterar quarto', eyebrow: reservation.code,
    content: `<form id="change-room-form"><div class="alert alert--warning">O quarto atual ficará aguardando limpeza e o novo quarto será marcado como ocupado.</div><label class="field"><span>Novo quarto *</span><select name="room_id" required><option value="">Selecione</option>${pageState.rooms.filter((room) => room.id !== reservation.room_id && room.current_status === 'available').map((room) => `<option value="${room.id}">Quarto ${escapeHtml(room.room_number)} · ${escapeHtml(room.category_name)} · capacidade ${room.max_capacity}</option>`).join('')}</select></label><div class="form-actions"><button type="button" class="button button--secondary" id="change-room-back">Voltar</button><button type="submit" class="button button--primary">Confirmar troca</button></div></form>`,
    onOpen(root) {
      const form = root.querySelector('form');
      root.querySelector('#change-room-back').addEventListener('click', () => openReservationDetails(reservation.id));
      form.addEventListener('submit', async (event) => {
        event.preventDefault(); if (!form.reportValidity()) return; setDrawerBusy(true, 'Alterando…');
        try {
          const supabase = await getSupabase();
          const { error } = await supabase.rpc('change_reservation_room', { p_reservation_id: reservation.id, p_new_room_id: form.elements.room_id.value });
          if (error) throw error;
          toast('Quarto alterado com segurança.'); closeDrawer(); await refreshReservations();
        } catch (error) { setFormError(form, friendlyError(error)); } finally { setDrawerBusy(false); }
      });
    }
  });
}

function printReservation(reservation) {
  const popup = window.open('', '_blank', 'width=820,height=720');
  if (!popup) return toast('Permita janelas pop-up para imprimir o comprovante.', { title: 'Impressão bloqueada', type: 'error' });
  const balance = Math.max(0, Number(reservation.total_amount) - Number(reservation.amount_paid || 0));
  popup.document.write(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Comprovante ${escapeHtml(reservation.code)}</title><style>body{font:14px Arial;color:#263238;max-width:760px;margin:40px auto;padding:0 24px}header{display:flex;justify-content:space-between;border-bottom:2px solid #163c3a;padding-bottom:18px}h1{font-family:Georgia;color:#163c3a;margin:0}small{color:#667371}.grid{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin:26px 0}.item{border-bottom:1px solid #ddd;padding:8px 0}.item span{display:block;font-size:10px;color:#667371;text-transform:uppercase}.total{padding:18px;background:#f6f1e8;font-size:18px;display:flex;justify-content:space-between}footer{margin-top:50px;text-align:center;color:#667371;font-size:11px}@media print{body{margin:0}}</style></head><body><header><div><h1>Constantino’s Hotel</h1><small>Passos–MG · Comprovante de reserva</small></div><strong>${escapeHtml(reservation.code)}</strong></header><div class="grid"><div class="item"><span>Hóspede</span><strong>${escapeHtml(reservation.guest_name)}</strong></div><div class="item"><span>Quarto</span><strong>${escapeHtml(reservation.room_number)} · ${escapeHtml(reservation.category_name)}</strong></div><div class="item"><span>Entrada</span><strong>${formatDateTime(reservation.check_in_at)}</strong></div><div class="item"><span>Saída</span><strong>${formatDateTime(reservation.check_out_at)}</strong></div><div class="item"><span>Diárias</span><strong>${reservation.nights}</strong></div><div class="item"><span>Situação</span><strong>${label(reservation.status)}</strong></div></div><div class="total"><span>Total</span><strong>${formatMoney(reservation.total_amount)}</strong></div><div class="total"><span>Saldo pendente</span><strong>${formatMoney(balance)}</strong></div><footer>Documento gerado em ${formatDateTime(new Date())}. Constantino’s Hotel agradece a preferência.</footer><script>window.onload=()=>window.print()<\/script></body></html>`);
  popup.document.close();
}

async function showHistory(reservation) {
  if (!can('admin')) return;
  openDrawer({ title: 'Histórico de alterações', eyebrow: reservation.code, content: '<div class="page-loading"><span class="spinner"></span>Carregando histórico…</div>' });
  try {
    const supabase = await getSupabase();
    const { data, error } = await supabase.from('audit_logs').select('id, action, old_values, new_values, created_at, user_id').eq('table_name', 'reservations').eq('record_id', reservation.id).order('created_at', { ascending: false });
    if (error) throw error;
    document.querySelector('#drawer-content').innerHTML = data?.length ? `<div class="timeline">${data.map((item) => `<div class="timeline-item"><span class="timeline-time">${formatDate(item.created_at).slice(0,5)}<br>${formatTime(item.created_at)}</span><span class="timeline-dot"></span><div class="timeline-copy"><strong>${escapeHtml(item.action)}</strong><small>${formatDateTime(item.created_at)} · Situação: ${label(item.new_values?.status || item.old_values?.status)}</small></div></div>`).join('')}</div>` : emptyState({ title: 'Sem alterações registradas', message: 'Ainda não há eventos de auditoria para esta reserva.' });
  } catch (error) { document.querySelector('#drawer-content').innerHTML = emptyState({ icon: '!', title: 'Histórico indisponível', message: friendlyError(error) }); }
}

export async function openReservationDetails(id) {
  const reservation = pageState.reservations.find((item) => item.id === id);
  if (!reservation) return;
  const editable = can('admin', 'reception') && ['pre_reservation','pending','confirmed'].includes(reservation.status);
  const balance = Math.max(0, Number(reservation.total_amount) - Number(reservation.amount_paid || 0));
  openDrawer({
    title: reservation.code,
    eyebrow: 'Detalhes da reserva',
    content: `<div class="detail-actions">
      ${editable ? `<button class="button button--secondary button--small" id="detail-edit">Editar / alterar quarto</button>` : ''}
      ${can('admin','reception') && reservation.status === 'checked_in' ? '<button class="button button--secondary button--small" id="detail-change-room">Alterar quarto</button>' : ''}
      ${reservation.status === 'pending' || reservation.status === 'pre_reservation' ? '<button class="button button--primary button--small" id="detail-confirm">Confirmar</button>' : ''}
      ${['pending','confirmed'].includes(reservation.status) ? '<button class="button button--gold button--small" id="detail-checkin">Check-in</button>' : ''}
      ${reservation.status === 'checked_in' ? '<button class="button button--gold button--small" id="detail-checkout">Check-out</button>' : ''}
      ${['pending','confirmed'].includes(reservation.status) ? '<button class="button button--ghost button--small" id="detail-no-show">Não compareceu</button>' : ''}
      ${can('admin','reception') && !['checked_out','canceled','no_show'].includes(reservation.status) && balance > 0 ? '<button class="button button--secondary button--small" id="detail-payment">Registrar pagamento</button>' : ''}
      <button class="button button--secondary button--small" id="detail-print">Imprimir comprovante</button>
      ${can('admin') ? '<button class="button button--ghost button--small" id="detail-history">Histórico</button>' : ''}
      ${editable ? '<button class="button button--ghost button--small" id="detail-cancel">Cancelar reserva</button>' : ''}
    </div>
    <div class="detail-grid">
      <div class="detail-item detail-item--full"><small>Hóspede responsável</small><strong>${escapeHtml(reservation.guest_name)}</strong></div>
      <div class="detail-item"><small>Telefone</small><strong>${escapeHtml(formatPhone(reservation.guest_phone || 'Não informado'))}</strong></div>
      <div class="detail-item"><small>E-mail</small><strong>${escapeHtml(reservation.guest_email || 'Não informado')}</strong></div>
      <div class="detail-item"><small>Quarto</small><strong>${escapeHtml(reservation.room_number)} · ${escapeHtml(reservation.category_name)}</strong></div>
      <div class="detail-item"><small>Hóspedes</small><strong>${reservation.adults} adulto(s) · ${reservation.children} criança(s)</strong></div>
      <div class="detail-item"><small>Entrada</small><strong>${formatDateTime(reservation.check_in_at)}</strong></div>
      <div class="detail-item"><small>Saída</small><strong>${formatDateTime(reservation.check_out_at)}</strong></div>
      <div class="detail-item"><small>Situação</small><strong><span class="status-badge ${statusClass(reservation.status)}">${escapeHtml(label(reservation.status))}</span></strong></div>
      <div class="detail-item"><small>Canal de origem</small><strong>${escapeHtml(reservation.origin_channel)}</strong></div>
    </div>
    <div class="divider-label">Valores</div>
    <div class="detail-grid"><div class="detail-item"><small>Diária × quantidade</small><strong>${formatMoney(reservation.nightly_rate)} × ${reservation.nights}</strong></div><div class="detail-item"><small>Total</small><strong>${formatMoney(reservation.total_amount)}</strong></div><div class="detail-item"><small>Recebido</small><strong>${formatMoney(reservation.amount_paid)}</strong></div><div class="detail-item"><small>Saldo</small><strong>${formatMoney(balance)}</strong></div></div>
    ${reservation.special_requests || reservation.notes ? `<div class="divider-label">Observações</div><div class="detail-grid">${reservation.special_requests ? `<div class="detail-item detail-item--full"><small>Pedidos especiais</small><strong>${escapeHtml(reservation.special_requests)}</strong></div>` : ''}${reservation.notes ? `<div class="detail-item detail-item--full"><small>Observações internas</small><strong>${escapeHtml(reservation.notes)}</strong></div>` : ''}</div>` : ''}`,
    onOpen(root) {
      root.querySelector('#detail-edit')?.addEventListener('click', () => openReservationForm(reservation.id));
      root.querySelector('#detail-change-room')?.addEventListener('click', () => changeOccupiedRoom(reservation));
      root.querySelector('#detail-confirm')?.addEventListener('click', () => transitionReservation(reservation, 'confirm'));
      root.querySelector('#detail-checkin')?.addEventListener('click', () => transitionReservation(reservation, 'check_in'));
      root.querySelector('#detail-checkout')?.addEventListener('click', () => transitionReservation(reservation, 'check_out'));
      root.querySelector('#detail-no-show')?.addEventListener('click', () => transitionReservation(reservation, 'no_show'));
      root.querySelector('#detail-payment')?.addEventListener('click', () => registerPayment(reservation));
      root.querySelector('#detail-print')?.addEventListener('click', () => printReservation(reservation));
      root.querySelector('#detail-history')?.addEventListener('click', () => showHistory(reservation));
      root.querySelector('#detail-cancel')?.addEventListener('click', () => cancelReservation(reservation));
    }
  });
}

async function refreshReservations() {
  await loadData();
  renderContent();
  window.dispatchEvent(new CustomEvent('hotel:dashboard-stale'));
}

export async function renderReservations(container, options = {}) {
  pageState.container = container;
  if (options.filter) pageState.status = options.filter;
  try {
    await loadData();
    const channels = [...new Set(pageState.reservations.map((item) => item.origin_channel).filter(Boolean))].sort();
    container.innerHTML = `<div class="page-heading"><div><h2>Reservas</h2><p>Organize períodos, chegadas, saídas e pagamentos.</p></div><div class="heading-actions"><span id="result-count" class="status-badge status--confirmed">0 reservas</span>${can('admin','reception') ? '<button id="new-reservation-button" class="button button--primary">+ Nova reserva</button>' : ''}</div></div>
      <div class="toolbar">
        <label class="field field--search"><span class="sr-only">Pesquisar reservas</span><input id="reservation-search" type="search" value="${escapeHtml(pageState.search)}" placeholder="Hóspede, CPF, telefone, quarto ou código"></label>
        <label class="field"><span class="sr-only">Situação</span><select id="filter-status"><option value="">Todas as situações</option>${['pre_reservation','pending','confirmed','checked_in','checked_out','canceled','no_show'].map((status) => `<option value="${status}" ${status === pageState.status ? 'selected' : ''}>${label(status)}</option>`).join('')}</select></label>
        <label class="field"><span class="sr-only">Quarto</span><select id="filter-room"><option value="">Todos os quartos</option>${pageState.rooms.map((room) => `<option value="${room.id}">${escapeHtml(room.room_number)}</option>`).join('')}</select></label>
        <label class="field"><span class="sr-only">Categoria</span><select id="filter-category"><option value="">Todas as categorias</option>${pageState.categories.map((category) => `<option value="${escapeHtml(category.name)}">${escapeHtml(category.name)}</option>`).join('')}</select></label>
        <label class="field"><span class="sr-only">Canal</span><select id="filter-channel"><option value="">Todos os canais</option>${channels.map((channel) => `<option value="${escapeHtml(channel)}">${escapeHtml(channel)}</option>`).join('')}</select></label>
        <label class="field"><span>De</span><input id="filter-from" type="date"></label><label class="field"><span>Até</span><input id="filter-to" type="date"></label>
        <div class="toolbar-actions"><button id="clear-reservation-filters" class="button button--ghost button--small">Limpar</button><div class="view-toggle"><button class="is-active" data-view="list">Lista</button><button data-view="cards">Cartões</button><button data-view="calendar">Calendário</button></div></div>
      </div>
      <div id="calendar-controls" class="page-heading" hidden><div><h2 id="calendar-month"></h2></div><div class="heading-actions"><button id="calendar-prev" class="button button--secondary button--small">← Anterior</button><button id="calendar-next" class="button button--secondary button--small">Próximo →</button></div></div>
      <div id="reservations-content"></div>`;
    updateMonthLabel(); bindFilters(); renderContent();
  } catch (error) {
    container.innerHTML = emptyState({ icon: '!', title: 'Reservas indisponíveis', message: friendlyError(error), actionLabel: 'Tentar novamente', actionId: 'retry-reservations' });
    container.querySelector('#retry-reservations')?.addEventListener('click', () => renderReservations(container, options));
  }
}

export function reservationModuleReady() {
  return Boolean(pageState.container && pageState.container.isConnected);
}
