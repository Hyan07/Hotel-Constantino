import { openModal } from '../components/modal.js';
import { showToast } from '../components/toast.js';
import { formField, renderEmpty, renderError, renderLoading } from '../components/ui.js';
import { hotelApi } from '../services/hotel-api.js';
import { escapeHtml, formatDateTime, statusBadge } from '../utils/format.js';

function roleFields(roles, selected = []) {
  return `<fieldset class="form-field form-field-wide"><legend>Perfis *</legend><div class="check-grid">${roles.map((role) => `<label><input type="checkbox" name="roleCodes" value="${escapeHtml(role.code)}" ${selected.includes(role.code) ? 'checked' : ''}> <span><strong>${escapeHtml(role.name)}</strong><small>${escapeHtml(role.description)}</small></span></label>`).join('')}</div></fieldset>`;
}

function userForm(roles, user = {}) {
  return `<div class="form-grid">
    ${formField({ label: 'Nome completo', name: 'fullName', value: user.fullName, required: true })}
    ${user.id ? `<div class="form-field"><span>E-mail</span><strong>${escapeHtml(user.email)}</strong></div>` : formField({ label: 'E-mail', name: 'email', type: 'email', required: true })}
    ${formField({ label: user.id ? 'Nova senha (opcional)' : 'Senha inicial', name: 'password', type: 'password', required: !user.id, min: 12 })}
    ${
      user.id
        ? formField({
            label: 'Situação',
            name: 'status',
            value: user.status,
            options: [
              { value: 'active', label: 'Ativo' },
              { value: 'inactive', label: 'Inativo' },
              { value: 'locked', label: 'Bloqueado' },
            ],
          })
        : ''
    }
    ${roleFields(roles, user.roleCodes ?? ['funcionario'])}
    ${user.id ? `<input type="hidden" name="version" value="${user.version}">` : ''}
  </div>`;
}

function openUserModal(container, roles, user) {
  openModal({
    title: user ? 'Editar usuário' : 'Novo usuário',
    content: userForm(roles, user),
    submitLabel: user ? 'Salvar usuário' : 'Criar usuário',
    onSubmit: async (data) => {
      const payload = {
        fullName: data.get('fullName'),
        roleCodes: data.getAll('roleCodes'),
        ...(data.get('password') ? { password: data.get('password') } : {}),
      };
      if (user) {
        await hotelApi.updateUser(user.id, {
          ...payload,
          status: data.get('status'),
          version: Number(data.get('version')),
        });
      } else {
        await hotelApi.createUser({ ...payload, email: data.get('email') });
      }
      showToast(user ? 'Usuário atualizado.' : 'Usuário criado.');
      renderUsersPage(container);
    },
  });
}

export async function renderUsersPage(container) {
  renderLoading(container, 'Carregando usuários e permissões…');
  try {
    const [response, roleResponse] = await Promise.all([
      hotelApi.users({ pageSize: 100 }),
      hotelApi.roles(),
    ]);
    container.innerHTML = `<section class="page-toolbar surface"><div><p class="eyebrow">Acesso</p><p>Usuários e perfis são validados pelo servidor.</p></div><button class="button button-primary" data-new>+ Novo usuário</button></section>
      <section class="surface data-card"><header class="data-card-header"><div><p class="eyebrow">Administração</p><h2>Usuários</h2></div><span class="subtle-label">${response.meta.total} usuários</span></header>${response.data.length ? `<div class="table-scroll"><table><thead><tr><th>Usuário</th><th>Perfis</th><th>Situação</th><th>Último acesso</th><th><span class="sr-only">Ações</span></th></tr></thead><tbody>${response.data.map((user) => `<tr><td><strong>${escapeHtml(user.fullName)}</strong><small>${escapeHtml(user.email)}</small></td><td>${user.roleCodes.map((role) => `<span class="subtle-label">${escapeHtml(role)}</span>`).join(' ')}</td><td>${statusBadge(user.status)}</td><td>${formatDateTime(user.lastLoginAt)}</td><td><button class="text-button" data-edit="${user.id}">Editar</button></td></tr>`).join('')}</tbody></table></div>` : renderEmpty('Crie o primeiro usuário autorizado.')}</section>
      <section class="role-grid">${roleResponse.data.map((role) => `<article class="surface section-card"><p class="eyebrow">Perfil</p><h2>${escapeHtml(role.name)}</h2><p>${escapeHtml(role.description)}</p><small>${role.permissions.length} permissões atribuídas</small></article>`).join('')}</section>`;
    container
      .querySelector('[data-new]')
      .addEventListener('click', () => openUserModal(container, roleResponse.data));
    container.querySelectorAll('[data-edit]').forEach((button) =>
      button.addEventListener('click', () => {
        const user = response.data.find((item) => item.id === Number(button.dataset.edit));
        openUserModal(container, roleResponse.data, user);
      }),
    );
  } catch (error) {
    renderError(container, error, () => renderUsersPage(container));
  }
}
