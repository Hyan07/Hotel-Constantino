import { backendFetch } from './api.js';
import { setState } from './state.js';

export async function signIn(email, password) {
  const data = await backendFetch('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password })
  });
  setState({ session: data.session, profile: data.profile });
  return data;
}

export async function signOut() {
  await backendFetch('/auth/logout', { method: 'POST' }).catch(() => {});
  setState({ session: null, profile: null });
}

export async function loadSession() {
  try {
    const { session, profile } = await backendFetch('/auth/session');
    setState({ session, profile });
    return { session, profile };
  } catch (error) {
    if (['AUTH_REQUIRED', 'INVALID_SESSION', 'PROFILE_INACTIVE'].includes(error.code)) {
      setState({ session: null, profile: null });
      return { session: null, profile: null };
    }
    throw error;
  }
}
