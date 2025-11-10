"use client";

import { useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";

import { createSupabaseBrowserClient } from "@/lib/supabaseBrowser";
import { subscribeToSessionChanges, type UserSessionRow } from "@/lib/userSessions";
import { WEB_USER_STORAGE_KEY } from "@/lib/constants";

type SessionWatcherProps = {
  email?: string | null;
};

export function SessionWatcher({ email }: SessionWatcherProps) {
  const router = useRouter();
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);

  useEffect(() => {
    if (!email) {
      return;
    }

    const unsubscribe = subscribeToSessionChanges(supabase, email, (payload) => {
      const oldState: UserSessionRow | null = payload.old ?? null;
      const newState: UserSessionRow | null = payload.new ?? null;

      if (!newState) {
        return;
      }

      const appChanged =
        typeof newState.app_logged_in === "boolean" &&
        newState.app_logged_in === false &&
        (oldState?.app_logged_in ?? true) !== newState.app_logged_in;

      if (appChanged) {
        try {
          localStorage.removeItem(WEB_USER_STORAGE_KEY);
        } catch (error) {
          console.warn("[SessionWatcher] Failed to clear local storage:", error);
        }

        router.push("/logout?origin=app");
      }
    });

    return () => {
      if (unsubscribe) {
        unsubscribe();
      }
    };
  }, [email, supabase, router]);

  return null;
}


