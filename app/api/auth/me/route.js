import { handle, json, requireAuth, IDLE_MINUTES } from '@/lib/auth';
import { getSettings } from '@/models';

export const dynamic = 'force-dynamic';

export const GET = handle(async () => {
  const { user, session } = await requireAuth();
  const s = await getSettings();
  return json({
    user,
    idleMinutes: IDLE_MINUTES,
    lastActivityAt: session.lastActivityAt,
    settings: { companyName: s.companyName, currency: s.currency, agingBuckets: s.agingBuckets, agingBasis: s.agingBasis },
  });
});
