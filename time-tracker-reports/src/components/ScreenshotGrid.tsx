'use client';

import { useEffect, useState } from 'react';
import { format } from 'date-fns';

type Screenshot = {
  id: number;
  session_id: number;
  screenshot_data: string;
  captured_at: string;
  app_name?: string | null;
  captured_idle?: boolean | null;
};

type ScreenshotGridProps = {
  screenshots: Screenshot[];
};

function formatDateTime(dateString: string): string {
  let dateStr = dateString.trim();

  const hasTimezone = /[Z+-]\d{2}:?\d{2}$/.test(dateStr) || dateStr.endsWith('Z');

  if (!hasTimezone && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(dateStr)) {
    dateStr = `${dateStr}Z`;
  }

  const date = new Date(dateStr);
  return format(date, 'MM/dd/yyyy, HH:mm:ss');
}

function FloatingViewer({ screenshot, onClose }: { screenshot: Screenshot; onClose: () => void }) {
  useEffect(() => {
    const escHandler = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', escHandler);
    return () => window.removeEventListener('keydown', escHandler);
  }, [onClose]);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  const appLabel = screenshot.app_name ?? 'Screenshot Preview';
  const isIdle = Boolean(screenshot.captured_idle);

  return (
    <div className="pip-overlay" aria-hidden>
      <div
        className={`pip-overlay-content relative ${
          isIdle ? 'border-4 border-rose-400' : ''
        }`}
      >
        {isIdle ? (
          <span className="absolute right-4 top-4 rounded-full bg-rose-500 px-3 py-1 text-xs font-semibold text-white shadow">
            Idle capture
          </span>
        ) : null}
        <img
          src={screenshot.screenshot_data}
          alt={`Screenshot ${screenshot.id}`}
          className="pip-overlay-image"
          draggable={false}
          loading="lazy"
        />
        <div className="mt-3 text-sm font-medium text-foreground">App: {appLabel}</div>
      </div>
    </div>
  );
}

export default function ScreenshotGrid({ screenshots }: ScreenshotGridProps) {
  const [activeScreenshot, setActiveScreenshot] = useState<Screenshot | null>(null);

  if (screenshots.length === 0) {
    return (
      <p className="rounded-xl border border-border bg-card p-6 text-center text-muted-foreground">
        No screenshots available for this session.
      </p>
    );
  }

  return (
    <>
      <div className="screenshot-grid">
        {screenshots.map((shot) => {
          const formattedDate = formatDateTime(shot.captured_at);
          const alt = `Screenshot ${shot.id} captured at ${formattedDate}`;
          const appLabel = shot.app_name ?? 'Unknown app';
          const cardClasses = [
            'flex flex-col overflow-hidden rounded-xl border border-border bg-card p-3 shadow-sm transition hover:shadow-md',
          ];
          if (shot.captured_idle) {
            cardClasses.push('border-rose-400 shadow-[0_0_0_3px_rgba(244,114,182,0.25)]');
          }

          return (
            <div
              key={shot.id}
              className={cardClasses.join(' ')}
              onMouseEnter={() => setActiveScreenshot(shot)}
              onMouseLeave={() =>
                setActiveScreenshot((prev) => (prev?.id === shot.id ? null : prev))
              }
              onClick={() => setActiveScreenshot(shot)}
            >
              <div className="relative aspect-video w-full overflow-hidden rounded-lg bg-muted flex-shrink-0">
                <img
                  src={shot.screenshot_data}
                  alt={alt}
                  className="absolute inset-0 h-full w-full object-contain"
                  loading="lazy"
                  draggable={false}
                />
              </div>
              <div className="mt-2 text-xs text-muted-foreground">{formattedDate}</div>
              {shot.captured_idle ? (
                <span className="mt-1 inline-flex h-5 items-center rounded-full bg-rose-100 px-2 text-[10px] font-semibold uppercase tracking-wide text-rose-600">
                  Idle capture
                </span>
              ) : null}
              <div className="mt-1 text-xs font-medium text-foreground">App: {appLabel}</div>
            </div>
          );
        })}
      </div>

      {activeScreenshot ? (
        <FloatingViewer
          key={activeScreenshot.id}
          screenshot={activeScreenshot}
          onClose={() => setActiveScreenshot(null)}
        />
      ) : null}
    </>
  );
}




