"use client";

import { Calendar, AlertCircle, Clock } from "lucide-react";

const EVENTS = [
  {
    title: "Client Meeting - ABC Corp",
    time: "Today, 2:00 PM",
    iconBg: "bg-blue-100",
    iconColor: "text-blue-600",
    Icon: Calendar,
  },
  {
    title: "Tax Filing Deadline",
    time: "Tomorrow, 5:00 PM",
    iconBg: "bg-orange-100",
    iconColor: "text-orange-600",
    Icon: AlertCircle,
  },
  {
    title: "Review Session - XYZ Inc",
    time: "Friday, 10:00 AM",
    iconBg: "bg-sky-100",
    iconColor: "text-sky-600",
    Icon: Clock,
  },
];

export function UpcomingSchedule() {
  return (
    <section className="rounded-xl border border-border bg-card p-6 shadow-sm">
      <header className="mb-6 space-y-1">
        <h2 className="text-xl font-semibold text-foreground">Upcoming Schedule</h2>
        <p className="text-sm text-muted-foreground">Your meetings and deadlines</p>
      </header>

      <div className="space-y-4">
        {EVENTS.map(({ title, time, Icon, iconBg, iconColor }) => (
          <div
            key={title}
            className="flex items-center gap-4 rounded-lg border border-border p-4 transition-colors hover:bg-secondary"
          >
            <span className={`${iconBg} ${iconColor} flex h-10 w-10 items-center justify-center rounded-lg`}>
              <Icon size={18} />
            </span>
            <div>
              <p className="text-sm font-semibold text-foreground">{title}</p>
              <p className="text-xs text-muted-foreground">{time}</p>
            </div>
          </div>
        ))}
      </div>

      <button
        type="button"
        className="mt-6 w-full rounded-lg border border-border py-2 text-sm font-semibold text-foreground transition-colors hover:bg-secondary"
      >
        View Calendar
      </button>
    </section>
  );
}


