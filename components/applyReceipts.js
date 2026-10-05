'use client';
import { api } from '@/lib/client';
import { toast } from './ui';
import { money } from '@/lib/format';

/** Match a customer's unmatched receipts / credit notes to invoices (refs = chosen invoices, or oldest first) */
export async function applyReceipts(customer, refs = [], currency = 'LKR') {
  const where = refs.length ? `the ${refs.length} chosen invoice(s)` : 'the oldest open invoices';
  if (!confirm(`Use ${customer.name}'s receipts / credit notes to close ${where}?\n\nThis is not new money — it only matches payments the customer already made to their invoices. The CEO can undo it.`)) return false;
  try {
    const r = await api(`/api/customers/${customer._id}/apply-credits`, { method: 'POST', body: { refs } });
    toast(`Applied ${money(r.applied, currency)} of receipts to ${r.invoices.length} invoice(s)`);
    return true;
  } catch (e) {
    toast(e.message, 'err');
    return false;
  }
}
