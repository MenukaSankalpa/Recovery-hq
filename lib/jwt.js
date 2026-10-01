// Edge-safe (used by middleware and API routes)
import { SignJWT, jwtVerify } from 'jose';

export const COOKIE = 'rhq_token';
export const TOKEN_HOURS = 12;

const secret = () => new TextEncoder().encode(process.env.JWT_SECRET || 'dev-only-secret-change-me-please-0000');

export async function signToken(payload) {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${TOKEN_HOURS}h`)
    .sign(secret());
}

export async function verifyToken(token) {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret());
    return payload;
  } catch {
    return null;
  }
}
