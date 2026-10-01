import { handle, json, readBody, requireAuth, HttpError } from '@/lib/auth';
import { addDays } from '@/lib/util';
import { Customer } from '@/models';
import { customerFields } from '@/lib/customerFields';

export const dynamic = 'force-dynamic';

// Bulk add: { rows: [{ name, amount, creditStartDate, creditPeriodDays, code?, phone?, invoiceNo?, ... }] }
export const POST = handle(async (req) => {
  const { user } = await requireAuth({ perm: 'enter', touch: true });
  const { rows } = await readBody(req);
  if (!Array.isArray(rows) || !rows.length) throw new HttpError(400, 'No rows to import');
  if (rows.length > 2000) throw new HttpError(400, 'Max 2000 rows per import');
  const docs = [];
  const errors = [];
  rows.forEach((r, i) => {
    try {
      const f = customerFields(r);
      f.dueDate = addDays(f.creditStartDate, f.creditPeriodDays);
      f.createdBy = user._id;
      docs.push(f);
    } catch (e) {
      errors.push(`Row ${i + 1}: ${e.message}`);
    }
  });
  if (errors.length) throw new HttpError(400, errors.slice(0, 8).join(' · '));
  await Customer.insertMany(docs);
  return json({ inserted: docs.length }, 201);
});
