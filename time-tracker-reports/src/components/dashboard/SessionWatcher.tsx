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
      // const oldState: UserSessionRow | null = payload.old ?? null;
      // const newState: UserSessionRow | null = payload.new ?? null;
      // Changed the 'State'  to check  fields before using them
      const oldState = (payload.old ?? null) as UserSessionRow | null;
      const newState = (payload.new ?? null) as UserSessionRow | null;

      if (!newState) {
        return;
      }

      const oldAppLoggedIn =
        typeof oldState?.app_logged_in === "boolean" ? oldState.app_logged_in : null;
      const newAppLoggedIn =
        typeof newState.app_logged_in === "boolean" ? newState.app_logged_in : null;

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

    return () => {
      if (unsubscribe) {
        unsubscribe();
      }
    };
  }, [email, supabase, router]);

  return null;
}


