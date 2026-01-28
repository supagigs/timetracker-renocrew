import { format } from 'date-fns';
import { CalendarClock } from 'lucide-react';
import { DashboardShell } from '@/components/dashboard';
import { fetchUserProfile } from '@/lib/userProfile';
import { createServerSupabaseClient } from '@/lib/supabaseServer';
import { type DateRange, defaultDateRange, normalizeDateRange } from '@/lib/dateRange';
import { LocalTime } from '@/components/LocalTime';
import { determineRoleFromRoleProfile } from '@/lib/frappeClient';
import EmployeeSelector from '@/components/FreelancerSelector';
import { ExportTimesheetButton } from '@/components/ExportTimesheetButton';

type TimesheetRow = {
  id: number;
  employeeEmail: string;
  employeeName: string | null;
  projectName: string | null;
  sessionDate: string;
  startTime: string | null;
  endTime: string | null;
  activeSeconds: number;
  breakSeconds: number;
  idleSeconds: number;
  totalSeconds: number;
};

type RawSessionRow = {
  id: number;
  user_email: string;
  session_date: string;
  start_time: string | null;
  end_time: string | null;
  active_duration: number | null;
  break_duration: number | null;
  idle_duration: number | null;
  projects?: Array<{
    project_name: string | null;
  }> | null;
};

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
    console.warn('[timesheet] Failed to load project names:', error);
    return new Map();
  }

  const projectMap = new Map<string, string>();
  (projects || []).forEach((project) => {
    if (project.frappe_project_id && project.project_name) {
      projectMap.set(project.frappe_project_id, project.project_name);
    }
  });

  return projectMap;
}

async function fetchSessionsForEmails(emails: string[], dateRange: DateRange): Promise<RawSessionRow[]> {
  if (emails.length === 0) {
    return [];
  }

  const supabase = createServerSupabaseClient();

  const { data, error } = await supabase
    .from('time_sessions')
    .select(
      `
        id,
        user_email,
        session_date,
        start_time,
        end_time,
        active_duration,
        break_duration,
        idle_duration,
        frappe_project_id
      `,
    )
    .in('user_email', emails)
    .gte('session_date', dateRange.start)
    .lte('session_date', dateRange.end)
    .order('session_date', { ascending: false })
    .order('start_time', { ascending: false });

  if (error) {
    console.warn('[timesheet] Failed to load session data:', error);
    return [];
  }

  // Transform data to match RawSessionRow type (projects is now null since we removed the join)
  return (data ?? []).map((row: any) => ({
    ...row,
    projects: null, // No longer available via join
  })) as RawSessionRow[];
}

async function fetchManagerTimesheet({
  email,
  dateRange,
  company,
}: {
  email: string;
  dateRange: DateRange;
  company?: string | null;
}): Promise<TimesheetRow[]> {
  const supabase = createServerSupabaseClient();

  // Try to fetch employees from assignments table first
  let employeeEmails: string[] = [];
  const { data: assignments, error: assignmentsError } = await supabase
    .from('manager_employee_assignments')
    .select('employee_email')
    .eq('manager_email', email)
    .eq('is_active', true);

  if (assignmentsError) {
    // If assignments table query fails (e.g., table doesn't exist or RLS blocking), 
    // silently continue to fallback approach
    // Only log if it's not an empty error object (which might indicate RLS/permission issue)
    if (Object.keys(assignmentsError).length > 0) {
      console.warn('[manager-timesheet] Failed to fetch assignments, trying fallback:', assignmentsError);
    }
  } else if (assignments && assignments.length > 0) {
    employeeEmails = Array.from(
      new Set(
        assignments
          .map((entry) => entry.employee_email)
          .filter((value): value is string => Boolean(value)),
      ),
    );
  }

  // If no assignments found, try fetching employees by company (fallback approach)
  if (employeeEmails.length === 0 && company) {
    try {
      // Import and use Frappe manager to get users by company
      const { getAllFrappeUsers } = await import('@/lib/frappeClient');
      const frappeUsers = await getAllFrappeUsers(company);
      employeeEmails = frappeUsers
        .filter((user) => user.email.toLowerCase() !== email.toLowerCase())
        .map((user) => user.email);
    } catch (fallbackError: any) {
      // Silently handle Frappe API errors (e.g., 417, authentication issues)
      // If Frappe fails, try fallback to Supabase users with same company
      if (company) {
        const { data: supabaseUsers, error: usersError } = await supabase
          .from('users')
          .select('email')
          .eq('company', company)
          .neq('email', email);
        
        if (!usersError && supabaseUsers && supabaseUsers.length > 0) {
          employeeEmails = supabaseUsers.map(u => u.email);
        }
      }
      
      // If still no emails, return empty array
      if (employeeEmails.length === 0) {
        return [];
      }
    }
  }

  if (employeeEmails.length === 0) {
    return [];
  }

  const { data: userRows, error: usersError } = await supabase
    .from('users')
    .select('email, display_name')
    .in('email', employeeEmails);

  if (usersError) {
    console.error('[manager-timesheet] Failed to fetch employee names:', usersError);
    return [];
  }

  const nameMap = new Map<string, string | null>();
  (userRows ?? []).forEach((row) => {
    nameMap.set(row.email, row.display_name ?? null);
  });

  const sessions = await fetchSessionsForEmails(employeeEmails, dateRange);

  // Fetch project names
  const projectIds = sessions.map((s: any) => s.frappe_project_id).filter(Boolean) as string[];
  const projectNamesMap = await fetchProjectNamesMap(supabase, projectIds);

  return sessions.map((session) => {
    const frappeProjectId = (session as any).frappe_project_id;
    const projectName = frappeProjectId ? projectNamesMap.get(frappeProjectId) ?? null : null;

    return {
      id: session.id,
      employeeEmail: session.user_email,
      employeeName: nameMap.get(session.user_email) ?? session.user_email,
      projectName,
      sessionDate: session.session_date,
      startTime: session.start_time,
      endTime: session.end_time,
      // Ensure values are numbers and handle NULL properly
      activeSeconds: Number(session.active_duration) || 0,
      breakSeconds: Number(session.break_duration) || 0,
      idleSeconds: Number(session.idle_duration) || 0,
      totalSeconds:
        (Number(session.active_duration) || 0) +
        (Number(session.break_duration) || 0) +
        (Number(session.idle_duration) || 0),
    };
  });
}

async function fetchEmployeeTimesheet({
  email,
  dateRange,
}: {
  email: string;
  dateRange: DateRange;
}): Promise<TimesheetRow[]> {
  const supabase = createServerSupabaseClient();
  const { data: userRow, error: userError } = await supabase
    .from('users')
    .select('display_name')
    .eq('email', email)
    .maybeSingle();

  if (userError) {
    console.warn('[employee-timesheet] Could not load display name.', userError);
  }

  const displayName = userRow?.display_name ?? email;

  const sessions = await fetchSessionsForEmails([email], dateRange);

  // Fetch project names
  const projectIds = sessions.map((s: any) => s.frappe_project_id).filter(Boolean) as string[];
  const projectNamesMap = await fetchProjectNamesMap(supabase, projectIds);

  return sessions.map((session) => {
    const frappeProjectId = (session as any).frappe_project_id;
    const projectName = frappeProjectId ? projectNamesMap.get(frappeProjectId) ?? null : null;

    return {
      id: session.id,
      employeeEmail: session.user_email,
      employeeName: displayName,
      projectName,
      sessionDate: session.session_date,
      startTime: session.start_time,
      endTime: session.end_time,
      // Ensure values are numbers and handle NULL properly
      activeSeconds: Number(session.active_duration) || 0,
      breakSeconds: Number(session.break_duration) || 0,
      idleSeconds: Number(session.idle_duration) || 0,
      totalSeconds:
        (Number(session.active_duration) || 0) +
        (Number(session.break_duration) || 0) +
        (Number(session.idle_duration) || 0),
    };
  });
}

function formatSecondsToHoursMinutes(totalSeconds: number): string {
  // Ensure we have a valid number
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

export default async function TimesheetPage({
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

  const dateRange = normalizeDateRange(resolvedSearchParams);

  // Convert role_profile_name to Manager/Employee for logic
  const convertedRole = determineRoleFromRoleProfile(profile.role);
  const isManager = convertedRole === 'Manager';
  const isEmployee = convertedRole === 'Employee';

  // For managers, check if a specific user is selected
  const selectedUserEmail = (() => {
    const value = resolvedSearchParams?.employee;
    if (Array.isArray(value)) return value[0];
    return value ?? null;
  })();

  // Determine target email for timesheet data
  const targetEmail = isManager && selectedUserEmail ? selectedUserEmail : profile.email;

  const timesheetRows = isManager && selectedUserEmail
    ? await fetchEmployeeTimesheet({ email: selectedUserEmail, dateRange })
    : isManager
      ? await fetchManagerTimesheet({ email: profile.email, dateRange, company: profile.company })
      : isEmployee
        ? await fetchEmployeeTimesheet({ email: profile.email, dateRange })
        : [];

  const emptyStateMessage = isManager && selectedUserEmail
    ? 'This employee has no tracked sessions for the selected date range.'
    : isManager
      ? 'Select an employee from the dropdown above to view their timesheet.'
      : 'You have no tracked sessions for the selected date range.';

  return (
    <DashboardShell
      userName={profile.displayName || profile.email}
      userEmail={profile.email}
      userRole={profile.role}
    >
      <div className="space-y-6">
        <header className="space-y-2">
          <h1 className="text-3xl font-bold text-foreground">Timesheet</h1>
          <p className="text-sm text-muted-foreground">
            {isEmployee
              ? 'Your recent sessions with login and logout times. Use the filter to view a specific range.'
              : 'Review detailed session logs for each employee assigned to your projects.'}
          </p>
        </header>

        {isManager && (
          <section className="rounded-2xl border border-border bg-card p-6 shadow-sm">
            <EmployeeSelector
              managerEmail={profile.email}
              currentEmployeeEmail={selectedUserEmail ?? undefined}
              redirectBasePath={`/reports/${encodeURIComponent(profile.email)}/timesheet`}
              autoSelectFirst={false}
            />
          </section>
        )}

        <section className="rounded-2xl border border-border bg-card p-6 shadow-sm">
          <form className="flex flex-col gap-4 sm:flex-row sm:items-end" method="get">
            {isManager && selectedUserEmail && (
              <input type="hidden" name="employee" value={selectedUserEmail} />
            )}
            <div>
              <label htmlFor="from" className="block text-xs font-medium uppercase tracking-wide text-muted-foreground">
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

        {isManager && !selectedUserEmail ? (
          <section className="rounded-2xl border border-dashed border-border/60 bg-card p-10 text-center shadow-sm">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-secondary/70 text-secondary-foreground">
              <CalendarClock size={24} />
            </div>
            <h2 className="mt-4 text-xl font-semibold text-foreground">Select an employee</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Please select an employee from the dropdown above to view their timesheet.
            </p>
          </section>
        ) : timesheetRows.length === 0 ? (
          <section className="rounded-2xl border border-dashed border-border/60 bg-card p-10 text-center shadow-sm">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-secondary/70 text-secondary-foreground">
              <CalendarClock size={24} />
            </div>
            <h2 className="mt-4 text-xl font-semibold text-foreground">No timesheet entries</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              {emptyStateMessage}
            </p>
          </section>
        ) : (
          <section className="rounded-2xl border border-border bg-card p-6 shadow-sm">
            {isManager && selectedUserEmail && (
              <div className="mb-4 flex justify-end">
                <ExportTimesheetButton
                  timesheetData={timesheetRows}
                  employeeEmail={selectedUserEmail}
                  employeeName={timesheetRows[0]?.employeeName ?? null}
                  dateRange={dateRange}
                  disabled={timesheetRows.length === 0}
                />
              </div>
            )}
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-muted-foreground">
                    <th className="px-4 py-3 font-medium">Date</th>
                    {isManager && <th className="px-4 py-3 font-medium">Employee</th>}
                    <th className="px-4 py-3 font-medium">Project</th>
                    <th className="px-4 py-3 font-medium">Active</th>
                    <th className="px-4 py-3 font-medium">Break</th>
                    <th className="px-4 py-3 font-medium">Idle</th>
                    <th className="px-4 py-3 font-medium">Total</th>
                    <th className="px-4 py-3 font-medium">Clock In</th>
                    <th className="px-4 py-3 font-medium">Clock Out</th>
                  </tr>
                </thead>
                <tbody>
                  {timesheetRows.map((row) => (
                    <tr key={row.id} className="border-b border-border/60 transition-colors hover:bg-secondary/60">
                      <td className="px-4 py-3 text-foreground">{format(new Date(row.sessionDate), 'PPP')}</td>
                      {isManager && (
                        <td className="px-4 py-3 text-foreground">
                          <div className="font-semibold">{row.employeeName || row.employeeEmail}</div>
                          <div className="text-xs text-muted-foreground">{row.employeeEmail}</div>
                        </td>
                      )}
                      <td className="px-4 py-3 text-foreground">{row.projectName ?? '—'}</td>
                      <td className="px-4 py-3 text-foreground">{formatSecondsToHoursMinutes(row.activeSeconds)}</td>
                      <td className="px-4 py-3 text-foreground">{formatSecondsToHoursMinutes(row.breakSeconds)}</td>
                      <td className="px-4 py-3 text-foreground">{formatSecondsToHoursMinutes(row.idleSeconds)}</td>
                      <td className="px-4 py-3 text-foreground">{formatSecondsToHoursMinutes(row.totalSeconds)}</td>
                      <td className="px-4 py-3 text-foreground">
                        <LocalTime isoString={row.startTime} formatString="p" />
                      </td>
                      <td className="px-4 py-3 text-foreground">
                        <LocalTime isoString={row.endTime} formatString="p" />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}
      </div>
    </DashboardShell>
  );
}
