import { handle, json, requireAuth } from '@/lib/auth';

export const dynamic = 'force-dynamic';

// Called by the browser only while the user is actually active (mouse / keys / touch)
export const POST = handle(async () => {
  const { session } = await requireAuth({ touch: true });
  return json({ ok: true, lastActivityAt: session.lastActivityAt });
});
