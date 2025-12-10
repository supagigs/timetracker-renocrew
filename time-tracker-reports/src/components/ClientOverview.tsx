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

type ClientOverviewProps = {
  clientName: string | null;
  clientEmail: string;
  members: OverviewMember[];
  metrics: OverviewMetrics;
};

export default function ClientOverview({
  clientName,
  clientEmail,
  members,
  metrics,
}: ClientOverviewProps) {
  const hasMembers = members.length > 0;
  const title = clientName ? `${clientName}'s team` : 'Your team';

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-border bg-card p-6 shadow-sm">
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-primary">Team overview</p>
          <h2 className="text-2xl font-bold text-foreground">{title}</h2>
          <p className="text-sm text-muted-foreground">
            Track how your freelancers are doing today and quickly dive into their detailed reports when
            you need more context.
          </p>
        </div>
      </section>

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <OverviewCard title="Total team members" value={metrics.totalMembers.toString()} />
        <OverviewCard title="Currently working" value={metrics.currentlyWorking.toString()} tone="positive" />
        <OverviewCard title="Currently offline" value={metrics.offlineMembers.toString()} />
        <OverviewCard title="No activity yet" value={metrics.noActivityMembers.toString()} tone="warning" />
        <OverviewCard title="Total active today" value={metrics.totalActiveToday} />
      </section>

      <section className="rounded-2xl border border-border bg-card p-6 shadow-sm">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h3 className="text-xl font-semibold text-foreground">Team members</h3>
            <p className="text-sm text-muted-foreground">
              Select a freelancer to open their detailed activity report.
            </p>
          </div>
        </div>

        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-muted-foreground">
                <th className="px-4 py-3 font-medium">Member</th>
                <th className="px-4 py-3 font-medium">Today active</th>
                <th className="px-4 py-3 font-medium">Last 30 days</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Last activity</th>
                <th className="px-4 py-3 font-medium text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {hasMembers ? (
                members.map((member) => (
                  <tr
                    key={member.email}
                    className="border-b border-border/60 transition-colors hover:bg-secondary/60"
                  >
                    <td className="px-4 py-3 text-foreground">
                      <div className="font-semibold">{member.displayName}</div>
                      <div className="text-xs text-muted-foreground">{member.email}</div>
                    </td>
                    <td className="px-4 py-3 text-foreground">{member.todayActive}</td>
                    <td className="px-4 py-3 text-foreground">{member.last30Active}</td>
                    <td className="px-4 py-3"><StatusBadge status={member.status} /></td>
                    <td className="px-4 py-3 text-foreground">{member.lastActiveLabel}</td>
                    <td className="px-4 py-3 text-right">
                    <Link
                      href={`/reports/${encodeURIComponent(clientEmail)}?freelancer=${encodeURIComponent(member.email)}`}
                      className="inline-flex w-full items-center justify-center rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground transition hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 md:w-auto"
                    >
                        View report
                      </Link>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td className="px-4 py-10 text-center text-muted-foreground" colSpan={6}>
                    No freelancers are assigned yet. Invite team members from the desktop app to start
                    tracking activity here.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function OverviewCard({
  title,
  value,
  tone = 'neutral',
}: {
  title: string;
  value: string;
  tone?: 'neutral' | 'positive' | 'warning';
}) {
  const baseClasses = 'rounded-2xl border p-4 shadow-sm';
  const toneClasses =
    tone === 'positive'
      ? 'border-emerald-100 bg-emerald-50 text-emerald-700'
      : tone === 'warning'
      ? 'border-amber-100 bg-amber-50 text-amber-700'
      : 'border-border bg-card text-foreground';

  return (
    <div className={`${baseClasses} ${toneClasses}`}>
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</p>
      <p className="mt-2 text-2xl font-bold">{value}</p>
    </div>
  );
}

function StatusBadge({ status }: { status: MemberStatus }) {
  const config: Record<MemberStatus, { label: string; classes: string }> = {
    active: {
      label: 'Active',
      classes: 'bg-emerald-100 text-emerald-700',
    },
    offline: {
      label: 'Offline',
      classes: 'bg-slate-200 text-slate-700',
    },
    'no-data': {
      label: 'No activity',
      classes: 'bg-amber-100 text-amber-700',
    },
  };

  const { label, classes } = config[status];

  return (
    <span className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ${classes}`}>
      {label}
    </span>
  );
}
