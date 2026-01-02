'use client';

import { format } from 'date-fns';
import { useMemo } from 'react';

type LocalTimeProps = {
  isoString: string | null;
  formatString?: string;
};

/**
 * Client component that displays a time in the user's local timezone.
 * The Date object automatically converts UTC to local timezone when formatted.
 * This component must be client-side to access the browser's timezone.
 */
export function LocalTime({ isoString, formatString = 'p' }: LocalTimeProps) {
  const formattedTime = useMemo(() => {
    if (!isoString) {
      return '—';
    }

    // Create a Date object from the ISO string
    // JavaScript Date automatically handles timezone conversion when created from ISO string
    // format() will display it in the browser's local timezone
    const date = new Date(isoString);
    return format(date, formatString);
  }, [isoString, formatString]);

  return <span>{formattedTime}</span>;
}

