import { openModal } from '../components/modal.js';
import { showToast } from '../components/toast.js';
import { formField, renderEmpty, renderError, renderLoading } from '../components/ui.js';
import { hotelApi } from '../services/hotel-api.js';
import { hasPermission } from '../store/app-store.js';
import { escapeHtml, formatDate } from '../utils/format.js';

function guestForm(guest = {}) {
  return `<div class="form-grid">
    ${formField({ label: 'Nome completo', name: 'fullName', value: guest.fullName, required: true })}
    ${formField({ label: 'E-mail', name: 'email', type: 'email', value: guest.email })}
    ${formField({ label: 'Telefone', name: 'phone', value: guest.phone })}
    ${formField({ label: 'Nascimento', name: 'birthDate', type: 'date', value: guest.birthDate })}
    ${formField({
      label: 'Tipo de documento',
      name: 'documentType',
      value: guest.documentType ?? '',
      options: [
        { value: '', label: 'Não informado' },
        { value: 'cpf', label: 'CPF' },
        { value: 'passport', label: 'Passaporte' },
        { value: 'other', label: 'Outro' },
      ],
    })}
    ${formField({ label: 'Número do documento', name: 'documentNumber', value: guest.documentNumber })}
    ${formField({ label: 'Cidade', name: 'city', value: guest.city })}
    ${formField({ label: 'UF', name: 'stateCode', value: guest.stateCode, max: 2 })}
    <label class="form-field form-field-wide"><span>Observações</span><textarea name="notes" rows="3" maxlength="1000">${escapeHtml(guest.notes ?? '')}</textarea></label>
    ${guest.version ? `<input type="hidden" name="version" value="${guest.version}">` : ''}
  </div>`;
}

function formDataToGuest(formData) {
  const value = (name) => formData.get(name)?.toString().trim() || null;
  return {
    fullName: value('fullName'),
    email: value('email'),
    phone: value('phone'),
    birthDate: value('birthDate'),
    documentType: value('documentType'),
    documentNumber: value('documentNumber'),
    city: value('city'),
    stateCode: value('stateCode'),
    notes: value('notes'),
    ...(value('version') ? { version: Number(value('version')) } : {}),
  };
}

function openGuestModal(container, guest) {
  openModal({
    title: guest ? 'Editar hóspede' : 'Novo hóspede',
    content: guestForm(guest),
    submitLabel: guest ? 'Salvar alterações' : 'Cadastrar hóspede',
    onSubmit: async (formData) => {
      const payload = formDataToGuest(formData);
      if (guest) await hotelApi.updateGuest(guest.id, payload);
      else await hotelApi.createGuest(payload);
      showToast(guest ? 'Hóspede atualizado.' : 'Hóspede cadastrado.');
      await renderGuestsPage(container);
    },
  });
}

export async function renderGuestsPage(container, initialSearch = '') {
  renderLoading(container, 'Carregando hóspedes…');
  try {
    const response = await hotelApi.guests({ pageSize: 50, search: initialSearch });
    const canWrite = hasPermission('guests.write');
    container.innerHTML = `
      <section class="page-toolbar surface">
        <form class="search-form" data-search-form><label class="sr-only" for="guest-search">Buscar hóspede</label><input id="guest-search" type="search" name="search" value="${escapeHtml(initialSearch)}" placeholder="Nome, e-mail ou documento"><button class="button button-secondary" type="submit">Buscar</button></form>
        ${canWrite ? '<button class="button button-primary" type="button" data-new>+ Novo hóspede</button>' : ''}
      </section>
      <section class="surface data-card">
        <header class="data-card-header"><div><p class="eyebrow">Cadastro</p><h2>Hóspedes</h2></div><span class="subtle-label">${response.meta.total} registros</span></header>
        ${response.data.length ? `<div class="table-scroll"><table><thead><tr><th>Hóspede</th><th>Contato</th><th>Documento</th><th>Cidade</th><th>Atualização</th>${canWrite ? '<th><span class="sr-only">Ações</span></th>' : ''}</tr></thead><tbody>${response.data.map((guest) => `<tr><td><strong>${escapeHtml(guest.fullName)}</strong><small>${guest.birthDate ? `Nascimento ${formatDate(guest.birthDate)}` : 'Nascimento não informado'}</small></td><td>${escapeHtml(guest.email ?? '—')}<small>${escapeHtml(guest.phone ?? '')}</small></td><td>${escapeHtml(guest.documentNumber ?? '—')}</td><td>${escapeHtml([guest.city, guest.stateCode].filter(Boolean).join(' / ') || '—')}</td><td>${formatDate(String(guest.updatedAt).slice(0, 10))}</td>${canWrite ? `<td><button class="text-button" type="button" data-edit="${guest.id}">Editar</button></td>` : ''}</tr>`).join('')}</tbody></table></div>` : renderEmpty('Cadastre o primeiro hóspede para iniciar uma reserva.')}
      </section>`;
    container
      .querySelector('[data-new]')
      ?.addEventListener('click', () => openGuestModal(container));
    container.querySelector('[data-search-form]').addEventListener('submit', (event) => {
      event.preventDefault();
      renderGuestsPage(container, new FormData(event.currentTarget).get('search').toString());
    });
    container.querySelectorAll('[data-edit]').forEach((button) =>
      button.addEventListener('click', () => {
        const guest = response.data.find((item) => item.id === Number(button.dataset.edit));
        openGuestModal(container, guest);
      }),
    );
  } catch (error) {
    renderError(container, error, () => renderGuestsPage(container, initialSearch));
  }
}
