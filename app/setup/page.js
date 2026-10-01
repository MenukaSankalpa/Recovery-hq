'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Crown } from 'lucide-react';
import Brand from '@/components/Brand';
import { api } from '@/lib/client';

export default function Setup() {
  const router = useRouter();
  const [state, setState] = useState(null);
  const [f, setF] = useState({ name: '', username: '', password: '', setupKey: '' });
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api('/api/setup').then((d) => (d.needsSetup ? setState(d) : router.replace('/login'))).catch((e) => setErr(e.message));
  }, [router]);

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setErr('');
    try {
      await api('/api/setup', { method: 'POST', body: f });
      router.replace('/login?m=' + encodeURIComponent('CEO account created. Sign in now.'));
    } catch (e) {
      setErr(e.message);
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm rise">
        <div className="mb-8 flex justify-center"><Brand /></div>
        <form onSubmit={submit} className="card space-y-4 p-6">
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-amber-400/15 p-2.5"><Crown className="h-5 w-5 text-amber-300" /></div>
            <div>
              <h1 className="text-lg font-extrabold text-white">First-time setup</h1>
              <p className="text-sm text-slate-400">Create the CEO account</p>
            </div>
          </div>
          {!state && !err && <div className="text-sm text-slate-400">Checking…</div>}
          <input className="input" placeholder="Full name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} required />
          <input className="input" placeholder="Username" autoCapitalize="none" value={f.username} onChange={(e) => setF({ ...f, username: e.target.value })} required />
          <input className="input" type="password" placeholder="Password (min 6)" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} required />
          {state?.needsKey && <input className="input" type="password" placeholder="Setup key (SETUP_KEY in Vercel env)" value={f.setupKey} onChange={(e) => setF({ ...f, setupKey: e.target.value })} required />}
          {err && <div className="text-sm font-medium text-rose-300">{err}</div>}
          <button className="btn btn-primary w-full" disabled={busy || !state}>{busy ? 'Creating…' : 'Create CEO account'}</button>
        </form>
      </div>
    </div>
  );
}
