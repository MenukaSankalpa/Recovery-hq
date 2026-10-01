import bcrypt from 'bcryptjs';
import { handle, json, readBody, requireAuth, publicUser, HttpError } from '@/lib/auth';
import { User, Session } from '@/models';

export const dynamic = 'force-dynamic';

export const PATCH = handle(async (req, ctx) => {
  const { user: me } = await requireAuth({ roles: ['ceo'], touch: true });
  const { id } = await ctx.params;
  const b = await readBody(req);
  const u = await User.findById(id);
  if (!u) throw new HttpError(404, 'User not found');
  for (const k of ['name', 'username', 'team', 'phone']) if (b[k] !== undefined) u[k] = b[k];
  if (b.role !== undefined) u.role = b.role === 'ceo' ? 'ceo' : 'staff';
  if (b.canEnter !== undefined) u.canEnter = !!b.canEnter;
  if (b.canCollect !== undefined) u.canCollect = !!b.canCollect;
  if (b.active !== undefined) {
    if (String(u._id) === me._id && !b.active) throw new HttpError(400, 'You cannot disable your own account');
    u.active = !!b.active;
  }
  if (String(u._id) === me._id && u.role !== 'ceo') throw new HttpError(400, 'You cannot remove your own CEO role');
  if (b.password) {
    if (String(b.password).length < 6) throw new HttpError(400, 'Password must be at least 6 characters');
    u.passwordHash = await bcrypt.hash(String(b.password), 10);
  }
  await u.save();
  if (!u.active || b.password) {
    // force sign-out everywhere
    await Session.updateMany({ user: u._id, logoutAt: null }, { logoutAt: new Date(), logoutReason: 'disabled' });
  }
  return json({ user: publicUser(u) });
});
