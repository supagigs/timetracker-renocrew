'use client';

import { useEffect, useState, useCallback } from 'react';
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

/* --------------------------------------------------
   FLOATING VIEWER (FULLSCREEN PREVIEW)
-------------------------------------------------- */
function FloatingViewer({
  screenshots,
  index,
  onClose,
  setIndex,
}: {
  screenshots: Screenshot[];
  index: number;
  onClose: () => void;
  setIndex: (i: number) => void;
}) {
  const screenshot = screenshots[index];
  const isIdle = Boolean(screenshot.captured_idle);

  const goNext = useCallback(() => {
    const nextIndex = (index + 1) % screenshots.length;
    console.log("goNext()", { index, nextIndex });
    setIndex(nextIndex);
  }, [index, screenshots.length, setIndex]);

  const goPrev = useCallback(() => {
    const prevIndex = (index - 1 + screenshots.length) % screenshots.length;
    console.log("goPrev()", { index, prevIndex });
    setIndex(prevIndex);
  }, [index, screenshots.length, setIndex]);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.key === "ArrowRight") goNext();
      if (event.key === "ArrowLeft") goPrev();
      if (event.key === "Escape") onClose();
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [goNext, goPrev, onClose]);

  useEffect(() => {
    const p = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = p; };
  }, []);

  return (
    <div
      className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-[99999]"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      {/* CLOSE BUTTON */}
      <button
        onClick={onClose}
        className="absolute top-6 right-8 text-white text-4xl font-bold hover:text-red-400"
      >
        ✕
      </button>

      <button
        onClick={(e) => {
          e.stopPropagation();
          goPrev();
        }}
        className="absolute left-12 top-1/2 -translate-y-1/2 text-white rounded-full bg-black/40 hover:bg-black/70 flex items-center justify-center w-16 h-16"
        >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 16 16"
          className="w-9 h-9"
          fill="currentColor"
        >
          <path
            fillRule="evenodd"
            d="M1 8a7 7 0 1 0 14 0A7 7 0 0 0 1 8m15 0A8 8 0 1 1 0 8a8 8 0 0 1 16 0m-4.5-.5a.5.5 0 0 1 0 1H5.707l2.147 2.146a.5.5 0 0 1-.708.708l-3-3a.5.5 0 0 1 0-.708l3-3a.5.5 0 1 1 .708.708L5.707 7.5z"
          />
        </svg>
      </button>

      {/* IMAGE WRAPPER */}
      <div
        className={`relative w-full h-full max-w-[100vw] max-h-[100vh] flex flex-col items-center justify-center ${
          isIdle ? 'border-4 border-rose-500' : ''
        } rounded-none bg-transparent`}
        >
        {isIdle && (
          <span className="absolute top-4 right-4 bg-rose-500 text-white rounded-full px-3 py-1 text-xs font-bold shadow">
            Idle Capture
          </span>
        )}

        <img
          src={screenshot.screenshot_data}
          alt="Screenshot"
          className="max-h-[90vh] max-w-[95vw] object-contain"
          draggable={false}
        />

        {/* BOTTOM COUNTER */}
        <div className="mt-3 text-white text-sm font-medium opacity-80">
          {index + 1} / {screenshots.length}
        </div>
        <div className="text-white text-xs mt-1 opacity-60">
          App: {screenshot.app_name ?? "Unknown App"}
        </div>
      </div>

      {/* RIGHT ARROW */}
      <button
      onClick={(e) => {
        e.stopPropagation();
        goNext();
      }}
      className="absolute right-12 top-1/2 -translate-y-1/2 text-white rounded-full bg-black/40 hover:bg-black/70 flex items-center justify-center w-16 h-16"
      >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 16 16"
        className="w-9 h-9"
        fill="currentColor"
      >
        <path
          fillRule="evenodd"
          d="M1 8a7 7 0 1 0 14 0A7 7 0 0 0 1 8m15 0A8 8 0 1 1 0 8a8 8 0 0 1 16 0M4.5 7.5a.5.5 0 0 0 0 1h5.793l-2.147 2.146a.5.5 0 0 0 .708.708l3-3a.5.5 0 0 0 0-.708l-3-3a.5.5 0 1 0-.708.708L10.293 7.5z"
        />
      </svg>
    </button>
    </div>
  );
}

/* --------------------------------------------------
   SCREENSHOT GRID (THUMBNAILS)
-------------------------------------------------- */
export default function ScreenshotGrid({ screenshots }: ScreenshotGridProps) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);

  if (screenshots.length === 0) {
    return (
      <p className="rounded-xl border bg-card p-6 text-center text-muted-foreground">
        No screenshots available for this session.
      </p>
    );
  }

  return (
    <>
      <div className="screenshot-grid">
        {screenshots.map((shot, idx) => {
          const formattedDate = formatDateTime(shot.captured_at);

          return (
            <div
              key={shot.id}
              onClick={() => setActiveIndex(idx)}
              className={`flex flex-col overflow-hidden rounded-xl border bg-card p-3 shadow hover:shadow-md transition cursor-pointer ${
                shot.captured_idle ? 'border-rose-400 shadow-[0_0_0_3px_rgba(244,114,182,0.25)]' : ''
              }`}
            >
              <div className="relative aspect-video w-full overflow-hidden rounded-lg bg-muted">
                <img
                  src={shot.screenshot_data}
                  className="absolute inset-0 h-full w-full object-contain"
                  draggable={false}
                />
              </div>

              <div className="mt-2 text-xs text-muted-foreground">{formattedDate}</div>

              {shot.captured_idle && (
                <span className="mt-1 inline-flex h-5 items-center rounded-full bg-rose-100 px-2 text-[10px] font-semibold uppercase tracking-wide text-rose-600">
                  Idle capture
                </span>
              )}

              <div className="mt-1 text-xs font-medium">
                App: {shot.app_name ?? 'Unknown app'}
              </div>
            </div>
          );
        })}
      </div>

      {activeIndex !== null && (
        <FloatingViewer
          screenshots={screenshots}
          index={activeIndex}
          setIndex={setActiveIndex}
          onClose={() => setActiveIndex(null)}
        />
      )}
    </>
  );
}
