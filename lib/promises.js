import { Collection } from '@/models';

/**
 * Re-applies a customer's payments to their promises (oldest promise date first).
 * A payment only counts toward promises recorded on or before the payment date.
 * Called after every payment is added or deleted, so promise status is always correct.
 */
export async function recomputePromises(customerId) {
  const proms = await Collection.find({ customer: customerId, type: 'promise', status: { $ne: 'cancelled' } }).sort({ promiseDate: 1, date: 1 });
  if (!proms.length) return;
  const pays = await Collection.find({ customer: customerId, type: 'payment' }).sort({ date: 1 });
  const fill = proms.map(() => 0);
  const kept = proms.map(() => null);
  for (const p of pays) {
    let left = p.amount;
    for (let i = 0; i < proms.length && left > 0.0001; i++) {
      if (new Date(p.date) < new Date(proms[i].date) - 60000) continue;
      const need = proms[i].amount - fill[i];
      if (need <= 0.0001) continue;
      const a = Math.min(need, left);
      fill[i] += a;
      left -= a;
      if (fill[i] >= proms[i].amount - 0.0001) kept[i] = p.date;
    }
  }
  await Collection.bulkWrite(
    proms.map((pr, i) => ({
      updateOne: {
        filter: { _id: pr._id },
        update: { $set: { fulfilled: Math.round(fill[i] * 100) / 100, status: kept[i] ? 'kept' : 'open', keptAt: kept[i] } },
      },
    }))
  );
}

export async function openPromisedFor(customerId, excludeId) {
  const q = { customer: customerId, type: 'promise', status: 'open' };
  if (excludeId) q._id = { $ne: excludeId };
  const list = await Collection.find(q).lean();
  return list.reduce((s, p) => s + Math.max(0, p.amount - (p.fulfilled || 0)), 0);
}
