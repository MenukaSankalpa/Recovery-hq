'use client';
import { useState } from 'react';
import { Save, Database, Plus, X, Trash2 } from 'lucide-react';
import { PageHeader, useMe } from '@/components/AppShell';
import { Card, Field, toast } from '@/components/ui';
import { api } from '@/lib/client';

export default function Settings() {
  const me = useMe();
  const [f, setF] = useState({ ...me.settings });
  const [nb, setNb] = useState('');
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    try {
      await api('/api/settings', { method: 'PATCH', body: f });
      await me.reload();
      toast('Settings saved');
    } catch (e) {
      toast(e.message, 'err');
    } finally {
      setBusy(false);
    }
  }
  async function seed() {
    if (!confirm('Load demo data? Adds 5 collectors (password pass1234), 1 data-entry user, 24 customers, 3 groups and sample payments.')) return;
    try {
      const r = await api('/api/seed', { method: 'POST' });
      toast(`Demo loaded: ${r.customers} customers, ${r.entries} entries`);
    } catch (e) {
      toast(e.message, 'err');
    }
  }

  async function clearAll() {
    const t = prompt('This deletes ALL customers, groups, payments and promises (users stay).\nType DELETE to confirm:');
    if (t !== 'DELETE') return;
    try {
      const r = await api('/api/clear', { method: 'POST', body: { confirm: 'DELETE' } });
      toast(`Removed ${r.customers} customers, ${r.groups} groups, ${r.entries} records`);
    } catch (e) {
      toast(e.message, 'err');
    }
  }

  return (
    <div className="max-w-2xl">
      <PageHeader title="Settings" />
      <Card className="space-y-5 p-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Company name"><input className="input" value={f.companyName} onChange={(e) => setF({ ...f, companyName: e.target.value })} /></Field>
          <Field label="Currency code"><input className="input" value={f.currency} onChange={(e) => setF({ ...f, currency: e.target.value.toUpperCase() })} /></Field>
        </div>
        <Field label="Aging buckets (days)" hint="The dashboard groups outstanding balances by these values, e.g. 30 / 60 / 90 → 1–30, 31–60, 61–90, 90+.">
          <div className="flex flex-wrap items-center gap-2">
            {f.agingBuckets.map((b) => (
              <span key={b} className="chip num">{b}<button onClick={() => setF({ ...f, agingBuckets: f.agingBuckets.filter((x) => x !== b) })} className="text-slate-500 hover:text-rose-300"><X className="h-3 w-3" /></button></span>
            ))}
            <input className="input !w-24 !py-1.5" placeholder="Add…" inputMode="numeric" value={nb} onChange={(e) => setNb(e.target.value.replace(/\D/g, ''))}
              onKeyDown={(e) => { if (e.key === 'Enter' && +nb > 0) { setF({ ...f, agingBuckets: [...new Set([...f.agingBuckets, +nb])].sort((a, b) => a - b) }); setNb(''); } }} />
            <button className="btn btn-ghost btn-sm" onClick={() => { if (+nb > 0) { setF({ ...f, agingBuckets: [...new Set([...f.agingBuckets, +nb])].sort((a, b) => a - b) }); setNb(''); } }}><Plus className="h-3.5 w-3.5" /></button>
          </div>
        </Field>
        <Field label="Default aging basis">
          <select className="input" value={f.agingBasis} onChange={(e) => setF({ ...f, agingBasis: e.target.value })}>
            <option value="overdue">Days past due date</option><option value="age">Days since credit start</option>
          </select>
        </Field>
        <div className="flex justify-end"><button className="btn btn-primary" disabled={busy} onClick={save}><Save className="h-4 w-4" />{busy ? 'Saving…' : 'Save settings'}</button></div>
      </Card>
      <Card className="mt-4 p-5">
        <div className="flex items-start gap-3">
          <Database className="mt-0.5 h-5 w-5 text-slate-400" />
          <div className="flex-1">
            <div className="font-bold text-white">Demo data</div>
            <p className="mt-1 text-sm text-slate-400">Try every screen with sample customers, groups and payments. Only works while there are no customers.</p>
            <button className="btn btn-ghost mt-3" onClick={seed}>Load demo data</button>
          </div>
        </div>
      </Card>
      <Card className="mt-4 border-rose-500/20 p-5">
        <div className="flex items-start gap-3">
          <Trash2 className="mt-0.5 h-5 w-5 text-rose-400" />
          <div className="flex-1">
            <div className="font-bold text-white">Remove all customer data</div>
            <p className="mt-1 text-sm text-slate-400">Deletes every customer, group, payment and promise so you can start fresh. Users, login log and these settings stay. To load a new AR file, use <b className="text-slate-200">Customers → Import AR master (Excel)</b> — it can remove old data for you.</p>
            <button className="btn btn-danger mt-3" onClick={clearAll}>Remove all customer data</button>
          </div>
        </div>
      </Card>
      <p className="mt-4 text-xs text-slate-500">Auto-logout after {me.idleMinutes} minutes of inactivity (change IDLE_MINUTES in Vercel env).</p>
    </div>
  );
}
