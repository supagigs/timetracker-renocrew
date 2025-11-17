"use client";

import { useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";

import { createSupabaseBrowserClient } from "@/lib/supabaseBrowser";
import { subscribeToSessionChanges, type UserSessionRow } from "@/lib/userSessions";
import { WEB_USER_STORAGE_KEY } from "@/lib/constants";

type SessionWatcherProps = {
  email?: string | null;
};

function hasAppLoggedIn(row: any): row is UserSessionRow {
  return row && typeof row.app_logged_in === "boolean";
}

export function SessionWatcher({ email }: SessionWatcherProps) {
  const router = useRouter();
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);

  useEffect(() => {
    if (!email) return;

    const unsubscribe = subscribeToSessionChanges(supabase, email, (payload) => {
      const oldState = payload.old ?? null;
      const newState = payload.new ?? null;

      if (!hasAppLoggedIn(newState)) return;

      const oldAppLoggedIn = hasAppLoggedIn(oldState)
        ? oldState.app_logged_in
        : null;

      const newAppLoggedIn = newState.app_logged_in;

      const appLoggedOut = oldAppLoggedIn === true && newAppLoggedIn === false;

      if (appLoggedOut) {
        try {
          localStorage.removeItem(WEB_USER_STORAGE_KEY);
        } catch (error) {
          console.warn("[SessionWatcher] Failed to clear local storage:", error);
        }

        router.push("/logout?origin=app");
      }
    });

    return () => unsubscribe?.();
  }, [email, supabase, router]);

  return null;
}
