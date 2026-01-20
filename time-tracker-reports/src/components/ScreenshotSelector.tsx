'use client';

// ============ TYPE DECLARATION FOR ELECTRON API ============
declare global {
  interface Window {
    electronAPI?: {
      onScreenshotDeleted?: (callback: (data: any) => void) => () => void;
    };
  }
}

import { useState, useEffect, startTransition } from 'react';
import ScreenshotGrid from './ScreenshotGrid';
import { format } from 'date-fns';
import { getDeletionStats, getSessionDeletionStats } from '@/lib/screenshotDeletionTracker';

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
  // ✅ ADD: Prevent hydration mismatch
  const [mounted, setMounted] = useState(false);
  
  const [selectedSessionId, setSelectedSessionId] = useState<number | undefined>(
    initialSessionId || (sessions.length > 0 ? sessions[0].id : undefined)
  );
  const [screenshots, setScreenshots] = useState<Screenshot[]>(initialScreenshots);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deletionStats, setDeletionStats] = useState({ perDay: 0, perSession: 0, perMonth: 0, perCurrentSession: 0 });

  // ✅ Set mounted flag first
  useEffect(() => {
    setMounted(true);
  }, []);

  // Update deletion stats when screenshots change or component mounts
  useEffect(() => {
    if (!mounted || !userEmail) return;
    
    const updateStats = () => {
      const stats = getDeletionStats(userEmail);
      const sessionStats = selectedSessionId ? getSessionDeletionStats(selectedSessionId, userEmail) : 0;
      setDeletionStats({
        ...stats,
        perCurrentSession: sessionStats,
      });
    };
    
    updateStats();
  }, [mounted, selectedSessionId, screenshots, userEmail]);

  // ============ LISTEN FOR SCREENSHOT DELETION EVENT ============
  useEffect(() => {
    if (!mounted || typeof window === 'undefined') {
      return;
    }

    if (window.electronAPI?.onScreenshotDeleted) {
      console.log('[ScreenshotSelector] Setting up deletion listener');
      
      const unsubscribe = window.electronAPI.onScreenshotDeleted((data: any) => {
        console.log('[ScreenshotSelector] Screenshot deleted event received:', data);
        
        // Remove the deleted screenshot from the display
        setScreenshots(prev => {
          const updated = prev.filter(ss => {
            // Check if screenshot URL contains the deleted filename
            if (ss.screenshot_data.includes(data.filename)) {
              console.log('[ScreenshotSelector] Removing screenshot:', data.filename);
              return false;
            }
            return true;
          });
          
          console.log(`[ScreenshotSelector] Filtered screenshots: ${prev.length} -> ${updated.length}`);
          return updated;
        });
      });
      
      return unsubscribe; // cleanup on unmount
    }
  }, [mounted]);

  useEffect(() => {
    if (!mounted || !selectedSessionId) {
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
  }, [selectedSessionId, userEmail, initialSessionId, initialScreenshots, mounted]);

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

  // ✅ Show loading state until mounted
  if (!mounted) {
    return (
      <section className="space-y-4">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-xl font-semibold text-foreground">Session Screenshots</h2>
            <p className="text-sm text-muted-foreground">Loading...</p>
          </div>
          <div className="flex items-center gap-2">
            <label className="text-sm text-muted-foreground">
              Select Session:
            </label>
            <select
              disabled
              className="rounded-lg border border-border bg-white px-4 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
              suppressHydrationWarning
            >
              <option>Loading...</option>
            </select>
          </div>
        </div>
      </section>
    );
  }

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
          {/* Deleted Counts Display */}
          {(deletionStats.perCurrentSession > 0 || deletionStats.perDay > 0 || deletionStats.perMonth > 0) && (
            <div className="mt-2 flex flex-wrap gap-4 text-xs text-muted-foreground">
              {deletionStats.perCurrentSession > 0 && (
                <span className="flex items-center gap-1">
                  <span className="font-medium text-foreground">Deleted in this session:</span>
                  <span className="rounded-full bg-red-100 px-2 py-0.5 font-semibold text-red-700 dark:bg-red-900/30 dark:text-red-400">
                    {deletionStats.perCurrentSession}
                  </span>
                </span>
              )}
              {deletionStats.perDay > 0 && (
                <span className="flex items-center gap-1">
                  <span className="font-medium text-foreground">Deleted today:</span>
                  <span className="rounded-full bg-orange-100 px-2 py-0.5 font-semibold text-orange-700 dark:bg-orange-900/30 dark:text-orange-400">
                    {deletionStats.perDay}
                  </span>
                </span>
              )}
              {deletionStats.perMonth > 0 && (
                <span className="flex items-center gap-1">
                  <span className="font-medium text-foreground">Deleted this month:</span>
                  <span className="rounded-full bg-amber-100 px-2 py-0.5 font-semibold text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
                    {deletionStats.perMonth}
                  </span>
                </span>
              )}
            </div>
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
            suppressHydrationWarning
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
        <ScreenshotGrid
          screenshots={screenshots}
          userEmail={userEmail}
          currentSessionId={selectedSessionId}
          onScreenshotDeleted={(deletedId) => {
            // Remove the deleted screenshot from the list
            setScreenshots((prev) => prev.filter((s) => s.id !== deletedId));
            // Update deletion stats after deletion (with a small delay to ensure localStorage is updated)
            setTimeout(() => {
              const stats = getDeletionStats(userEmail);
              const sessionStats = selectedSessionId ? getSessionDeletionStats(selectedSessionId, userEmail) : 0;
              setDeletionStats({
                ...stats,
                perCurrentSession: sessionStats,
              });
            }, 100);
          }}
        />
      )}
    </section>
  );
}
