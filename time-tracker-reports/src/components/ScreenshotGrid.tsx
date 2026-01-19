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
  onScreenshotDeleted?: (screenshotId: number) => void;
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
      {/* CLOSE BUTTON - FIXED WITH HIGHER Z-INDEX */}
      <button
        onClick={onClose}
        className="absolute top-6 right-8 z-[100000] text-white text-4xl font-bold hover:text-red-400 transition-colors p-2 rounded-lg hover:bg-black/40 focus:outline-none focus:ring-2 focus:ring-red-500"
        aria-label="Close fullscreen viewer"
        type="button"
      >
        ✕
      </button>

      {/* LEFT ARROW - RESPONSIVE & ALIGNED */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          goPrev();
        }}
        className="absolute left-8 lg:left-12 top-1/2 -translate-y-1/2 text-white rounded-full bg-black/40 hover:bg-black/70 flex items-center justify-center w-16 h-16 transition-colors focus:outline-none focus:ring-2 focus:ring-white/50 z-[100001]"
        aria-label="Previous screenshot"
        type="button"
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

      {/* IMAGE WRAPPER - FULLSCREEN WITH PROPER SIZING */}
      <div
        className={`relative w-[90%] h-[90%] max-w-[95vw] max-h-[95vh] flex flex-col items-center justify-center pointer-events-none ${
          isIdle ? 'border-4 border-rose-500' : ''
        } rounded-lg bg-transparent`}
      >
        {/* IDLE CAPTURE BADGE */}
        {isIdle && (
          <span className="absolute top-4 right-4 bg-rose-500 text-white rounded-full px-3 py-1 text-xs font-bold shadow z-10 pointer-events-auto">
            Idle Capture
          </span>
        )}

        {/* SCREENSHOT IMAGE */}
        <img
          src={screenshot.screenshot_data}
          alt={`Screenshot ${index + 1} of ${screenshots.length}`}
          className="max-h-[95vh] max-w-[95vw] object-contain rounded-lg shadow-2xl"
          draggable={false}
          onError={(e) => {
            console.error(`Failed to load screenshot ${screenshot.id} in viewer:`, screenshot.screenshot_data);
            console.error('Image error:', e);
          }}
        />

        {/* BOTTOM COUNTER AND APP INFO */}
        <div className="mt-4 text-center pointer-events-auto">
          <div className="text-white text-sm font-semibold opacity-90">
            {index + 1} / {screenshots.length}
          </div>
          <div className="text-white text-xs mt-1 opacity-70 max-w-xs truncate">
            App: {screenshot.app_name ?? "Unknown App"}
          </div>
        </div>
      </div>

      {/* RIGHT ARROW - RESPONSIVE & ALIGNED */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          goNext();
        }}
        className="absolute right-8 lg:right-12 top-1/2 -translate-y-1/2 text-white rounded-full bg-black/40 hover:bg-black/70 flex items-center justify-center w-16 h-16 transition-colors focus:outline-none focus:ring-2 focus:ring-white/50 z-[100001]"
        aria-label="Next screenshot"
        type="button"
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
   CONFIRMATION DIALOG
-------------------------------------------------- */
function DeleteConfirmationDialog({
  isOpen,
  onConfirm,
  onCancel,
}: {
  isOpen: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  useEffect(() => {
    if (isOpen) {
      const handleEscape = (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
          onCancel();
        }
      };
      document.addEventListener('keydown', handleEscape);
      return () => document.removeEventListener('keydown', handleEscape);
    }
  }, [isOpen, onCancel]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[99998]"
      onClick={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <div
        className="bg-card border border-border rounded-xl shadow-lg p-6 max-w-md w-full mx-4"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-lg font-semibold text-foreground mb-2">
          Delete Screenshot?
        </h3>
        <p className="text-sm text-muted-foreground mb-6">
          Are you sure you want to delete this screenshot? This action cannot be undone. The screenshot will be permanently removed from the database and storage.
        </p>
        <div className="flex gap-3 justify-end">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-sm font-medium text-foreground bg-muted hover:bg-muted/80 rounded-lg transition-colors"
            type="button"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="px-4 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-lg transition-colors"
            type="button"
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}

/* --------------------------------------------------
   SCREENSHOT GRID (THUMBNAILS)
-------------------------------------------------- */
export default function ScreenshotGrid({ screenshots, onScreenshotDeleted }: ScreenshotGridProps) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const [imageErrors, setImageErrors] = useState<Set<number>>(new Set());
  const [deleteConfirmId, setDeleteConfirmId] = useState<number | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const handleDeleteClick = useCallback((e: React.MouseEvent, screenshotId: number) => {
    e.stopPropagation();
    setDeleteConfirmId(screenshotId);
  }, []);

  const handleDeleteConfirm = useCallback(async () => {
    if (!deleteConfirmId) return;

    setDeletingId(deleteConfirmId);
    try {
      const response = await fetch(`/api/screenshots/${deleteConfirmId}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({ error: 'Failed to delete screenshot' }));
        throw new Error(error.error || 'Failed to delete screenshot');
      }

      // Close the viewer if the deleted screenshot was being viewed
      const deletedIndex = screenshots.findIndex((s) => s.id === deleteConfirmId);
      if (deletedIndex !== -1 && activeIndex !== null) {
        // If we're viewing the deleted screenshot or it affects the index, close the viewer
        if (activeIndex === deletedIndex || activeIndex >= deletedIndex) {
          setActiveIndex(null);
        }
      }

      // Notify parent component to refresh the list
      if (onScreenshotDeleted) {
        onScreenshotDeleted(deleteConfirmId);
      }

      // Close the confirmation dialog
      setDeleteConfirmId(null);
    } catch (error) {
      console.error('Error deleting screenshot:', error);
      alert(error instanceof Error ? error.message : 'Failed to delete screenshot');
    } finally {
      setDeletingId(null);
    }
  }, [deleteConfirmId, onScreenshotDeleted, screenshots, activeIndex]);

  const handleDeleteCancel = useCallback(() => {
    setDeleteConfirmId(null);
  }, []);

  if (screenshots.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-card p-8 shadow-sm">
        <p className="text-center text-muted-foreground font-medium">
          No screenshots available for this session.
        </p>
        <p className="text-center text-muted-foreground text-sm mt-2">
          Screenshots will appear here once they are captured.
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="screenshot-grid grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {screenshots.map((shot, idx) => {
          const formattedDate = formatDateTime(shot.captured_at);

          return (
            <div
              key={shot.id}
              onClick={() => setActiveIndex(idx)}
              className={`flex flex-col overflow-hidden rounded-xl border bg-card p-3 shadow hover:shadow-lg transition-all cursor-pointer hover:scale-105 ${
                shot.captured_idle ? 'border-rose-400 shadow-[0_0_0_3px_rgba(244,114,182,0.25)]' : 'border-border hover:border-primary/50'
              }`}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  setActiveIndex(idx);
                }
              }}
              aria-label={`Screenshot ${idx + 1} - ${shot.app_name ?? 'Unknown app'} - ${formattedDate}`}
            >
              {/* THUMBNAIL IMAGE */}
              <div className="relative aspect-video w-full overflow-hidden rounded-lg bg-muted">
                {imageErrors.has(shot.id) ? (
                  <div className="absolute inset-0 flex flex-col items-center justify-center text-center p-4">
                    <div className="text-muted-foreground text-xs">
                      <div className="mb-2">⚠️ Image failed to load</div>
                      <div className="text-[10px] break-all opacity-70">
                        URL: {shot.screenshot_data?.substring(0, 60)}...
                      </div>
                    </div>
                  </div>
                ) : (
                  <img
                    src={shot.screenshot_data}
                    alt={`Screenshot thumbnail ${idx + 1}`}
                    className="absolute inset-0 h-full w-full object-contain"
                    draggable={false}
                    onError={(e) => {
                      console.error(`Failed to load screenshot ${shot.id}:`, shot.screenshot_data);
                      console.error('Image error event:', e);
                      setImageErrors((prev) => new Set(prev).add(shot.id));
                    }}
                    onLoad={() => {
                      console.log(`Successfully loaded screenshot ${shot.id}:`, shot.screenshot_data);
                    }}
                  />
                )}
                {/* DELETE BUTTON - TRASH ICON */}
                <button
                  onClick={(e) => handleDeleteClick(e, shot.id)}
                  disabled={deletingId === shot.id}
                  className="absolute top-2 right-2 p-2 bg-black/60 hover:bg-black/80 text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed z-10"
                  aria-label="Delete screenshot"
                  type="button"
                  title="Delete screenshot"
                >
                  {deletingId === shot.id ? (
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="w-4 h-4 animate-spin"
                    >
                      <circle cx="12" cy="12" r="10" opacity="0.25" />
                      <path d="M12 2a10 10 0 0 1 10 10" opacity="0.75" />
                    </svg>
                  ) : (
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="w-4 h-4"
                    >
                      <path d="M3 6h18" />
                      <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
                      <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
                    </svg>
                  )}
                </button>
              </div>

              {/* TIMESTAMP */}
              <div className="mt-3 text-xs text-muted-foreground font-medium">
                {formattedDate}
              </div>

              {/* IDLE BADGE */}
              {shot.captured_idle && (
                <span className="mt-2 inline-flex h-5 items-center rounded-full bg-rose-100 px-2 text-[10px] font-semibold uppercase tracking-wide text-rose-600 border border-rose-200">
                  Idle capture
                </span>
              )}

              {/* APP NAME */}
              <div className="mt-2 text-xs font-semibold text-foreground truncate">
                {shot.app_name ?? 'Unknown app'}
              </div>
            </div>
          );
        })}
      </div>

      {/* FLOATING VIEWER MODAL */}
      {activeIndex !== null && (
        <FloatingViewer
          screenshots={screenshots}
          index={activeIndex}
          setIndex={setActiveIndex}
          onClose={() => setActiveIndex(null)}
        />
      )}

      {/* DELETE CONFIRMATION DIALOG */}
      <DeleteConfirmationDialog
        isOpen={deleteConfirmId !== null}
        onConfirm={handleDeleteConfirm}
        onCancel={handleDeleteCancel}
      />
    </>
  );
}
