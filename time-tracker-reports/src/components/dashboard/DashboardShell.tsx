"use client";

import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";

import { DashboardHeader } from "./DashboardHeader";
import { Sidebar } from "./Sidebar";
import { SessionWatcher } from "./SessionWatcher";
import { WEB_USER_STORAGE_KEY } from "@/lib/constants";

type DashboardShellProps = {
  children: ReactNode;
  userName?: string | null;
  userEmail?: string | null;
  userRole?: string | null;
  showBreadcrumb?: boolean;
  showAccountControls?: boolean;
  showSidebar?: boolean;
};

export function DashboardShell({
  children,
  userName,
  userEmail,
  userRole,
  showBreadcrumb = true,
  showAccountControls = true,
  showSidebar = true,
}: DashboardShellProps) {
  const [shouldWatchSession, setShouldWatchSession] = useState(false);

  const normalizedRole = useMemo(() => userRole?.trim().toLowerCase() ?? null, [userRole]);
  const normalizedEmail = useMemo(() => userEmail?.trim().toLowerCase() ?? null, [userEmail]);

  useEffect(() => {
    if (!normalizedEmail) {
      setShouldWatchSession(false);
      return;
    }

    if (normalizedRole) {
      setShouldWatchSession(normalizedRole !== "client");
      return;
    }

    let storedRole: string | null = null;

    try {
      const raw = localStorage.getItem(WEB_USER_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as { category?: string | null; email?: string | null } | null;
        if (parsed?.email?.trim().toLowerCase() === normalizedEmail) {
          storedRole = parsed.category?.trim().toLowerCase() ?? null;
        }
      }
    } catch (error) {
      console.warn("[DashboardShell] Failed to read stored user role:", error);
    }

    setShouldWatchSession(storedRole !== "client");
  }, [normalizedEmail, normalizedRole]);

  return (
    <div className="flex min-h-screen bg-background text-foreground">
      {showSidebar ? <Sidebar userRole={userRole} userEmail={userEmail} /> : null}
      <div className="flex min-h-screen w-full flex-1 flex-col">
        <DashboardHeader
          name={userName}
          email={userEmail}
          showBreadcrumb={showBreadcrumb}
          showAccountControls={showAccountControls}
        />
        {shouldWatchSession ? <SessionWatcher email={userEmail ?? undefined} /> : null}
        <main className="flex-1 overflow-auto bg-muted/40">
          <div className="mx-auto w-full max-w-6xl px-6 py-8">{children}</div>
        </main>
      </div>
    </div>
  );
}
