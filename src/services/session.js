import { SignJWT, jwtVerify } from 'jose';
import { env } from '../config/env.js';

const cookieName = 'constantinos_session';
const secret = new TextEncoder().encode(env.SESSION_SECRET);

export async function createSessionToken(user) {
  return new SignJWT({ sessionVersion: user.session_version })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setSubject(user.id)
    .setIssuer('constantinos-hotel')
    .setAudience('constantinos-hotel-web')
    .setIssuedAt()
    .setExpirationTime(`${env.SESSION_HOURS}h`)
    .sign(secret);
}

export async function verifySessionToken(token) {
  const { payload } = await jwtVerify(token, secret, {
    issuer: 'constantinos-hotel',
    audience: 'constantinos-hotel-web'
  });
  return payload;
}

export function readSessionCookie(request) {
  const cookieHeader = request.get('cookie') ?? '';
  for (const part of cookieHeader.split(';')) {
    const separator = part.indexOf('=');
    if (separator < 0) continue;
    const name = part.slice(0, separator).trim();
    if (name === cookieName) return decodeURIComponent(part.slice(separator + 1).trim());
  }
  return null;
}

export function setSessionCookie(response, token) {
  response.cookie(cookieName, token, {
    httpOnly: true,
    secure: env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/',
    maxAge: env.SESSION_HOURS * 60 * 60 * 1000
  });
}

export function clearSessionCookie(response) {
  response.clearCookie(cookieName, {
    httpOnly: true,
    secure: env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/'
  });
}
