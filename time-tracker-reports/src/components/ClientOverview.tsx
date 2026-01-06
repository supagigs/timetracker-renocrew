'use client';

import Link from 'next/link';

type MemberStatus = 'active' | 'offline' | 'no-data';

type OverviewMember = {
  email: string;
  displayName: string;
  todayActive: string;
  last30Active: string;
  lastActiveLabel: string;
  status: MemberStatus;
};

type OverviewMetrics = {
  totalMembers: number;
  currentlyWorking: number;
  offlineMembers: number;
  noActivityMembers: number;
  totalActiveToday: string;
};

type ManagerOverviewProps = {
  managerName: string | null;
  managerEmail: string;
  members: OverviewMember[];
  metrics: OverviewMetrics;
};

export default function ManagerOverview({
  managerName,
  managerEmail,
  members,
  metrics,
}: ManagerOverviewProps) {
  const hasMembers = members.length > 0;
  const title = managerName ? `${managerName}'s team` : 'Your team';

  return (
    <div className="space-y-6">
      {/* HEADER SECTION */}
      <section className="rounded-2xl border border-border bg-card p-6 shadow-sm">
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-primary">
            Team overview
          </p>
          <h2 className="text-2xl font-bold text-foreground">{title}</h2>
          <p className="text-sm text-muted-foreground">
            Track how your employees are doing today and quickly dive into their detailed reports when
            you need more context.
          </p>
        </div>
      </section>

      {/* METRICS CARDS GRID */}
      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <OverviewCard title="Total team members" value={metrics.totalMembers.toString()} />
        <OverviewCard title="Currently working" value={metrics.currentlyWorking.toString()} tone="positive" />
        <OverviewCard title="Currently offline" value={metrics.offlineMembers.toString()} />
        <OverviewCard title="No activity yet" value={metrics.noActivityMembers.toString()} tone="warning" />
        <OverviewCard title="Total active today" value={metrics.totalActiveToday} />
      </section>

      {/* TEAM MEMBERS TABLE SECTION */}
      <section className="rounded-2xl border border-border bg-card p-6 shadow-sm">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between mb-4">
          <div>
            <h3 className="text-xl font-semibold text-foreground">Team members</h3>
            <p className="text-sm text-muted-foreground">
              Select an employee to open their detailed activity report.
            </p>
          </div>
        </div>

        {/* RESPONSIVE TABLE CONTAINER */}
        <div className="overflow-x-auto rounded-lg border border-border/40">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/30 text-left text-muted-foreground">
                <th className="px-4 py-3 font-semibold">Member</th>
                <th className="px-4 py-3 font-semibold">Today active</th>
                <th className="px-4 py-3 font-semibold hidden sm:table-cell">Last 30 days</th>
                <th className="px-4 py-3 font-semibold">Status</th>
                <th className="px-4 py-3 font-semibold hidden md:table-cell">Last activity</th>
                <th className="px-4 py-3 font-semibold text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/40">
              {hasMembers ? (
                members.map((member) => (
                  <tr
                    key={member.email}
                    className="transition-colors hover:bg-muted/40 active:bg-muted/60"
                  >
                    {/* MEMBER INFO */}
                    <td className="px-4 py-4 text-foreground">
                      <div className="font-semibold leading-tight">{member.displayName}</div>
                      <div className="text-xs text-muted-foreground truncate">{member.email}</div>
                    </td>

                    {/* TODAY ACTIVE */}
                    <td className="px-4 py-4 text-foreground font-medium">
                      {member.todayActive}
                    </td>

                    {/* LAST 30 DAYS (HIDDEN ON SMALL SCREENS) */}
                    <td className="px-4 py-4 text-foreground font-medium hidden sm:table-cell">
                      {member.last30Active}
                    </td>

                    {/* STATUS BADGE */}
                    <td className="px-4 py-4">
                      <StatusBadge status={member.status} />
                    </td>

                    {/* LAST ACTIVITY (HIDDEN ON SMALL SCREENS) */}
                    <td className="px-4 py-4 text-foreground text-xs hidden md:table-cell">
                      {member.lastActiveLabel}
                    </td>

                    {/* ACTION BUTTON */}
                    <td className="px-4 py-4 text-right">
                      <Link
                        href={`/reports/${encodeURIComponent(managerEmail)}?employee=${encodeURIComponent(member.email)}`}
                        className="inline-flex items-center justify-center rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground transition-colors hover:bg-primary/90 active:bg-primary/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-1 whitespace-nowrap"
                        aria-label={`View detailed report for ${member.displayName}`}
                      >
                        View report
                      </Link>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td
                    className="px-4 py-10 text-center text-muted-foreground text-sm"
                    colSpan={6}
                  >
                    <p className="font-medium mb-1">No employees assigned yet</p>
                    <p className="text-xs">
                      Invite team members from the desktop app to start tracking activity here.
                    </p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* MOBILE-ONLY INFO NOTE */}
        <div className="mt-3 text-xs text-muted-foreground sm:hidden">
          💡 <span className="ml-1">Scroll table horizontally for more details on smaller screens</span>
        </div>
      </section>
    </div>
  );
}

/**
 * OverviewCard Component - Displays metric cards
 */
function OverviewCard({
  title,
  value,
  tone = 'neutral',
}: {
  title: string;
  value: string;
  tone?: 'neutral' | 'positive' | 'warning';
}) {
  const baseClasses = 'rounded-2xl border p-4 shadow-sm transition-all hover:shadow-md';
  const toneClasses =
    tone === 'positive'
      ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
      : tone === 'warning'
      ? 'border-amber-200 bg-amber-50 text-amber-700'
      : 'border-border bg-card text-foreground';

  return (
    <div className={`${baseClasses} ${toneClasses}`}>
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground opacity-80">
        {title}
      </p>
      <p className="mt-3 text-3xl font-bold">{value}</p>
    </div>
  );
}

/**
 * StatusBadge Component - Shows member status
 */
function StatusBadge({ status }: { status: MemberStatus }) {
  const config: Record<MemberStatus, { label: string; classes: string }> = {
    active: {
      label: 'Active',
      classes: 'bg-emerald-100 text-emerald-700 border border-emerald-200',
    },
    offline: {
      label: 'Offline',
      classes: 'bg-slate-100 text-slate-700 border border-slate-200',
    },
    'no-data': {
      label: 'No activity',
      classes: 'bg-amber-100 text-amber-700 border border-amber-200',
    },
  };

  const { label, classes } = config[status];

  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${classes}`}>
      {label}
    </span>
  );
}
