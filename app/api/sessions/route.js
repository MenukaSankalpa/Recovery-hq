import { handle, json, requireAuth, IDLE_MINUTES } from '@/lib/auth';
import { Session } from '@/models';

export const dynamic = 'force-dynamic';

// Login / usage log for the CEO
export const GET = handle(async (req) => {
  await requireAuth({ roles: ['ceo'] });
  const p = new URL(req.url).searchParams;
  const q = {};
  if (p.get('from') || p.get('to')) {
    q.loginAt = {};
    if (p.get('from')) q.loginAt.$gte = new Date(p.get('from'));
    if (p.get('to')) q.loginAt.$lte = new Date(p.get('to'));
  }
  if (p.get('user')) q.user = p.get('user');
  const rows = await Session.find(q).populate('user', 'name username role team').sort({ loginAt: -1 }).limit(2000).lean();
  const idleMs = IDLE_MINUTES * 60000;
  const now = Date.now();
  const sessions = rows.map((s) => {
    const last = new Date(s.lastActivityAt).getTime();
    let status = s.logoutReason || 'manual';
    let end = s.logoutAt ? new Date(s.logoutAt) : null;
    if (!s.logoutAt) {
      if (now - last > idleMs) {
        status = 'idle';
        end = new Date(last + idleMs);
      } else status = 'active';
    }
    return {
      _id: s._id,
      user: s.user,
      loginAt: s.loginAt,
      lastActivityAt: s.lastActivityAt,
      logoutAt: end,
      status,
      activeMs: Math.max(0, last - new Date(s.loginAt).getTime()),
      sessionMs: Math.max(0, (end ? end.getTime() : now) - new Date(s.loginAt).getTime()),
      ip: s.ip,
      userAgent: s.userAgent,
    };
  });
  return json({ sessions, idleMinutes: IDLE_MINUTES });
});
