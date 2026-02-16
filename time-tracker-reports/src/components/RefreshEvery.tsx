'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

const REFRESH_INTERVAL_MS = 20 * 1000; // 20 seconds

/**
 * Refreshes the current route (re-fetches server components) every 20 seconds.
 * Runs on all pages; no UI. Use in root layout.
 */
export function RefreshEvery() {
  const router = useRouter();

  useEffect(() => {
    const id = setInterval(() => {
      router.refresh();
    }, REFRESH_INTERVAL_MS);
    return () => clearInterval(id);
  }, [router]);

  return null;
}
