'use client';

import Image from 'next/image';
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
  // Parse date and ensure UTC timestamps are converted to local timezone
  let dateStr = dateString.trim();
  
  // Check if the string has timezone info (Z, +, or - after time)
  const hasTimezone = /[Z+-]\d{2}:?\d{2}$/.test(dateStr) || dateStr.endsWith('Z');
  
  // If it's an ISO timestamp without timezone, assume it's UTC and append 'Z'
  if (!hasTimezone && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(dateStr)) {
    dateStr = dateStr + 'Z';
  }
  
  const date = new Date(dateStr);
  // Format in local timezone (date-fns format automatically uses local time)
  return format(date, 'MM/dd/yyyy, HH:mm:ss');
}

export default function ScreenshotGrid({ screenshots }: ScreenshotGridProps) {
  if (screenshots.length === 0) {
    return (
      <p className="rounded-xl bg-slate-800 p-6 text-center text-slate-400">
        No screenshots available for this session.
      </p>
    );
  }

  return (
    <div className="screenshot-grid">
      {screenshots.map((shot) => {
        const formattedDate = formatDateTime(shot.captured_at);
        const alt = `Screenshot ${shot.id} captured at ${formattedDate}`;

        return (
          <div
            key={shot.id}
            className="flex flex-col rounded-xl bg-slate-800 p-3 shadow transition hover:shadow-lg overflow-hidden"
          >
            <div className="relative aspect-video w-full overflow-hidden rounded-lg bg-black flex-shrink-0">
              {shot.screenshot_data.startsWith('http') ? (
                // Use regular img for external URLs to avoid Next.js optimization issues
                <img
                  src={shot.screenshot_data}
                  alt={alt}
                  className="absolute inset-0 h-full w-full object-contain"
                  loading="lazy"
                />
              ) : (
                <Image
                  fill
                  src={shot.screenshot_data}
                  alt={alt}
                  className="object-contain"
                  sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
                  quality={95}
                  priority={false}
                />
              )}
            </div>
            <div className="mt-2 text-xs text-slate-400">
              Session: {shot.session_id}
              <br />
              {formattedDate}
            </div>
          </div>
        );
      })}
    </div>
  );
}

