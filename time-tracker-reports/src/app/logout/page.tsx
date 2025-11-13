"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";

import { createSupabaseBrowserClient } from "@/lib/supabaseBrowser";
import { setUserSessionState } from "@/lib/userSessions";
import { WEB_USER_STORAGE_KEY } from "@/lib/constants";

type StoredUser = {
  email: string;
  displayName?: string | null;
};

export default function LogoutPage() {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const searchParams = useSearchParams();
  const [status, setStatus] = useState<"pending" | "complete">("pending");
  const origin = searchParams.get("origin") ?? "manual";

  useEffect(() => {
    let active = true;

    const performLogout = async () => {
      try {
        const raw = localStorage.getItem(WEB_USER_STORAGE_KEY);
        if (raw) {
          const stored = JSON.parse(raw) as StoredUser | null;
          if (stored?.email) {
            await setUserSessionState(supabase, stored.email, { web_logged_in: false });
          }
        }
      } catch (error) {
        console.error("[logout] Failed to update session state:", error);
      } finally {
        try {
          localStorage.removeItem(WEB_USER_STORAGE_KEY);
        } catch (error) {
          console.warn("[logout] Failed to clear stored user:", error);
        }
        if (active) {
          setStatus("complete");
        }
      }
    };

    performLogout();

    return () => {
      active = false;
    };
  }, [supabase]);

  const headline =
    origin === "app"
      ? "You have been signed out"
      : "You are signed out";

  const helperText =
    origin === "app"
      ? "The desktop app ended your session. Please sign in from the desktop app and click “View reports” to return here."
      : "You have been logged out. Please sign in again and click “View reports” to get back into the reports website.";

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30 px-4 py-10 text-foreground">
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-8 text-center shadow-lg">
        <h1 className="text-2xl font-semibold">{headline}</h1>
        <p className="mt-3 text-sm text-muted-foreground">{helperText}</p>
        {status === "pending" && (
          <p className="mt-6 text-xs text-muted-foreground">
            Finalising sign out…
          </p>
        )}
      </div>
    </div>
  );
}


