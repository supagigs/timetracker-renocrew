import SummaryCard from '@/components/SummaryCard';
import WeeklyActivityChart from '@/components/WeeklyActivityChart';
import FreelancerSelector from '@/components/FreelancerSelector';
import { DashboardShell } from '@/components/dashboard';
import { createServerSupabaseClient } from '@/lib/supabaseServer';
import { fetchUserProfile } from '@/lib/userProfile';
import { redirect } from 'next/navigation';
import { format } from 'date-fns';

type TimeSession = {
  id: number;
  session_date: string;
  start_time: string;
  end_time: string | null;
  active_duration: number;
  break_duration: number;
  idle_duration: number | null;
  project_id: number | null;
  projects?: {
    id: number;
    project_name: string;
  } | null;
};

function formatHoursMinutes(decimalHours: number): string {
  const hours = Math.floor(decimalHours);
  const minutes = Math.round((decimalHours - hours) * 60);

  if (minutes >= 60) {
    return `${hours + 1}h 0m`;
  }

  if (hours === 0 && minutes === 0) {
    return '0h 0m';
  }
  if (hours === 0) {
    return `${minutes}m`;
  }
  if (minutes === 0) {
    return `${hours}h`;
  }
  return `${hours}h ${minutes}m`;
}

function formatSecondsToHoursMinutes(totalSeconds: number): string {
  const totalMinutes = Math.round(totalSeconds / 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (hours === 0 && minutes === 0) {
    return '0h 0m';
  }
  if (hours === 0) {
    return `${minutes}m`;
  }
  if (minutes === 0) {
    return `${hours}h`;
  }
  return `${hours}h ${minutes}m`;
}

function buildMonthlySummary(sessions: TimeSession[]) {
  const daily = new Map<string, { active: number; idle: number }>();

  sessions.forEach((session) => {
    const date = session.session_date;
    if (!daily.has(date)) {
      daily.set(date, { active: 0, idle: 0 });
    }
    const entry = daily.get(date)!;
    entry.active += session.active_duration ?? 0;
    entry.idle += session.idle_duration ?? 0;
  });

  const labels: string[] = [];
  const activeHours: number[] = [];
  const idleHours: number[] = [];

  const now = new Date();
  for (let i = 29; i >= 0; i -= 1) {
    const date = new Date(now);
    date.setDate(now.getDate() - i);
    const key = format(date, 'yyyy-MM-dd');
    const label = format(date, 'MMM dd');
    labels.push(label);
    const entry = daily.get(key);
    activeHours.push((entry?.active ?? 0) / 3600);
    idleHours.push((entry?.idle ?? 0) / 3600);
  }

  const totalActiveSeconds = sessions.reduce((sum, session) => sum + (session.active_duration ?? 0), 0);
  const totalIdleSeconds = sessions.reduce((sum, session) => sum + (session.idle_duration ?? 0), 0);
  const totalTimeSeconds = totalActiveSeconds + totalIdleSeconds;
  const avgIdlePercent = totalTimeSeconds > 0 ? (totalIdleSeconds / totalTimeSeconds) * 100 : 0;

  const daysWithWork = activeHours.filter((h) => h > 0).length;
  const avgDailyHours = daysWithWork > 0
    ? (totalActiveSeconds / 3600) / daysWithWork
    : (totalActiveSeconds / 3600) / 30;

  return {
    labels,
    activeHours,
    idleHours,
    totalHours: totalActiveSeconds / 3600,
    totalIdleSeconds,
    avgIdlePercent,
    avgDailyHours,
  };
}

function buildProjectSummary(sessions: TimeSession[]) {
  const projectMap = new Map<number, { name: string; totalSeconds: number }>();

  sessions.forEach((session) => {
    if (session.project_id && session.projects) {
      const projectId = session.project_id;
      const projectName = session.projects.project_name || 'Untitled project';
      const activeDuration = session.active_duration ?? 0;

      if (projectMap.has(projectId)) {
        const existing = projectMap.get(projectId)!;
        projectMap.set(projectId, {
          name: projectName,
          totalSeconds: existing.totalSeconds + activeDuration,
        });
      } else {
        projectMap.set(projectId, {
          name: projectName,
          totalSeconds: activeDuration,
        });
      }
    }
  });

  return Array.from(projectMap.entries())
    .map(([id, data]) => ({
      id,
      name: data.name,
      totalHours: data.totalSeconds / 3600,
      totalSeconds: data.totalSeconds,
    }))
    .sort((a, b) => b.totalHours - a.totalHours);
}

async function fetchLastMonthSessions(userEmail: string): Promise<TimeSession[]> {
  const supabase = createServerSupabaseClient();

  const endDate = new Date();
  const startDate = new Date();
  startDate.setDate(endDate.getDate() - 29);

  const startDateStr = format(startDate, 'yyyy-MM-dd');
  const endDateStr = format(endDate, 'yyyy-MM-dd');

  const { data, error } = await supabase
    .from('time_sessions')
    .select(
      `
        *,
        projects (
          id,
          project_name
        )
      `,
    )
    .eq('user_email', userEmail)
    .gte('session_date', startDateStr)
    .lte('session_date', endDateStr)
    .order('start_time', { ascending: false });

  if (error) {
    console.error('[reports-page] Failed to load sessions', error);
    return [];
  }

  return (data ?? []) as TimeSession[];
}

export default async function ReportsAnalyticsPage({
  params,
  searchParams,
}: {
  params: Promise<{ userEmail: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ userEmail }, resolvedSearchParams] = await Promise.all([params, searchParams]);
  const decodedEmail = decodeURIComponent(userEmail);
  const profile = await fetchUserProfile(decodedEmail);

  if (!profile) {
    return (
      <DashboardShell userName={decodedEmail} userEmail={decodedEmail} userRole={null}>
        <div className="space-y-6">
          <section className="rounded-2xl border border-border bg-card p-6 text-center shadow-sm">
            <h1 className="text-2xl font-semibold text-foreground">Account not found</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              We couldn&apos;t locate your account details. Please ensure you are logged in with the correct email.
            </p>
          </section>
        </div>
      </DashboardShell>
    );
  }

  const isClient = profile.category === 'Client';
  const isFreelancer = profile.category === 'Freelancer';

  const requestedFreelancer = (() => {
    const value = resolvedSearchParams?.freelancer;
    if (Array.isArray(value)) {
      return value[0];
    }
    return value ?? null;
  })();

  let targetEmail = profile.email;

  if (isClient) {
    if (requestedFreelancer) {
      targetEmail = requestedFreelancer;
    }
  } else if (!isFreelancer) {
    // Unsupported role, redirect to overview
    redirect(`/reports/${encodeURIComponent(profile.email)}`);
  }

  const sessions = await fetchLastMonthSessions(targetEmail);
  const summary = buildMonthlySummary(sessions);
  const projectSummary = buildProjectSummary(sessions);

  const todayStr = format(new Date(), 'yyyy-MM-dd');
  const todayActiveSeconds = sessions
    .filter((session) => session.session_date === todayStr)
    .reduce((total, session) => total + (session.active_duration ?? 0), 0);

  return (
    <DashboardShell
      userName={profile.displayName || profile.email}
      userEmail={profile.email}
      userRole={profile.category}
    >
      <div className="space-y-6">
        <header className="space-y-2">
          <h1 className="text-3xl font-bold text-foreground">
            Reports
          </h1>
          <p className="text-sm text-muted-foreground">
            Detailed analytics for the last 30 days{isClient && requestedFreelancer ? ` · ${requestedFreelancer}` : ''}.
          </p>
        </header>

        {isClient && (
          <section className="rounded-2xl border border-border bg-card p-6 shadow-sm">
            <p className="text-sm text-muted-foreground">
              Switch between your assigned freelancers to review their recent activity.
            </p>
            <div className="mt-6">
              <FreelancerSelector
                clientEmail={profile.email}
                currentFreelancerEmail={requestedFreelancer ?? undefined}
                redirectBasePath={`/reports/${encodeURIComponent(profile.email)}/reports`}
                autoSelectFirst={false}
              />
            </div>
          </section>
        )}

        <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <SummaryCard title="Total Work (30 days)" value={formatHoursMinutes(summary.totalHours)} />
          <SummaryCard title="Avg. Daily Work" value={formatHoursMinutes(summary.avgDailyHours)} />
          <SummaryCard title="Avg. Idle %" value={`${summary.avgIdlePercent.toFixed(1)}%`} />
          <SummaryCard title="Active Today" value={formatSecondsToHoursMinutes(todayActiveSeconds)} />
        </section>

        {projectSummary.length > 0 && (
          <section className="rounded-2xl border border-border bg-card p-6 shadow-sm">
            <h2 className="mb-4 text-xl font-semibold text-foreground">Time by Project (Last 30 Days)</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">Project Name</th>
                    <th className="px-4 py-3 text-right font-medium text-muted-foreground">Total Time</th>
                  </tr>
                </thead>
                <tbody>
                  {projectSummary.map((project) => (
                    <tr key={project.id} className="border-b border-border/60 transition-colors hover:bg-secondary/60">
                      <td className="px-4 py-3 text-foreground">{project.name}</td>
                      <td className="px-4 py-3 text-right font-semibold text-emerald-600">
                        {formatHoursMinutes(project.totalHours)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        <section className="rounded-2xl border border-border bg-card p-6 shadow-sm">
          <h2 className="mb-4 text-xl font-semibold text-foreground">Daily Activity (Last 30 Days)</h2>
          <WeeklyActivityChart
            labels={summary.labels}
            activeHours={summary.activeHours}
            idleHours={summary.idleHours}
          />
        </section>

        {projectSummary.length > 0 && (
          <section className="rounded-2xl border border-border bg-card p-6 shadow-sm">
            <h2 className="mb-4 text-xl font-semibold text-foreground">Time Distribution by Project</h2>
            <WeeklyActivityChart
              labels={projectSummary.map((project) => project.name)}
              activeHours={projectSummary.map((project) => project.totalHours)}
              idleHours={[]}
            />
          </section>
        )}
      </div>
    </DashboardShell>
  );
}

