import { env } from '../config/env.js';
import { createSession, authenticateCredentials, endSession } from '../services/auth.service.js';
import { parseCookies } from '../middlewares/auth.js';

const csrfCookieName = 'constantinos.csrf';

function cookieOptions() {
  return {
    httpOnly: true,
    secure: env.isProduction,
    sameSite: 'strict',
    path: '/',
    maxAge: env.sessionTtlHours * 60 * 60 * 1000,
  };
}

function setSessionCookies(response, session) {
  response.cookie(env.sessionCookieName, session.rawSessionId, cookieOptions());
  response.cookie(csrfCookieName, session.rawCsrfToken, {
    ...cookieOptions(),
    httpOnly: false,
  });
}

function clearSessionCookies(response) {
  const options = { ...cookieOptions() };
  delete options.maxAge;
  response.clearCookie(env.sessionCookieName, options);
  response.clearCookie(csrfCookieName, { ...options, httpOnly: false });
}

export async function login(request, response) {
  const user = await authenticateCredentials({ ...request.body, requestId: request.id });
  const previousSessionId = parseCookies(request.headers.cookie)[env.sessionCookieName];
  const session = await createSession(user.id, previousSessionId);
  setSessionCookies(response, session);
  response.status(200).json({ data: { user, csrfToken: session.rawCsrfToken } });
}

export function me(request, response) {
  response.status(200).json({
    data: {
      user: request.auth.user,
      authentication: request.auth.isBypass ? 'development-bypass' : 'session',
    },
  });
}

export async function logout(request, response) {
  await endSession({
    rawSessionId: request.auth.rawSessionId,
    userId: request.auth.user.id,
    requestId: request.id,
  });
  clearSessionCookies(response);
  response.status(204).end();
}
