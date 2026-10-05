'use client';
import { useCallback, useEffect, useRef, useState } from 'react';

export async function api(path, { method = 'GET', body } = {}) {
  const res = await fetch(path, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
    cache: 'no-store',
  });
  let data = null;
  try {
    data = await res.json();
  } catch {}
  if (res.status === 401 && !path.startsWith('/api/auth/login') && typeof window !== 'undefined') {
    const msg = data?.error || 'Session ended';
    window.location.href = '/login?m=' + encodeURIComponent(msg);
    throw new Error(msg);
  }
  if (res.status === 403 && method === 'GET' && typeof window !== 'undefined' && window.location.pathname !== '/') {
    // e.g. a CEO page left open in another tab after signing in as a dashboard-only user:
    // go to this login's own home once (never loop if the home page itself is not allowed)
    let last = 0;
    try { last = Number(sessionStorage.getItem('rhq_403_redirect') || 0); } catch {}
    if (Date.now() - last > 15000) {
      try { sessionStorage.setItem('rhq_403_redirect', String(Date.now())); } catch {}
      window.location.href = '/';
    }
    throw new Error(data?.error || 'Not allowed');
  }
  if (!res.ok) throw new Error(data?.error || `Request failed (${res.status})`);
  return data;
}

/** Fetches now and every `interval` ms while the tab is visible (live data). */
export function useLive(url, interval = 15000) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [updatedAt, setUpdatedAt] = useState(null);
  const [loading, setLoading] = useState(true);
  const urlRef = useRef(url);
  urlRef.current = url;

  const reload = useCallback(async () => {
    if (!urlRef.current) return;
    try {
      const d = await api(urlRef.current);
      setData(d);
      setError('');
      setUpdatedAt(new Date());
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    setLoading(true);
    reload();
  }, [url, reload]);

  useEffect(() => {
    if (!interval) return;
    const t = setInterval(() => {
      if (document.visibilityState === 'visible') reload();
    }, interval);
    const onVis = () => document.visibilityState === 'visible' && reload();
    document.addEventListener('visibilitychange', onVis);
    return () => {
      clearInterval(t);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [interval, reload]);

  return { data, error, loading, reload, updatedAt, setData };
}

export const safeStorage = {
  get(k) {
    try {
      return window.localStorage.getItem(k);
    } catch {
      return null;
    }
  },
  set(k, v) {
    try {
      window.localStorage.setItem(k, v);
    } catch {}
  },
};
