"use client";

import type { ReactNode } from "react";

import { Sidebar } from "./Sidebar";
import { DashboardHeader } from "./DashboardHeader";
import { SessionWatcher } from "./SessionWatcher";

type DashboardShellProps = {
  children: ReactNode;
  userName?: string | null;
  userEmail?: string | null;
  userRole?: string | null;
};

export function DashboardShell({
  children,
  userName,
  userEmail,
  userRole,
}: DashboardShellProps) {
  return (
    <div className="flex min-h-screen bg-background text-foreground">
      <Sidebar userRole={userRole} userEmail={userEmail} />
      <div className="flex flex-1 flex-col">
        <DashboardHeader name={userName} email={userEmail} />
        <SessionWatcher email={userEmail ?? undefined} />
        <main className="flex-1 overflow-auto bg-muted/40">
          <div className="mx-auto w-full max-w-6xl px-6 py-8">{children}</div>
        </main>
      </div>
    </div>
  );
}
