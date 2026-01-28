import SummaryCard from '@/components/SummaryCard';
import WeeklyActivityChart from '@/components/WeeklyActivityChart';
import ProjectPieChart from '@/components/ProjectPieChart';
import EmployeeSelector from '@/components/FreelancerSelector';
import { DashboardShell } from '@/components/dashboard';
import { ReportsRealtimeWatcher } from '@/components/ReportsRealtimeWatcher';
import { createServerSupabaseClient } from '@/lib/supabaseServer';
import { fetchUserProfile } from '@/lib/userProfile';
import { redirect } from 'next/navigation';
import { format } from 'date-fns';
import { type DateRange, normalizeDateRange } from '@/lib/dateRange';
import { determineRoleFromRoleProfile, getAllFrappeProjects } from '@/lib/frappeClient';

type TimeSession = {
  id: number;
  session_date: string;
  start_time: string;
  end_time: string | null;
  active_duration: number;
  break_duration: number;
  idle_duration: number | null;
  project_id: number | null;
  frappe_project_id: string | null;
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
  const seconds = Number(totalSeconds) || 0;
  
  // For values less than 60 seconds, show seconds
  if (seconds < 60) {
    return `${seconds}s`;
  }
  
  const totalMinutes = Math.floor(seconds / 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  const remainingSeconds = seconds % 60;

  // If we have hours, show as "Xh Ym" (no seconds)
  if (hours > 0) {
    if (minutes === 0) {
      return `${hours}h`;
    }
    return `${hours}h ${minutes}m`;
  }
  
  // If only minutes, show seconds if there are any
  if (hours === 0 && minutes > 0) {
    if (remainingSeconds === 0) {
      return `${minutes}m`;
    }
    return `${minutes}m ${remainingSeconds}s`;
  }
  
  return '0m';
}

function buildMonthlySummary(sessions: TimeSession[], dateRange: DateRange) {
  const daily = new Map<string, { active: number; idle: number; break: number }>();

  sessions.forEach((session) => {
    const date = session.session_date;
    if (!daily.has(date)) {
      daily.set(date, { active: 0, idle: 0, break: 0 });
    }
    const entry = daily.get(date)!;
    entry.active += session.active_duration ?? 0;
    entry.idle += session.idle_duration ?? 0;
    entry.break += session.break_duration ?? 0;
  });

  const labels: string[] = [];
  const activeHours: number[] = [];
  const idleHours: number[] = [];
  const breakHours: number[] = [];

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
    breakHours.push((entry?.break ?? 0) / 3600);
    daysCount += 1;
  }

  const totalActiveSeconds = sessions.reduce((sum, session) => sum + (session.active_duration ?? 0), 0);
  const totalIdleSeconds = sessions.reduce((sum, session) => sum + (session.idle_duration ?? 0), 0);
  const totalBreakSeconds = sessions.reduce((sum, session) => sum + (session.break_duration ?? 0), 0);
  const totalTimeSeconds = totalActiveSeconds + totalIdleSeconds + totalBreakSeconds;
  const avgIdlePercent = totalTimeSeconds > 0 ? (totalIdleSeconds / totalTimeSeconds) * 100 : 0;

  const daysWithWork = activeHours.filter((h) => h > 0).length;
  const denominator = daysWithWork > 0 ? daysWithWork : Math.max(daysCount, 1);
  const avgDailyHours = (totalActiveSeconds / 3600) / denominator;

  return {
    labels,
    activeHours,
    idleHours,
    breakHours,
    totalHours: totalActiveSeconds / 3600,
    totalIdleSeconds,
    avgIdlePercent,
    avgDailyHours,
  };
}

function buildProjectSummary(sessions: TimeSession[], projectNamesMap: Map<string, string>) {
  const projectMap = new Map<string, { name: string; totalSeconds: number }>();

  sessions.forEach((session) => {
    const projectId = session.frappe_project_id;
    if (projectId) {
      const projectName = projectNamesMap.get(projectId) || projectId || 'Untitled project';
      // Calculate total time: active + idle + break
      const activeDuration = session.active_duration ?? 0;
      const idleDuration = session.idle_duration ?? 0;
      const breakDuration = session.break_duration ?? 0;
      const totalDuration = activeDuration + idleDuration + breakDuration;

      if (projectMap.has(projectId)) {
        const existing = projectMap.get(projectId)!;
        projectMap.set(projectId, {
          name: projectName,
          totalSeconds: existing.totalSeconds + totalDuration,
        });
      } else {
        projectMap.set(projectId, {
          name: projectName,
          totalSeconds: totalDuration,
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

  // Try to select frappe_project_id, but fallback to select('*') if column doesn't exist
  let { data, error } = await supabase
    .from('time_sessions')
    .select('id, session_date, start_time, end_time, active_duration, break_duration, idle_duration, frappe_project_id')
    .eq('user_email', userEmail)
    .gte('session_date', dateRange.start)
    .lte('session_date', dateRange.end)
    .order('start_time', { ascending: false });

  // If frappe_project_id or project_id column doesn't exist, fallback to select('*')
  if (error && (error.message?.includes('frappe_project_id') || error.message?.includes('project_id') || error.code === '42703')) {
    const fallback = await supabase
      .from('time_sessions')
      .select('*')
      .eq('user_email', userEmail)
      .gte('session_date', dateRange.start)
      .lte('session_date', dateRange.end)
      .order('start_time', { ascending: false });
    data = fallback.data;
    error = fallback.error;
  }

  if (error) {
    console.error('[reports-page] Failed to load sessions', {
      message: error.message,
      code: error.code,
      details: error.details,
      hint: error.hint,
      error,
    });
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

  // Fallback: for any missing IDs, try to fetch names directly from Frappe
  const missingIds = uniqueProjectIds.filter((id) => !projectMap.has(id));
  if (missingIds.length > 0) {
    try {
      const frappeProjects = await getAllFrappeProjects(); // no company filter; returns id + human name
      const frappeMap = new Map<string, string>();
      frappeProjects.forEach((p) => {
        if (p.id && p.name) {
          frappeMap.set(p.id, p.name);
        }
      });
      
      // Add missing projects from Frappe
      missingIds.forEach((id) => {
        const frappeName = frappeMap.get(id);
        if (frappeName) {
          projectMap.set(id, frappeName);
        }
      });
    } catch (frappeErr) {
      console.warn('[reports-page] Failed to fetch project names from Frappe:', frappeErr);
    }
  }

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
    } else {
      // Manager must select an employee to view reports
      // Show empty state or redirect
    }
  } else if (!isEmployee) {
    // Unsupported role, redirect to overview
    redirect(`/reports/${encodeURIComponent(profile.email)}`);
  }

  const dateRange = normalizeDateRange(resolvedSearchParams);

  const sessions = await fetchSessionsInRange(targetEmail, dateRange);
  
  // Fetch project names
  const supabase = createServerSupabaseClient();
  const projectIds = sessions.map((s) => s.frappe_project_id).filter(Boolean) as string[];
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
            {isManager
              ? 'Select an employee to view their detailed analytics for the selected date range.'
              : 'Detailed analytics for the selected date range.'}
          </p>
        </header>

        {isManager && (
          <section className="rounded-2xl border border-border bg-card p-6 shadow-sm">
            <EmployeeSelector
              managerEmail={profile.email}
              currentEmployeeEmail={requestedEmployee ?? undefined}
              redirectBasePath={`/reports/${encodeURIComponent(profile.email)}/reports`}
              autoSelectFirst={false}
            />
          </section>
        )}

        {isManager && !requestedEmployee ? (
          <section className="rounded-2xl border border-dashed border-border/60 bg-card p-10 text-center shadow-sm">
            <h2 className="text-xl font-semibold text-foreground">Select an employee</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Please select an employee from the dropdown above to view their reports.
            </p>
          </section>
        ) : (
          <>
            <section className="rounded-2xl border border-border bg-card p-6 shadow-sm">
              <form className="flex flex-col gap-4 sm:flex-row sm:items-end" method="get">
                {isManager && requestedEmployee && (
                  <input type="hidden" name="employee" value={requestedEmployee} />
                )}
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
                <button
                  type="submit"
                  className="inline-flex h-10 items-center justify-center rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-sm transition hover:bg-primary/90"
                >
                  Apply Filters
                </button>
              </form>
            </section>

        <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <SummaryCard title="Total Active Work" value={formatHoursMinutes(summary.totalHours)} />
          <SummaryCard title="Avg. Daily Active Work" value={formatHoursMinutes(summary.avgDailyHours)} />
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
            breakHours={summary.breakHours}
          />
        </section>

        {projectSummary.length > 0 && (
          <section className="rounded-2xl border border-border bg-card p-6 shadow-sm">
            <h2 className="mb-4 text-xl font-semibold text-foreground">Time Distribution by Project</h2>
            <div className="flex justify-center">
              <div className="w-full max-w-2xl">
                <ProjectPieChart
                  labels={projectSummary.map((project) => project.name)}
                  totalHours={projectSummary.map((project) => project.totalHours)}
                />
              </div>
            </div>
          </section>
        )}
          </>
        )}
      </div>
    </DashboardShell>
  );
}

