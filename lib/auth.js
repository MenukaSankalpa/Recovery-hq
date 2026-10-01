import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { dbConnect } from './db';
import { COOKIE, verifyToken } from './jwt';
import { Session, User } from '@/models';

export const IDLE_MINUTES = Number(process.env.IDLE_MINUTES || 30);

export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export function publicUser(u) {
  if (!u) return null;
  return {
    _id: String(u._id),
    name: u.name,
    username: u.username,
    role: u.role,
    canEnter: u.role === 'ceo' || !!u.canEnter,
    canCollect: u.role === 'ceo' || !!u.canCollect,
    team: u.team || '',
    phone: u.phone || '',
    active: u.active,
    lastLoginAt: u.lastLoginAt,
    createdAt: u.createdAt,
  };
}

/**
 * Validates the JWT *and* the server-side session (so idle / manual logouts are enforced).
 * touch=true marks real user activity (writes, heartbeats). Background polling never touches,
 * so an unattended open tab still expires after IDLE_MINUTES.
 */
export async function requireAuth({ roles, perm, touch = false } = {}) {
  const store = await cookies();
  const payload = await verifyToken(store.get(COOKIE)?.value);
  if (!payload?.sid) throw new HttpError(401, 'Please sign in');
  await dbConnect();

  const session = await Session.findById(payload.sid);
  if (!session || session.logoutAt) throw new HttpError(401, 'Your session has ended');

  const idleMs = IDLE_MINUTES * 60000;
  if (Date.now() - new Date(session.lastActivityAt).getTime() > idleMs) {
    session.logoutAt = new Date(new Date(session.lastActivityAt).getTime() + idleMs);
    session.logoutReason = 'idle';
    await session.save();
    throw new HttpError(401, `Logged out after ${IDLE_MINUTES} minutes of inactivity`);
  }

  const user = await User.findById(payload.uid).lean();
  if (!user || !user.active) {
    session.logoutAt = new Date();
    session.logoutReason = 'disabled';
    await session.save();
    throw new HttpError(401, 'Account disabled');
  }
  const pu = publicUser(user);
  if (roles && !roles.includes(user.role)) throw new HttpError(403, 'Not allowed');
  if (perm === 'enter' && !pu.canEnter) throw new HttpError(403, 'You cannot edit customers');
  if (perm === 'collect' && !pu.canCollect) throw new HttpError(403, 'You cannot record collections');

  if (touch) {
    session.lastActivityAt = new Date();
    await session.save();
  }
  return { user: pu, session };
}

export function handle(fn) {
  return async (req, ctx) => {
    try {
      return await fn(req, ctx);
    } catch (e) {
      let status = e.status || 500;
      if (e.name === 'ValidationError' || e.name === 'CastError') status = 400;
      if (e.code === 11000) {
        status = 409;
        e.message = 'That value already exists (duplicate)';
      }
      if (status >= 500) console.error(e);
      return NextResponse.json({ error: e.message || 'Server error' }, { status });
    }
  };
}

export const json = (data, status = 200) => NextResponse.json(data, { status });

export async function readBody(req) {
  try {
    return await req.json();
  } catch {
    return {};
  }
}
