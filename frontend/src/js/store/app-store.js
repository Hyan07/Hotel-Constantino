const state = {
  user: null,
  authentication: null,
  currentPage: 'dashboard',
  sidebarCollapsed: localStorage.getItem('sidebar-collapsed') === 'true',
};
const listeners = new Set();

export function getState() {
  return state;
}

export function setState(patch) {
  Object.assign(state, patch);
  for (const listener of listeners) listener(state);
}

export function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function hasPermission(permission) {
  return state.user?.permissions?.includes(permission) ?? false;
}

export function toggleSidebar() {
  state.sidebarCollapsed = !state.sidebarCollapsed;
  localStorage.setItem('sidebar-collapsed', String(state.sidebarCollapsed));
  setState({ sidebarCollapsed: state.sidebarCollapsed });
}
