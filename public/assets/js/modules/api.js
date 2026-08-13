import { getState } from './state.js';

export async function backendFetch(path, options = {}) {
  const token = getState().session?.access_token;
  const response = await fetch(`/api${path}`, {
    ...options,
    headers: {
      Accept: 'application/json',
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers
    }
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.ok === false) {
    const error = new Error(payload?.error?.message ?? 'Falha na solicitação.');
    error.code = payload?.error?.code;
    error.details = payload?.error?.details;
    throw error;
  }
  return payload.data ?? payload;
}
