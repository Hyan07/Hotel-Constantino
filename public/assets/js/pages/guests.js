import { backendFetch } from '../modules/api.js';
import { getDatabase } from '../modules/database.js';
import { can } from '../modules/state.js';
import {
  closeDrawer, emptyState, friendlyError, openDrawer, setDrawerBusy,
  setFormError, toast
} from '../modules/ui.js';
import {
  escapeHtml, formatCpf, formatDate, formatDateTime, formatMoney, formatPhone,
  label, maskDocument, normalizeSearch, statusClass, validateCpf
} from '../modules/format.js';

const guestState = { container: null, guests: [], reservations: [], search: '', city: '' };

async function loadGuests() {
  const database = await getDatabase();
  const { data, error } = await database.from('guests').select('*').is('deleted_at', null).order('full_name').limit(1500);
  if (error) throw error;
  guestState.guests = data ?? [];
}

function filteredGuests() {
  const query = normalizeSearch(guestState.search);
  return guestState.guests.filter((guest) => {
    const haystack = normalizeSearch([guest.full_name, guest.document_number, guest.phone, guest.email, guest.city].join(' '));
    if (query && !haystack.includes(query)) return false;
    if (guestState.city && guest.city !== guestState.city) return false;
    return true;
  });
}

function guestsHtml(items) {
  if (!items.length) return emptyState({ icon: '♙', title: 'Nenhum hóspede encontrado', message: 'Ajuste a pesquisa ou faça um novo cadastro.', actionLabel: 'Novo hóspede', actionId: 'empty-new-guest' });
  return `<div class="data-table-wrap"><table class="data-table"><thead><tr><th>Hóspede</th><th>Documento</th><th>Telefone</th><th>E-mail</th><th>Cidade</th><th>Cadastro</th><th>Ações</th></tr></thead><tbody>${items.map((guest) => `<tr><td data-label="Hóspede" class="primary-cell"><strong>${escapeHtml(guest.full_name)}</strong><small>${guest.nationality ? escapeHtml(guest.nationality) : 'Nacionalidade não informada'}</small></td><td data-label="Documento">${escapeHtml(maskDocument(guest.document_number))}</td><td data-label="Telefone">${escapeHtml(formatPhone(guest.phone || '')) || '—'}</td><td data-label="E-mail">${escapeHtml(guest.email || '—')}</td><td data-label="Cidade">${escapeHtml([guest.city, guest.state].filter(Boolean).join('–') || '—')}</td><td data-label="Cadastro">${formatDate(guest.created_at)}</td><td data-label="Ações"><div class="table-actions"><button class="table-action" data-guest-view="${guest.id}">Ver</button><button class="table-action" data-guest-reservation="${guest.id}">Reservar</button></div></td></tr>`).join('')}</tbody></table></div>`;
}

function renderGuestContent() {
  const items = filteredGuests();
  guestState.container.querySelector('#guests-content').innerHTML = guestsHtml(items);
  guestState.container.querySelector('#guest-result-count').textContent = `${items.length} hóspede${items.length === 1 ? '' : 's'}`;
  guestState.container.querySelectorAll('[data-guest-view]').forEach((button) => button.addEventListener('click', () => openGuestDetails(button.dataset.guestView)));
  guestState.container.querySelectorAll('[data-guest-reservation]').forEach((button) => button.addEventListener('click', () => startReservation(button.dataset.guestReservation)));
  guestState.container.querySelector('#empty-new-guest')?.addEventListener('click', () => openGuestForm());
}

function guestFormHtml(guest = null) {
  return `<form id="guest-form" novalidate><div class="form-section"><h3>Identificação</h3><p>Dados essenciais para a hospedagem. Documentos não aparecem integralmente nas listagens.</p></div><div class="form-grid">
    <label class="field field--full"><span>Nome completo *</span><input name="full_name" minlength="3" maxlength="160" value="${escapeHtml(guest?.full_name || '')}" autocomplete="name" required></label>
    <label class="field"><span>Tipo de documento *</span><select name="document_type"><option value="cpf" ${guest?.document_type === 'cpf' || !guest ? 'selected' : ''}>CPF</option><option value="passport" ${guest?.document_type === 'passport' ? 'selected' : ''}>Passaporte</option><option value="other" ${guest?.document_type === 'other' ? 'selected' : ''}>Outro</option></select></label>
    <label class="field"><span>Número do documento</span><input name="document_number" maxlength="40" value="${escapeHtml(guest?.document_number || '')}" autocomplete="off"><small id="cpf-feedback"></small></label>
    <label class="field"><span>Data de nascimento</span><input name="birth_date" type="date" max="${new Date().toISOString().slice(0,10)}" value="${guest?.birth_date || ''}"></label>
    <label class="field"><span>Nacionalidade</span><input name="nationality" maxlength="80" value="${escapeHtml(guest?.nationality || 'Brasileira')}"></label>
    <label class="field"><span>Telefone</span><input name="phone" inputmode="tel" maxlength="16" value="${escapeHtml(formatPhone(guest?.phone || ''))}" autocomplete="tel"></label>
    <label class="field"><span>E-mail</span><input name="email" type="email" maxlength="160" value="${escapeHtml(guest?.email || '')}" autocomplete="email"></label>
  </div><div class="form-section"><h3>Endereço</h3><p>Informe somente o necessário para cadastro e faturamento.</p></div><div class="form-grid form-grid--3">
    <label class="field"><span>CEP</span><input name="postal_code" maxlength="10" value="${escapeHtml(guest?.postal_code || '')}"></label>
    <label class="field field--full"><span>Logradouro</span><input name="street" maxlength="160" value="${escapeHtml(guest?.street || '')}" autocomplete="street-address"></label>
    <label class="field"><span>Número</span><input name="address_number" maxlength="30" value="${escapeHtml(guest?.address_number || '')}"></label>
    <label class="field"><span>Complemento</span><input name="complement" maxlength="120" value="${escapeHtml(guest?.complement || '')}"></label>
    <label class="field"><span>Bairro</span><input name="neighborhood" maxlength="120" value="${escapeHtml(guest?.neighborhood || '')}"></label>
    <label class="field"><span>Cidade</span><input name="city" maxlength="120" value="${escapeHtml(guest?.city || '')}"></label>
    <label class="field"><span>Estado</span><input name="state" maxlength="2" value="${escapeHtml(guest?.state || 'MG')}"></label>
    <label class="field"><span>País</span><input name="country" maxlength="80" value="${escapeHtml(guest?.country || 'Brasil')}"></label>
  </div><div class="form-section"><h3>Acolhimento e segurança</h3><p>Preferências, acessibilidade e contato de emergência.</p></div><div class="form-grid">
    <label class="field"><span>Contato de emergência</span><input name="emergency_contact_name" maxlength="160" value="${escapeHtml(guest?.emergency_contact_name || '')}"></label>
    <label class="field"><span>Telefone de emergência</span><input name="emergency_contact_phone" maxlength="16" value="${escapeHtml(formatPhone(guest?.emergency_contact_phone || ''))}"></label>
    <label class="field field--full"><span>Preferências</span><textarea name="preferences" maxlength="2000">${escapeHtml(guest?.preferences || '')}</textarea></label>
    <label class="field field--full"><span>Necessidades de acessibilidade</span><textarea name="accessibility_needs" maxlength="2000">${escapeHtml(guest?.accessibility_needs || '')}</textarea></label>
    <label class="field field--full"><span>Observações internas</span><textarea name="internal_notes" maxlength="3000">${escapeHtml(guest?.internal_notes || '')}</textarea></label>
    <label class="field field--full"><span>Documento digital (PDF, JPG ou PNG; até 10 MB)</span><input name="document_file" type="file" accept="application/pdf,image/jpeg,image/png"><small>O arquivo será armazenado de forma privada no MySQL e exige login para ser aberto.</small></label>
  </div><div class="form-actions"><button type="button" class="button button--secondary" id="guest-form-cancel">Cancelar</button><button type="submit" class="button button--primary">${guest ? 'Salvar alterações' : 'Cadastrar hóspede'}</button></div></form>`;
}

async function detectDuplicate(payload, currentId = null) {
  const database = await getDatabase();
  const checks = [];
  const documentNormalized = String(payload.document_number || '').replace(/[^a-z0-9]/gi, '').toUpperCase();
  const phoneNormalized = String(payload.phone || '').replace(/\D/g, '');
  if (documentNormalized) checks.push(database.from('guests').select('id, full_name').eq('document_type', payload.document_type).eq('document_number_normalized', documentNormalized).is('deleted_at', null).limit(1));
  if (phoneNormalized) checks.push(database.from('guests').select('id, full_name').eq('phone_normalized', phoneNormalized).is('deleted_at', null).limit(1));
  if (payload.email) checks.push(database.from('guests').select('id, full_name').ilike('email', payload.email).is('deleted_at', null).limit(1));
  const results = await Promise.all(checks);
  for (const result of results) {
    if (result.error) throw result.error;
    const match = result.data?.find((item) => item.id !== currentId);
    if (match) return match;
  }
  return null;
}

async function uploadGuestDocument(guestId, file) {
  if (!file || !file.size) return null;
  if (file.size > 10 * 1024 * 1024) throw new Error('O arquivo excede o limite de 10 MB.');
  const safeName = file.name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9._-]/g, '-').slice(-120);
  const path = `${guestId}/${crypto.randomUUID()}-${safeName}`;
  const body = new FormData();
  body.append('bucket', 'guest-documents');
  body.append('path', path);
  body.append('file', file, file.name);
  await backendFetch('/storage/upload', { method: 'POST', body });
  return path;
}

export function openGuestForm(guestId = null, options = {}) {
  const guest = guestId ? guestState.guests.find((item) => item.id === guestId) : null;
  openDrawer({ title: guest ? 'Editar hóspede' : 'Novo hóspede', eyebrow: 'Cadastro protegido', content: guestFormHtml(guest), onOpen(root) {
    const form = root.querySelector('form');
    const documentInput = form.elements.document_number;
    const typeInput = form.elements.document_type;
    const cpfFeedback = root.querySelector('#cpf-feedback');
    const validateDocument = () => {
      if (typeInput.value !== 'cpf' || !documentInput.value) { cpfFeedback.textContent = ''; documentInput.removeAttribute('aria-invalid'); return true; }
      documentInput.value = formatCpf(documentInput.value);
      const valid = validateCpf(documentInput.value);
      cpfFeedback.textContent = valid ? 'CPF válido.' : 'CPF inválido.';
      cpfFeedback.style.color = valid ? 'var(--success)' : 'var(--danger)';
      documentInput.setAttribute('aria-invalid', String(!valid));
      return valid;
    };
    documentInput.addEventListener('input', () => { if (typeInput.value === 'cpf') documentInput.value = formatCpf(documentInput.value); });
    documentInput.addEventListener('blur', validateDocument);
    typeInput.addEventListener('change', validateDocument);
    form.elements.phone.addEventListener('input', () => { form.elements.phone.value = formatPhone(form.elements.phone.value); });
    form.elements.emergency_contact_phone.addEventListener('input', () => { form.elements.emergency_contact_phone.value = formatPhone(form.elements.emergency_contact_phone.value); });
    root.querySelector('#guest-form-cancel').addEventListener('click', closeDrawer);
    form.addEventListener('submit', async (event) => {
      event.preventDefault(); if (!form.reportValidity() || !validateDocument()) return; setDrawerBusy(true, 'Salvando…');
      try {
        const value = (name) => form.elements[name].value.trim() || null;
        const payload = {
          full_name: value('full_name'), document_type: typeInput.value, document_number: value('document_number'),
          birth_date: form.elements.birth_date.value || null, phone: value('phone'), email: value('email'),
          postal_code: value('postal_code'), street: value('street'), address_number: value('address_number'),
          complement: value('complement'), neighborhood: value('neighborhood'), city: value('city'),
          state: value('state')?.toUpperCase() || null, country: value('country') || 'Brasil', nationality: value('nationality') || 'Brasileira',
          emergency_contact_name: value('emergency_contact_name'), emergency_contact_phone: value('emergency_contact_phone'),
          preferences: value('preferences'), accessibility_needs: value('accessibility_needs'), internal_notes: value('internal_notes')
        };
        const duplicate = await detectDuplicate(payload, guest?.id);
        if (duplicate) throw new Error(`Possível cadastro duplicado: ${duplicate.full_name}. Consulte o registro existente antes de continuar.`);
        const database = await getDatabase();
        const query = guest ? database.from('guests').update(payload).eq('id', guest.id).select().single() : database.from('guests').insert(payload).select().single();
        const { data: saved, error } = await query;
        if (error) throw error;
        const file = form.elements.document_file.files[0];
        if (file) {
          const documentPath = await uploadGuestDocument(saved.id, file);
          const { error: pathError } = await database.from('guests').update({ document_path: documentPath }).eq('id', saved.id);
          if (pathError) throw pathError;
        }
        toast(guest ? 'Dados do hóspede atualizados.' : 'Hóspede cadastrado com sucesso.'); closeDrawer();
        await refreshGuests();
        if (options.returnToReservation) startReservation(saved.id);
      } catch (error) { setFormError(form, friendlyError(error)); } finally { setDrawerBusy(false); }
    });
  }});
}

async function downloadDocument(guest) {
  if (!guest.document_path) return;
  try {
    const { url } = await backendFetch('/storage/download-url', { method: 'POST', body: JSON.stringify({ bucket: 'guest-documents', path: guest.document_path }) });
    window.open(url, '_blank', 'noopener,noreferrer');
  } catch (error) { toast(friendlyError(error), { title: 'Documento indisponível', type: 'error' }); }
}

function startReservation(guestId) {
  window.dispatchEvent(new CustomEvent('hotel:new-reservation', { detail: { guestId } }));
}

async function openGuestDetails(id) {
  const guest = guestState.guests.find((item) => item.id === id);
  if (!guest) return;
  const database = await getDatabase();
  await database.rpc('record_sensitive_access', { p_table_name: 'guests', p_record_id: guest.id, p_context: 'guest_details' });
  const { data: history, error } = await database.from('reservation_overview').select('id, code, check_in_at, check_out_at, room_number, total_amount, status').eq('responsible_guest_id', guest.id).order('check_in_at', { ascending: false }).limit(30);
  const historyItems = error ? [] : (history ?? []);
  openDrawer({ title: guest.full_name, eyebrow: 'Perfil do hóspede', content: `<div class="detail-actions"><button class="button button--primary button--small" id="guest-detail-reservation">Iniciar reserva</button><button class="button button--secondary button--small" id="guest-detail-edit">Editar dados</button>${guest.document_path ? '<button class="button button--secondary button--small" id="guest-detail-document">Abrir documento</button>' : ''}</div>
    <div class="alert alert--warning">Dados pessoais: consulte somente quando necessário para a operação.</div><div class="detail-grid"><div class="detail-item"><small>Documento</small><strong>${escapeHtml(guest.document_number || 'Não informado')}</strong></div><div class="detail-item"><small>Nascimento</small><strong>${formatDate(guest.birth_date)}</strong></div><div class="detail-item"><small>Telefone</small><strong>${escapeHtml(formatPhone(guest.phone || '') || 'Não informado')}</strong></div><div class="detail-item"><small>E-mail</small><strong>${escapeHtml(guest.email || 'Não informado')}</strong></div><div class="detail-item detail-item--full"><small>Endereço</small><strong>${escapeHtml([guest.street, guest.address_number, guest.neighborhood, guest.city, guest.state].filter(Boolean).join(', ') || 'Não informado')}</strong></div><div class="detail-item"><small>Nacionalidade</small><strong>${escapeHtml(guest.nationality || '—')}</strong></div><div class="detail-item"><small>Contato de emergência</small><strong>${escapeHtml([guest.emergency_contact_name, formatPhone(guest.emergency_contact_phone || '')].filter(Boolean).join(' · ') || '—')}</strong></div>${guest.preferences ? `<div class="detail-item detail-item--full"><small>Preferências</small><strong>${escapeHtml(guest.preferences)}</strong></div>` : ''}${guest.accessibility_needs ? `<div class="detail-item detail-item--full"><small>Acessibilidade</small><strong>${escapeHtml(guest.accessibility_needs)}</strong></div>` : ''}${guest.internal_notes ? `<div class="detail-item detail-item--full"><small>Observações internas</small><strong>${escapeHtml(guest.internal_notes)}</strong></div>` : ''}</div>
    <div class="divider-label">Histórico de hospedagens</div>${historyItems.length ? `<div class="timeline">${historyItems.map((item) => `<div class="timeline-item"><span class="timeline-time">${formatDate(item.check_in_at).slice(0,5)}</span><span class="timeline-dot"></span><div class="timeline-copy"><strong>${escapeHtml(item.code)} · Quarto ${escapeHtml(item.room_number)}</strong><small>${formatDate(item.check_in_at)} a ${formatDate(item.check_out_at)} · ${formatMoney(item.total_amount)}</small></div><span class="status-badge ${statusClass(item.status)}">${label(item.status)}</span></div>`).join('')}</div>` : emptyState({ icon: '◇', title: 'Primeira hospedagem', message: 'Este hóspede ainda não possui histórico de reservas.' })}`,
    onOpen(root) {
      root.querySelector('#guest-detail-reservation').addEventListener('click', () => startReservation(guest.id));
      root.querySelector('#guest-detail-edit').addEventListener('click', () => openGuestForm(guest.id));
      root.querySelector('#guest-detail-document')?.addEventListener('click', () => downloadDocument(guest));
    }
  });
}

function bindGuestFilters() {
  const root = guestState.container;
  root.querySelector('#guest-search').addEventListener('input', (event) => { guestState.search = event.target.value; renderGuestContent(); });
  root.querySelector('#guest-city-filter').addEventListener('change', (event) => { guestState.city = event.target.value; renderGuestContent(); });
  root.querySelector('#clear-guest-filters').addEventListener('click', () => { guestState.search = ''; guestState.city = ''; root.querySelector('#guest-search').value = ''; root.querySelector('#guest-city-filter').value = ''; renderGuestContent(); });
  root.querySelector('#new-guest-button').addEventListener('click', () => openGuestForm());
}

async function refreshGuests() { await loadGuests(); renderGuestContent(); }

export async function renderGuests(container) {
  guestState.container = container;
  try {
    await loadGuests();
    const cities = [...new Set(guestState.guests.map((guest) => guest.city).filter(Boolean))].sort();
    container.innerHTML = `<div class="page-heading"><div><h2>Hóspedes</h2><p>Cadastros protegidos, preferências e histórico de hospedagens.</p></div><div class="heading-actions"><span id="guest-result-count" class="status-badge status--confirmed">0 hóspedes</span><button id="new-guest-button" class="button button--primary">+ Novo hóspede</button></div></div><div class="toolbar"><label class="field field--search"><span class="sr-only">Pesquisar hóspedes</span><input id="guest-search" type="search" placeholder="Nome, CPF, telefone ou e-mail"></label><label class="field"><span class="sr-only">Cidade</span><select id="guest-city-filter"><option value="">Todas as cidades</option>${cities.map((city) => `<option value="${escapeHtml(city)}">${escapeHtml(city)}</option>`).join('')}</select></label><div class="toolbar-actions"><button id="clear-guest-filters" class="button button--ghost button--small">Limpar filtros</button></div></div><div id="guests-content"></div>`;
    bindGuestFilters(); renderGuestContent();
  } catch (error) {
    container.innerHTML = emptyState({ icon: '!', title: 'Hóspedes indisponíveis', message: friendlyError(error), actionLabel: 'Tentar novamente', actionId: 'retry-guests' });
    container.querySelector('#retry-guests')?.addEventListener('click', () => renderGuests(container));
  }
}

export function guestsModuleReady() { return Boolean(guestState.container?.isConnected); }
