"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { determineRoleFromRoleProfile } from "@/lib/frappeClient";
import {
  LayoutDashboard,
  FolderOpen,
  Users,
  BarChart3,
  Monitor,
  CalendarClock,
  SlidersHorizontal,
} from "lucide-react";
import type { ReactNode } from "react";

type NavItemConfig = {
  icon: ReactNode;
  label: string;
  href: string;
};

const buildReportsNavItems = (
  pathname: string,
  normalizedRole: "manager" | "employee" | null,
  normalizedEmail?: string | null,
): Array<NavItemConfig & { active: boolean }> => {
  if (!normalizedEmail) {
    return [];
  }

  const encodedEmail = encodeURIComponent(normalizedEmail);
  const basePath = `/reports/${encodedEmail}`;

  const items: NavItemConfig[] = [
    { icon: <LayoutDashboard size={20} />, label: "Overview", href: basePath },
  ];

  if (normalizedRole === "manager") {
    items.push({
      icon: <Users size={20} />,
      label: "Users",
      href: `${basePath}/employees`,
    });
  }

  items.push(
    { icon: <BarChart3 size={20} />, label: "Reports", href: `${basePath}/reports` },
    { icon: <FolderOpen size={20} />, label: "Projects", href: `${basePath}/projects` },
    { icon: <CalendarClock size={20} />, label: "Timesheets", href: `${basePath}/timesheet` },
    { icon: <Monitor size={20} />, label: "Screenshots", href: `${basePath}/screenshots` },
    ...(normalizedRole === "manager"
      ? [
          {
            icon: <SlidersHorizontal size={20} />,
            label: "Settings",
            href: `${basePath}/screenshot-interval`,
          },
        ]
      : []),
  );

  return items.map((item) => ({
    ...item,
    active: item.href === basePath
      ? pathname === basePath
      : pathname.startsWith(item.href),
  }));
};

export function Sidebar({
  userRole,
  userEmail,
}: {
  userRole?: string | null;
  userEmail?: string | null;
}) {
  const pathname = usePathname();
  const normalizedEmail = userEmail ? userEmail.trim().toLowerCase() : null;
  
  // Convert role_profile_name to Manager/Employee for navigation logic.
  // If role is not yet known, leave it null so we don't default to "employee" and hide manager tabs.
  const convertedRole = userRole ? determineRoleFromRoleProfile(userRole) : null;
  const roleForNav: "manager" | "employee" | null =
    convertedRole === "Manager" ? "manager" : convertedRole === "Employee" ? "employee" : null;

  const navItems = buildReportsNavItems(pathname, roleForNav, normalizedEmail ?? undefined);

  return (
    <>
      {/* Compact rail for small screens (icons only) */}
      <aside className="flex h-screen w-16 flex-col border-r border-border bg-sidebar px-2 pb-4 pt-4 md:hidden">
        <div className="mb-6 flex items-center justify-center">
          <img
            src="/android-chrome-192x192.png"
            alt="Renocrew Solutions logo"
            width={32}
            height={32}
            className="h-8 w-8 rounded-lg object-contain"
          />
        </div>
        <nav className="flex-1 space-y-1">
          {navItems.map((item) => (
            <Link
              key={item.label}
              href={item.href}
              className={`flex w-full items-center justify-center rounded-lg p-2 transition-colors ${
                item.active ? "bg-secondary/70 text-foreground" : "text-muted-foreground hover:bg-secondary/60"
              }`}
              aria-label={item.label}
              title={item.label}
            >
              {item.icon}
            </Link>
          ))}
        </nav>
      </aside>
  
      {/* Full sidebar for md and up */}
      <aside className="hidden h-screen w-64 flex-col border-r border-border bg-sidebar px-6 pb-6 pt-6 md:flex">
        <div className="mb-8 flex items-center gap-3">
          <img
            src="/android-chrome-192x192.png"
            alt="Renocrew Solutions logo"
            width={36}
            height={36}
            className="h-9 w-9 rounded-xl object-contain"
          />
          <span className="text-xl font-bold tracking-tight text-sidebar-foreground">Renocrew Solutions</span>
        </div>
        <nav className="flex-1 space-y-1">
          {navItems.map((item) => (
            <NavItem key={item.label} icon={item.icon} label={item.label} href={item.href} active={item.active} />
          ))}
        </nav>
      </aside>
    </>
  );
}

function NavItem({ icon, label, href, active }: NavItemConfig & { active?: boolean }) {
  return (
    <Link
      href={href}
      className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm font-medium transition-colors ${
        active ? "bg-secondary/70 text-foreground" : "text-muted-foreground hover:bg-secondary/60"
      }`}
    >
      {icon}
      <span>{label}</span>
    </Link>
  );
}