'use client';
import { Badge } from './ui';
import { promiseState } from '@/lib/metrics';

const MAP = {
  open: ['Upcoming', 'violet'], today: ['Due today', 'amber'], broken: ['Broken', 'overdue'],
  kept: ['Kept', 'settled'], late: ['Kept late', 'current'], cancelled: ['Cancelled', 'slate'],
};
export function PromiseBadge({ p }) {
  const s = promiseState(p);
  return <Badge tone={MAP[s][1]}>{MAP[s][0]}</Badge>;
}
