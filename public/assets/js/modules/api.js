export async function backendFetch(path, options = {}) {
  const isFormData = options.body instanceof FormData;
  const response = await fetch(`/api${path}`, {
    ...options,
    credentials: 'same-origin',
    headers: {
      Accept: 'application/json',
      ...(options.body && !isFormData ? { 'Content-Type': 'application/json' } : {}),
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
