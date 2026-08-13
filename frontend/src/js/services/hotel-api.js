import { apiRequest, createIdempotencyKey } from '../core/api-client.js';

function queryString(parameters = {}) {
  const query = new URLSearchParams(
    Object.entries(parameters).filter(([, value]) => value !== '' && value != null),
  );
  const value = query.toString();
  return value ? `?${value}` : '';
}

const get = (path, query) => apiRequest(`${path}${queryString(query)}`);
const mutate = (path, method, body, headers) => apiRequest(path, { method, body, headers });

export const hotelApi = {
  me: () => get('/api/v1/auth/me'),
  login: (body) => mutate('/api/v1/auth/login', 'POST', body),
  logout: () => mutate('/api/v1/auth/logout', 'POST'),
  dashboard: () => get('/api/v1/dashboard'),
  guests: (query) => get('/api/v1/guests', query),
  guest: (id) => get(`/api/v1/guests/${id}`),
  createGuest: (body) => mutate('/api/v1/guests', 'POST', body),
  updateGuest: (id, body) => mutate(`/api/v1/guests/${id}`, 'PATCH', body),
  rooms: (query) => get('/api/v1/rooms', query),
  room: (id) => get(`/api/v1/rooms/${id}`),
  createRoom: (body) => mutate('/api/v1/rooms', 'POST', body),
  updateRoom: (id, body) => mutate(`/api/v1/rooms/${id}`, 'PATCH', body),
  roomStatus: (id, body) => mutate(`/api/v1/rooms/${id}/status`, 'POST', body),
  reservations: (query) => get('/api/v1/reservations', query),
  reservation: (id) => get(`/api/v1/reservations/${id}`),
  createReservation: (body) =>
    mutate('/api/v1/reservations', 'POST', body, {
      'idempotency-key': createIdempotencyKey('reservation'),
    }),
  updateReservation: (id, body) => mutate(`/api/v1/reservations/${id}`, 'PATCH', body),
  reservationAction: (id, action, body) =>
    mutate(`/api/v1/reservations/${id}/${action}`, 'POST', body),
  checkIn: (id, body) =>
    mutate(`/api/v1/reservations/${id}/check-in`, 'POST', body, {
      'idempotency-key': createIdempotencyKey('checkin'),
    }),
  stays: (query) => get('/api/v1/stays', query),
  stay: (id) => get(`/api/v1/stays/${id}`),
  addCharge: (id, body) => mutate(`/api/v1/stays/${id}/charges`, 'POST', body),
  addPayment: (id, body) =>
    mutate(`/api/v1/stays/${id}/payments`, 'POST', body, {
      'idempotency-key': createIdempotencyKey('payment'),
    }),
  checkout: (id, body) =>
    mutate(`/api/v1/stays/${id}/checkout`, 'POST', body, {
      'idempotency-key': createIdempotencyKey('checkout'),
    }),
  housekeeping: (query) => get('/api/v1/housekeeping', query),
  createHousekeeping: (body) => mutate('/api/v1/housekeeping', 'POST', body),
  housekeepingAction: (id, action, body) =>
    mutate(`/api/v1/housekeeping/${id}/${action}`, 'POST', body),
  finance: (query) => get('/api/v1/finance', query),
  createFinance: (body) => mutate('/api/v1/finance', 'POST', body),
  reports: (query) => get('/api/v1/reports', query),
  users: (query) => get('/api/v1/users', query),
  roles: () => get('/api/v1/users/roles'),
  createUser: (body) => mutate('/api/v1/users', 'POST', body),
  updateUser: (id, body) => mutate(`/api/v1/users/${id}`, 'PATCH', body),
};
