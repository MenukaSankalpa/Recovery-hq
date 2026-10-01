'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useMe, homeFor } from '@/components/AppShell';
import { PageLoader } from '@/components/ui';

export default function Home() {
  const me = useMe();
  const router = useRouter();
  useEffect(() => {
    if (me?.user) router.replace(homeFor(me.user));
  }, [me, router]);
  return <PageLoader />;
}
