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
  Monitor,
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

const buildReportsNavItems = (
  pathname: string,
  normalizedRole: "client" | "freelancer" | null,
  normalizedEmail?: string | null,
): Array<NavItemConfig & { active: boolean }> => {
  if (!normalizedEmail) {
    return DEFAULT_NAV_ITEMS(pathname);
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
    { icon: <Monitor size={20} />, label: "Screenshots", href: `${basePath}/screenshots` },
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
  const hasReportsNavigation = normalizedRole === "client" || normalizedRole === "freelancer";
  const navItems = hasReportsNavigation
    ? buildReportsNavItems(
        pathname,
        normalizedRole as "client" | "freelancer",
        normalizedEmail ?? undefined,
      )
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


