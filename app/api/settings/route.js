import { handle, json, readBody, requireAuth, HttpError } from '@/lib/auth';
import { Setting, getSettings } from '@/models';

export const dynamic = 'force-dynamic';

export const GET = handle(async () => {
  await requireAuth();
  return json({ settings: await getSettings() });
});

export const PATCH = handle(async (req) => {
  await requireAuth({ roles: ['ceo'], touch: true });
  const b = await readBody(req);
  const upd = {};
  if (b.companyName !== undefined) upd.companyName = String(b.companyName).trim() || 'Recovery HQ';
  if (b.currency !== undefined) upd.currency = String(b.currency).trim().toUpperCase().slice(0, 6) || 'LKR';
  if (b.agingBasis !== undefined) upd.agingBasis = b.agingBasis === 'age' ? 'age' : 'overdue';
  if (b.agingBuckets !== undefined) {
    const arr = [...new Set((b.agingBuckets || []).map((n) => Math.round(Number(n))).filter((n) => n > 0 && n < 10000))].sort((a, b) => a - b);
    if (!arr.length) throw new HttpError(400, 'Add at least one aging value (e.g. 30)');
    if (arr.length > 8) throw new HttpError(400, 'Maximum 8 aging values');
    upd.agingBuckets = arr;
  }
  await getSettings();
  const s = await Setting.findOneAndUpdate({ key: 'app' }, { $set: upd }, { new: true }).lean();
  return json({ settings: s });
});
