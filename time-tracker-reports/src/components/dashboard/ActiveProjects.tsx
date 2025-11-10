"use client";

import { ChevronRight } from "lucide-react";

const PROJECTS = [
  { name: "Tax Filing - ABC Corp", company: "ABC Corporation", daysLeft: "2 days" },
  { name: "Audit Review - XYZ Inc", company: "XYZ Inc", daysLeft: "5 days" },
  { name: "Financial Planning", company: "Smith Enterprises", daysLeft: "1 week" },
];

export function ActiveProjects() {
  return (
    <section className="rounded-xl border border-border bg-card p-6 shadow-sm">
      <header className="mb-6 space-y-1">
        <h2 className="text-xl font-semibold text-foreground">Active Projects</h2>
        <p className="text-sm text-muted-foreground">Your current client engagements</p>
      </header>

      <div className="space-y-4">
        {PROJECTS.map((project) => (
          <button
            key={project.name}
            type="button"
            className="flex w-full items-center justify-between rounded-lg border border-border px-4 py-4 text-left transition-colors hover:bg-secondary"
          >
            <div>
              <p className="text-sm font-semibold text-foreground">{project.name}</p>
              <p className="text-xs text-muted-foreground">{project.company}</p>
            </div>
            <div className="flex items-center gap-3 text-sm text-muted-foreground">
              <span>{project.daysLeft}</span>
              <ChevronRight size={18} />
            </div>
          </button>
        ))}
      </div>

      <button
        type="button"
        className="mt-6 w-full rounded-lg border border-border py-2 text-sm font-semibold text-foreground transition-colors hover:bg-secondary"
      >
        View All Projects
      </button>
    </section>
  );
}




