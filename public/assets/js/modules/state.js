const listeners = new Set();

const store = {
  session: null,
  profile: null,
  route: 'dashboard',
  dashboard: null,
  globalSearch: '',
  realtimeChannel: null
};

export function getState() {
  return store;
}

export function setState(patch) {
  Object.assign(store, patch);
  for (const listener of listeners) listener(store, patch);
}

export function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function can(...roles) {
  return Boolean(store.profile && roles.includes(store.profile.role));
}

export const roleLabels = Object.freeze({
  admin: 'Administrador',
  reception: 'Recepção',
  housekeeping: 'Governança / limpeza',
  viewer: 'Consulta'
});
