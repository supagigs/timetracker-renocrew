"use client";

import { ChevronRight } from "lucide-react";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";

type DashboardHeaderProps = {
  name?: string | null;
  email?: string | null;
};

export function DashboardHeader({
  name,
  email,
}: DashboardHeaderProps) {
  const displayName = name || "Account";
  const initials = createInitials(displayName);

  return (
    <header className="flex items-center justify-between border-b border-border bg-card px-8 py-4">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <ChevronRight size={16} />
        <span>Dashboard</span>
      </div>

      <div className="flex items-center gap-3">
        <div className="text-right">
          <div className="text-sm font-semibold leading-tight text-foreground">{displayName}</div>
          {email ? (
            <div className="text-xs text-muted-foreground">{email}</div>
          ) : null}
        </div>
        <Avatar className="h-10 w-10 uppercase">
          <AvatarImage src={undefined} alt={displayName} className="hidden" />
          <AvatarFallback>{initials}</AvatarFallback>
        </Avatar>
      </div>
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


