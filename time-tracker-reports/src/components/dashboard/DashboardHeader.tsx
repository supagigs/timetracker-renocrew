"use client";

import { ChevronRight, LogOut } from "lucide-react";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";

type DashboardHeaderProps = {
  name?: string | null;
  email?: string | null;
  showBreadcrumb?: boolean;
  showAccountControls?: boolean;
};

export function DashboardHeader({
  name,
  email,
  showBreadcrumb = true,
  showAccountControls = true,
}: DashboardHeaderProps) {
  const displayName = name || "Account";
  const initials = createInitials(displayName);
  const logoutHref = "/logout?origin=header";

  return (
    <header className="flex items-center justify-between border-b border-border bg-card px-8 py-4">
      {showBreadcrumb ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <ChevronRight size={16} />
          <span>Dashboard</span>
        </div>
      ) : (
        <span />
      )}

      {showAccountControls ? (
        <div className="flex items-center gap-3">
          <div className="text-right">
            <div className="text-sm font-semibold leading-tight text-foreground">{displayName}</div>
            {email ? (
              <div className="text-xs text-muted-foreground">{email}</div>
            ) : null}
          </div>
          <details className="group relative">
            <summary className="list-none cursor-pointer rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40">
              <Avatar className="h-10 w-10 uppercase transition group-open:shadow-lg">
                <AvatarImage src={undefined} alt={displayName} className="hidden" />
                <AvatarFallback>{initials}</AvatarFallback>
              </Avatar>
            </summary>
            <div className="invisible absolute right-0 z-50 mt-3 w-48 rounded-xl border border-border bg-card/95 p-3 text-sm opacity-0 shadow-lg backdrop-blur-md transition group-open:visible group-open:opacity-100">
              <div className="pb-3 text-xs text-muted-foreground">
                <div className="text-sm font-semibold text-foreground">{displayName}</div>
                {email && <div>{email}</div>}
              </div>
              <div className="h-px bg-border/70" />
              <a
                href={logoutHref}
                className="mt-3 flex items-center gap-2 rounded-lg px-3 py-2 font-medium text-destructive transition hover:bg-destructive/10"
              >
                <LogOut size={16} />
                <span>Logout</span>
              </a>
            </div>
          </details>
        </div>
      ) : (
        <span />
      )}
    </header>
  );
}

function createInitials(name: string) {
  const parts = name
    .split(" ")
    .map((part) => part.trim())
    .filter(Boolean);

  if (parts.length === 0) return "U";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}


