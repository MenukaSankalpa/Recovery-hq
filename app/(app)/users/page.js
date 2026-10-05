'use client';
import { useMemo, useState } from 'react';
import { UserPlus, Pencil, KeyRound, Power, Clock, LogIn, Timer, Activity, Monitor, Crown, LayoutDashboard, Wallet, Check } from 'lucide-react';
import { PageHeader, useMe } from '@/components/AppShell';
import { Card, Modal, Field, Tabs, Badge, PageLoader, Empty, toast, cx } from '@/components/ui';
import DateRange, { presetRange } from '@/components/DateRange';
import { api, useLive } from '@/lib/client';
import { fmtDateTime, fmtDuration, timeAgo, deviceOf, dayStartISO, dayEndISO, short } from '@/lib/format';

const blank = { name: '', username: '', password: '', role: 'staff', team: '', phone: '', canEnter: false, canCollect: true, canDashboard: false, companies: [], access: 'viewer' };

/** 3 kinds of account */
export function accessOf(u) {
  if (u.role === 'ceo') return 'ceo';
  if (u.canDashboard && !u.canCollect && !u.canEnter) return 'viewer';
  return 'staff';
}
const ACCESS = [
  { value: 'ceo', icon: Crown, title: 'CEO', text: 'Everything — all companies, groups, users, settings' },
  { value: 'viewer', icon: LayoutDashboard, title: 'Dashboard only', text: 'Sees only the dashboard, only for the companies you tick' },
  { value: 'staff', icon: Wallet, title: 'Staff', text: 'Collector and / or data entry' },
];

function UserForm({ open, onClose, initial, onSaved }) {
  const [f, setF] = useState(() => (initial ? { ...blank, ...initial, password: '', access: accessOf(initial) } : blank));
  const cos = useLive('/api/companies', 0);
  const toggleCo = (c) => setF({ ...f, companies: f.companies.includes(c) ? f.companies.filter((x) => x !== c) : [...f.companies, c] });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const editing = !!initial?._id;
  async function save() {
    setBusy(true);
    setErr('');
    try {
      const body = { ...f };
      if (f.access === 'ceo') Object.assign(body, { role: 'ceo' });
      if (f.access === 'viewer') Object.assign(body, { role: 'staff', canDashboard: true, canCollect: false, canEnter: false });
      if (f.access === 'staff') Object.assign(body, { role: 'staff', canDashboard: false, companies: [] });
      delete body.access;
      if (editing && !body.password) delete body.password;
      if (editing) await api(`/api/users/${initial._id}`, { method: 'PATCH', body });
      else await api('/api/users', { method: 'POST', body });
      toast(editing ? 'User updated' : `User ${f.name} created`);
      onSaved();
      onClose();
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }
  const Toggle = ({ k, label, hint }) => (
    <button type="button" onClick={() => setF({ ...f, [k]: !f[k] })} className={cx('flex w-full items-start gap-3 rounded-xl border p-3 text-left transition', f[k] ? 'border-emerald-400/40 bg-emerald-500/[0.07]' : 'border-white/10')}>
      <span className={cx('mt-0.5 flex h-5 w-9 shrink-0 items-center rounded-full p-0.5 transition', f[k] ? 'bg-emerald-500' : 'bg-white/10')}><span className={cx('h-4 w-4 rounded-full bg-white transition', f[k] && 'translate-x-4')} /></span>
      <span><span className="block text-sm font-semibold text-white">{label}</span><span className="text-xs text-slate-400">{hint}</span></span>
    </button>
  );
  return (
    <Modal open={open} onClose={onClose} title={editing ? `Edit ${initial.name}` : 'Add user'}
      footer={<><button className="btn btn-ghost" onClick={onClose}>Cancel</button><button className="btn btn-primary" disabled={busy || !f.name || !f.username || (!editing && !f.password)} onClick={save}>{busy ? 'Saving…' : 'Save'}</button></>}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Full name"><input className="input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
        <Field label="Username (login)"><input className="input" autoCapitalize="none" value={f.username} onChange={(e) => setF({ ...f, username: e.target.value })} /></Field>
        <Field label={editing ? 'New password (leave blank to keep)' : 'Password'}><input className="input" type="password" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} /></Field>
        <Field label="Team / label"><input className="input" placeholder="e.g. Team Alpha" value={f.team} onChange={(e) => setF({ ...f, team: e.target.value })} /></Field>
        <Field label="Phone"><input className="input" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} /></Field>
      </div>
      <div className="mt-4">
        <span className="label">Access type</span>
        <div className="grid gap-2 sm:grid-cols-3">
          {ACCESS.map((a) => (
            <button key={a.value} type="button" onClick={() => setF({ ...f, access: a.value })}
              className={cx('rounded-xl border p-3 text-left transition', f.access === a.value ? 'border-emerald-400/50 bg-emerald-500/[0.08]' : 'border-white/10 hover:bg-white/[0.03]')}>
              <div className="flex items-center gap-2 text-sm font-bold text-white"><a.icon className={cx('h-4 w-4', f.access === a.value ? 'text-emerald-300' : 'text-slate-400')} />{a.title}</div>
              <div className="mt-1 text-[11px] leading-snug text-slate-400">{a.text}</div>
            </button>
          ))}
        </div>
      </div>
      {f.access !== 'ceo' && (
        <div className="mt-4 space-y-2">
          {f.access === 'staff' && <>
            <Toggle k="canCollect" label="Collector" hint="Can be assigned customer groups and record payments / not-collected reasons" />
            <Toggle k="canEnter" label="Data entry" hint="Can add and edit customers (AR value, credit start date, credit period)" />
          </>}
          {f.access === 'viewer' && (
            <div className="rounded-xl border border-violet-400/30 bg-violet-500/[0.06] p-3">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-xs font-semibold text-violet-200">Companies this user can see ({f.companies.length})</span>
                <span className="flex gap-3 text-xs">
                  <button type="button" className="text-slate-400 hover:text-white" onClick={() => setF({ ...f, companies: (cos.data?.companies || []).map((c) => c.code) })}>All</button>
                  <button type="button" className="text-slate-400 hover:text-white" onClick={() => setF({ ...f, companies: [] })}>None</button>
                </span>
              </div>
              {!cos.data ? <div className="text-xs text-slate-500">Loading companies…</div> : (
                <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
                  {cos.data.companies.map((c) => {
                    const on = f.companies.includes(c.code);
                    return (
                      <button key={c.code} type="button" onClick={() => toggleCo(c.code)}
                        className={cx('rounded-lg border px-2.5 py-2 text-left transition', on ? 'border-violet-400/60 bg-violet-500/20' : 'border-white/10 hover:bg-white/[0.04]')}>
                        <div className="flex items-center justify-between"><span className="text-sm font-bold text-white">{c.code}</span><span className={cx('h-3.5 w-3.5 rounded border', on ? 'border-violet-300 bg-violet-400' : 'border-white/20')} /></div>
                        <div className="text-[10px] text-slate-400">{c.customers} customers · {short(c.total)}</div>
                      </button>
                    );
                  })}
                </div>
              )}
              {!f.companies.length && <div className="mt-2 text-xs text-amber-300">Tick at least one company, or the user will see nothing.</div>}
            </div>
          )}
        </div>
      )}
      {err && <div className="mt-3 text-sm font-medium text-rose-300">{err}</div>}
    </Modal>
  );
}

function UsersTab() {
  const me = useMe();
  const { data, reload } = useLive('/api/users', 30000);
  const [form, setForm] = useState(null);
  if (!data) return <PageLoader />;
  async function toggle(u) {
    if (!confirm(`${u.active ? 'Disable' : 'Enable'} ${u.name}?${u.active ? ' They will be signed out immediately.' : ''}`)) return;
    try { await api(`/api/users/${u._id}`, { method: 'PATCH', body: { active: !u.active } }); toast('Saved'); reload(); } catch (e) { toast(e.message, 'err'); }
  }
  return (
    <>
      <div className="mb-3 flex justify-end"><button className="btn btn-primary" onClick={() => setForm('new')}><UserPlus className="h-4 w-4" />Add user</button></div>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {data.users.map((u) => (
          <Card key={u._id} className={cx('p-4', !u.active && 'opacity-50')}>
            <div className="flex items-start gap-3">
              <div className="relative">
                <div className="grid h-11 w-11 place-items-center rounded-xl bg-gradient-to-br from-indigo-500/80 to-emerald-500/80 font-bold text-white">{u.name.slice(0, 1).toUpperCase()}</div>
                <span className={cx('absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full ring-2 ring-ink-900', u.online ? 'bg-emerald-400' : 'bg-slate-600')} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2"><span className="truncate font-bold text-white">{u.name}</span>{u._id === me.user._id && <Badge>You</Badge>}</div>
                <div className="text-xs text-slate-400">@{u.username}{u.team && ` · ${u.team}`}</div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {u.role === 'ceo' ? <Badge tone="amber">CEO · all companies</Badge> : <>
                    {accessOf(u) === 'viewer' && <Badge tone="current">Dashboard only</Badge>}
                    {u.canCollect && <Badge tone="settled">Collector</Badge>}{u.canEnter && <Badge tone="violet">Data entry</Badge>}
                    {u.canDashboard && accessOf(u) !== 'viewer' && <Badge tone="current">+ Dashboard</Badge>}
                    {u.canDashboard && (u.companies.length ? u.companies.map((c) => <Badge key={c} tone="slate">{c}</Badge>) : <Badge tone="overdue">no company</Badge>)}
                  </>}
                  {!u.active && <Badge tone="overdue">Disabled</Badge>}
                </div>
                <div className="mt-2 text-xs text-slate-500">{u.online ? <span className="text-emerald-300">Online now</span> : `Last login ${timeAgo(u.lastLoginAt)}`}</div>
              </div>
            </div>
            <div className="mt-3 flex gap-2">
              <button className="btn btn-ghost btn-sm" onClick={() => setForm(u)}><Pencil className="h-3.5 w-3.5" />Edit</button>
              <button className="btn btn-ghost btn-sm" onClick={() => setForm(u)}><KeyRound className="h-3.5 w-3.5" />Password</button>
              {u._id !== me.user._id && <button className={cx('btn btn-sm', u.active ? 'btn-danger' : 'btn-ghost')} onClick={() => toggle(u)}><Power className="h-3.5 w-3.5" />{u.active ? 'Disable' : 'Enable'}</button>}
            </div>
          </Card>
        ))}
      </div>
      {form && <UserForm open initial={form === 'new' ? null : form} onClose={() => setForm(null)} onSaved={reload} />}
    </>
  );
}

const STATUS = {
  active: ['Active now', 'settled'], manual: ['Logged out', 'slate'], idle: ['Auto logout (30 min idle)', 'amber'],
  expired: ['Expired', 'slate'], disabled: ['Forced out', 'overdue'],
};

function LogTab() {
  const [range, setRange] = useState({ ...presetRange('7d'), preset: '7d' });
  const [user, setUser] = useState('');
  const users = useLive('/api/users', 0);
  const { data } = useLive(`/api/sessions?from=${encodeURIComponent(dayStartISO(range.from))}&to=${encodeURIComponent(dayEndISO(range.to))}${user ? `&user=${user}` : ''}`, 30000);

  const summary = useMemo(() => {
    if (!data) return [];
    const m = {};
    data.sessions.forEach((s) => {
      const k = s.user?._id || 'x';
      m[k] ||= { user: s.user, count: 0, active: 0, total: 0, idle: 0, last: null, online: false };
      const r = m[k];
      r.count++;
      r.active += s.activeMs;
      r.total += s.sessionMs;
      if (s.status === 'idle') r.idle++;
      if (s.status === 'active') r.online = true;
      if (!r.last || new Date(s.lastActivityAt) > new Date(r.last)) r.last = s.lastActivityAt;
    });
    return Object.values(m).sort((a, b) => b.active - a.active);
  }, [data]);

  return (
    <>
      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <DateRange value={range} onChange={setRange} />
        <select className="input !w-auto !py-2" value={user} onChange={(e) => setUser(e.target.value)}>
          <option value="">All users</option>{(users.data?.users || []).map((u) => <option key={u._id} value={u._id}>{u.name}</option>)}
        </select>
      </div>
      {!data ? <PageLoader /> : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {summary.map((r) => (
              <Card key={r.user?._id} className="p-4">
                <div className="flex items-center justify-between"><div className="font-bold text-white">{r.user?.name || 'Deleted user'}</div>{r.online && <Badge tone="settled"><span className="live-dot h-1.5 w-1.5 rounded-full bg-emerald-400" />Online</Badge>}</div>
                <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                  <div><div className="num text-lg font-bold text-emerald-300">{fmtDuration(r.active)}</div><div className="text-[10px] uppercase tracking-wide text-slate-500">Used time</div></div>
                  <div><div className="num text-lg font-bold text-white">{r.count}</div><div className="text-[10px] uppercase tracking-wide text-slate-500">Logins</div></div>
                  <div><div className="num text-lg font-bold text-amber-300">{r.idle}</div><div className="text-[10px] uppercase tracking-wide text-slate-500">Idle outs</div></div>
                </div>
                <div className="mt-2 text-center text-xs text-slate-500">Avg {fmtDuration(r.active / Math.max(1, r.count))}/session · last seen {timeAgo(r.last)}</div>
              </Card>
            ))}
          </div>
          <Card className="mt-4 overflow-hidden">
            {!data.sessions.length ? <Empty icon={LogIn} title="No logins in this range" /> : (
              <>
                <div className="hidden overflow-x-auto md:block">
                  <table className="tbl">
                    <thead><tr><th>User</th><th>Login</th><th>Last activity</th><th>Logout</th><th>Used time</th><th>Session length</th><th>Status</th><th>Device / IP</th></tr></thead>
                    <tbody>
                      {data.sessions.map((s) => (
                        <tr key={s._id}>
                          <td><div className="font-semibold text-white">{s.user?.name}</div><div className="text-xs text-slate-500">{s.user?.role === 'ceo' ? 'CEO' : s.user?.team}</div></td>
                          <td className="text-slate-300">{fmtDateTime(s.loginAt)}</td>
                          <td className="text-slate-300">{fmtDateTime(s.lastActivityAt)}</td>
                          <td className="text-slate-300">{s.logoutAt ? fmtDateTime(s.logoutAt) : '—'}</td>
                          <td className="num font-bold text-emerald-300">{fmtDuration(s.activeMs)}</td>
                          <td className="num text-slate-400">{fmtDuration(s.sessionMs)}</td>
                          <td><Badge tone={STATUS[s.status]?.[1]}>{STATUS[s.status]?.[0] || s.status}</Badge></td>
                          <td className="text-xs text-slate-400">{deviceOf(s.userAgent)}<div className="text-slate-600">{s.ip}</div></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="divide-y divide-white/[0.05] md:hidden">
                  {data.sessions.map((s) => (
                    <div key={s._id} className="p-3">
                      <div className="flex items-center justify-between"><span className="font-semibold text-white">{s.user?.name}</span><Badge tone={STATUS[s.status]?.[1]}>{STATUS[s.status]?.[0]}</Badge></div>
                      <div className="mt-1.5 grid grid-cols-2 gap-1 text-xs text-slate-400">
                        <span className="flex items-center gap-1"><LogIn className="h-3 w-3" />{fmtDateTime(s.loginAt)}</span>
                        <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{s.logoutAt ? fmtDateTime(s.logoutAt) : 'still on'}</span>
                        <span className="flex items-center gap-1"><Timer className="h-3 w-3" />Used <b className="num text-emerald-300">{fmtDuration(s.activeMs)}</b></span>
                        <span className="flex items-center gap-1"><Monitor className="h-3 w-3" />{deviceOf(s.userAgent)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </Card>
          <p className="mt-3 flex items-center gap-1.5 text-xs text-slate-500"><Activity className="h-3.5 w-3.5" />“Used time” = login until last real activity (clicks, typing, touch). Sessions idle for {data.idleMinutes} minutes are logged out automatically.</p>
        </>
      )}
    </>
  );
}

/** One screen: every user × every company. Tick = that user sees that company on the dashboard. */
function AccessTab() {
  const users = useLive('/api/users', 0);
  const cos = useLive('/api/companies', 0);
  const [busy, setBusy] = useState('');
  if (!users.data || !cos.data) return <PageLoader />;
  const companies = cos.data.companies;
  const list = users.data.users.filter((u) => u.active);
  async function save(u, patch) {
    setBusy(u._id);
    try {
      await api(`/api/users/${u._id}`, { method: 'PATCH', body: patch });
      await users.reload();
    } catch (e) {
      toast(e.message, 'err');
    } finally {
      setBusy('');
    }
  }
  const toggle = (u, code) => {
    const has = u.companies.includes(code);
    const next = has ? u.companies.filter((c) => c !== code) : [...u.companies, code];
    save(u, { companies: next, canDashboard: next.length > 0 ? true : u.canDashboard });
  };
  return (
    <Card className="overflow-hidden">
      <div className="border-b border-white/[0.06] p-4">
        <div className="font-bold text-white">Company access — who sees which company on the dashboard</div>
        <div className="mt-0.5 text-xs text-slate-400">Tick a box to give that user the company. Changes save at once. CEO accounts always see all companies.</div>
      </div>
      <div className="overflow-x-auto">
        <table className="tbl">
          <thead>
            <tr>
              <th>User</th><th>Dashboard</th>
              {companies.map((c) => <th key={c.code} className="!text-center" title={`${c.customers} customers · ${short(c.total)}`}>{c.code}</th>)}
            </tr>
          </thead>
          <tbody>
            {list.map((u) => {
              const ceo = u.role === 'ceo';
              return (
                <tr key={u._id} className={cx(busy === u._id && 'opacity-60')}>
                  <td><div className="font-semibold text-white">{u.name}</div><div className="text-xs text-slate-500">@{u.username} · {ceo ? 'CEO' : accessOf(u) === 'viewer' ? 'Dashboard only' : [u.canCollect && 'Collector', u.canEnter && 'Data entry'].filter(Boolean).join(', ') || 'Staff'}</div></td>
                  <td>
                    {ceo ? <Badge tone="amber">All</Badge> : (
                      <button onClick={() => save(u, { canDashboard: !u.canDashboard })} className={cx('flex h-5 w-9 items-center rounded-full p-0.5 transition', u.canDashboard ? 'bg-emerald-500' : 'bg-white/10')} title="Dashboard on / off">
                        <span className={cx('h-4 w-4 rounded-full bg-white transition', u.canDashboard && 'translate-x-4')} />
                      </button>
                    )}
                  </td>
                  {companies.map((c) => {
                    const on = ceo || u.companies.includes(c.code);
                    return (
                      <td key={c.code} className="!text-center">
                        <button disabled={ceo || busy === u._id} onClick={() => toggle(u, c.code)}
                          className={cx('mx-auto grid h-6 w-6 place-items-center rounded-md border transition', on ? (ceo ? 'border-amber-400/30 bg-amber-400/10 text-amber-300' : 'border-violet-400/60 bg-violet-500/30 text-white') : 'border-white/15 hover:border-white/40')}>
                          {on && <Check className="h-3.5 w-3.5" />}
                        </button>
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

export default function UsersPage() {
  const [tab, setTab] = useState('users');
  return (
    <div>
      <PageHeader title="Users & Log Time" subtitle="Manage who can collect or enter data, and see when everyone logged in and how long they used the system.">
        <Tabs value={tab} onChange={setTab} tabs={[{ value: 'users', label: 'Users' }, { value: 'access', label: 'Company access' }, { value: 'log', label: 'Login & usage log' }]} />
      </PageHeader>
      {tab === 'users' ? <UsersTab /> : tab === 'access' ? <AccessTab /> : <LogTab />}
    </div>
  );
}
