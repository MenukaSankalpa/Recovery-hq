'use client';
import { useMemo, useState } from 'react';
import {
  DndContext, DragOverlay, PointerSensor, TouchSensor, KeyboardSensor, useSensor, useSensors, useDraggable, useDroppable,
} from '@dnd-kit/core';
import { Search, GripVertical, Lock, Pencil, X, Plus, Users, CalendarClock, Archive, Trash2, Eye, CheckSquare, Square, Layers, MousePointerClick, Target } from 'lucide-react';
import { PageHeader, useMe } from '@/components/AppShell';
import { Card, Badge, Field, Progress, Tabs, PageLoader, Empty, toast, cx } from '@/components/ui';
import GroupDetail from '@/components/GroupDetail';
import { api, useLive } from '@/lib/client';
import { enrich, groupStats, daysBetween } from '@/lib/metrics';
import { short, money, fmtDate, toInputDate, dayStartISO, dayEndISO, pct, fmtPct, statusDot } from '@/lib/format';

const emptyBuilder = () => ({ mode: 'new', groupId: null, name: '', startDate: toInputDate(), endDate: toInputDate(new Date(Date.now() + 6 * 86400000)), assignees: [], notes: '', customerIds: [] });

function CustCard({ c, selected, onToggle, onAdd, overlay, count }) {
  return (
    <div className={cx('flex items-center gap-2 rounded-xl border p-2.5 transition', overlay ? 'border-emerald-400/50 bg-ink-800 shadow-2xl shadow-emerald-500/20 rotate-1' : selected ? 'border-emerald-400/40 bg-emerald-500/[0.07]' : 'border-white/[0.07] bg-ink-850/80 hover:border-white/15')}>
      <GripVertical className="h-4 w-4 shrink-0 text-slate-600" />
      {onToggle && (
        <button onPointerDown={(e) => e.stopPropagation()} onClick={onToggle} className="shrink-0 text-slate-400 hover:text-emerald-300" aria-label="Select">
          {selected ? <CheckSquare className="h-4 w-4 text-emerald-400" /> : <Square className="h-4 w-4" />}
        </button>
      )}
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-semibold text-white">{c.company && <span className="mr-1.5 rounded bg-white/[0.06] px-1 py-px text-[10px] font-bold text-slate-400">{c.company}</span>}{c.name}</div>
        <div className="truncate text-[11px] text-slate-500">
          Due {fmtDate(c.due)} · {c.daysSinceStart}d old{c.overdueDays > 0 && <span className="text-rose-300"> · {c.overdueDays}d late</span>}
        </div>
      </div>
      <div className="shrink-0 text-right">
        <div className="num text-sm font-bold text-rose-300">{short(c.balance)}</div>
        <div className="num text-[10px] text-slate-500">AR {short(c.amount)}</div>
      </div>
      {count > 1 && <span className="num absolute -right-2 -top-2 grid h-6 min-w-6 place-items-center rounded-full bg-emerald-500 px-1.5 text-xs font-bold text-ink-950">{count}</span>}
      {onAdd && (
        <button onPointerDown={(e) => e.stopPropagation()} onClick={onAdd} className="shrink-0 rounded-lg bg-emerald-500/15 p-1.5 text-emerald-300 hover:bg-emerald-500/25" aria-label="Add to group">
          <Plus className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}

function Draggable({ id, children }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id });
  return (
    <div ref={setNodeRef} {...listeners} {...attributes} className={cx('relative cursor-grab touch-manipulation active:cursor-grabbing', isDragging && 'opacity-30')}>
      {children}
    </div>
  );
}

function Drop({ id, className, activeClass, children }) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return <div ref={setNodeRef} className={cx(className, isOver && activeClass)}>{children}</div>;
}

export default function Groups() {
  const me = useMe();
  const currency = me.settings.currency;
  const cust = useLive('/api/customers', 30000);
  const grp = useLive('/api/groups', 30000);
  const usr = useLive('/api/users', 0);
  const [b, setB] = useState(emptyBuilder);
  const [sel, setSel] = useState(new Set());
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState('all');
  const [company, setCompany] = useState('all');
  const [sort, setSort] = useState('balance');
  const [dragId, setDragId] = useState(null);
  const [tab, setTab] = useState('active');
  const [busy, setBusy] = useState(false);
  const [detail, setDetail] = useState(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 8 } }),
    useSensor(KeyboardSensor)
  );

  const V = useMemo(() => {
    if (!cust.data || !grp.data) return null;
    const cs = cust.data.customers.map((c) => enrich({ ...c, group: c.group?._id || null, groupDoc: c.group }));
    const cMap = Object.fromEntries(cs.map((c) => [String(c._id), c]));
    const inBuilder = new Set(b.customerIds);
    const s = q.trim().toLowerCase();
    let pool = cs.filter((c) => c.balance > 0 && !inBuilder.has(String(c._id)) && !(c.groupDoc && c.groupDoc.status === 'active' && String(c.groupDoc._id) !== b.groupId));
    // when editing, customers already in that group but removed in builder go back to pool (handled above)
    pool = pool.filter((c) => (!s || [c.name, c.code, c.invoiceNo, c.company].some((v) => (v || '').toLowerCase().includes(s))) && (filter === 'all' || c.status === filter) && (company === 'all' || c.company === company));
    pool.sort((x, y) => sort === 'balance' ? y.balance - x.balance : sort === 'overdue' ? y.overdueDays - x.overdueDays : sort === 'due' ? x.due - y.due : x.name.localeCompare(y.name));
    const items = b.customerIds.map((id) => cMap[id]).filter(Boolean);
    const groups = grp.data.groups;
    const companies = [...new Set(cs.map((c) => c.company).filter(Boolean))].sort();
    return { cs, cMap, pool, items, groups, companies };
  }, [cust.data, grp.data, b.customerIds, b.groupId, q, filter, sort, company]);

  const collectors = (usr.data?.users || []).filter((u) => u.active && u.canCollect);

  if (!V) return <PageLoader />;

  const addIds = (ids) => {
    setB((x) => ({ ...x, customerIds: [...new Set([...x.customerIds, ...ids.map(String)])] }));
    setSel(new Set());
  };
  const removeId = (id) => setB((x) => ({ ...x, customerIds: x.customerIds.filter((i) => i !== String(id)) }));

  function onDragEnd({ active, over }) {
    setDragId(null);
    if (!over) return;
    const [from, id] = String(active.id).split(':');
    if (from === 'pool' && over.id === 'builder') addIds(sel.has(id) ? [...sel] : [id]);
    if (from === 'b' && over.id === 'pool') removeId(id);
  }

  const total = V.items.reduce((s, c) => s + c.balance, 0);
  const overdueN = V.items.filter((c) => c.status === 'overdue').length;
  const days = Math.max(1, daysBetween(`${b.startDate}T00:00`, `${b.endDate}T00:00`) + 1);

  async function save() {
    setBusy(true);
    try {
      const body = { name: b.name, startDate: dayStartISO(b.startDate), endDate: dayEndISO(b.endDate), assigneeIds: b.assignees, customerIds: b.customerIds, notes: b.notes };
      if (b.mode === 'edit') await api(`/api/groups/${b.groupId}`, { method: 'PATCH', body });
      else await api('/api/groups', { method: 'POST', body });
      toast(b.mode === 'edit' ? 'Group updated' : `Group “${b.name}” created & assigned`);
      setB(emptyBuilder());
      await Promise.all([cust.reload(), grp.reload()]);
    } catch (e) {
      toast(e.message, 'err');
    } finally {
      setBusy(false);
    }
  }

  function edit(g) {
    setB({
      mode: 'edit', groupId: String(g._id), name: g.name, startDate: toInputDate(g.startDate), endDate: toInputDate(g.endDate),
      assignees: g.assignees.map((a) => String(a._id)), notes: g.notes || '', customerIds: g.customers.map(String),
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
  async function closeGroup(g) {
    if (!confirm(`Close “${g.name}”? Unsettled customers go back to the pool so you can regroup them.`)) return;
    try { await api(`/api/groups/${g._id}`, { method: 'PATCH', body: { status: 'closed' } }); toast('Group closed'); cust.reload(); grp.reload(); } catch (e) { toast(e.message, 'err'); }
  }
  async function delGroup(g) {
    if (!confirm(`Delete “${g.name}”?`)) return;
    try { await api(`/api/groups/${g._id}`, { method: 'DELETE' }); toast('Group deleted'); cust.reload(); grp.reload(); } catch (e) { toast(e.message, 'err'); }
  }

  const dragCust = dragId ? V.cMap[dragId.split(':')[1]] : null;
  const dragCount = dragId?.startsWith('pool:') && sel.has(dragId.split(':')[1]) ? sel.size : 1;
  const gpMap = {};
  const shown = V.groups.filter((g) => g.status === tab);

  return (
    <div>
      <PageHeader title="Group & Assign" subtitle="Drag customers into a group, set the collection period, assign one or more collectors. Assigned customers are locked until you edit the group." />

      <DndContext sensors={sensors} onDragStart={(e) => setDragId(String(e.active.id))} onDragEnd={onDragEnd} onDragCancel={() => setDragId(null)}>
        <div className="grid gap-4 lg:grid-cols-2">
          {/* POOL */}
          <Card className="flex min-w-0 flex-col overflow-hidden">
            <div className="border-b border-white/[0.06] p-4">
              <div className="flex items-center justify-between">
                <div><h2 className="font-bold text-white">Customer pool</h2><p className="text-xs text-slate-400">{V.pool.length} unassigned with balance · {short(V.pool.reduce((s, c) => s + c.balance, 0))}</p></div>
                {sel.size > 0 && <button className="btn btn-primary btn-sm" onClick={() => addIds([...sel])}>Add {sel.size} →</button>}
              </div>
              <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                <div className="relative flex-1">
                  <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-500" />
                  <input className="input !py-2 pl-9" placeholder="Search customers" value={q} onChange={(e) => setQ(e.target.value)} />
                </div>
                {V.companies.length > 0 && (
                  <select className="input !py-2 sm:w-28" value={company} onChange={(e) => setCompany(e.target.value)}>
                    <option value="all">All cos.</option>{V.companies.map((c) => <option key={c}>{c}</option>)}
                  </select>
                )}
                <select className="input !py-2 sm:w-40" value={sort} onChange={(e) => setSort(e.target.value)}>
                  <option value="balance">Biggest balance</option><option value="overdue">Most overdue</option><option value="due">Due soonest</option><option value="name">Name A–Z</option>
                </select>
              </div>
              <div className="mt-2 flex items-center justify-between">
                <Tabs value={filter} onChange={setFilter} tabs={[{ value: 'all', label: 'All' }, { value: 'overdue', label: 'Overdue' }, { value: 'current', label: 'Not due' }]} />
                <button className="text-xs font-semibold text-slate-400 hover:text-emerald-300" onClick={() => setSel(sel.size ? new Set() : new Set(V.pool.map((c) => String(c._id))))}>
                  {sel.size ? 'Clear selection' : 'Select all'}
                </button>
              </div>
            </div>
            <Drop id="pool" className="max-h-[560px] min-h-[200px] flex-1 space-y-2 overflow-y-auto p-3 transition" activeClass="bg-rose-500/[0.05] ring-2 ring-inset ring-rose-400/30">
              {!V.pool.length && <Empty icon={Layers} title="Pool is empty" text="Every customer with a balance is already in an active group, or none match your search." />}
              {V.pool.map((c) => {
                const id = String(c._id);
                return (
                  <Draggable key={id} id={`pool:${id}`}>
                    <CustCard c={c} selected={sel.has(id)} onToggle={() => setSel((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; })} onAdd={() => addIds([id])} />
                  </Draggable>
                );
              })}
            </Drop>
          </Card>

          {/* BUILDER */}
          <Card className={cx('flex min-w-0 flex-col overflow-hidden lg:sticky lg:top-6 lg:self-start', b.mode === 'edit' && 'ring-2 ring-amber-400/40')}>
            <div className="flex items-center justify-between border-b border-white/[0.06] p-4">
              <div>
                <h2 className="font-bold text-white">{b.mode === 'edit' ? <>Editing group <span className="text-amber-300">“{b.name}”</span></> : 'New collection group'}</h2>
                <p className="text-xs text-slate-400">{V.items.length} customers · <b className="num text-rose-300">{short(total)}</b> to recover · {overdueN} overdue</p>
              </div>
              {(V.items.length > 0 || b.mode === 'edit') && <button className="btn btn-ghost btn-sm" onClick={() => setB(emptyBuilder())}><X className="h-3.5 w-3.5" />{b.mode === 'edit' ? 'Cancel edit' : 'Clear'}</button>}
            </div>

            <Drop id="builder" className="m-3 min-h-[150px] rounded-2xl border-2 border-dashed border-white/10 p-2 transition" activeClass="!border-emerald-400/60 bg-emerald-500/[0.06]">
              {!V.items.length ? (
                <div className="flex h-[130px] flex-col items-center justify-center text-center text-sm text-slate-500">
                  <MousePointerClick className="mb-2 h-6 w-6" />Drag customers here<span className="text-xs">or tap + on a card · select many and drag them together</span>
                </div>
              ) : (
                <div className="max-h-[260px] space-y-1.5 overflow-y-auto">
                  {V.items.map((c) => (
                    <Draggable key={String(c._id)} id={`b:${c._id}`}>
                      <div className="flex items-center gap-2 rounded-lg bg-white/[0.03] px-2.5 py-2">
                        <GripVertical className="h-3.5 w-3.5 shrink-0 text-slate-600" />
                        <span className="min-w-0 flex-1 truncate text-sm text-slate-200">{c.name}</span>
                        {c.overdueDays > 0 && <Badge tone="overdue">{c.overdueDays}d</Badge>}
                        <span className="num text-sm font-semibold text-rose-300">{short(c.balance)}</span>
                        <button onPointerDown={(e) => e.stopPropagation()} onClick={() => removeId(c._id)} className="rounded p-1 text-slate-500 hover:bg-rose-500/10 hover:text-rose-300"><X className="h-3.5 w-3.5" /></button>
                      </div>
                    </Draggable>
                  ))}
                </div>
              )}
            </Drop>

            <div className="space-y-4 border-t border-white/[0.06] p-4">
              <Field label="Group name"><input className="input" placeholder="e.g. Colombo overdue — week 40" value={b.name} onChange={(e) => setB({ ...b, name: e.target.value })} /></Field>
              <div>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Collect from"><input className="input" type="date" value={b.startDate} onChange={(e) => setB({ ...b, startDate: e.target.value })} /></Field>
                  <Field label="Collect by (deadline)"><input className="input" type="date" min={b.startDate} value={b.endDate} onChange={(e) => setB({ ...b, endDate: e.target.value })} /></Field>
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {[1, 3, 7, 14, 30, 60, 90].map((n) => (
                    <button key={n} className="chip hover:bg-white/10" onClick={() => setB({ ...b, endDate: toInputDate(new Date(new Date(`${b.startDate}T00:00`).getTime() + (n - 1) * 86400000)) })}>{n}d</button>
                  ))}
                </div>
              </div>
              <Field label={`Assign to (${b.assignees.length} selected)`}>
                <div className="flex flex-wrap gap-2">
                  {!collectors.length && <span className="text-xs text-slate-500">No collectors yet — add users first.</span>}
                  {collectors.map((u) => {
                    const on = b.assignees.includes(u._id);
                    return (
                      <button key={u._id} type="button" onClick={() => setB({ ...b, assignees: on ? b.assignees.filter((x) => x !== u._id) : [...b.assignees, u._id] })}
                        className={cx('flex items-center gap-2 rounded-xl border px-3 py-2 text-sm font-semibold transition', on ? 'border-emerald-400/50 bg-emerald-500/15 text-emerald-200' : 'border-white/10 text-slate-300 hover:bg-white/[0.05]')}>
                        <span className={cx('h-1.5 w-1.5 rounded-full', u.online ? 'bg-emerald-400' : 'bg-slate-600')} />{u.name}{u.team && <span className="text-xs font-normal text-slate-500">{u.team}</span>}
                      </button>
                    );
                  })}
                </div>
              </Field>
              <Field label="Note to collectors (optional)"><input className="input" value={b.notes} onChange={(e) => setB({ ...b, notes: e.target.value })} /></Field>

              {V.items.length > 0 && (
                <div className="grid grid-cols-3 gap-2 rounded-2xl bg-white/[0.02] p-3 text-center">
                  <div><div className="text-[11px] text-slate-500">Target</div><div className="num font-bold text-white">{short(total)}</div></div>
                  <div><div className="text-[11px] text-slate-500">Per day ({days}d)</div><div className="num font-bold text-emerald-300">{short(total / days)}</div></div>
                  <div><div className="text-[11px] text-slate-500">Per collector/day</div><div className="num font-bold text-sky-300">{short(total / days / Math.max(1, b.assignees.length))}</div></div>
                </div>
              )}

              <button className={cx('btn w-full', b.mode === 'edit' ? 'bg-amber-400 text-ink-950 hover:bg-amber-300' : 'btn-primary')}
                disabled={busy || !b.name.trim() || !V.items.length || !b.assignees.length} onClick={save}>
                <Target className="h-4 w-4" />{busy ? 'Saving…' : b.mode === 'edit' ? 'Save changes' : `Create group & assign ${V.items.length || ''}`}
              </button>
            </div>
          </Card>
        </div>

        <DragOverlay dropAnimation={null}>
          {dragCust && <div className="relative w-[340px] max-w-[85vw]"><CustCard c={dragCust} overlay count={dragCount} /></div>}
        </DragOverlay>
      </DndContext>

      {/* GROUP LIST */}
      <div className="mt-8 mb-3 flex items-center justify-between">
        <h2 className="text-lg font-bold text-white">Groups</h2>
        <Tabs value={tab} onChange={setTab} tabs={[{ value: 'active', label: `Active (${V.groups.filter((g) => g.status === 'active').length})` }, { value: 'closed', label: 'Closed' }]} />
      </div>
      {!shown.length ? <Card><Empty icon={Layers} title={tab === 'active' ? 'No active groups' : 'No closed groups'} text={tab === 'active' ? 'Build your first group above.' : ''} /></Card> : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {shown.map((g) => {
            const s = groupStats(g, V.cMap, gpMap);
            const members = g.customers.map((id) => V.cMap[String(id)]).filter(Boolean);
            const bal = members.reduce((x, c) => x + c.balance, 0);
            const ar = members.reduce((x, c) => x + c.amount, 0);
            const editing = b.groupId === String(g._id);
            return (
              <Card key={g._id} className={cx('p-4', editing && 'ring-2 ring-amber-400/50')}>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 font-bold text-white"><span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: g.color }} /><span className="truncate">{g.name}</span></div>
                    <div className="mt-1 flex items-center gap-1 text-xs text-slate-400"><CalendarClock className="h-3 w-3" />{fmtDate(g.startDate)} → {fmtDate(g.endDate)}</div>
                    <div className="mt-0.5 flex items-center gap-1 text-xs text-slate-400"><Users className="h-3 w-3" />{g.assignees.map((a) => a.name).join(', ')}</div>
                  </div>
                  {g.status === 'active' ? (editing ? <Badge tone="amber"><Pencil className="h-3 w-3" />Editing</Badge> : <Badge><Lock className="h-3 w-3" />Locked</Badge>) : <Badge>Closed</Badge>}
                </div>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {members.slice(0, 8).map((c) => (
                    <span key={c._id} className={cx('chip !py-0.5 !text-[11px]', c.balance <= 0 && '!border-emerald-500/30 !text-emerald-300')}>{c.name}</span>
                  ))}
                  {members.length > 8 && <span className="chip !py-0.5 !text-[11px]">+{members.length - 8}</span>}
                </div>
                {g.status === 'active' && (
                  <div className="mt-3">
                    <div className="mb-1 flex justify-between text-xs"><span className="text-slate-400">{members.filter((c) => c.balance <= 0).length}/{members.length} settled</span><span className="num text-slate-300">{short(bal)} due of AR {short(ar)}</span></div>
                    <Progress value={pct(ar - bal, ar)} />
                  </div>
                )}
                <div className="mt-3 flex flex-wrap gap-2">
                  <button className="btn btn-ghost btn-sm" onClick={() => setDetail(g._id)}><Eye className="h-3.5 w-3.5" />Details</button>
                  {g.status === 'active' && !editing && <button className="btn btn-ghost btn-sm" onClick={() => edit(g)}><Pencil className="h-3.5 w-3.5" />Edit</button>}
                  {g.status === 'active' && <button className="btn btn-ghost btn-sm" onClick={() => closeGroup(g)}><Archive className="h-3.5 w-3.5" />Close</button>}
                  {g.status === 'active' && <button className="btn btn-danger btn-sm" onClick={() => delGroup(g)}><Trash2 className="h-3.5 w-3.5" /></button>}
                </div>
              </Card>
            );
          })}
        </div>
      )}
      <GroupDetail id={detail} open={!!detail} onClose={() => setDetail(null)} currency={currency} />
    </div>
  );
}
