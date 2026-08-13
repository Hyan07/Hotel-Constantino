import { getDatabase } from '../modules/database.js';
import { can } from '../modules/state.js';
import {
  closeDrawer, emptyState, friendlyError, openDrawer, setDrawerBusy,
  setFormError, toast, confirmAction
} from '../modules/ui.js';
import {
  escapeHtml, formatDateTime, formatMoney, label, localInputToIso,
  normalizeSearch, statusClass, toLocalDateTimeInput
} from '../modules/format.js';

const roomState = {
  container: null,
  rooms: [],
  categories: [],
  maintenance: [],
  view: 'cards',
  search: '',
  status: '',
  category: '',
  capacity: '',
  floor: ''
};

async function loadRooms() {
  const database = await getDatabase();
  const [rooms, categories, maintenance] = await Promise.all([
    database.from('room_overview').select('*').order('room_number'),
    database.from('room_categories').select('*').order('name'),
    database.from('maintenance').select('*').in('status', ['open','in_progress','waiting_parts']).order('start_at', { ascending: false })
  ]);
  if (rooms.error) throw rooms.error;
  if (categories.error) throw categories.error;
  if (maintenance.error) throw maintenance.error;
  roomState.rooms = rooms.data ?? [];
  roomState.categories = categories.data ?? [];
  roomState.maintenance = maintenance.data ?? [];
}

function filteredRooms() {
  const query = normalizeSearch(roomState.search);
  return roomState.rooms.filter((room) => {
    if (query && !normalizeSearch([room.room_number, room.category_name, room.description, ...(room.amenities ?? [])].join(' ')).includes(query)) return false;
    if (roomState.status && room.current_status !== roomState.status) return false;
    if (roomState.category && room.category_id !== roomState.category) return false;
    if (roomState.capacity && Number(room.max_capacity) < Number(roomState.capacity)) return false;
    if (roomState.floor && String(room.floor ?? '') !== roomState.floor) return false;
    return true;
  });
}

function roomActions(room) {
  const operational = can('admin', 'reception');
  const cleaning = can('admin', 'reception', 'housekeeping');
  return `<div class="room-card__actions"><button class="button button--secondary button--small" data-room-view="${room.id}">Detalhes</button>${operational ? `<button class="button button--ghost button--small" data-room-edit="${room.id}">Editar</button>${room.current_status !== 'maintenance' ? `<button class="button button--ghost button--small" data-room-maintenance="${room.id}">Manutenção</button>` : ''}${['available','blocked'].includes(room.current_status) ? `<button class="button button--ghost button--small" data-room-operational="${room.id}">${room.current_status === 'blocked' ? 'Liberar' : 'Bloquear'}</button>` : ''}` : ''}${cleaning && ['awaiting_cleaning','cleaning'].includes(room.current_status) ? `<button class="button button--gold button--small" data-room-cleaning="${room.id}">${room.current_status === 'cleaning' ? 'Concluir limpeza' : 'Iniciar limpeza'}</button>` : ''}</div>`;
}

function cardsHtml(items) {
  if (!items.length) return emptyState({ icon: '▤', title: 'Nenhum quarto encontrado', message: 'Ajuste os filtros para encontrar o quarto desejado.' });
  return `<div class="card-grid">${items.map((room) => `<article class="room-card">
    <div class="room-card__top"><div><strong class="room-number">${escapeHtml(room.room_number)}</strong><div class="room-card__category">${escapeHtml(room.category_name)} · ${room.floor ? `${room.floor}º andar` : 'Andar não informado'}</div></div><span class="status-badge ${statusClass(room.current_status)}">${escapeHtml(label(room.current_status))}</span></div>
    <div class="room-card__meta"><span>Capacidade <strong>${room.max_capacity} pessoa(s)</strong></span><span>Diária padrão <strong>${formatMoney(room.standard_nightly_rate)}</strong></span><span>Limpeza <strong>${escapeHtml(label(room.cleaning_status))}</strong></span><span>${room.current_guest_name ? 'Hóspede atual' : 'Próxima reserva'} <strong>${escapeHtml(room.current_guest_name || (room.next_check_in ? formatDateTime(room.next_check_in) : 'Nenhuma'))}</strong></span></div>
    ${roomActions(room)}
  </article>`).join('')}</div>`;
}

function tableHtml(items) {
  if (!items.length) return cardsHtml(items);
  return `<div class="data-table-wrap"><table class="data-table"><thead><tr><th>Quarto</th><th>Categoria</th><th>Capacidade</th><th>Diária</th><th>Limpeza</th><th>Situação</th><th>Ações</th></tr></thead><tbody>${items.map((room) => `<tr><td data-label="Quarto" class="primary-cell"><strong>${escapeHtml(room.room_number)}</strong><small>${room.floor ? `${room.floor}º andar` : '—'}</small></td><td data-label="Categoria">${escapeHtml(room.category_name)}</td><td data-label="Capacidade">${room.max_capacity} pessoa(s)</td><td data-label="Diária">${formatMoney(room.standard_nightly_rate)}</td><td data-label="Limpeza"><span class="status-badge ${statusClass(room.cleaning_status)}">${escapeHtml(label(room.cleaning_status))}</span></td><td data-label="Situação"><span class="status-badge ${statusClass(room.current_status)}">${escapeHtml(label(room.current_status))}</span></td><td data-label="Ações">${roomActions(room)}</td></tr>`).join('')}</tbody></table></div>`;
}

function renderRoomContent() {
  const items = filteredRooms();
  roomState.container.querySelector('#rooms-content').innerHTML = roomState.view === 'cards' ? cardsHtml(items) : tableHtml(items);
  roomState.container.querySelector('#room-result-count').textContent = `${items.length} quarto${items.length === 1 ? '' : 's'}`;
  bindRoomActions();
}

function bindRoomActions() {
  const root = roomState.container.querySelector('#rooms-content');
  root.querySelectorAll('[data-room-view]').forEach((button) => button.addEventListener('click', () => openRoomDetails(button.dataset.roomView)));
  root.querySelectorAll('[data-room-edit]').forEach((button) => button.addEventListener('click', () => openRoomForm(button.dataset.roomEdit)));
  root.querySelectorAll('[data-room-maintenance]').forEach((button) => button.addEventListener('click', () => openMaintenanceForm(button.dataset.roomMaintenance)));
  root.querySelectorAll('[data-room-cleaning]').forEach((button) => button.addEventListener('click', () => updateCleaning(button.dataset.roomCleaning)));
  root.querySelectorAll('[data-room-operational]').forEach((button) => button.addEventListener('click', () => toggleOperationalBlock(button.dataset.roomOperational)));
}

async function toggleOperationalBlock(roomId) {
  const room = roomState.rooms.find((item) => item.id === roomId);
  if (!room) return;
  const blocking = room.current_status === 'available';
  const accepted = await confirmAction({
    title: blocking ? 'Bloquear quarto' : 'Liberar quarto',
    message: blocking
      ? `Bloquear o quarto ${room.room_number} por motivo operacional? A ação será recusada se houver reservas ativas.`
      : `Liberar o bloqueio operacional do quarto ${room.room_number}?`,
    confirmLabel: blocking ? 'Bloquear' : 'Liberar', danger: blocking
  });
  if (!accepted) return;
  try {
    const database = await getDatabase();
    const { error } = await database.rpc('set_room_operational_status', {
      p_room_id: room.id, p_status: blocking ? 'blocked' : 'available', p_reason: blocking ? 'Bloqueio operacional manual' : 'Bloqueio operacional liberado'
    });
    if (error) throw error;
    toast(blocking ? `Quarto ${room.room_number} bloqueado.` : `Quarto ${room.room_number} liberado.`);
    closeDrawer(); await refreshRooms();
  } catch (error) { toast(friendlyError(error), { title: 'Não foi possível alterar', type: 'error' }); }
}

async function updateCleaning(roomId) {
  const room = roomState.rooms.find((item) => item.id === roomId);
  if (!room) return;
  const completing = room.current_status === 'cleaning';
  const accepted = await confirmAction({
    title: completing ? 'Concluir limpeza' : 'Iniciar limpeza',
    message: completing ? `Confirmar que o quarto ${room.room_number} está limpo e disponível?` : `Marcar o quarto ${room.room_number} como em limpeza?`,
    confirmLabel: completing ? 'Liberar quarto' : 'Iniciar', danger: false
  });
  if (!accepted) return;
  try {
    const database = await getDatabase();
    const { error } = await database.rpc('update_room_cleaning', { p_room_id: room.id, p_cleaning_status: completing ? 'clean' : 'in_progress', p_reason: null });
    if (error) throw error;
    toast(completing ? `Quarto ${room.room_number} liberado.` : `Limpeza do quarto ${room.room_number} iniciada.`);
    await refreshRooms();
  } catch (error) { toast(friendlyError(error), { title: 'Não foi possível atualizar', type: 'error' }); }
}

function roomFormHtml(room = null) {
  return `<form id="room-form" novalidate><div class="form-section"><h3>Identificação</h3><p>Dados operacionais e comerciais do quarto.</p></div><div class="form-grid">
    <label class="field"><span>Número do quarto *</span><input name="room_number" maxlength="20" value="${escapeHtml(room?.room_number || '')}" required></label>
    <label class="field"><span>Categoria *</span><select name="category_id" required><option value="">Selecione</option>${roomState.categories.filter((category) => category.active || category.id === room?.category_id).map((category) => `<option value="${category.id}" ${category.id === room?.category_id ? 'selected' : ''}>${escapeHtml(category.name)}</option>`).join('')}</select></label>
    <label class="field"><span>Andar</span><input name="floor" type="number" min="-2" max="99" value="${room?.floor ?? ''}"></label>
    <label class="field"><span>Capacidade máxima *</span><input name="max_capacity" type="number" min="1" max="20" value="${room?.max_capacity ?? 2}" required></label>
    <label class="field"><span>Tipo de cama *</span><input name="bed_type" maxlength="120" value="${escapeHtml(room?.bed_type || 'Casal')}" required></label>
    <label class="field"><span>Quantidade de camas *</span><input name="bed_count" type="number" min="1" max="10" value="${room?.bed_count ?? 1}" required></label>
    <label class="field"><span>Diária padrão *</span><input name="standard_nightly_rate" type="number" min="0" step="0.01" value="${room?.standard_nightly_rate ?? ''}" required></label>
      <div class="field"><span class="field-label">Situação operacional</span><div class="detail-item"><strong>${escapeHtml(label(room?.current_status || 'available'))}</strong></div><small>Bloqueios, manutenção, ocupação e limpeza são alterados pelas ações próprias da operação.</small></div>
    <label class="field field--full"><span>Comodidades</span><input name="amenities" value="${escapeHtml((room?.amenities || []).join(', '))}" placeholder="Wi-Fi, TV, ar-condicionado"><small>Separe os itens por vírgulas.</small></label>
    <label class="field field--full"><span>Descrição</span><textarea name="description" maxlength="2000">${escapeHtml(room?.description || '')}</textarea></label>
    <label class="field field--full"><span>Observações internas</span><textarea name="internal_notes" maxlength="2000">${escapeHtml(room?.internal_notes || '')}</textarea></label>
  </div><div class="form-actions"><button type="button" class="button button--secondary" id="room-form-cancel">Cancelar</button><button type="submit" class="button button--primary">${room ? 'Salvar alterações' : 'Cadastrar quarto'}</button></div></form>`;
}

function openRoomForm(roomId = null) {
  const room = roomId ? roomState.rooms.find((item) => item.id === roomId) : null;
  openDrawer({ title: room ? `Editar quarto ${room.room_number}` : 'Novo quarto', eyebrow: 'Quartos', content: roomFormHtml(room), onOpen(root) {
    const form = root.querySelector('form');
    root.querySelector('#room-form-cancel').addEventListener('click', closeDrawer);
    form.elements.category_id.addEventListener('change', () => {
      if (room) return;
      const category = roomState.categories.find((item) => item.id === form.elements.category_id.value);
      if (category) {
        form.elements.max_capacity.value = category.default_capacity;
        form.elements.standard_nightly_rate.value = category.default_nightly_rate;
      }
    });
    form.addEventListener('submit', async (event) => {
      event.preventDefault(); if (!form.reportValidity()) return; setDrawerBusy(true, 'Salvando…');
      try {
        const payload = {
          room_number: form.elements.room_number.value.trim(), category_id: form.elements.category_id.value,
          floor: form.elements.floor.value ? Number(form.elements.floor.value) : null,
          bed_type: form.elements.bed_type.value.trim(), bed_count: Number(form.elements.bed_count.value),
          max_capacity: Number(form.elements.max_capacity.value), standard_nightly_rate: Number(form.elements.standard_nightly_rate.value),
          amenities: form.elements.amenities.value.split(',').map((item) => item.trim()).filter(Boolean),
          description: form.elements.description.value.trim() || null, internal_notes: form.elements.internal_notes.value.trim() || null
        };
        const database = await getDatabase();
        const query = room ? database.from('rooms').update(payload).eq('id', room.id) : database.from('rooms').insert(payload);
        const { error } = await query;
        if (error) throw error;
        toast(room ? 'Quarto atualizado com sucesso.' : 'Quarto cadastrado com sucesso.'); closeDrawer(); await refreshRooms();
      } catch (error) { setFormError(form, friendlyError(error)); } finally { setDrawerBusy(false); }
    });
  }});
}

function openMaintenanceForm(roomId) {
  const room = roomState.rooms.find((item) => item.id === roomId);
  if (!room) return;
  const start = new Date();
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  openDrawer({ title: `Bloquear quarto ${room.room_number}`, eyebrow: 'Manutenção', content: `<form id="maintenance-form"><div class="alert alert--warning">O quarto ficará indisponível no período informado. Reservas confirmadas conflitantes impedirão o bloqueio.</div><div class="form-grid"><label class="field field--full"><span>Motivo *</span><input name="reason" minlength="3" maxlength="160" required></label><label class="field"><span>Início *</span><input name="start_at" type="datetime-local" value="${toLocalDateTimeInput(start)}" required></label><label class="field"><span>Previsão de liberação</span><input name="expected_release_at" type="datetime-local" value="${toLocalDateTimeInput(end)}"></label><label class="field field--full"><span>Responsável</span><input name="responsible_name" maxlength="160"></label><label class="field field--full"><span>Descrição</span><textarea name="description" maxlength="2000"></textarea></label></div><div class="form-actions"><button type="button" class="button button--secondary" id="maintenance-cancel">Cancelar</button><button type="submit" class="button button--danger">Bloquear para manutenção</button></div></form>`, onOpen(root) {
    const form = root.querySelector('form'); root.querySelector('#maintenance-cancel').addEventListener('click', closeDrawer);
    form.addEventListener('submit', async (event) => {
      event.preventDefault(); if (!form.reportValidity()) return; setDrawerBusy(true, 'Bloqueando…');
      try {
        const database = await getDatabase();
        const { error } = await database.rpc('block_room_for_maintenance', {
          p_room_id: room.id, p_reason: form.elements.reason.value, p_description: form.elements.description.value || null,
          p_start_at: localInputToIso(form.elements.start_at.value),
          p_expected_release_at: form.elements.expected_release_at.value ? localInputToIso(form.elements.expected_release_at.value) : null,
          p_responsible_name: form.elements.responsible_name.value || null
        });
        if (error) throw error;
        toast(`Quarto ${room.room_number} bloqueado para manutenção.`); closeDrawer(); await refreshRooms();
      } catch (error) { setFormError(form, friendlyError(error)); } finally { setDrawerBusy(false); }
    });
  }});
}

async function completeMaintenance(item) {
  const accepted = await confirmAction({ title: 'Concluir manutenção', message: 'O quarto ficará aguardando limpeza antes de voltar a receber hóspedes.', confirmLabel: 'Concluir', danger: false });
  if (!accepted) return;
  try {
    const database = await getDatabase();
    const { error } = await database.rpc('complete_room_maintenance', { p_maintenance_id: item.id, p_notes: null });
    if (error) throw error;
    toast('Manutenção concluída. O quarto está aguardando limpeza.'); closeDrawer(); await refreshRooms();
  } catch (error) { toast(friendlyError(error), { title: 'Não foi possível concluir', type: 'error' }); }
}

function openRoomDetails(id) {
  const room = roomState.rooms.find((item) => item.id === id);
  if (!room) return;
  const maintenance = roomState.maintenance.find((item) => item.room_id === room.id);
  openDrawer({ title: `Quarto ${room.room_number}`, eyebrow: room.category_name, content: `<div class="detail-actions">${can('admin','reception') ? `<button class="button button--secondary button--small" id="room-detail-edit">Editar quarto</button>${!maintenance ? '<button class="button button--ghost button--small" id="room-detail-maintenance">Bloquear para manutenção</button>' : ''}${['available','blocked'].includes(room.current_status) ? `<button class="button button--ghost button--small" id="room-detail-operational">${room.current_status === 'blocked' ? 'Liberar bloqueio' : 'Bloquear quarto'}</button>` : ''}` : ''}${can('admin','reception','housekeeping') && ['awaiting_cleaning','cleaning'].includes(room.current_status) ? `<button class="button button--gold button--small" id="room-detail-cleaning">${room.current_status === 'cleaning' ? 'Concluir limpeza' : 'Iniciar limpeza'}</button>` : ''}${maintenance && can('admin','reception','housekeeping') ? '<button class="button button--primary button--small" id="room-detail-complete-maintenance">Concluir manutenção</button>' : ''}</div>
    <div class="detail-grid"><div class="detail-item"><small>Situação</small><strong><span class="status-badge ${statusClass(room.current_status)}">${label(room.current_status)}</span></strong></div><div class="detail-item"><small>Limpeza</small><strong>${label(room.cleaning_status)}</strong></div><div class="detail-item"><small>Categoria</small><strong>${escapeHtml(room.category_name)}</strong></div><div class="detail-item"><small>Andar</small><strong>${room.floor ?? '—'}</strong></div><div class="detail-item"><small>Capacidade</small><strong>${room.max_capacity} pessoa(s)</strong></div><div class="detail-item"><small>Camas</small><strong>${room.bed_count} × ${escapeHtml(room.bed_type)}</strong></div><div class="detail-item"><small>Diária padrão</small><strong>${formatMoney(room.standard_nightly_rate)}</strong></div><div class="detail-item"><small>Hóspede atual</small><strong>${escapeHtml(room.current_guest_name || 'Nenhum')}</strong></div><div class="detail-item detail-item--full"><small>Comodidades</small><strong>${escapeHtml((room.amenities || []).join(' · ') || 'Não informadas')}</strong></div><div class="detail-item detail-item--full"><small>Próxima reserva</small><strong>${room.next_check_in ? `${formatDateTime(room.next_check_in)} · ${escapeHtml(room.next_reservation_code)}` : 'Nenhuma reserva futura'}</strong></div></div>
    ${maintenance ? `<div class="divider-label">Manutenção ativa</div><div class="alert alert--warning"><strong>${escapeHtml(maintenance.reason)}</strong><br>${escapeHtml(maintenance.description || 'Sem descrição')}<br>Previsão: ${formatDateTime(maintenance.expected_release_at)}</div>` : ''}`,
    onOpen(root) {
      root.querySelector('#room-detail-edit')?.addEventListener('click', () => openRoomForm(room.id));
      root.querySelector('#room-detail-maintenance')?.addEventListener('click', () => openMaintenanceForm(room.id));
      root.querySelector('#room-detail-cleaning')?.addEventListener('click', () => updateCleaning(room.id));
      root.querySelector('#room-detail-operational')?.addEventListener('click', () => toggleOperationalBlock(room.id));
      root.querySelector('#room-detail-complete-maintenance')?.addEventListener('click', () => completeMaintenance(maintenance));
    }
  });
}

function bindRoomFilters() {
  const root = roomState.container;
  const fields = { 'room-search': 'search', 'room-status-filter': 'status', 'room-category-filter': 'category', 'room-capacity-filter': 'capacity', 'room-floor-filter': 'floor' };
  Object.entries(fields).forEach(([id, key]) => {
    const input = root.querySelector(`#${id}`); input.addEventListener(input.type === 'search' ? 'input' : 'change', () => { roomState[key] = input.value; renderRoomContent(); });
  });
  root.querySelectorAll('[data-room-view-mode]').forEach((button) => button.addEventListener('click', () => {
    roomState.view = button.dataset.roomViewMode; root.querySelectorAll('[data-room-view-mode]').forEach((item) => item.classList.toggle('is-active', item === button)); renderRoomContent();
  }));
  root.querySelector('#clear-room-filters').addEventListener('click', () => {
    Object.keys(fields).forEach((id) => { root.querySelector(`#${id}`).value = ''; });
    ['search','status','category','capacity','floor'].forEach((key) => { roomState[key] = ''; }); renderRoomContent();
  });
  root.querySelector('#new-room-button')?.addEventListener('click', () => openRoomForm());
}

async function refreshRooms() {
  await loadRooms(); renderRoomContent(); window.dispatchEvent(new CustomEvent('hotel:dashboard-stale'));
}

export async function renderRooms(container) {
  roomState.container = container;
  try {
    await loadRooms();
    const floors = [...new Set(roomState.rooms.map((room) => room.floor).filter((floor) => floor !== null))].sort((a,b) => a-b);
    container.innerHTML = `<div class="page-heading"><div><h2>Quartos</h2><p>Disponibilidade, limpeza, tarifas e manutenção em uma única visão.</p></div><div class="heading-actions"><span id="room-result-count" class="status-badge status--confirmed">0 quartos</span>${can('admin') ? '<button id="new-room-button" class="button button--primary">+ Novo quarto</button>' : ''}</div></div><div class="toolbar"><label class="field field--search"><span class="sr-only">Pesquisar quartos</span><input id="room-search" type="search" placeholder="Número, categoria ou comodidade"></label><label class="field"><span class="sr-only">Situação</span><select id="room-status-filter"><option value="">Todas as situações</option>${['available','reserved','occupied','awaiting_cleaning','cleaning','blocked','maintenance'].map((status) => `<option value="${status}">${label(status)}</option>`).join('')}</select></label><label class="field"><span class="sr-only">Categoria</span><select id="room-category-filter"><option value="">Todas as categorias</option>${roomState.categories.map((category) => `<option value="${category.id}">${escapeHtml(category.name)}</option>`).join('')}</select></label><label class="field"><span class="sr-only">Capacidade</span><select id="room-capacity-filter"><option value="">Qualquer capacidade</option><option value="1">1+ pessoa</option><option value="2">2+ pessoas</option><option value="3">3+ pessoas</option><option value="4">4+ pessoas</option></select></label><label class="field"><span class="sr-only">Andar</span><select id="room-floor-filter"><option value="">Todos os andares</option>${floors.map((floor) => `<option value="${floor}">${floor}º andar</option>`).join('')}</select></label><div class="toolbar-actions"><button id="clear-room-filters" class="button button--ghost button--small">Limpar</button><div class="view-toggle"><button class="is-active" data-room-view-mode="cards">Cartões</button><button data-room-view-mode="list">Lista</button></div></div></div><div id="rooms-content"></div>`;
    bindRoomFilters(); renderRoomContent();
  } catch (error) {
    container.innerHTML = emptyState({ icon: '!', title: 'Quartos indisponíveis', message: friendlyError(error), actionLabel: 'Tentar novamente', actionId: 'retry-rooms' });
    container.querySelector('#retry-rooms')?.addEventListener('click', () => renderRooms(container));
  }
}

export function roomsModuleReady() {
  return Boolean(roomState.container?.isConnected);
}
