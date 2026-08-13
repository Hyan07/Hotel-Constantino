export function normalizeStoragePath(value) {
  const path = String(value ?? '').trim().replace(/^\/+/, '');
  if (!path || path.includes('..') || path.includes('\\') || /[\u0000-\u001f]/.test(path)) {
    return null;
  }
  return path;
}

export function requestIp(request) {
  const forwarded = request.headers['x-forwarded-for'];
  if (typeof forwarded === 'string') return forwarded.split(',')[0].trim().slice(0, 64);
  return String(request.ip ?? '').slice(0, 64) || null;
}
