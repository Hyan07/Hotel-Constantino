import '@fontsource/manrope/latin-400.css';
import '@fontsource/manrope/latin-600.css';
import '@fontsource/manrope/latin-700.css';
import '@fontsource/dm-serif-display/latin-400.css';
import { confirmAction } from './components/modal.js';
import { showToast } from './components/toast.js';
import { getCsrfTokenFromCookie, setCsrfToken } from './core/api-client.js';
import { renderDashboardPage } from './pages/dashboard-page.js';
import { renderFinancePage } from './pages/finance-page.js';
import { renderGuestsPage } from './pages/guests-page.js';
import { renderHousekeepingPage } from './pages/housekeeping-page.js';
import { renderReportsPage } from './pages/reports-page.js';
import { renderReservationsPage } from './pages/reservations-page.js';
import { renderRoomsPage } from './pages/rooms-page.js';
import { renderStaysPage } from './pages/stays-page.js';
import { renderUsersPage } from './pages/users-page.js';
import { hotelApi } from './services/hotel-api.js';
import { getState, hasPermission, setState, toggleSidebar } from './store/app-store.js';
import { escapeHtml, formatDate, todayInput } from './utils/format.js';

const pages = {
  dashboard: {
    label: 'Visão Geral',
    short: 'VG',
    permission: 'dashboard.read',
    render: renderDashboardPage,
  },
  reservations: {
    label: 'Reservas',
    short: 'RE',
    permission: 'reservations.read',
    render: renderReservationsPage,
  },
  stays: { label: 'Hospedagens', short: 'HO', permission: 'stays.read', render: renderStaysPage },
  rooms: { label: 'Quartos', short: 'QU', permission: 'rooms.read', render: renderRoomsPage },
  guests: {
    label: 'Hóspedes',
    short: 'HS',
    permission: 'guests.read',
    render: renderGuestsPage,
    searchable: true,
  },
  housekeeping: {
    label: 'Limpeza e manutenção',
    short: 'LM',
    permission: 'housekeeping.read',
    render: renderHousekeepingPage,
  },
  finance: {
    label: 'Financeiro',
    short: 'FI',
    permission: 'finance.read',
    render: renderFinancePage,
  },
  reports: {
    label: 'Relatórios',
    short: 'RL',
    permission: 'reports.read',
    render: renderReportsPage,
  },
  users: {
    label: 'Usuários e permissões',
    short: 'US',
    permission: 'users.read',
    render: renderUsersPage,
  },
};

function availablePages() {
  return Object.entries(pages).filter(([, page]) => hasPermission(page.permission));
}

function pageFromHash() {
  const requested = window.location.hash.replace(/^#\/?/u, '') || 'dashboard';
  return pages[requested] && hasPermission(pages[requested].permission)
    ? requested
    : (availablePages()[0]?.[0] ?? 'dashboard');
}

function renderNavigation(currentPage) {
  return availablePages()
    .map(
      ([key, page]) =>
        `<button class="navigation-item ${currentPage === key ? 'is-active' : ''}" type="button" data-navigate="${key}" ${currentPage === key ? 'aria-current="page"' : ''}><span class="navigation-icon" aria-hidden="true">${page.short}</span><span>${escapeHtml(page.label)}</span></button>`,
    )
    .join('');
}

function appShell() {
  const state = getState();
  const page = pages[state.currentPage];
  return `<div class="app-shell ${state.sidebarCollapsed ? 'is-collapsed' : ''}">
    <aside class="sidebar" aria-label="Navegação principal">
      <a class="brand" href="#/dashboard" aria-label="Constantino's Hotel — visão geral"><span class="brand-mark" aria-hidden="true">C</span><span class="brand-copy"><strong>Constantino's</strong><small>Hotel</small></span></a>
      <button class="sidebar-toggle" type="button" data-sidebar-toggle aria-label="${state.sidebarCollapsed ? 'Expandir' : 'Recolher'} menu">${state.sidebarCollapsed ? '›' : '‹'}</button>
      <nav class="main-navigation"><p class="navigation-label">Operação</p>${renderNavigation(state.currentPage)}</nav>
      <div class="sidebar-footer"><span class="avatar" aria-hidden="true">${escapeHtml(state.user.fullName.slice(0, 1).toUpperCase())}</span><span><strong>${escapeHtml(state.user.fullName)}</strong><small>${escapeHtml(state.user.roles.join(', '))}</small></span></div>
    </aside>
    <main class="main-content" id="main-content" tabindex="-1">
      <header class="topbar"><div><p class="eyebrow">Constantino's Hotel</p><h1>${escapeHtml(page.label)}</h1></div><div class="topbar-actions"><form class="header-search" data-header-search title="${page.searchable ? 'Buscar neste módulo' : 'Este módulo possui filtros próprios'}"><label class="sr-only" for="global-search">Buscar</label><input id="global-search" name="search" type="search" placeholder="${page.searchable ? 'Buscar neste módulo' : 'Use os filtros do módulo'}" ${page.searchable ? '' : 'disabled'}><button class="icon-button" type="submit" ${page.searchable ? '' : 'disabled'} aria-label="Buscar">⌕</button></form><span class="date-chip">${formatDate(todayInput())}</span><button class="icon-button" type="button" data-logout aria-label="Sair do sistema" title="Sair">↪</button></div></header>
      <div class="page-content" data-page-content></div>
      <footer class="page-footer"><span>Constantino's Hotel</span><span>Gestão operacional</span></footer>
    </main>
  </div>`;
}

async function renderCurrentPage(search = '') {
  const state = getState();
  const page = pages[state.currentPage];
  const container = document.querySelector('[data-page-content]');
  if (page.searchable) await page.render(container, search);
  else await page.render(container);
}

function bindShell() {
  document
    .querySelectorAll('[data-navigate]')
    .forEach((button) => button.addEventListener('click', () => navigate(button.dataset.navigate)));
  document.querySelector('[data-sidebar-toggle]').addEventListener('click', () => {
    toggleSidebar();
    showAuthenticatedApp();
  });
  document.querySelector('[data-header-search]').addEventListener('submit', (event) => {
    event.preventDefault();
    renderCurrentPage(new FormData(event.currentTarget).get('search')?.toString() ?? '');
  });
  document.querySelector('[data-logout]').addEventListener('click', async () => {
    const confirmed = await confirmAction({
      title: 'Sair do sistema',
      message: 'Deseja encerrar esta sessão?',
      confirmLabel: 'Sair',
    });
    if (!confirmed) return;
    try {
      await hotelApi.logout();
    } catch (error) {
      if (error.status !== 401) return showToast(error.message, 'error');
    }
    setState({ user: null, authentication: null });
    showLogin();
  });
}

function showAuthenticatedApp() {
  const app = document.querySelector('#app');
  const currentPage = pageFromHash();
  setState({ currentPage });
  app.innerHTML = appShell();
  bindShell();
  renderCurrentPage();
}

function navigate(page) {
  if (!pages[page] || !hasPermission(pages[page].permission)) return;
  const target = `#/${page}`;
  if (window.location.hash === target) showAuthenticatedApp();
  else window.location.hash = target;
}

function showLogin(message = '') {
  const app = document.querySelector('#app');
  app.innerHTML = `<main class="login-layout" id="main-content"><section class="login-brand"><div><span class="brand-mark" aria-hidden="true">C</span><p class="eyebrow">Constantino's Hotel</p><h1>Operação precisa.<br>Hospitalidade em cada detalhe.</h1><p>Gestão integrada de reservas, hospedagens, quartos e finanças.</p></div><small>Ambiente seguro · Acesso restrito</small></section><section class="login-panel"><form class="login-card surface" data-login-form><p class="eyebrow">Acesso ao sistema</p><h2>Bem-vindo</h2><p>Entre com seu usuário autorizado.</p>${message ? `<div class="form-error" role="alert">${escapeHtml(message)}</div>` : ''}<label class="form-field"><span>E-mail</span><input name="email" type="email" autocomplete="username" required></label><label class="form-field"><span>Senha</span><input name="password" type="password" autocomplete="current-password" required></label><div class="form-error" data-login-error role="alert" hidden></div><button class="button button-primary button-wide" type="submit">Entrar</button></form></section></main>`;
  const form = app.querySelector('[data-login-form]');
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const button = form.querySelector('button');
    const errorBox = form.querySelector('[data-login-error]');
    button.disabled = true;
    button.textContent = 'Entrando…';
    errorBox.hidden = true;
    try {
      const data = new FormData(form);
      const response = await hotelApi.login({
        email: data.get('email'),
        password: data.get('password'),
      });
      setCsrfToken(response.data.csrfToken);
      setState({ user: response.data.user, authentication: 'session' });
      window.location.hash = '#/dashboard';
      showAuthenticatedApp();
    } catch (error) {
      errorBox.textContent = error.message;
      errorBox.hidden = false;
    } finally {
      if (document.contains(button)) {
        button.disabled = false;
        button.textContent = 'Entrar';
      }
    }
  });
  window.setTimeout(() => form.querySelector('input')?.focus(), 0);
}

function showConnectionProblem(error) {
  const app = document.querySelector('#app');
  app.innerHTML = `<main class="boot-screen" id="main-content"><span class="brand-mark" aria-hidden="true">C</span><h1>O sistema ainda não está disponível</h1><p>${escapeHtml(error.message)}</p>${error.requestId ? `<small>Protocolo ${escapeHtml(error.requestId)}</small>` : ''}<button class="button button-secondary" type="button" data-retry>Verificar novamente</button></main>`;
  app.querySelector('[data-retry]').addEventListener('click', bootstrap);
}

async function bootstrap() {
  try {
    setCsrfToken(getCsrfTokenFromCookie());
    const response = await hotelApi.me();
    setState({ user: response.data.user, authentication: response.data.authentication });
    showAuthenticatedApp();
  } catch (error) {
    if (error.status === 401) showLogin();
    else showConnectionProblem(error);
  }
}

window.addEventListener('app:navigate', (event) => navigate(event.detail));
window.addEventListener('hashchange', () => {
  if (getState().user) showAuthenticatedApp();
});
window.addEventListener('auth:required', () => {
  if (getState().user) {
    setState({ user: null, authentication: null });
    showLogin('Sua sessão expirou. Entre novamente.');
  }
});

bootstrap();
