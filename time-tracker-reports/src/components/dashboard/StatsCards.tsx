"use client";

import { DollarSign, FolderIcon, Clock, Star } from "lucide-react";

const STATS = [
  {
    title: "Total Earnings",
    value: "$12,450",
    change: "+20.1% from last month",
    Icon: DollarSign,
    accent: "bg-blue-100 text-blue-600",
  },
  {
    title: "Active Projects",
    value: "8",
    change: "3 due this week",
    Icon: FolderIcon,
    accent: "bg-violet-100 text-violet-600",
  },
  {
    title: "Hours This Month",
    value: "142",
    change: "+12% from last month",
    Icon: Clock,
    accent: "bg-orange-100 text-orange-600",
  },
  {
    title: "Client Rating",
    value: "4.9",
    change: "Based on 24 reviews",
    Icon: Star,
    accent: "bg-pink-100 text-pink-600",
  },
];

export function StatsCards() {
  return (
    <section className="grid gap-6 md:grid-cols-2 xl:grid-cols-4">
      {STATS.map(({ title, value, change, Icon, accent }) => (
        <article key={title} className="rounded-xl border border-border bg-card p-6 shadow-sm">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm font-medium text-muted-foreground">{title}</p>
              <p className="mt-2 text-3xl font-semibold text-foreground">{value}</p>
              <p className="mt-2 text-xs text-muted-foreground">{change}</p>
            </div>
            <span className={`rounded-lg p-3 ${accent}`}>
              <Icon size={20} />
            </span>
          </div>
        </article>
      ))}
    </section>
  );
}




