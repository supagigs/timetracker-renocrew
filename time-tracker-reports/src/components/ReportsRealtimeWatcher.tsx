"use client";

import { useEffect, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";

import { createSupabaseBrowserClient } from "@/lib/supabaseBrowser";

type ReportsRealtimeWatcherProps = {
  userEmail: string | null;
};

/**
 * Subscribes to Supabase changes for the given user's time sessions and screenshots
 * and triggers a soft refresh of the current page whenever new data arrives.
 *
 * This keeps the Reports and Screenshots views up-to-date while an employee is
 * actively working without requiring a manual page reload.
 */
export function ReportsRealtimeWatcher({ userEmail }: ReportsRealtimeWatcherProps) {
  const router = useRouter();
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const isUnmountingRef = useRef(false);
  const channelRef = useRef<any>(null);
  const retryTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    const normalizedEmail = userEmail?.trim().toLowerCase() ?? "";
    if (!normalizedEmail) {
      return;
    }

    isUnmountingRef.current = false;

    const setupChannel = () => {
      // Clean up any existing retry timeout
      if (retryTimeoutRef.current) {
        clearTimeout(retryTimeoutRef.current);
        retryTimeoutRef.current = null;
      }

      // Remove old channel if it exists
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
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

      channelRef.current = channel;

      channel.subscribe((status) => {
        // Only log errors if we're not unmounting
        if (status === "CHANNEL_ERROR") {
          if (!isUnmountingRef.current) {
            console.warn("[ReportsRealtimeWatcher] Channel error occurred. Attempting to reconnect...");
            // Retry after a delay
            retryTimeoutRef.current = setTimeout(() => {
              if (!isUnmountingRef.current) {
                setupChannel();
              }
            }, 3000);
          }
        } else if (status === "TIMED_OUT") {
          if (!isUnmountingRef.current) {
            console.warn("[ReportsRealtimeWatcher] Channel timed out. Attempting to reconnect...");
            // Retry after a delay
            retryTimeoutRef.current = setTimeout(() => {
              if (!isUnmountingRef.current) {
                setupChannel();
              }
            }, 3000);
          }
        } else if (status === "SUBSCRIBED") {
          // Channel successfully subscribed - clear any retry timeout
          if (retryTimeoutRef.current) {
            clearTimeout(retryTimeoutRef.current);
            retryTimeoutRef.current = null;
          }
        }
        // CLOSED status is expected on unmount, so we don't log it
      });
    };

    setupChannel();

    return () => {
      isUnmountingRef.current = true;
      
      // Clear retry timeout
      if (retryTimeoutRef.current) {
        clearTimeout(retryTimeoutRef.current);
        retryTimeoutRef.current = null;
      }

      // Remove channel
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, [supabase, userEmail, router]);

  return null;
}


