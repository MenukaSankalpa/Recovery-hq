import { handle, json, requireAuth } from '@/lib/auth';
import { Customer } from '@/models';

export const dynamic = 'force-dynamic';

// Company codes in the data, with customer count and net total (CEO, for assigning dashboard access)
export const GET = handle(async () => {
  await requireAuth({ roles: ['ceo'] });
  const rows = await Customer.find({}, 'company amount invoices.amount').lean();
  const map = {};
  for (const c of rows) {
    if (!c.company) continue;
    const net = c.invoices?.length ? c.invoices.reduce((s, x) => s + (x.amount || 0), 0) : c.amount || 0;
    map[c.company] ||= { code: c.company, customers: 0, total: 0 };
    map[c.company].customers++;
    map[c.company].total += net;
  }
  return json({ companies: Object.values(map).sort((a, b) => a.code.localeCompare(b.code)) });
});
