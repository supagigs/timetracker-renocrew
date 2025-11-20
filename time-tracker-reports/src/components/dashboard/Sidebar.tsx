"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
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
  normalizedRole: "client" | "freelancer" | null,
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

  if (normalizedRole === "client") {
    items.push({
      icon: <Users size={20} />,
      label: "Freelancers",
      href: `${basePath}/freelancers`,
    });
  }

  items.push(
    { icon: <FolderOpen size={20} />, label: "Projects", href: `${basePath}/projects` },
    { icon: <BarChart3 size={20} />, label: "Reports", href: `${basePath}/reports` },
    ...(normalizedRole === "freelancer"
      ? [{ icon: <CalendarClock size={20} />, label: "Timesheet", href: `${basePath}/timesheet` }]
      : []),
    { icon: <Monitor size={20} />, label: "Screenshots", href: `${basePath}/screenshots` },
    ...(normalizedRole === "client"
      ? [
          {
            icon: <SlidersHorizontal size={20} />,
            label: "Change screenshot interval",
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
  const normalizedRole = userRole ? userRole.trim().toLowerCase() : null;
  const normalizedEmail = userEmail ? userEmail.trim().toLowerCase() : null;
  const roleForNav: "client" | "freelancer" | null =
    normalizedRole === "client" ? "client" : normalizedRole === "freelancer" ? "freelancer" : "freelancer";

  const navItems = buildReportsNavItems(pathname, roleForNav, normalizedEmail ?? undefined);

  return (
    <aside className="hidden h-screen w-64 flex-col border-r border-border bg-sidebar px-6 pb-6 pt-6 md:flex">
      <div className="mb-8 flex items-center gap-3">
        <Image
          src="/SupagigsIcon.ico"
          alt="Supagigs logo"
          width={36}
          height={36}
          className="h-9 w-9 rounded-xl object-contain"
          priority
        />
        <span className="text-xl font-bold tracking-tight text-sidebar-foreground">Supagigs</span>
      </div>

      <nav className="flex-1 space-y-1">
        {navItems.map((item) => (
          <NavItem key={item.label} icon={item.icon} label={item.label} href={item.href} active={item.active} />
        ))}
      </nav>
    </aside>
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


