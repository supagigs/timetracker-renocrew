"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Compass,
  FolderOpen,
  FileText,
  MessageSquare,
  CreditCard,
  Settings,
  Users,
  BarChart3,
  CalendarClock,
} from "lucide-react";
import type { ReactNode } from "react";

type NavItemConfig = {
  icon: ReactNode;
  label: string;
  href: string;
};

const DEFAULT_NAV_ITEMS = (
  pathname: string,
): Array<NavItemConfig & { active: boolean }> => [
  { icon: <LayoutDashboard size={20} />, label: "Dashboard", href: "/", active: pathname === "/" },
  { icon: <Compass size={20} />, label: "Discover", href: "#", active: false },
  { icon: <FolderOpen size={20} />, label: "My Projects", href: "#", active: false },
  { icon: <FileText size={20} />, label: "Contracts", href: "#", active: false },
  { icon: <MessageSquare size={20} />, label: "Messages", href: "#", active: false },
  { icon: <CreditCard size={20} />, label: "Payments & Invoices", href: "#", active: false },
  { icon: <Settings size={20} />, label: "Settings", href: "#", active: false },
];

const buildClientNavItems = (
  pathname: string,
  userEmail?: string | null,
): Array<NavItemConfig & { active: boolean }> => {
  if (!userEmail) {
    return DEFAULT_NAV_ITEMS(pathname);
  }

  const encodedEmail = encodeURIComponent(userEmail);
  const basePath = `/reports/${encodedEmail}`;

  const items: NavItemConfig[] = [
    { icon: <LayoutDashboard size={20} />, label: "Overview", href: basePath },
    { icon: <FolderOpen size={20} />, label: "Projects", href: `${basePath}/projects` },
    { icon: <Users size={20} />, label: "Freelancers", href: `${basePath}/freelancers` },
    { icon: <BarChart3 size={20} />, label: "Reports", href: `${basePath}/reports` },
    { icon: <CalendarClock size={20} />, label: "Timesheet", href: `${basePath}/timesheet` },
  ];

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
  const navItems = userRole === "Client"
    ? buildClientNavItems(pathname, userEmail ?? undefined)
    : DEFAULT_NAV_ITEMS(pathname);

  return (
    <aside className="hidden h-screen w-64 flex-col border-r border-border bg-sidebar px-6 pb-6 pt-6 md:flex">
      <div className="mb-8 flex items-center gap-3">
        <Image
          src="/supagigs-logo.png"
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


