"use client";

import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";

import { DashboardHeader } from "./DashboardHeader";
import { Sidebar } from "./Sidebar";

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
        <main className="flex-1 overflow-auto bg-muted/40">
          <div className="mx-auto w-full max-w-6xl px-6 py-8">{children}</div>
        </main>
      </div>
    </div>
  );
}
