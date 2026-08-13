import { backendFetch } from '../modules/api.js';
import { getState } from '../modules/state.js';
import { closeDrawer, emptyState, friendlyError, openDrawer, setDrawerBusy, setFormError, toast, confirmAction } from '../modules/ui.js';
import { escapeHtml, formatDateTime, label, normalizeSearch, statusClass } from '../modules/format.js';

const usersState = { container: null, users: [], search: '', role: '' };

async function loadUsers() { usersState.users = await backendFetch('/admin/users'); }

function filteredUsers() {
  const search = normalizeSearch(usersState.search);
  return usersState.users.filter((user) => (!search || normalizeSearch(`${user.full_name} ${user.email}`).includes(search)) && (!usersState.role || user.role === usersState.role));
}

function renderUsersContent() {
  const items = filteredUsers();
  const host = usersState.container.querySelector('#users-content');
  if (!items.length) host.innerHTML = emptyState({ icon: '⚿', title: 'Nenhum usuário encontrado', message: 'Ajuste os filtros ou crie um novo acesso.' });
  else host.innerHTML = `<div class="data-table-wrap"><table class="data-table"><thead><tr><th>Usuário</th><th>Perfil</th><th>Situação</th><th>Último acesso</th><th>Criado em</th><th>Ações</th></tr></thead><tbody>${items.map((user) => `<tr><td data-label="Usuário" class="primary-cell"><strong>${escapeHtml(user.full_name)}</strong><small>${escapeHtml(user.email || 'E-mail indisponível')}</small></td><td data-label="Perfil"><span class="status-badge ${statusClass(user.role)}">${escapeHtml(label(user.role))}</span></td><td data-label="Situação"><span class="status-badge ${user.active ? 'status--available' : 'status--canceled'}">${user.active ? 'Ativo' : 'Inativo'}</span></td><td data-label="Último acesso">${formatDateTime(user.last_sign_in_at)}</td><td data-label="Criado em">${formatDateTime(user.created_at)}</td><td data-label="Ações"><div class="table-actions">${user.id !== getState().profile.id ? `<button class="table-action" data-user-edit="${user.id}">Alterar acesso</button>` : '<small>Conta atual</small>'}</div></td></tr>`).join('')}</tbody></table></div>`;
  usersState.container.querySelector('#users-result-count').textContent = `${items.length} usuário${items.length === 1 ? '' : 's'}`;
  host.querySelectorAll('[data-user-edit]').forEach((button) => button.addEventListener('click', () => openEditUser(button.dataset.userEdit)));
}

function openNewUser() {
  openDrawer({ title: 'Novo usuário', eyebrow: 'Acesso ao sistema', content: `<form id="new-user-form"><div class="alert alert--warning">A senha inicial deve ser entregue ao usuário por um canal seguro. Ela não será exibida novamente.</div><div class="form-grid"><label class="field field--full"><span>Nome completo *</span><input name="fullName" minlength="3" maxlength="120" required autocomplete="name"></label><label class="field field--full"><span>E-mail *</span><input name="email" type="email" required autocomplete="off"></label><label class="field"><span>Perfil de acesso *</span><select name="role" required>${['reception','housekeeping','viewer','admin'].map((role) => `<option value="${role}">${label(role)}</option>`).join('')}</select></label><label class="field"><span>Senha inicial *</span><input name="password" type="password" minlength="10" maxlength="128" required autocomplete="new-password"><small>Mínimo de 10 caracteres.</small></label></div><div class="form-actions"><button type="button" id="new-user-cancel" class="button button--secondary">Cancelar</button><button type="submit" class="button button--primary">Criar usuário</button></div></form>`, onOpen(root) {
    const form = root.querySelector('form'); root.querySelector('#new-user-cancel').addEventListener('click', closeDrawer);
    form.addEventListener('submit', async (event) => {
      event.preventDefault(); if (!form.reportValidity()) return; setDrawerBusy(true, 'Criando…');
      try {
        await backendFetch('/admin/users', { method: 'POST', body: JSON.stringify({ email: form.elements.email.value.trim(), password: form.elements.password.value, fullName: form.elements.fullName.value.trim(), role: form.elements.role.value }) });
        toast('Usuário criado com sucesso.'); closeDrawer(); await refreshUsers();
      } catch (error) { setFormError(form, friendlyError(error)); } finally { setDrawerBusy(false); }
    });
  }});
}

function openEditUser(id) {
  const user = usersState.users.find((item) => item.id === id); if (!user) return;
  openDrawer({ title: user.full_name, eyebrow: 'Permissões do usuário', content: `<form id="edit-user-form"><div class="alert alert--warning">Alterações de perfil modificam imediatamente o que este usuário pode visualizar e editar.</div><div class="detail-grid"><div class="detail-item detail-item--full"><small>E-mail</small><strong>${escapeHtml(user.email || '—')}</strong></div></div><label class="field"><span>Perfil de acesso *</span><select name="role">${['reception','housekeeping','viewer','admin'].map((role) => `<option value="${role}" ${role === user.role ? 'selected' : ''}>${label(role)}</option>`).join('')}</select></label><label class="field"><span>Situação *</span><select name="active"><option value="true" ${user.active ? 'selected' : ''}>Ativo</option><option value="false" ${!user.active ? 'selected' : ''}>Inativo</option></select></label><div class="form-actions"><button type="button" id="edit-user-cancel" class="button button--secondary">Cancelar</button><button type="submit" class="button button--primary">Salvar acesso</button></div></form>`, onOpen(root) {
    const form = root.querySelector('form'); root.querySelector('#edit-user-cancel').addEventListener('click', closeDrawer);
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const active = form.elements.active.value === 'true';
      const accepted = await confirmAction({ title: 'Alterar acesso do usuário', message: `Aplicar o perfil ${label(form.elements.role.value)} e deixar a conta ${active ? 'ativa' : 'inativa'}?`, confirmLabel: 'Aplicar alteração', danger: !active });
      if (!accepted) return; setDrawerBusy(true, 'Salvando…');
      try {
        await backendFetch(`/admin/users/${user.id}/role`, { method: 'PATCH', body: JSON.stringify({ role: form.elements.role.value, active }) });
        toast('Permissões atualizadas.'); closeDrawer(); await refreshUsers();
      } catch (error) { setFormError(form, friendlyError(error)); } finally { setDrawerBusy(false); }
    });
  }});
}

function bindUsersFilters() {
  const root = usersState.container;
  root.querySelector('#users-search').addEventListener('input', (event) => { usersState.search = event.target.value; renderUsersContent(); });
  root.querySelector('#users-role-filter').addEventListener('change', (event) => { usersState.role = event.target.value; renderUsersContent(); });
  root.querySelector('#new-user-button').addEventListener('click', openNewUser);
}

async function refreshUsers() { await loadUsers(); renderUsersContent(); }

export async function renderUsers(container) {
  usersState.container = container;
  try {
    await loadUsers();
    container.innerHTML = `<div class="page-heading"><div><h2>Usuários e permissões</h2><p>Administre acessos sem expor credenciais ou permitir autoelevação de perfil.</p></div><div class="heading-actions"><span id="users-result-count" class="status-badge status--confirmed">0 usuários</span><button id="new-user-button" class="button button--primary">+ Novo usuário</button></div></div><div class="toolbar"><label class="field field--search"><span class="sr-only">Pesquisar usuários</span><input id="users-search" type="search" placeholder="Nome ou e-mail"></label><label class="field"><span class="sr-only">Perfil</span><select id="users-role-filter"><option value="">Todos os perfis</option>${['admin','reception','housekeeping','viewer'].map((role) => `<option value="${role}">${label(role)}</option>`).join('')}</select></label></div><div id="users-content"></div>`;
    bindUsersFilters(); renderUsersContent();
  } catch (error) {
    container.innerHTML = emptyState({ icon: '!', title: 'Usuários indisponíveis', message: friendlyError(error), actionLabel: 'Tentar novamente', actionId: 'retry-users' });
    container.querySelector('#retry-users')?.addEventListener('click', () => renderUsers(container));
  }
}
