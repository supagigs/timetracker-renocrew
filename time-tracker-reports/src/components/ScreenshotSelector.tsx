'use client';

import { useState, useEffect, startTransition } from 'react';
import ScreenshotGrid from './ScreenshotGrid';
import { format } from 'date-fns';

type TimeSession = {
  id: number;
  session_date: string;
  start_time: string;
  end_time: string | null;
  active_duration: number;
  break_duration: number;
  idle_duration: number | null;
  break_count: number | null;
};

type Screenshot = {
  id: number;
  session_id: number;
  screenshot_data: string;
  captured_at: string;
  app_name?: string | null;
  captured_idle?: boolean | null;
};

type ScreenshotSelectorProps = {
  userEmail: string;
  sessions: TimeSession[];
  initialScreenshots: Screenshot[];
  initialSessionId?: number;
};

async function fetchScreenshotsForSession(
  userEmail: string,
  sessionId: number
): Promise<Screenshot[]> {
  const response = await fetch(
    `/api/screenshots?email=${encodeURIComponent(userEmail)}&sessionId=${sessionId}`
  );
  if (!response.ok) {
    throw new Error('Failed to fetch screenshots');
  }
  return response.json();
}

export default function ScreenshotSelector({
  userEmail,
  sessions,
  initialScreenshots,
  initialSessionId,
}: ScreenshotSelectorProps) {
  const [selectedSessionId, setSelectedSessionId] = useState<number | undefined>(
    initialSessionId || (sessions.length > 0 ? sessions[0].id : undefined)
  );
  const [screenshots, setScreenshots] = useState<Screenshot[]>(initialScreenshots);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
  if (!selectedSessionId) {
      return;
    }

    if (selectedSessionId === initialSessionId && initialScreenshots.length > 0) {
      startTransition(() => {
        setScreenshots(initialScreenshots);
        setLoading(false);
        setError(null);
      });
      return;
    }

    let cancelled = false;

    startTransition(() => {
      setLoading(true);
      setError(null);
    });

    fetchScreenshotsForSession(userEmail, selectedSessionId)
      .then((data) => {
        if (cancelled) {
          return;
        }

        console.log(
          `ScreenshotSelector: Received ${data.length} screenshots for session ${selectedSessionId}`
        );
        setScreenshots(data);
      })
      .catch((err) => {
        if (cancelled) {
          return;
        }

        console.error('ScreenshotSelector: Error fetching screenshots:', err);
        setError(err.message);
        setScreenshots([]);
      })
      .finally(() => {
        if (cancelled) {
          return;
        }

        startTransition(() => {
          setLoading(false);
        });
      });

    return () => {
      cancelled = true;
    };
  }, [selectedSessionId, userEmail, initialSessionId, initialScreenshots]);

  const formatSessionLabel = (session: TimeSession): string => {
    // Parse dates and ensure UTC timestamps are converted to local timezone
    // Supabase stores timestamps in UTC, so we need to ensure they're parsed as UTC
    let startDateStr = session.start_time.trim();
    
    // Check if the string has timezone info (Z, +, or - after time)
    const hasTimezone = /[Z+-]\d{2}:?\d{2}$/.test(startDateStr) || startDateStr.endsWith('Z');
    
    // If it's an ISO timestamp without timezone, assume it's UTC and append 'Z'
    if (!hasTimezone && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(startDateStr)) {
      startDateStr = startDateStr + 'Z';
    }
    
    const startDate = new Date(startDateStr);
    
    let endDate: Date | null = null;
    if (session.end_time) {
      let endDateStr = session.end_time.trim();
      const endHasTimezone = /[Z+-]\d{2}:?\d{2}$/.test(endDateStr) || endDateStr.endsWith('Z');
      
      if (!endHasTimezone && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(endDateStr)) {
        endDateStr = endDateStr + 'Z';
      }
      endDate = new Date(endDateStr);
    }
    
    // Format dates in local timezone (date-fns format automatically uses local time)
    const dateStr = format(startDate, 'MMM dd, yyyy');
    const timeStr = format(startDate, 'HH:mm');
    const endTimeStr = endDate ? ` - ${format(endDate, 'HH:mm')}` : '';
    const duration = Math.round((session.active_duration || 0) / 3600 * 10) / 10;
    return `${dateStr} ${timeStr}${endTimeStr} (${duration}h active)`;
  };

  if (sessions.length === 0) {
    return (
      <section className="space-y-4">
        <div>
          <h2 className="text-xl font-semibold text-foreground">Session Screenshots</h2>
          <p className="text-sm text-muted-foreground">No sessions recorded in the last 30 days.</p>
        </div>
      </section>
    );
  }

  return (
    <section className="space-y-4">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-semibold text-foreground">Session Screenshots</h2>
          {screenshots.length > 0 && (
            <p className="text-sm text-muted-foreground">
              {screenshots.length} image{screenshots.length !== 1 ? 's' : ''}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <label htmlFor="session-select" className="text-sm text-muted-foreground">
            Select Session:
          </label>
          <select
            id="session-select"
            value={selectedSessionId || ''}
            onChange={(e) => {
              const sessionId = e.target.value ? parseInt(e.target.value, 10) : undefined;
              setSelectedSessionId(sessionId);
            }}
            className="rounded-lg border border-border bg-white px-4 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
          >
            {sessions.map((session) => (
              <option key={session.id} value={session.id}>
                {formatSessionLabel(session)}
              </option>
            ))}
          </select>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-destructive bg-destructive/20 p-4 text-sm text-destructive-foreground">
          <strong>Error:</strong> {error}
        </div>
      )}

      {loading ? (
        <div className="rounded-xl border border-border bg-card p-6 text-center text-muted-foreground">
          Loading screenshots...
        </div>
      ) : screenshots.length === 0 ? (
        <div className="rounded-xl border border-border bg-card p-6 text-center text-muted-foreground">
          No screenshots available for this session.
        </div>
      ) : (
          <ScreenshotGrid screenshots={screenshots} />
      )}
    </section>
  );
}

