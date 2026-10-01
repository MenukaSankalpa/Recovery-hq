import { HttpError } from './auth';
import { toDate, num } from './util';

export function customerFields(b, partial = false) {
  const out = {};
  if (!partial || b.name !== undefined) {
    if (!b.name || !String(b.name).trim()) throw new HttpError(400, 'Customer name is required');
    out.name = String(b.name).trim();
  }
  for (const k of ['company', 'code', 'phone', 'contactPerson', 'address', 'invoiceNo', 'notes'])
    if (b[k] !== undefined) out[k] = String(b[k] ?? '');
  if (!partial || b.amount !== undefined) out.amount = num(b.amount, 'AR amount');
  if (!partial || b.creditStartDate !== undefined) out.creditStartDate = toDate(b.creditStartDate, 'credit start date');
  if (!partial || b.creditPeriodDays !== undefined) out.creditPeriodDays = Math.round(num(b.creditPeriodDays, 'credit period'));
  return out;
}

