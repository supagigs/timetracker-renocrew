"use client";

import { useState } from "react";

const OPTIONS: Array<{ label: string; seconds: number }> = [
  { label: "30 seconds", seconds: 30 },
  { label: "1 minute", seconds: 60 },
  { label: "2 minutes", seconds: 120 },
  { label: "5 minutes", seconds: 300 },
  { label: "10 minutes", seconds: 600 },
  { label: "20 minutes", seconds: 1200 },
  { label: "30 minutes", seconds: 1800 },
  { label: "1 hour", seconds: 3600 },
];

const DELETE_OPTIONS: Array<{ label: string; days: number }> = [
  { label: "30 days", days: 30 },
  { label: "60 days", days: 60 },
  { label: "90 days", days: 90 },
];

type ScreenshotIntervalFormProps = {
  clientEmail: string;
  freelancerEmail: string;
  initialIntervalSeconds: number;
};

export function ScreenshotIntervalForm({
  clientEmail,
  freelancerEmail,
  initialIntervalSeconds,
}: ScreenshotIntervalFormProps) {
  const [selected, setSelected] = useState<number>(initialIntervalSeconds);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [deleteDays, setDeleteDays] = useState<number>(5);
  const [deleting, setDeleting] = useState(false);
  const [deleteMsg, setDeleteMsg] = useState<string | null>(null);
  const [deleteErr, setDeleteErr] = useState<string | null>(null);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setMessage(null);
    setError(null);

    try {
      const response = await fetch("/api/client-settings/screenshot-interval", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientEmail,
          intervalSeconds: selected,
        }),
      });

      const payload = await response.json();
      if (!response.ok || !payload?.ok) {
        setError(payload?.error ?? "Unable to save interval. Please try again.");
        return;
      }

      setMessage("Screenshot interval updated. New captures will follow this setting.");
    } catch (err) {
      console.error("[ScreenshotIntervalForm] Failed to save interval:", err);
      setError("Unexpected error while saving. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  // ✅ FIXED: Properly send all parameters
  const handleDelete = async (event: React.FormEvent) => {
    event.preventDefault();
    
    console.log('[handleDelete] Starting deletion with:', {
      days: deleteDays,
      clientEmail,
      freelancerEmail
    });

    setDeleting(true);
    setDeleteMsg(null);
    setDeleteErr(null);

    try {
      const requestBody = {
        days: deleteDays,
        clientEmail: clientEmail,
        freelancerEmail: freelancerEmail,
      };

      console.log('[handleDelete] Request body:', requestBody);

      const response = await fetch("/api/screenshots/delete-old", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody),
      });

      console.log('[handleDelete] Response status:', response.status);

      const result = await response.json();
      console.log('[handleDelete] Response data:', result);

      if (!response.ok || !result.success) {
        setDeleteErr(result.error ?? "Failed to delete screenshots. Please try again.");
        return;
      }

      const deletedCount = result.deleted ?? 0;
      const filesDeleted = result.filesDeleted ?? 0;
      
      setDeleteMsg(
        ` Successfully deleted ${deletedCount} screenshot(s) and ${filesDeleted} file(s) older than ${deleteDays} days for ${freelancerEmail}.`
      );
    } catch (err: any) {
      console.error('[handleDelete] Error:', err);
      setDeleteErr(err?.message ?? "Failed to delete screenshots. Please try again.");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <form className="space-y-4" onSubmit={handleSubmit}>
      <div>
        <label
          htmlFor="interval"
          className="block text-xs font-medium uppercase tracking-wide text-muted-foreground"
        >
          Select the interval between two screenshot captures
        </label>
        <select
          id="interval"
          name="interval"
          className="mt-2 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
          value={selected}
          onChange={(event) => setSelected(Number(event.target.value))}
          disabled={saving}
        >
          {OPTIONS.map((option) => (
            <option key={option.seconds} value={option.seconds}>
              {option.label}
            </option>
          ))}
        </select>
      </div>

      <button
        type="submit"
        disabled={saving}
        className="inline-flex h-10 items-center justify-center rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-sm transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground"
      >
        {saving ? "Saving…" : "Save interval"}
      </button>

      {message ? (
        <p className="text-sm text-emerald-600">{message}</p>
      ) : null}
      {error ? <p className="text-sm text-destructive-foreground">{error}</p> : null}

      {/* Delete screenshots section */}
      <div className="space-y-2 mt-8 border-t pt-4">
        <label
          htmlFor="ss-delete-days"
          className="block text-xs font-medium uppercase tracking-wide text-muted-foreground mb-1"
        >
          Delete screenshots older than
        </label>
        <div className="flex gap-2 items-center">
          <select
            id="ss-delete-days"
            name="ss-delete-days"
            className="rounded-lg border border-border bg-background px-3 py-2 text-sm"
            value={deleteDays}
            onChange={(event) => setDeleteDays(Number(event.target.value))}
            disabled={deleting}
          >
            {DELETE_OPTIONS.map((option) => (
              <option key={option.days} value={option.days}>
                {option.label}
              </option>
            ))}
          </select>
          <button
            type="button"
            disabled={deleting}
            onClick={handleDelete}
            className="inline-flex h-10 items-center justify-center rounded-lg bg-red-600 px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-red-700 disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground"
          >
            {deleting ? "Deleting…" : "Delete old screenshots"}
          </button>
        </div>
        {deleteMsg ? <p className="text-sm text-emerald-600">{deleteMsg}</p> : null}
        {deleteErr ? <p className="text-sm text-destructive-foreground">{deleteErr}</p> : null}
      </div>
    </form>
  );
}

