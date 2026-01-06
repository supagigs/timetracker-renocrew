import SummaryCard from '@/components/SummaryCard';
import WeeklyActivityChart from '@/components/WeeklyActivityChart';
import EmployeeSelector from '@/components/FreelancerSelector';
import { DashboardShell } from '@/components/dashboard';
import { ReportsRealtimeWatcher } from '@/components/ReportsRealtimeWatcher';
import { createServerSupabaseClient } from '@/lib/supabaseServer';
import { fetchUserProfile } from '@/lib/userProfile';
import { redirect } from 'next/navigation';
import { format } from 'date-fns';
import { type DateRange, normalizeDateRange } from '@/lib/dateRange';
import { determineRoleFromRoleProfile } from '@/lib/frappeClient';

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

function buildMonthlySummary(sessions: TimeSession[], dateRange: DateRange) {
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

  const startDate = new Date(dateRange.start);
  const endDate = new Date(dateRange.end);

  let daysCount = 0;
  for (
    let cursor = new Date(startDate);
    cursor <= endDate;
    cursor.setDate(cursor.getDate() + 1)
  ) {
    const key = format(cursor, 'yyyy-MM-dd');
    const label = format(cursor, 'MMM dd');
    labels.push(label);
    const entry = daily.get(key);
    activeHours.push((entry?.active ?? 0) / 3600);
    idleHours.push((entry?.idle ?? 0) / 3600);
    daysCount += 1;
  }

  const totalActiveSeconds = sessions.reduce((sum, session) => sum + (session.active_duration ?? 0), 0);
  const totalIdleSeconds = sessions.reduce((sum, session) => sum + (session.idle_duration ?? 0), 0);
  const totalTimeSeconds = totalActiveSeconds + totalIdleSeconds;
  const avgIdlePercent = totalTimeSeconds > 0 ? (totalIdleSeconds / totalTimeSeconds) * 100 : 0;

  const daysWithWork = activeHours.filter((h) => h > 0).length;
  const denominator = daysWithWork > 0 ? daysWithWork : Math.max(daysCount, 1);
  const avgDailyHours = (totalActiveSeconds / 3600) / denominator;

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

function buildProjectSummary(sessions: TimeSession[], projectNamesMap: Map<string, string>) {
  const projectMap = new Map<string, { name: string; totalSeconds: number }>();

  sessions.forEach((session) => {
    const projectId = (session as any).frappe_project_id;
    if (projectId) {
      const projectName = projectNamesMap.get(projectId) || projectId || 'Untitled project';
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
    .map(([id, data], index) => ({
      id: index + 1,
      name: data.name,
      totalHours: data.totalSeconds / 3600,
      totalSeconds: data.totalSeconds,
    }))
    .sort((a, b) => b.totalHours - a.totalHours);
}

async function fetchSessionsInRange(userEmail: string, dateRange: DateRange): Promise<TimeSession[]> {
  const supabase = createServerSupabaseClient();

  const { data, error } = await supabase
    .from('time_sessions')
    .select('*')
    .eq('user_email', userEmail)
    .gte('session_date', dateRange.start)
    .lte('session_date', dateRange.end)
    .order('start_time', { ascending: false });

  if (error) {
    console.error('[reports-page] Failed to load sessions', error);
    return [];
  }

  return (data ?? []) as TimeSession[];
}

async function fetchProjectNamesMap(supabase: ReturnType<typeof createServerSupabaseClient>, projectIds: string[]): Promise<Map<string, string>> {
  if (projectIds.length === 0) {
    return new Map();
  }

  const uniqueProjectIds = [...new Set(projectIds.filter(Boolean))];
  if (uniqueProjectIds.length === 0) {
    return new Map();
  }

  const { data: projects, error } = await supabase
    .from('projects')
    .select('frappe_project_id, project_name')
    .in('frappe_project_id', uniqueProjectIds);

  if (error) {
    console.warn('[reports-page] Failed to load project names:', error);
    return new Map();
  }

  const projectMap = new Map<string, string>();
  (projects || []).forEach((project: any) => {
    if (project.frappe_project_id && project.project_name) {
      projectMap.set(project.frappe_project_id, project.project_name);
    }
  });

  return projectMap;
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

  // Convert role_profile_name to Manager/Employee for logic
  const convertedRole = determineRoleFromRoleProfile(profile.role);
  const isManager = convertedRole === 'Manager';
  const isEmployee = convertedRole === 'Employee';

  const requestedEmployee = (() => {
    const value = resolvedSearchParams?.employee;
    if (Array.isArray(value)) {
      return value[0];
    }
    return value ?? null;
  })();

  let targetEmail = profile.email;

  if (isManager) {
    if (requestedEmployee) {
      targetEmail = requestedEmployee;
    }
  } else if (!isEmployee) {
    // Unsupported role, redirect to overview
    redirect(`/reports/${encodeURIComponent(profile.email)}`);
  }

  const dateRange = normalizeDateRange(resolvedSearchParams);

  const sessions = await fetchSessionsInRange(targetEmail, dateRange);
  
  // Fetch project names
  const supabase = createServerSupabaseClient();
  const projectIds = sessions.map((s: any) => s.frappe_project_id).filter(Boolean) as string[];
  const projectNamesMap = await fetchProjectNamesMap(supabase, projectIds);
  
  const summary = buildMonthlySummary(sessions, dateRange);
  const projectSummary = buildProjectSummary(sessions, projectNamesMap);

  const todayStr = format(new Date(), 'yyyy-MM-dd');
  const todayActiveSeconds = sessions
    .filter((session) => session.session_date === todayStr)
    .reduce((total, session) => total + (session.active_duration ?? 0), 0);

  return (
    <DashboardShell
      userName={profile.displayName || profile.email}
      userEmail={profile.email}
      userRole={profile.role}
    >
      <ReportsRealtimeWatcher userEmail={targetEmail} />
      <div className="space-y-6">
        <header className="space-y-2">
          <h1 className="text-3xl font-bold text-foreground">Reports</h1>
          <p className="text-sm text-muted-foreground">
            Detailed analytics for the selected date range
            {isManager && requestedEmployee ? ` · ${requestedEmployee}` : ''}.
          </p>
        </header>

        <section className="rounded-2xl border border-border bg-card p-6 shadow-sm">
          <form className="flex flex-col gap-4 sm:flex-row sm:items-end" method="get">
            <div>
              <label
                htmlFor="from"
                className="block text-xs font-medium uppercase tracking-wide text-muted-foreground"
              >
                From
              </label>
              <input
                type="date"
                id="from"
                name="from"
                className="mt-2 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                defaultValue={dateRange.start}
                max={dateRange.end}
              />
            </div>
            <div>
              <label htmlFor="to" className="block text-xs font-medium uppercase tracking-wide text-muted-foreground">
                To
              </label>
              <input
                type="date"
                id="to"
                name="to"
                className="mt-2 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                defaultValue={dateRange.end}
                min={dateRange.start}
              />
            </div>
            {isManager && requestedEmployee ? (
              <input type="hidden" name="employee" value={requestedEmployee} />
            ) : null}
            <button
              type="submit"
              className="inline-flex h-10 items-center justify-center rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-sm transition hover:bg-primary/90"
            >
              Apply Filters
            </button>
          </form>
        </section>

        {isManager && (
          <section className="rounded-2xl border border-border bg-card p-6 shadow-sm">
            <p className="text-sm text-muted-foreground">
              Switch between your assigned employees to review their recent activity.
            </p>
            <div className="mt-6">
              <EmployeeSelector
                managerEmail={profile.email}
                currentEmployeeEmail={requestedEmployee ?? undefined}
                redirectBasePath={`/reports/${encodeURIComponent(profile.email)}/reports`}
                autoSelectFirst={false}
              />
            </div>
          </section>
        )}

        <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <SummaryCard title="Total Work" value={formatHoursMinutes(summary.totalHours)} />
          <SummaryCard title="Avg. Daily Work" value={formatHoursMinutes(summary.avgDailyHours)} />
          <SummaryCard title="Avg. Idle %" value={`${summary.avgIdlePercent.toFixed(1)}%`} />
          <SummaryCard title="Active Today" value={formatSecondsToHoursMinutes(todayActiveSeconds)} />
        </section>

        {projectSummary.length > 0 && (
          <section className="rounded-2xl border border-border bg-card p-6 shadow-sm">
            <h2 className="mb-4 text-xl font-semibold text-foreground">Time by Project</h2>
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
          <h2 className="mb-4 text-xl font-semibold text-foreground">Daily Activity</h2>
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

