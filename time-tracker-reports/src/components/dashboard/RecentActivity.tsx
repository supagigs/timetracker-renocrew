"use client";

import { CheckCircle, Star, FileCheck } from "lucide-react";

const ACTIVITIES = [
  {
    title: "Completed tax filing for ABC Corporation",
    time: "2 hours ago",
    Icon: CheckCircle,
    bg: "bg-emerald-100",
    color: "text-emerald-600",
  },
  {
    title: "Received 5-star review from XYZ Inc",
    time: "5 hours ago",
    Icon: Star,
    bg: "bg-amber-100",
    color: "text-amber-500",
  },
  {
    title: "Submitted audit report for Smith Enterprises",
    time: "1 day ago",
    Icon: FileCheck,
    bg: "bg-blue-100",
    color: "text-blue-600",
  },
];

export function RecentActivity() {
  return (
    <section className="mt-8 rounded-xl border border-border bg-card p-6 shadow-sm">
      <header className="mb-6 space-y-1">
        <h2 className="text-xl font-semibold text-foreground">Recent Activity</h2>
        <p className="text-sm text-muted-foreground">Your latest updates and achievements</p>
      </header>

      <div className="space-y-4">
        {ACTIVITIES.map(({ title, time, Icon, bg, color }) => (
          <div key={title} className="flex items-start gap-4">
            <span className={`${bg} ${color} mt-0.5 flex h-10 w-10 items-center justify-center rounded-full`}>
              <Icon size={18} />
            </span>
            <div className="flex-1">
              <p className="text-sm font-medium text-foreground">{title}</p>
              <p className="text-xs text-muted-foreground">{time}</p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}




