'use client';
import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { LayoutDashboard, Boxes, Users2, Wallet, ShieldCheck, Settings, LogOut, Menu, X, Timer } from 'lucide-react';
import Brand from './Brand';
import { Toaster, Modal, cx, PageLoader } from './ui';
import { api, safeStorage } from '@/lib/client';

const Ctx = createContext(null);
export const useMe = () => useContext(Ctx);

const LAST = 'rhq_last_activity';

function navFor(u) {
  if (!u) return [];
  const n = [];
  if (u.role === 'ceo') {
    n.push({ href: '/dashboard', label: 'CEO Dashboard', short: 'Dashboard', icon: LayoutDashboard });
    n.push({ href: '/groups', label: 'Group & Assign', short: 'Groups', icon: Boxes });
  }
  if (u.role !== 'ceo' && u.canCollect) n.push({ href: '/my', label: 'My Collections', short: 'Collect', icon: Wallet });
  if (u.canEnter) n.push({ href: '/customers', label: 'Customers', short: 'Customers', icon: Users2 });
  if (u.role === 'ceo') {
    n.push({ href: '/users', label: 'Users & Log Time', short: 'Users', icon: ShieldCheck });
    n.push({ href: '/settings', label: 'Settings', short: 'Settings', icon: Settings });
  }
  return n;
}

export function homeFor(u) {
  if (!u) return '/login';
  if (u.role === 'ceo') return '/dashboard';
  if (u.canCollect) return '/my';
  return '/customers';
}

/** Auto-logout after N idle minutes; shared across tabs; heartbeats only while active. */
function IdleGuard({ minutes, onLogout }) {
  const idleMs = minutes * 60000;
  const last = useRef(Date.now());
  const dirty = useRef(true);
  const [left, setLeft] = useState(idleMs);

  const mark = useCallback(() => {
    const now = Date.now();
    if (now - last.current < 3000) return;
    last.current = now;
    dirty.current = true;
    safeStorage.set(LAST, String(now));
  }, []);

  useEffect(() => {
    last.current = Date.now();
    safeStorage.set(LAST, String(last.current));
    const evs = ['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll', 'wheel'];
    evs.forEach((e) => window.addEventListener(e, mark, { passive: true }));
    const tick = setInterval(() => {
      const shared = Number(safeStorage.get(LAST) || 0);
      if (shared > last.current) last.current = shared;
      const remain = idleMs - (Date.now() - last.current);
      setLeft(remain);
      if (remain <= 0) {
        clearInterval(tick);
        onLogout('idle');
      }
    }, 1000);
    const beat = setInterval(() => {
      if (dirty.current) {
        dirty.current = false;
        api('/api/auth/heartbeat', { method: 'POST' }).catch(() => {});
      }
    }, 60000);
    api('/api/auth/heartbeat', { method: 'POST' }).catch(() => {});
    return () => {
      evs.forEach((e) => window.removeEventListener(e, mark));
      clearInterval(tick);
      clearInterval(beat);
    };
  }, [idleMs, mark, onLogout]);

  const warn = left <= 60000 && left > 0;
  const s = Math.max(0, Math.ceil(left / 1000));
  return (
    <Modal open={warn} onClose={() => { last.current = 0; mark(); }} title="Still there?"
      footer={<>
        <button className="btn btn-ghost" onClick={() => onLogout('manual')}>Log out</button>
        <button className="btn btn-primary" onClick={() => { last.current = 0; mark(); }}>Stay signed in</button>
      </>}>
      <div className="flex items-center gap-4">
        <div className="grid h-16 w-16 shrink-0 place-items-center rounded-2xl bg-amber-400/15">
          <span className="num text-2xl font-bold text-amber-300">{s}</span>
        </div>
        <p className="text-sm text-slate-300">No activity for {minutes - 1} minutes. For security you will be logged out in <b className="text-white">{s} seconds</b>.</p>
      </div>
    </Modal>
  );
}

export default function AppShell({ children }) {
  const router = useRouter();
  const path = usePathname();
  const [me, setMe] = useState(null);
  const [open, setOpen] = useState(false);

  const load = useCallback(async () => {
    const d = await api('/api/auth/me');
    setMe(d);
    return d;
  }, []);

  useEffect(() => {
    load().catch(() => {});
  }, [load]);
  useEffect(() => setOpen(false), [path]);

  const logout = useCallback(async (reason = 'manual') => {
    try {
      await fetch('/api/auth/logout', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ reason }) });
    } catch {}
    window.location.href = reason === 'idle' ? '/login?m=idle' : '/login';
  }, []);

  const u = me?.user;
  const nav = navFor(u);
  // guard pages by role
  const allowed = path === '/' || nav.some((n) => path.startsWith(n.href));
  useEffect(() => {
    if (u && !allowed) router.replace(homeFor(u));
  }, [u, allowed, router]);

  if (!me) return <div className="min-h-screen"><PageLoader /></div>;
  if (!allowed) return <PageLoader />;

  const Side = (
    <nav className="flex h-full flex-col">
      <div className="px-5 py-5"><Brand name={me.settings.companyName} /></div>
      <div className="flex-1 space-y-1 px-3">
        {nav.map((n) => {
          const on = path.startsWith(n.href);
          return (
            <Link key={n.href} href={n.href}
              className={cx('flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition',
                on ? 'bg-emerald-500/12 text-emerald-300 ring-1 ring-emerald-500/25' : 'text-slate-400 hover:bg-white/[0.04] hover:text-slate-100')}>
              <n.icon className="h-[18px] w-[18px]" />{n.label}
            </Link>
          );
        })}
      </div>
      <div className="m-3 rounded-2xl border border-white/[0.06] bg-white/[0.02] p-3">
        <div className="flex items-center gap-3">
          <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-indigo-500 to-emerald-500 text-sm font-bold text-white">
            {u.name.slice(0, 1).toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-bold text-white">{u.name}</div>
            <div className="truncate text-xs text-slate-400">{u.role === 'ceo' ? 'CEO' : u.team || 'Staff'}</div>
          </div>
          <button onClick={() => logout('manual')} title="Log out" className="rounded-lg p-2 text-slate-400 hover:bg-rose-500/10 hover:text-rose-300">
            <LogOut className="h-4 w-4" />
          </button>
        </div>
        <div className="mt-2 flex items-center gap-1.5 text-[11px] text-slate-500"><Timer className="h-3 w-3" />Auto logout after {me.idleMinutes} min idle</div>
      </div>
    </nav>
  );

  return (
    <Ctx.Provider value={{ ...me, reload: load, logout }}>
      <div className="flex min-h-screen">
        <aside className="sticky top-0 hidden h-screen w-64 shrink-0 border-r border-white/[0.06] bg-ink-900/60 backdrop-blur lg:block">{Side}</aside>

        {open && (
          <div className="fixed inset-0 z-40 lg:hidden">
            <div className="absolute inset-0 bg-black/60" onClick={() => setOpen(false)} />
            <aside className="relative h-full w-72 border-r border-white/10 bg-ink-900">
              <button onClick={() => setOpen(false)} className="absolute right-3 top-5 p-1.5 text-slate-400"><X className="h-5 w-5" /></button>
              {Side}
            </aside>
          </div>
        )}

        <div className="min-w-0 flex-1">
          <header className="sticky top-0 z-30 flex items-center justify-between border-b border-white/[0.06] bg-ink-950/80 px-4 py-3 backdrop-blur lg:hidden">
            <button onClick={() => setOpen(true)} className="rounded-lg p-1.5 text-slate-300" aria-label="Menu"><Menu className="h-6 w-6" /></button>
            <Brand small />
            <button onClick={() => logout('manual')} className="rounded-lg p-1.5 text-slate-400" aria-label="Log out"><LogOut className="h-5 w-5" /></button>
          </header>
          <main className="mx-auto w-full max-w-[1500px] px-4 pb-28 pt-5 sm:px-6 lg:pb-10 lg:pt-7">{children}</main>
        </div>

        {/* mobile bottom nav */}
        <nav className="fixed inset-x-0 bottom-0 z-30 flex border-t border-white/[0.07] bg-ink-900/95 px-1 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden">
          {nav.slice(0, 5).map((n) => {
            const on = path.startsWith(n.href);
            return (
              <Link key={n.href} href={n.href} className={cx('flex flex-1 flex-col items-center gap-1 py-2.5 text-[10px] font-semibold', on ? 'text-emerald-300' : 'text-slate-500')}>
                <n.icon className="h-5 w-5" />{n.short}
              </Link>
            );
          })}
        </nav>
      </div>
      <IdleGuard minutes={me.idleMinutes} onLogout={logout} />
      <Toaster />
    </Ctx.Provider>
  );
}

export function PageHeader({ title, subtitle, children }) {
  return (
    <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight text-white sm:text-[28px]">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-slate-400">{subtitle}</p>}
      </div>
      {children && <div className="flex flex-wrap items-center gap-2">{children}</div>}
    </div>
  );
}
