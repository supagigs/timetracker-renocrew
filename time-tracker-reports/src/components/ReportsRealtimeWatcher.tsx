"use client";

import { useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";

import { createSupabaseBrowserClient } from "@/lib/supabaseBrowser";

type ReportsRealtimeWatcherProps = {
  userEmail: string | null;
};

/**
 * Subscribes to Supabase changes for the given user's time sessions and screenshots
 * and triggers a soft refresh of the current page whenever new data arrives.
 *
 * This keeps the Reports and Screenshots views up-to-date while a freelancer is
 * actively working without requiring a manual page reload.
 */
export function ReportsRealtimeWatcher({ userEmail }: ReportsRealtimeWatcherProps) {
  const router = useRouter();
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);

  useEffect(() => {
    const normalizedEmail = userEmail?.trim().toLowerCase() ?? "";
    if (!normalizedEmail) {
      return;
    }

    const channel = supabase
      .channel(`reports-realtime-${normalizedEmail}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "time_sessions",
          filter: `user_email=eq.${normalizedEmail}`,
        },
        () => {
          router.refresh();
        },
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "screenshots",
          filter: `user_email=eq.${normalizedEmail}`,
        },
        () => {
          router.refresh();
        },
      );

    channel.subscribe((status) => {
      if (status === "CHANNEL_ERROR" || status === "CLOSED" || status === "TIMED_OUT") {
        // Fail silently; the page will still work, just without live updates.
        // eslint-disable-next-line no-console
        console.warn("[ReportsRealtimeWatcher] Channel status:", status);
      }
    });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase, userEmail, router]);

  return null;
}


