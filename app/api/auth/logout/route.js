import { cookies } from 'next/headers';
import { dbConnect } from '@/lib/db';
import { handle, json, readBody } from '@/lib/auth';
import { COOKIE, verifyToken } from '@/lib/jwt';
import { Session } from '@/models';

export const dynamic = 'force-dynamic';

export const POST = handle(async (req) => {
  const { reason } = await readBody(req);
  const store = await cookies();
  const payload = await verifyToken(store.get(COOKIE)?.value);
  if (payload?.sid) {
    await dbConnect();
    const s = await Session.findById(payload.sid);
    if (s && !s.logoutAt) {
      s.logoutAt = new Date();
      s.logoutReason = reason === 'idle' ? 'idle' : 'manual';
      await s.save();
    }
  }
  const res = json({ ok: true });
  res.cookies.set(COOKIE, '', { httpOnly: true, path: '/', maxAge: 0 });
  return res;
});
