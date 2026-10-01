import { handle, json, readBody, requireAuth, HttpError } from '@/lib/auth';
import { Customer, Group, Collection } from '@/models';

export const dynamic = 'force-dynamic';

// CEO: wipe customers, groups and collection records (users, login log and settings stay)
export const POST = handle(async (req) => {
  await requireAuth({ roles: ['ceo'], touch: true });
  const { confirm } = await readBody(req);
  if (confirm !== 'DELETE') throw new HttpError(400, 'Type DELETE to confirm');
  const [a, b, c] = await Promise.all([Collection.deleteMany({}), Group.deleteMany({}), Customer.deleteMany({})]);
  return json({ customers: c.deletedCount, groups: b.deletedCount, entries: a.deletedCount });
});
