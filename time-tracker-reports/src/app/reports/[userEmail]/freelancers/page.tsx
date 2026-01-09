import { formatDistanceToNow } from 'date-fns';
import { Users } from 'lucide-react';
import { DashboardShell } from '@/components/dashboard';
import { fetchUserProfile } from '@/lib/userProfile';
import { createServerSupabaseClient } from '@/lib/supabaseServer';
import { format } from 'date-fns';
import { getAllFrappeUsers, determineRoleFromRoleProfile } from '@/lib/frappeClient';

type EmployeeSummary = {
  email: string;
  displayName: string | null;
  status: 'active' | 'offline' | 'no-data';
  todayActiveSeconds: number;
  last30ActiveSeconds: number;
  lastActiveAt: string | null;
};

async function fetchManagerEmployees(managerEmail: string, managerCompany: string | null): Promise<EmployeeSummary[]> {
  const supabase = createServerSupabaseClient();

  // For managers, fetch users from Frappe filtered by company
  let employeeEmails: string[] = [];
  try {
    const frappeUsers = await getAllFrappeUsers(managerCompany || undefined);
    // Include all users from the company, including the manager themselves
    employeeEmails = frappeUsers.map((user) => user.email);
  } catch (error) {
    console.error('[manager-employees] Failed to fetch Frappe users, falling back to Supabase:', error);
    // Fall back to Supabase users with same company if Frappe fails
    if (managerCompany) {
      const { data: supabaseUsers, error: usersError } = await supabase
        .from('users')
        .select('email')
        .eq('company', managerCompany);
        // Include all users from the company, including the manager themselves
      
      if (!usersError && supabaseUsers) {
        employeeEmails = supabaseUsers.map(u => u.email);
      }
    }
    
    if (employeeEmails.length === 0) {
      return [];
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
    console.error('[manager-employees] Failed to fetch employee details:', usersError);
    return [];
  }

  const nameMap = new Map<string, string | null>();
  (userRows ?? []).forEach((row) => {
    nameMap.set(row.email, row.display_name ?? null);
  });

  // No-op: user_sessions table is no longer used
  const sessionStateMap = new Map<string, { app_logged_in: boolean | null; updated_at: string | null }>();

  const endDate = new Date();
  const startDate = new Date();
  startDate.setDate(endDate.getDate() - 29);

  const startDateStr = format(startDate, 'yyyy-MM-dd');
  const endDateStr = format(endDate, 'yyyy-MM-dd');
  const todayStr = endDateStr;

  const { data: sessionRows, error: sessionsError } = await supabase
    .from('time_sessions')
    .select('user_email, session_date, start_time, end_time, active_duration')
    .in('user_email', employeeEmails)
    .gte('session_date', startDateStr)
    .lte('session_date', endDateStr)
    .order('start_time', { ascending: false });

  if (sessionsError) {
    console.error('Error fetching employee sessions:', sessionsError);
    throw sessionsError;
  }

  const sessionsByUser = new Map<string, typeof sessionRows>();
  (sessionRows ?? []).forEach((session) => {
    const list = sessionsByUser.get(session.user_email) ?? [];
    list.push(session);
    sessionsByUser.set(session.user_email, list);
  });

  return employeeEmails.map((email) => {
    const memberSessions = sessionsByUser.get(email) ?? [];

    const todayActiveSeconds = memberSessions
      .filter((session) => session.session_date === todayStr)
      .reduce((total, session) => total + (session.active_duration ?? 0), 0);

    const last30ActiveSeconds = memberSessions.reduce(
      (total, session) => total + (session.active_duration ?? 0),
      0,
    );

    const lastSession = memberSessions[0];
    
    // No-op: user_sessions table is no longer used
    // Determine status based on time_sessions only
    const activeSession = memberSessions.find(
      (session) => session.end_time === null && session.session_date === todayStr,
    );

    let status: EmployeeSummary['status'] = 'no-data';
    if (memberSessions.length === 0) {
      status = 'no-data';
    } else if (activeSession) {
      status = 'active';
    } else {
      status = 'offline';
    }

    // For active sessions, use the active session's start_time
    // For inactive sessions, use the last session's end_time or start_time
    const lastActiveAt = activeSession
      ? activeSession.start_time ?? null
      : lastSession
        ? lastSession.end_time ?? lastSession.start_time ?? null
        : null;

    return {
      email,
      displayName: nameMap.get(email) ?? null,
      status,
      todayActiveSeconds,
      last30ActiveSeconds,
      lastActiveAt,
    } satisfies EmployeeSummary;
  });
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

export default async function ManagerEmployeesPage({
  params,
}: {
  params: Promise<{ userEmail: string }>;
}) {
  const { userEmail } = await params;
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
  const employees = convertedRole === 'Manager'
    ? await fetchManagerEmployees(profile.email, profile.company)
    : [];

  return (
    <DashboardShell
      userName={profile.displayName || profile.email}
      userEmail={profile.email}
      userRole={profile.role}
    >
      <div className="space-y-6">
        <header className="space-y-2">
          <h1 className="text-3xl font-bold text-foreground">Users</h1>
          <p className="text-sm text-muted-foreground">
            Get a quick status update on every user assigned to your projects.
          </p>
        </header>

        {profile.role !== 'Manager' ? (
          <section className="rounded-2xl border border-border bg-card p-6 shadow-sm">
            <p className="text-sm text-muted-foreground">
              Only manager accounts can manage user assignments.
            </p>
          </section>
        ) : employees.length === 0 ? (
          <section className="rounded-2xl border border-dashed border-border/60 bg-card p-10 text-center shadow-sm">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-secondary/70 text-secondary-foreground">
              <Users size={24} />
            </div>
            <h2 className="mt-4 text-xl font-semibold text-foreground">No users assigned yet</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Invite users from the desktop app and they will appear here automatically.
            </p>
          </section>
        ) : (
          <section className="rounded-2xl border border-border bg-card p-6 shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-muted-foreground">
                    <th className="px-4 py-3 font-medium">User</th>
                    <th className="px-4 py-3 font-medium">Today</th>
                    <th className="px-4 py-3 font-medium">Last 30 days</th>
                    <th className="px-4 py-3 font-medium">Status</th>
                    <th className="px-4 py-3 font-medium">Last active</th>
                  </tr>
                </thead>
                <tbody>
                  {employees.map((employee) => {
                    // If employee is active, show "Active now" instead of time ago
                    const lastActiveLabel = employee.status === 'active'
                      ? 'Active now'
                      : employee.lastActiveAt
                        ? formatDistanceToNow(new Date(employee.lastActiveAt), { addSuffix: true })
                        : 'No activity yet';

                    const statusConfig: Record<EmployeeSummary['status'], { label: string; classes: string }> = {
                      active: { label: 'Working now', classes: 'bg-emerald-100 text-emerald-700' },
                      offline: { label: 'Offline', classes: 'bg-slate-200 text-slate-700' },
                      'no-data': { label: 'No activity', classes: 'bg-amber-100 text-amber-700' },
                    };

                    const { label, classes } = statusConfig[employee.status];

                    return (
                      <tr key={employee.email} className="border-b border-border/60 transition-colors hover:bg-secondary/60">
                        <td className="px-4 py-3 text-foreground">
                          <div className="font-semibold">{employee.displayName || employee.email}</div>
                          <div className="text-xs text-muted-foreground">{employee.email}</div>
                        </td>
                        <td className="px-4 py-3 text-foreground">
                          {formatSecondsToHoursMinutes(employee.todayActiveSeconds)}
                        </td>
                        <td className="px-4 py-3 text-foreground">
                          {formatSecondsToHoursMinutes(employee.last30ActiveSeconds)}
                        </td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ${classes}`}>
                            {label}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-foreground">{lastActiveLabel}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        )}
      </div>
    </DashboardShell>
  );
}



