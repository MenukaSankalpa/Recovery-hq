import bcrypt from 'bcryptjs';
import { handle, json, readBody, requireAuth, publicUser, HttpError } from '@/lib/auth';
import { User, Session } from '@/models';
import { IDLE_MINUTES } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export const GET = handle(async () => {
  await requireAuth({ roles: ['ceo'] });
  const users = await User.find().sort({ role: 1, name: 1 }).lean();
  const since = new Date(Date.now() - IDLE_MINUTES * 60000);
  const online = await Session.find({ logoutAt: null, lastActivityAt: { $gte: since } }).distinct('user');
  const onlineSet = new Set(online.map(String));
  return json({ users: users.map((u) => ({ ...publicUser(u), online: onlineSet.has(String(u._id)) })) });
});

export const POST = handle(async (req) => {
  await requireAuth({ roles: ['ceo'], touch: true });
  const b = await readBody(req);
  if (!b.name || !b.username || !b.password) throw new HttpError(400, 'Name, username and password are required');
  if (String(b.password).length < 6) throw new HttpError(400, 'Password must be at least 6 characters');
  const u = await User.create({
    name: b.name,
    username: b.username,
    passwordHash: await bcrypt.hash(String(b.password), 10),
    role: b.role === 'ceo' ? 'ceo' : 'staff',
    canEnter: !!b.canEnter,
    canCollect: b.canCollect !== false,
    team: b.team || '',
    phone: b.phone || '',
  });
  return json({ user: publicUser(u) }, 201);
});
