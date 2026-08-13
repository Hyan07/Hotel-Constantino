import { signIn, signOut, loadSession } from './modules/auth.js';
import { getDatabase } from './modules/database.js';
import { getState, roleLabels, setState } from './modules/state.js';
import { friendlyError, openDrawer, pageLoading, toast } from './modules/ui.js';
import { escapeHtml, formatDateTime, formatMoney, initials, label, statusClass } from './modules/format.js';
import { renderDashboard } from './pages/dashboard.js';
import { openGuestForm, renderGuests } from './pages/guests.js';
import { openReservationDetails, openReservationForm, renderReservations } from './pages/reservations.js';
import { renderRooms } from './pages/rooms.js';
import { renderUsers } from './pages/users.js';

const loginView = document.querySelector('#login-view');
const appShell = document.querySelector('#app-shell');
const main = document.querySelector('#main-content');
const loginForm = document.querySelector('#login-form');
const sidebar = document.querySelector('#sidebar');
const backdrop = document.querySelector('#mobile-backdrop');

const routes = {
  dashboard: { title: 'Visão geral', eyebrow: 'Operação do hotel', roles: ['admin','reception','housekeeping','viewer'], render: renderDashboard },
  reservations: { title: 'Reservas', eyebrow: 'Hospedagens', roles: ['admin','reception'], render: renderReservations },
  rooms: { title: 'Quartos', eyebrow: 'Operação e governança', roles: ['admin','reception','housekeeping','viewer'], render: renderRooms },
  guests: { title: 'Hóspedes', eyebrow: 'Relacionamento e LGPD', roles: ['admin','reception'], render: renderGuests },
  users: { title: 'Usuários', eyebrow: 'Administração', roles: ['admin'], render: renderUsers }
};

let notificationData = { upcoming: [], alerts: [] };
let refreshDebounce;

function showLogin(message = '') {
  loginView.hidden = false;
  appShell.hidden = true;
  if (message) {
    const alert = document.querySelector('#login-alert');
    alert.textContent = message;
    alert.hidden = false;
  }
}

function applyRoleVisibility() {
  const role = getState().profile.role;
  document.querySelectorAll('[data-roles]').forEach((element) => {
    const allowed = element.dataset.roles.split(',');
    element.hidden = !allowed.includes(role);
  });
}

function showApp() {
  const profile = getState().profile;
  loginView.hidden = true;
  appShell.hidden = false;
  document.querySelector('#user-name').textContent = profile.full_name;
  document.querySelector('#user-role').textContent = roleLabels[profile.role] ?? profile.role;
  document.querySelector('#user-initials').textContent = initials(profile.full_name);
  applyRoleVisibility();
}

function closeMobileSidebar() {
  sidebar.classList.remove('is-open');
  backdrop.hidden = true;
}

async function navigate(routeName, options = {}) {
  const route = routes[routeName] ?? routes.dashboard;
  const role = getState().profile?.role;
  if (!route.roles.includes(role)) {
    toast('Seu perfil não tem acesso a esta área.', { title: 'Acesso restrito', type: 'error' });
    routeName = 'dashboard';
  }
  const selected = routes[routeName];
  setState({ route: routeName });
  document.querySelector('#page-title').textContent = selected.title;
  document.querySelector('#page-eyebrow').textContent = selected.eyebrow;
  document.querySelectorAll('[data-route]').forEach((item) => item.classList.toggle('is-active', item.dataset.route === routeName));
  closeMobileSidebar();
  main.innerHTML = pageLoading();
  main.focus({ preventScroll: true });
  history.replaceState(null, '', `#${routeName}`);
  await selected.render(main, options);
}

async function setupAutoRefresh() {
  if (getState().autoRefreshTimer) clearInterval(getState().autoRefreshTimer);
  const refresh = () => {
    if (document.hidden || document.querySelector('#drawer')?.open) return;
    clearTimeout(refreshDebounce);
    refreshDebounce = setTimeout(() => {
      const route = getState().route;
      if (['dashboard','rooms','reservations'].includes(route)) navigate(route);
    }, 250);
  };
  const timer = setInterval(refresh, 30_000);
  setState({ autoRefreshTimer: timer });
}

async function handleGlobalSearch(query) {
  const value = query.trim();
  if (value.length < 2) return toast('Digite pelo menos dois caracteres.', { title: 'Pesquisa', type: 'error' });
  const filterValue = value.replace(/[(),.*]/g, ' ').replace(/\s+/g, ' ').trim();
  if (filterValue.length < 2) return toast('Use letras ou números na pesquisa.', { title: 'Pesquisa', type: 'error' });
  openDrawer({ title: `Resultados para “${value}”`, eyebrow: 'Pesquisa no sistema', content: pageLoading('Pesquisando…') });
  try {
    const database = await getDatabase();
    const role = getState().profile.role;
    const roomQuery = database.from('room_overview').select('id, room_number, category_name, current_status').or(`room_number.ilike.%${filterValue}%,category_name.ilike.%${filterValue}%`).limit(8);
    const queries = [roomQuery];
    if (['admin','reception'].includes(role)) {
      queries.push(database.from('reservation_overview').select('id, code, guest_name, room_number, status, check_in_at').or(`code.ilike.%${filterValue}%,guest_name.ilike.%${filterValue}%,guest_phone.ilike.%${filterValue}%`).limit(10));
      queries.push(database.from('guests').select('id, full_name, phone, email').or(`full_name.ilike.%${filterValue}%,phone.ilike.%${filterValue}%,email.ilike.%${filterValue}%`).is('deleted_at', null).limit(10));
    }
    const results = await Promise.all(queries);
    results.forEach((result) => { if (result.error) throw result.error; });
    const rooms = results[0].data ?? [];
    const reservations = results[1]?.data ?? [];
    const guests = results[2]?.data ?? [];
    const content = document.querySelector('#drawer-content');
    if (!rooms.length && !reservations.length && !guests.length) {
      content.innerHTML = '<div class="empty-state"><div><span class="empty-state__icon">⌕</span><h3>Nada encontrado</h3><p>Tente outro nome, telefone, código ou número de quarto.</p></div></div>';
      return;
    }
    content.innerHTML = `${reservations.length ? `<div class="divider-label">Reservas</div><div class="timeline">${reservations.map((item) => `<button class="quick-action" data-search-route="reservations" data-search-id="${item.id}"><span class="quick-action__icon">▣</span><span><strong>${escapeHtml(item.code)} · ${escapeHtml(item.guest_name)}</strong><small>Quarto ${escapeHtml(item.room_number)} · ${formatDateTime(item.check_in_at)}</small></span></button>`).join('')}</div>` : ''}${guests.length ? `<div class="divider-label">Hóspedes</div><div class="timeline">${guests.map((item) => `<button class="quick-action" data-search-route="guests" data-search-id="${item.id}"><span class="quick-action__icon">♙</span><span><strong>${escapeHtml(item.full_name)}</strong><small>${escapeHtml(item.phone || item.email || 'Sem contato')}</small></span></button>`).join('')}</div>` : ''}${rooms.length ? `<div class="divider-label">Quartos</div><div class="timeline">${rooms.map((item) => `<button class="quick-action" data-search-route="rooms"><span class="quick-action__icon">${escapeHtml(item.room_number)}</span><span><strong>${escapeHtml(item.category_name)}</strong><small>${escapeHtml(label(item.current_status))}</small></span></button>`).join('')}</div>` : ''}`;
    content.querySelectorAll('[data-search-route]').forEach((button) => button.addEventListener('click', async () => {
      document.querySelector('#drawer').close();
      const route = button.dataset.searchRoute;
      await navigate(route);
      if (route === 'reservations' && button.dataset.searchId) window.dispatchEvent(new CustomEvent('hotel:open-reservation', { detail: { id: button.dataset.searchId } }));
      if (route === 'guests' && button.dataset.searchId) document.querySelector(`[data-guest-view="${button.dataset.searchId}"]`)?.click();
    }));
  } catch (error) {
    document.querySelector('#drawer-content').innerHTML = `<div class="alert alert--error">${escapeHtml(friendlyError(error))}</div>`;
  }
}

function openNotifications() {
  const { upcoming, alerts } = notificationData;
  openDrawer({ title: 'Central de atenção', eyebrow: 'Notificações operacionais', content: `${alerts.length ? `<div class="divider-label">Pagamentos pendentes</div><div class="timeline">${alerts.map((item) => `<div class="timeline-item"><span class="timeline-time">${formatMoney(Math.max(0, Number(item.total_amount) - Number(item.amount_paid || 0)))}</span><span class="timeline-dot"></span><div class="timeline-copy"><strong>${escapeHtml(item.guest_name)}</strong><small>${escapeHtml(item.code)} · Quarto ${escapeHtml(item.room_number)}</small></div></div>`).join('')}</div>` : '<div class="alert alert--success">Nenhum pagamento ativo exige atenção.</div>'}${upcoming.length ? `<div class="divider-label">Próximas movimentações</div><div class="timeline">${upcoming.map((item) => `<div class="timeline-item"><span class="timeline-time">${formatDateTime(item.check_in_at).slice(0,5)}</span><span class="timeline-dot"></span><div class="timeline-copy"><strong>${escapeHtml(item.guest_name)}</strong><small>Quarto ${escapeHtml(item.room_number)} · ${escapeHtml(label(item.status))}</small></div></div>`).join('')}</div>` : ''}` });
}

function openUserPanel() {
  const profile = getState().profile;
  openDrawer({ title: profile.full_name, eyebrow: 'Usuário conectado', content: `<div class="detail-grid"><div class="detail-item"><small>Perfil de acesso</small><strong>${escapeHtml(roleLabels[profile.role])}</strong></div><div class="detail-item"><small>Situação</small><strong>Ativo</strong></div></div><div class="alert alert--success">Sua sessão está protegida por cookie seguro e autenticação no servidor.</div><div class="form-actions"><button id="user-panel-signout" class="button button--secondary">Sair do sistema</button></div>`, onOpen(root) { root.querySelector('#user-panel-signout').addEventListener('click', async () => { document.querySelector('#drawer').close(); await signOut(); showLogin(); }); } });
}

function bindStaticEvents() {
  document.querySelector('#toggle-password').addEventListener('click', (event) => {
    const input = document.querySelector('#login-password');
    input.type = input.type === 'password' ? 'text' : 'password';
    event.currentTarget.setAttribute('aria-label', input.type === 'password' ? 'Mostrar senha' : 'Ocultar senha');
  });
  loginForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const submit = document.querySelector('#login-submit');
    const alert = document.querySelector('#login-alert');
    alert.hidden = true;
    if (!loginForm.reportValidity()) return;
    submit.disabled = true; submit.innerHTML = '<span class="spinner"></span>Entrando…';
    try {
      await signIn(loginForm.elements.email.value.trim(), loginForm.elements.password.value);
      await loadSession(); showApp(); await navigate('dashboard'); await setupAutoRefresh();
    } catch (error) {
      alert.textContent = /Invalid login credentials/i.test(error.message) ? 'E-mail ou senha incorretos.' : friendlyError(error);
      alert.hidden = false;
    } finally { submit.disabled = false; submit.textContent = 'Entrar no sistema'; }
  });
  document.querySelectorAll('[data-route]').forEach((button) => button.addEventListener('click', () => navigate(button.dataset.route)));
  document.querySelector('#open-sidebar').addEventListener('click', () => { sidebar.classList.add('is-open'); backdrop.hidden = false; });
  document.querySelector('#close-sidebar').addEventListener('click', closeMobileSidebar);
  backdrop.addEventListener('click', closeMobileSidebar);
  document.querySelector('#sign-out').addEventListener('click', async () => { await signOut(); showLogin(); });
  document.querySelector('#quick-reservation').addEventListener('click', () => window.dispatchEvent(new CustomEvent('hotel:new-reservation')));
  document.querySelector('#mobile-new-reservation').addEventListener('click', () => window.dispatchEvent(new CustomEvent('hotel:new-reservation')));
  document.querySelector('#notifications-button').addEventListener('click', openNotifications);
  document.querySelector('#user-menu-button').addEventListener('click', openUserPanel);
  document.querySelector('#global-search-form').addEventListener('submit', (event) => { event.preventDefault(); handleGlobalSearch(document.querySelector('#global-search').value); });

  window.addEventListener('hotel:navigate', (event) => navigate(event.detail.route, event.detail));
  window.addEventListener('hotel:new-reservation', async (event) => { await navigate('reservations'); await openReservationForm(null, event.detail?.guestId ?? null); });
  window.addEventListener('hotel:new-guest', async (event) => { await navigate('guests'); openGuestForm(null, event.detail ?? {}); });
  window.addEventListener('hotel:open-reservation', async (event) => {
    openReservationDetails(event.detail.id);
  });
  window.addEventListener('hotel:notifications', (event) => {
    notificationData = event.detail;
    const count = notificationData.alerts.length;
    const badge = document.querySelector('#notification-count');
    badge.textContent = String(count); badge.hidden = count === 0;
  });
  window.addEventListener('hotel:dashboard-stale', () => { if (getState().route === 'dashboard') navigate('dashboard'); });
  window.addEventListener('hashchange', () => {
    const target = location.hash.slice(1); if (routes[target] && target !== getState().route) navigate(target);
  });
}

async function init() {
  bindStaticEvents();
  try {
    const { session } = await loadSession();
    if (!session) return showLogin();
    showApp();
    const requested = location.hash.slice(1);
    await navigate(routes[requested] ? requested : 'dashboard');
    await setupAutoRefresh();
  } catch (error) { showLogin(friendlyError(error)); }
}

init();
