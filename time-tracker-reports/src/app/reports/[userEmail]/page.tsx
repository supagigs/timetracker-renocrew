import { format, formatDistanceToNow } from 'date-fns';
import SummaryCard from '@/components/SummaryCard';
import WeeklyActivityChart from '@/components/WeeklyActivityChart';
import ProjectPieChart from '@/components/ProjectPieChart';
import EmployeeSelector from '@/components/FreelancerSelector';
import ManagerOverview from '@/components/ClientOverview';
import { createServerSupabaseClient } from '@/lib/supabaseServer';
import { DashboardShell } from '@/components/dashboard';
import { fetchEmployeeProjects, type ProjectRecord } from '@/lib/projects';
import { fetchUserProfile } from '@/lib/userProfile';
import { redirect } from 'next/navigation';
import { determineRoleFromRoleProfile, getAllFrappeProjects } from '@/lib/frappeClient';

type TimeSession = {
  id: number;
  session_date: string;
  start_time: string;
  end_time: string | null;
  active_duration: number;
  break_duration: number;
  idle_duration: number | null;
  break_count: number | null;
  frappe_project_id: string | null;
  projects?: {
    id: number;
    project_name: string;
  } | null;
};

type TeamMemberSummary = {
  email: string;
  displayName: string | null;
  todayActiveSeconds: number;
  last30ActiveSeconds: number;
  lastActiveAt: string | null;
  hasActiveSession: boolean;
  totalSessions: number;
};

async function fetchLastMonthSessions(userEmail: string): Promise<TimeSession[]> {
  const supabase = createServerSupabaseClient();

  const endDate = new Date();
  const startDate = new Date();
  startDate.setDate(endDate.getDate() - 29); // 30 days total (0-29 = 30 days)

  const startDateStr = format(startDate, 'yyyy-MM-dd');
  const endDateStr = format(endDate, 'yyyy-MM-dd');

  console.log('Fetching sessions for:', { userEmail, startDate: startDateStr, endDate: endDateStr });

  // Try user_email first (legacy schema), fallback to user_id if needed
  // Explicitly select frappe_project_id to ensure it's included (project_id column doesn't exist)
  let { data, error } = await supabase
    .from('time_sessions')
    .select('id, session_date, start_time, end_time, active_duration, break_duration, idle_duration, break_count, frappe_project_id')
    .eq('user_email', userEmail)
    .gte('session_date', startDateStr)
    .lte('session_date', endDateStr)
    .order('start_time', { ascending: false });

  // If user_email column doesn't exist, try user_id by looking up user first
  if (error && (error.message?.includes('column "user_email"') || error.code === '42703')) {
    const { data: userData } = await supabase
      .from('users')
      .select('id')
      .eq('email', userEmail)
      .maybeSingle();

    if (userData?.id) {
      const result = await supabase
        .from('time_sessions')
        .select('id, session_date, start_time, end_time, active_duration, break_duration, idle_duration, break_count, frappe_project_id')
        .eq('user_id', userData.id)
        .gte('session_date', startDateStr)
        .lte('session_date', endDateStr)
        .order('start_time', { ascending: false });
      data = result.data;
      error = result.error;
    }
  }

  if (error) {
    console.error('Error fetching sessions:', error.message || JSON.stringify(error));
    throw error;
  }

  console.log(`Found ${data?.length ?? 0} sessions for ${userEmail}`);
  return (data ?? []) as TimeSession[];
}

async function fetchManagerTeamMembers(managerEmail: string, managerCompany: string | null): Promise<TeamMemberSummary[]> {
  const supabase = createServerSupabaseClient();

  // For managers, fetch users from Frappe filtered by company, then get their data from Supabase
  let employeeEmails: string[] = [];
  
  try {
    // Get users from Frappe filtered by company
    const { getAllFrappeUsers } = await import('@/lib/frappeClient');
    const frappeUsers = await getAllFrappeUsers(managerCompany || undefined);
    // Include all users from the company, including the manager themselves
    employeeEmails = frappeUsers.map(u => u.email);
  } catch (error) {
    console.error('[reports-page] Failed to fetch Frappe users, falling back to Supabase:', error);
    // Fall back to Supabase users with same company
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

  const uniqueEmployeeEmails = Array.from(new Set(employeeEmails));

  const { data: users, error: usersError } = await supabase
    .from('users')
    .select('email, display_name')
    .in('email', uniqueEmployeeEmails);

  if (usersError) {
    console.error('Error fetching employee details:', usersError);
    throw usersError;
  }

  const userMap = new Map<string, string | null>();
  (users ?? []).forEach((user) => {
    userMap.set(user.email, user.display_name ?? null);
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
    .in('user_email', uniqueEmployeeEmails)
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

  return uniqueEmployeeEmails.map((email) => {
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
    // Determine active session based on time_sessions only
    const activeSession = memberSessions.find(
      (session) => session.end_time === null && session.session_date === todayStr,
    );

    const hasActiveSession = Boolean(activeSession);
    
    // For active sessions, use the active session's start_time
    // For inactive sessions, use the last session's end_time or start_time
    const lastActiveAt = activeSession
      ? activeSession.start_time ?? null
      : lastSession
        ? lastSession.end_time ?? lastSession.start_time ?? null
        : null;

    return {
      email,
      displayName: userMap.get(email) ?? null,
      todayActiveSeconds,
      last30ActiveSeconds,
      lastActiveAt,
      hasActiveSession,
      totalSessions: memberSessions.length,
    } satisfies TeamMemberSummary;
  });
}

async function fetchUserName(userEmail: string): Promise<string | null> {
  try {
    const supabase = createServerSupabaseClient();
    
    const { data, error } = await supabase
      .from('users')
      .select('display_name')
      .eq('email', userEmail)
      .maybeSingle();

    if (error) {
      // Log error but don't fail - this is non-critical
      console.warn('[reports] Error fetching user name from Supabase:', {
        message: error.message,
        details: error.details,
        hint: error.hint,
        code: error.code,
      });
      // Continue to try Frappe fallback
    }

    let displayName = data?.display_name || null;
    
    // If display_name is null, try to fetch it from Frappe
    if (!displayName) {
      try {
        const { createFrappeClient } = await import('@/lib/frappeClient');
        const frappe = createFrappeClient(true); // Use API key auth
        
        // Try to get user's full name from Frappe User doctype
        const userRes = await frappe.get('/api/resource/User', {
          params: {
            fields: JSON.stringify(['name', 'full_name']),
            filters: JSON.stringify([['name', '=', userEmail]]),
            limit_page_length: 1,
          },
        });
        
        const users = userRes?.data?.data || [];
        if (users.length > 0 && users[0]?.full_name) {
          displayName = users[0].full_name;
          
          // Update Supabase with the fetched display name for future use
          try {
            const { error: updateError } = await supabase
              .from('users')
              .update({ display_name: displayName })
              .eq('email', userEmail);
            
            if (updateError) {
              // Non-fatal - just log the error
              console.warn('[reports] Failed to update display_name in Supabase:', updateError);
            }
          } catch (err) {
            // Non-fatal - just log the error
            console.warn('[reports] Failed to update display_name in Supabase:', err);
          }
        }
      } catch (err) {
        // Non-fatal - just log the error and continue with null displayName
        const errorMessage = err instanceof Error ? err.message : String(err);
        console.warn('[reports] Failed to fetch display name from Frappe:', errorMessage);
      }
    }
    
    return displayName;
  } catch (err) {
    // Catch any unexpected errors and return null gracefully
    const errorMessage = err instanceof Error ? err.message : String(err);
    console.warn('[reports] Unexpected error in fetchUserName:', errorMessage);
    return null;
  }
}

async function fetchUserRole(userEmail: string): Promise<string | null> {
  // Fetch role from Frappe immediately to ensure we have the most up-to-date role
  // This ensures the correct view is shown on first load
  const { getFrappeRoleProfileForEmail } = await import('@/lib/frappeClient');
  
  // Fetch from Frappe and database in parallel for faster response
  const [frappeRole, dbResult] = await Promise.allSettled([
    getFrappeRoleProfileForEmail(userEmail),
    (async () => {
      const supabase = createServerSupabaseClient();
      const { data, error } = await supabase
        .from('users')
        .select('role')
        .eq('email', userEmail)
        .maybeSingle();
      return (!error && data?.role) ? data.role : null;
    })(),
  ]);

  // Prefer Frappe result (most up-to-date), fallback to database
  const roleProfile = frappeRole.status === 'fulfilled' && frappeRole.value
    ? frappeRole.value
    : dbResult.status === 'fulfilled' && dbResult.value
      ? dbResult.value
      : null;

  // If we got a role from Frappe and it's different from database, update database in background
  if (frappeRole.status === 'fulfilled' && frappeRole.value && 
      dbResult.status === 'fulfilled' && frappeRole.value !== dbResult.value) {
    const supabase = createServerSupabaseClient();
    (async () => {
      try {
        await supabase
          .from('users')
          .update({ role: frappeRole.value })
          .eq('email', userEmail);
        // Silently update - no need to wait or handle errors
      } catch (err) {
        console.warn('[fetchUserRole] Failed to update role in database:', err);
      }
    })();
  }

  return roleProfile;
}

function buildMonthlySummary(sessions: TimeSession[]) {
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

  const now = new Date();
  for (let i = 29; i >= 0; i -= 1) {
    const date = new Date(now);
    date.setDate(now.getDate() - i);
    const key = format(date, 'yyyy-MM-dd');
    // Format as "MMM DD" for better readability with 30 days
    const label = format(date, 'MMM dd');
    labels.push(label);
    const entry = daily.get(key);
    activeHours.push(((entry?.active ?? 0) / 3600));
    idleHours.push(((entry?.idle ?? 0) / 3600));
    breakHours.push(((entry?.break ?? 0) / 3600));
  }

  const totalActiveSeconds = sessions.reduce((sum, session) => sum + (session.active_duration ?? 0), 0);
  const totalIdleSeconds = sessions.reduce((sum, session) => sum + (session.idle_duration ?? 0), 0);
  const totalBreakSeconds = sessions.reduce((sum, session) => sum + (session.break_duration ?? 0), 0);
  const totalTimeSeconds = totalActiveSeconds + totalIdleSeconds + totalBreakSeconds;
  const avgIdlePercent = totalTimeSeconds > 0 ? (totalIdleSeconds / totalTimeSeconds) * 100 : 0;

  // Count days with actual work
  const daysWithWork = activeHours.filter(h => h > 0).length;
  const avgDailyHours = daysWithWork > 0 ? (totalActiveSeconds / 3600) / daysWithWork : (totalActiveSeconds / 3600) / 30;

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

function formatHoursMinutes(decimalHours: number): string {
  const hours = Math.floor(decimalHours);
  const minutes = Math.round((decimalHours - hours) * 60);
  
  // Handle edge case where rounding minutes gives 60
  if (minutes >= 60) {
    return `${hours + 1}h 0m`;
  }
  
  if (hours === 0 && minutes === 0) {
    return '0h 0m';
  } else if (hours === 0) {
    return `${minutes}m`;
  } else if (minutes === 0) {
    return `${hours}h`;
  } else {
    return `${hours}h ${minutes}m`;
  }
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

      missingIds.forEach((id) => {
        const name = frappeMap.get(id);
        if (name) {
          projectMap.set(id, name);
        }
      });
    } catch (err) {
      console.warn('[reports-page] Failed to fetch project names from Frappe:', err);
    }
  }

  return projectMap;
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

  // Convert to arrays and sort by total time (descending)
  const projectData = Array.from(projectMap.entries())
    .map(([id, data], index) => ({
      id: index + 1,
      name: data.name,
      totalHours: data.totalSeconds / 3600,
      totalSeconds: data.totalSeconds,
    }))
    .sort((a, b) => b.totalHours - a.totalHours);

  return projectData;
}

export default async function ReportsPage({
  params,
  searchParams,
}: {
  params: Promise<{ userEmail: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ userEmail }, resolvedSearchParams] = await Promise.all([params, searchParams]);
  const decodedEmail = decodeURIComponent(userEmail);
  const requestedEmployee = (() => {
    const value = resolvedSearchParams?.employee;
    if (Array.isArray(value)) {
      return value[0];
    }
    return value ?? null;
  })();

  const defaultSummary = {
    labels: [] as string[],
    activeHours: [] as number[],
    idleHours: [] as number[],
    breakHours: [] as number[],
    totalHours: 0,
    totalIdleSeconds: 0,
    avgIdlePercent: 0,
    avgDailyHours: 0,
  };

  let sessions: TimeSession[] = [];
  let summary: {
    labels: string[];
    activeHours: number[];
    idleHours: number[];
    breakHours: number[];
    totalHours: number;
    totalIdleSeconds: number;
    avgIdlePercent: number;
    avgDailyHours: number;
  } = defaultSummary;
  let projectSummary: Array<{ id: number; name: string; totalHours: number; totalSeconds: number }> = [];
  let errorMessage: string | null = null;
  let viewerName: string | null = null;
  let reportOwnerName: string | null = null;
  let userRole: string | null = null;
  let isManager = false;
  let reportEmail: string | null = decodedEmail;
  const managerEmailForSelector = decodedEmail;
  let teamMembers: TeamMemberSummary[] = [];
  let showTeamOverview = false;
  let assignedProjects: ProjectRecord[] = [];

  try {
    // Fetch viewer details (the person whose email is in the URL)
    viewerName = await fetchUserName(decodedEmail);

    // Fetch user role (role_profile_name from Frappe)
    userRole = await fetchUserRole(decodedEmail);
    // Convert role_profile_name to Manager/Employee for logic
    const convertedRole = determineRoleFromRoleProfile(userRole);
    isManager = convertedRole === 'Manager';

    // If the user is a Manager, build team overview and decide whether to show an individual report
    if (isManager) {
      // Get manager's company from profile
      const managerProfile = await fetchUserProfile(decodedEmail);
      const managerCompany = managerProfile?.company || null;
      teamMembers = await fetchManagerTeamMembers(decodedEmail, managerCompany);
      const assignedEmployees = teamMembers.map((member) => member.email);
      const hasRequestedEmployee =
        requestedEmployee && assignedEmployees.includes(requestedEmployee);

      if (requestedEmployee && !hasRequestedEmployee) {
        redirect(`/reports/${encodeURIComponent(decodedEmail)}`);
      }

      showTeamOverview = !hasRequestedEmployee;
      reportEmail = hasRequestedEmployee ? requestedEmployee : decodedEmail;
      
      // For managers, validate that the requested employee is from the same company
      if (hasRequestedEmployee && reportEmail && managerCompany) {
        const { getFrappeCompanyForUser } = await import('@/lib/frappeClient');
        const userCompany = await getFrappeCompanyForUser(reportEmail);
        
        // Also check Supabase as fallback
        const supabase = createServerSupabaseClient();
        const { data: userData } = await supabase
          .from('users')
          .select('company')
          .eq('email', reportEmail)
          .maybeSingle();
        
        const userCompanyFromDb = userData?.company || userCompany;
        
        // Only allow if company matches, otherwise redirect to team overview
        if (userCompanyFromDb !== managerCompany) {
          redirect(`/reports/${encodeURIComponent(decodedEmail)}`);
        }
      }
    } else {
      reportEmail = decodedEmail;
    }

    if (reportEmail && !showTeamOverview) {
      // Fetch user name for the report owner
      reportOwnerName = await fetchUserName(reportEmail);

      sessions = await fetchLastMonthSessions(reportEmail);
      summary = buildMonthlySummary(sessions);
      
      // Fetch project names
      const supabase = createServerSupabaseClient();
      const projectIds = sessions.map((s) => s.frappe_project_id).filter(Boolean) as string[];
      const projectNamesMap = await fetchProjectNamesMap(supabase, projectIds);
      projectSummary = buildProjectSummary(sessions, projectNamesMap);
      
      // Fetch assigned projects for employees (to show count only)
      if (!isManager) {
        assignedProjects = await fetchEmployeeProjects(reportEmail);
      }
    }
  } catch (error: any) {
    // Ignore Next.js redirect "errors" which use NEXT_REDIRECT internally
    if (error && typeof error === 'object' && 'digest' in error && String((error as any).digest).includes('NEXT_REDIRECT')) {
      throw error;
    }
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error('Error loading reports:', errorMsg, error);
    errorMessage = errorMsg || 'Failed to load reports';
    summary = defaultSummary;
    projectSummary = [];
  }

  if (!errorMessage && isManager) {
    const queryEmail = requestedEmployee ?? null;
    if (reportEmail === decodedEmail) {
      // Viewing own data; remove stale employee param if present
      if (queryEmail) {
        redirect(`/reports/${userEmail}`);
      }
    } else if (queryEmail !== reportEmail) {
      redirect(`/reports/${userEmail}?employee=${encodeURIComponent(reportEmail)}`);
    }
  }
  // Use display name if available, otherwise fallback to email
  const reportDisplayName = reportOwnerName || reportEmail || decodedEmail;
  const viewerDisplayName = viewerName || decodedEmail;

  const overviewMembers = teamMembers
    .map((member) => {
      const status: 'active' | 'offline' | 'no-data' = member.hasActiveSession
        ? 'active'
        : member.totalSessions === 0
        ? 'no-data'
        : 'offline';

      // If user is active, show "Active now" instead of time ago
      const lastActiveLabel = member.hasActiveSession
        ? 'Active now'
        : member.lastActiveAt
          ? formatDistanceToNow(new Date(member.lastActiveAt), { addSuffix: true })
          : 'No activity yet';

      return {
        email: member.email,
        displayName: member.displayName || member.email,
        todayActive: formatSecondsToHoursMinutes(member.todayActiveSeconds),
        last30Active: formatSecondsToHoursMinutes(member.last30ActiveSeconds),
        lastActiveLabel,
        status,
      };
    })
    .sort((a, b) => a.displayName.localeCompare(b.displayName));

  const overviewMetrics = {
    totalMembers: teamMembers.length,
    currentlyWorking: teamMembers.filter((member) => member.hasActiveSession).length,
    offlineMembers: teamMembers.filter(
      (member) => !member.hasActiveSession && member.totalSessions > 0,
    ).length,
    noActivityMembers: teamMembers.filter((member) => member.totalSessions === 0).length,
    totalActiveToday: formatSecondsToHoursMinutes(
      teamMembers.reduce((total, member) => total + member.todayActiveSeconds, 0),
    ),
  };


  const todayStr = format(new Date(), 'yyyy-MM-dd');
  const todayActiveSeconds = sessions
    .filter((session) => session.session_date === todayStr)
    .reduce((total, session) => total + (session.active_duration ?? 0), 0);

  return (
    <DashboardShell
      userName={viewerDisplayName}
      userEmail={decodedEmail}
      userRole={userRole}
    >
      <div className="space-y-8">
        <header className="space-y-3">
          <div>
            <h1 className="text-3xl font-bold text-foreground">
              {showTeamOverview ? 'Team overview' : `Reports for ${reportDisplayName}`}
            </h1>
            <p className="text-sm text-muted-foreground">
              {showTeamOverview
                ? 'Monitor your employees at a glance and jump into detailed reports when needed.'
                : 'Summary of the last 30 days'}
            </p>
            {!showTeamOverview && reportOwnerName && (
              <p className="text-xs text-muted-foreground">{reportEmail}</p>
            )}
          </div>
          {errorMessage && (
            <div className="mt-2 rounded-lg border border-destructive bg-destructive/20 p-4 text-sm text-destructive-foreground">
              <strong>Error:</strong> {errorMessage}
            </div>
          )}
        </header>

        {isManager && !showTeamOverview && (
          <EmployeeSelector
            managerEmail={managerEmailForSelector}
            currentEmployeeEmail={reportEmail}
          />
        )}

        {showTeamOverview ? (
          <ManagerOverview
            managerName={viewerName}
            managerEmail={decodedEmail}
            members={overviewMembers}
            metrics={overviewMetrics}
          />
        ) : isManager ? (
          <>
            <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <SummaryCard title="Total Active Work (30 days)" value={formatHoursMinutes(summary.totalHours)} />
              <SummaryCard title="Avg. Daily Active Work" value={formatHoursMinutes(summary.avgDailyHours)} />
              <SummaryCard title="Avg. Idle %" value={`${summary.avgIdlePercent.toFixed(1)}%`} />
              <SummaryCard title="Total Idle" value={formatSecondsToHoursMinutes(summary.totalIdleSeconds)} />
            </section>

            {projectSummary.length > 0 && (
              <section className="rounded-xl border border-border bg-card p-6 shadow-sm">
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

            <section className="rounded-xl border border-border bg-card p-6 shadow-sm">
              <h2 className="mb-4 text-xl font-semibold text-foreground">Daily Activity (Last 30 Days)</h2>
              <WeeklyActivityChart
                labels={summary.labels}
                activeHours={summary.activeHours}
                idleHours={summary.idleHours}
                breakHours={summary.breakHours}
              />
            </section>

            {projectSummary.length > 0 && (
              <section className="rounded-xl border border-border bg-card p-6 shadow-sm">
                <h2 className="mb-4 text-xl font-semibold text-foreground">Time Distribution by Project</h2>
                <div className="flex justify-center">
                  <div className="w-full max-w-2xl">
                    <ProjectPieChart
                      labels={projectSummary.map((p) => p.name)}
                      totalHours={projectSummary.map((p) => p.totalHours)}
                    />
                  </div>
                </div>
              </section>
            )}
          </>
        ) : (
          <>
            <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <SummaryCard title="Assigned Projects" value={assignedProjects.length.toString()} />
              <SummaryCard title="Total Active Work (30 days)" value={formatHoursMinutes(summary.totalHours)} />
              <SummaryCard title="Active Today" value={formatSecondsToHoursMinutes(todayActiveSeconds)} />
              <SummaryCard title="Avg. Daily Active Work" value={formatHoursMinutes(summary.avgDailyHours)} />
            </section>

            {projectSummary.length > 0 && (
              <section className="rounded-xl border border-border bg-card p-6 shadow-sm">
                <h2 className="mb-4 text-xl font-semibold text-foreground">Recent Activity</h2>
                <WeeklyActivityChart
                  labels={summary.labels.slice(-7)}
                  activeHours={summary.activeHours.slice(-7)}
                  idleHours={summary.idleHours.slice(-7)}
                  breakHours={summary.breakHours.slice(-7)}
                />
              </section>
            )}
          </>
        )}
      </div>
    </DashboardShell>
  );
}

