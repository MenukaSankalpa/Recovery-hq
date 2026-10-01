'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Lock, User, AlertTriangle } from 'lucide-react';
import Brand from '@/components/Brand';
import { api } from '@/lib/client';

export default function Login() {
  const router = useRouter();
  const [f, setF] = useState({ username: '', password: '' });
  const [err, setErr] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const m = new URLSearchParams(window.location.search).get('m');
    if (m) setNote(m === 'idle' ? 'You were logged out after 30 minutes of inactivity.' : m);
    api('/api/setup').then((d) => d.needsSetup && router.replace('/setup')).catch(() => {});
  }, [router]);

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setErr('');
    try {
      await api('/api/auth/login', { method: 'POST', body: f });
      try { localStorage.setItem('rhq_last_activity', String(Date.now())); } catch {}
      router.replace('/');
    } catch (e) {
      setErr(e.message);
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm rise">
        <div className="mb-8 flex justify-center"><Brand /></div>
        <form onSubmit={submit} className="card card-pad space-y-4 !p-6">
          <div>
            <h1 className="text-xl font-extrabold text-white">Sign in</h1>
            <p className="mt-1 text-sm text-slate-400">Collect it. Track it. Close it.</p>
          </div>
          {note && (
            <div className="flex gap-2 rounded-xl border border-amber-400/25 bg-amber-400/10 p-3 text-sm text-amber-100">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />{note}
            </div>
          )}
          <div className="relative">
            <User className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-slate-500" />
            <input className="input pl-9" placeholder="Username" autoComplete="username" autoCapitalize="none"
              value={f.username} onChange={(e) => setF({ ...f, username: e.target.value })} required />
          </div>
          <div className="relative">
            <Lock className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-slate-500" />
            <input className="input pl-9" type="password" placeholder="Password" autoComplete="current-password"
              value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} required />
          </div>
          {err && <div className="text-sm font-medium text-rose-300">{err}</div>}
          <button className="btn btn-primary w-full" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
        </form>
        <p className="mt-6 text-center text-xs text-slate-500">For security, you are signed out after 30 minutes of no activity.</p>
      </div>
    </div>
  );
}
