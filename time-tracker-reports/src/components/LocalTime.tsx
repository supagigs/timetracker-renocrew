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

    // Parse the time string and ensure UTC timestamps are converted to local timezone
    // Supabase stores timestamps in UTC, so we need to ensure they're parsed as UTC
    let timeStr = isoString.trim();
    
    // Check if the string has timezone info (Z, +, or - after time)
    const hasTimezone = /[Z+-]\d{2}:?\d{2}$/.test(timeStr) || timeStr.endsWith('Z');
    
    // If it's an ISO timestamp without timezone, assume it's UTC and append 'Z'
    if (!hasTimezone && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(timeStr)) {
      timeStr = timeStr + 'Z';
    }
    
    // Create a Date object from the ISO string
    // JavaScript Date automatically handles timezone conversion when created from ISO string
    // format() will display it in the browser's local timezone
    const date = new Date(timeStr);
    
    // Check if date is valid
    if (isNaN(date.getTime())) {
      return '—';
    }
    
    return format(date, formatString);
  }, [isoString, formatString]);

  return <span>{formattedTime}</span>;
}

