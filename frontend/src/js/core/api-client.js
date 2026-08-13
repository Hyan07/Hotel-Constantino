const DEFAULT_TIMEOUT_MS = 10_000;
let runtimeCsrfToken = '';

export class ApiError extends Error {
  constructor(message, { status = 0, code = 'REQUEST_FAILED', requestId, details } = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.requestId = requestId;
    this.details = details;
  }
}

function cookie(name) {
  const prefix = `${encodeURIComponent(name)}=`;
  return document.cookie
    .split(';')
    .map((item) => item.trim())
    .find((item) => item.startsWith(prefix))
    ?.slice(prefix.length);
}

export function getCsrfTokenFromCookie() {
  return decodeURIComponent(cookie('constantinos.csrf') ?? '');
}

export function setCsrfToken(token) {
  runtimeCsrfToken = token ?? '';
}

export function idempotencyKey(scope = 'operation') {
  return `${scope}-${crypto.randomUUID()}`;
}

export const createIdempotencyKey = idempotencyKey;

export async function apiRequest(path, options = {}) {
  const controller = new AbortController();
  const timeout = window.setTimeout(
    () => controller.abort(),
    options.timeout ?? DEFAULT_TIMEOUT_MS,
  );
  const csrfToken = runtimeCsrfToken || decodeURIComponent(cookie('constantinos.csrf') ?? '');
  const hasBody = options.body !== undefined && options.body !== null;
  const body =
    hasBody && typeof options.body !== 'string' ? JSON.stringify(options.body) : options.body;

  try {
    const response = await fetch(path, {
      ...options,
      body,
      credentials: 'same-origin',
      headers: {
        Accept: 'application/json',
        ...(hasBody ? { 'Content-Type': 'application/json' } : {}),
        ...(csrfToken ? { 'X-CSRF-Token': csrfToken } : {}),
        ...options.headers,
      },
      signal: controller.signal,
    });
    const responseBody = response.status === 204 ? null : await response.json().catch(() => null);
    if (!response.ok) {
      const error = new ApiError(
        responseBody?.error?.message ?? 'Não foi possível concluir a solicitação.',
        {
          status: response.status,
          code: responseBody?.error?.code,
          requestId: responseBody?.error?.requestId ?? response.headers.get('x-request-id'),
          details: responseBody?.error?.details,
        },
      );
      if (response.status === 401) {
        window.dispatchEvent(new CustomEvent('session:expired'));
        window.dispatchEvent(new CustomEvent('auth:required'));
      }
      throw error;
    }
    return responseBody;
  } catch (error) {
    if (error.name === 'AbortError')
      throw new ApiError('O servidor demorou para responder.', { code: 'REQUEST_TIMEOUT' });
    if (error instanceof ApiError) throw error;
    throw new ApiError('Não foi possível conectar ao servidor.', { code: 'NETWORK_ERROR' });
  } finally {
    window.clearTimeout(timeout);
  }
}
