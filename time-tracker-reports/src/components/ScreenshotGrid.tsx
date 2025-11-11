'use client';

import { useEffect, useState } from 'react';
import { format } from 'date-fns';

type Screenshot = {
  id: number;
  session_id: number;
  screenshot_data: string;
  captured_at: string;
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

  return (
    <div className="pip-overlay" aria-hidden>
      <div className="pip-overlay-content">
        <img
          src={screenshot.screenshot_data}
          alt={`Screenshot ${screenshot.id}`}
          className="pip-overlay-image"
          draggable={false}
          loading="lazy"
        />
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

          return (
            <div
              key={shot.id}
              className="flex flex-col overflow-hidden rounded-xl border border-border bg-card p-3 shadow-sm transition hover:shadow-md"
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




