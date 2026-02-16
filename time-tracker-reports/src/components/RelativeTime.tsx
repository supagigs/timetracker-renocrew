'use client';

import { formatDistanceToNow } from 'date-fns';
import { useEffect, useState } from 'react';

type RelativeTimeProps = {
  /** ISO date string (e.g. session end_time). Interpreted as a point in time; "now" is the viewer's current time. */
  isoDate: string | null;
  /** Refresh interval in ms so "5 minutes ago" updates (e.g. to "6 minutes ago"). Default 60_000. */
  refreshIntervalMs?: number;
};

/**
 * Displays a relative time string ("X minutes ago") using the viewer's system time.
 * Runs on the client so "now" is the viewer's current time, not the server's.
 */
export function RelativeTime({ isoDate, refreshIntervalMs = 60_000 }: RelativeTimeProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const [relative, setRelative] = useState<string | null>(null);

  useEffect(() => {
    if (!mounted || !isoDate) {
      setRelative(null);
      return;
    }

    const date = new Date(isoDate.trim());
    if (isNaN(date.getTime())) {
      setRelative(null);
      return;
    }

    const update = () => setRelative(formatDistanceToNow(date, { addSuffix: true }));
    update();

    const id = setInterval(update, refreshIntervalMs);
    return () => clearInterval(id);
  }, [mounted, isoDate, refreshIntervalMs]);

  if (!isoDate) return null;
  if (!mounted) return <span className="text-muted-foreground">—</span>;
  if (!relative) return <span className="text-muted-foreground">—</span>;
  return <span>{relative}</span>;
}
