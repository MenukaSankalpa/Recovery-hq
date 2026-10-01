import bcrypt from 'bcryptjs';
import { dbConnect } from '@/lib/db';
import { handle, json, readBody, publicUser, HttpError, IDLE_MINUTES } from '@/lib/auth';
import { COOKIE, signToken, TOKEN_HOURS } from '@/lib/jwt';
import { User, Session } from '@/models';

export const dynamic = 'force-dynamic';

export const POST = handle(async (req) => {
  const { username, password } = await readBody(req);
  if (!username || !password) throw new HttpError(400, 'Username and password are required');
  await dbConnect();
  const user = await User.findOne({ username: String(username).toLowerCase().trim() });
  if (!user || !(await bcrypt.compare(String(password), user.passwordHash)))
    throw new HttpError(401, 'Wrong username or password');
  if (!user.active) throw new HttpError(403, 'This account is disabled');

  const now = new Date();
  const session = await Session.create({
    user: user._id,
    loginAt: now,
    lastActivityAt: now,
    ip: (req.headers.get('x-forwarded-for') || '').split(',')[0].trim() || req.headers.get('x-real-ip') || '',
    userAgent: req.headers.get('user-agent') || '',
  });
  user.lastLoginAt = now;
  await user.save();

  const token = await signToken({ sid: String(session._id), uid: String(user._id), role: user.role });
  const res = json({ user: publicUser(user), idleMinutes: IDLE_MINUTES });
  res.cookies.set(COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: TOKEN_HOURS * 3600,
  });
  return res;
});
