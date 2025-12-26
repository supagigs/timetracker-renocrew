import { format, formatDistanceToNow } from 'date-fns';
import Image from 'next/image';
import SummaryCard from '@/components/SummaryCard';
import WeeklyActivityChart from '@/components/WeeklyActivityChart';
import FreelancerSelector from '@/components/FreelancerSelector';
import ClientOverview from '@/components/ClientOverview';
import { createServerSupabaseClient } from '@/lib/supabaseServer';
import { DashboardShell } from '@/components/dashboard';
import { fetchFreelancerProjects, type ProjectRecord } from '@/lib/projects';
import { fetchUserProfile } from '@/lib/userProfile';
import { redirect } from 'next/navigation';

type TimeSession = {
  id: number;
  session_date: string;
  start_time: string;
  end_time: string | null;
  active_duration: number;
  break_duration: number;
  idle_duration: number | null;
  break_count: number | null;
  project_id: number | null;
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
  let { data, error } = await supabase
    .from('time_sessions')
    .select('*')
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
        .select('*')
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

async function fetchClientTeamMembers(clientEmail: string, clientCompany: string | null): Promise<TeamMemberSummary[]> {
  const supabase = createServerSupabaseClient();

  // For clients, fetch users from Frappe filtered by company, then get their data from Supabase
  let freelancerEmails: string[] = [];
  
  try {
    // Get users from Frappe filtered by company
    const { getAllFrappeUsers } = await import('@/lib/frappeClient');
    const frappeUsers = await getAllFrappeUsers(clientCompany || undefined);
    // Exclude the client themselves from the list
    freelancerEmails = frappeUsers
      .filter(u => u.email.toLowerCase() !== clientEmail.toLowerCase())
      .map(u => u.email);
  } catch (error) {
    console.error('[reports-page] Failed to fetch Frappe users, falling back to Supabase:', error);
    // Fall back to Supabase users with same company
    if (clientCompany) {
      const { data: supabaseUsers, error: usersError } = await supabase
        .from('users')
        .select('email')
        .eq('company', clientCompany)
        .neq('email', clientEmail); // Exclude the client themselves
      
      if (!usersError && supabaseUsers) {
        freelancerEmails = supabaseUsers.map(u => u.email);
      }
    }
    
    if (freelancerEmails.length === 0) {
      return [];
    }
  }

  const uniqueFreelancerEmails = Array.from(new Set(freelancerEmails));

  const { data: users, error: usersError } = await supabase
    .from('users')
    .select('email, display_name')
    .in('email', uniqueFreelancerEmails);

  if (usersError) {
    console.error('Error fetching freelancer details:', usersError);
    throw usersError;
  }

  const userMap = new Map<string, string | null>();
  (users ?? []).forEach((user) => {
    userMap.set(user.email, user.display_name ?? null);
  });

  const { data: sessionStates, error: sessionStateError } = await supabase
    .from('user_sessions')
    .select('email, app_logged_in, updated_at')
    .in('email', uniqueFreelancerEmails);

  if (sessionStateError) {
    console.warn('Error fetching user session states:', sessionStateError);
  }

  const sessionStateMap = new Map<string, { app_logged_in: boolean | null; updated_at: string | null }>();
  (sessionStates ?? []).forEach((row) => {
    sessionStateMap.set(row.email, { app_logged_in: row.app_logged_in ?? null, updated_at: row.updated_at ?? null });
  });

  const endDate = new Date();
  const startDate = new Date();
  startDate.setDate(endDate.getDate() - 29);

  const startDateStr = format(startDate, 'yyyy-MM-dd');
  const endDateStr = format(endDate, 'yyyy-MM-dd');
  const todayStr = endDateStr;

  const { data: sessionRows, error: sessionsError } = await supabase
    .from('time_sessions')
    .select('user_email, session_date, start_time, end_time, active_duration')
    .in('user_email', uniqueFreelancerEmails)
    .gte('session_date', startDateStr)
    .lte('session_date', endDateStr)
    .order('start_time', { ascending: false });

  if (sessionsError) {
    console.error('Error fetching freelancer sessions:', sessionsError);
    throw sessionsError;
  }

  const sessionsByUser = new Map<string, typeof sessionRows>();
  (sessionRows ?? []).forEach((session) => {
    const list = sessionsByUser.get(session.user_email) ?? [];
    list.push(session);
    sessionsByUser.set(session.user_email, list);
  });

  return uniqueFreelancerEmails.map((email) => {
    const memberSessions = sessionsByUser.get(email) ?? [];

    const todayActiveSeconds = memberSessions
      .filter((session) => session.session_date === todayStr)
      .reduce((total, session) => total + (session.active_duration ?? 0), 0);

    const last30ActiveSeconds = memberSessions.reduce(
      (total, session) => total + (session.active_duration ?? 0),
      0,
    );

    const lastSession = memberSessions[0];
    const lastSessionTimestamp = lastSession
      ? lastSession.end_time ?? lastSession.start_time ?? null
      : null;

    const sessionState = sessionStateMap.get(email);
    const updatedAtMs = sessionState?.updated_at ? Date.parse(sessionState.updated_at) : Number.NaN;
    const isStatusRecent = Number.isFinite(updatedAtMs) ? Date.now() - updatedAtMs < 1000 * 60 * 60 * 6 : false;

    const lastActiveAt = Number.isFinite(updatedAtMs)
      ? new Date(updatedAtMs).toISOString()
      : lastSessionTimestamp;

    const activeSession = memberSessions.find(
      (session) => session.end_time === null && session.session_date === todayStr,
    );

    let hasActiveSession = false;
    if (sessionState?.app_logged_in === false) {
      hasActiveSession = false;
    } else if (sessionState?.app_logged_in === true) {
      hasActiveSession = Boolean(activeSession) || isStatusRecent;
    } else {
      hasActiveSession = Boolean(activeSession);
    }

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
  const supabase = createServerSupabaseClient();
  
  const { data, error } = await supabase
    .from('users')
    .select('display_name')
    .eq('email', userEmail)
    .maybeSingle();

  if (error) {
    console.error('Error fetching user name:', error.message || JSON.stringify(error));
    return null;
  }

  return data?.display_name || null;
}

async function fetchUserRole(userEmail: string): Promise<string | null> {
  const supabase = createServerSupabaseClient();
  
  const { data, error } = await supabase
    .from('users')
    .select('role')
    .eq('email', userEmail)
    .maybeSingle();

  if (error) {
    console.error('Error fetching user role:', error.message || JSON.stringify(error));
    return null;
  }

  return data?.role || null;
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
    // Format as "MMM DD" for better readability with 30 days
    const label = format(date, 'MMM dd');
    labels.push(label);
    const entry = daily.get(key);
    activeHours.push(((entry?.active ?? 0) / 3600));
    idleHours.push(((entry?.idle ?? 0) / 3600));
  }

  const totalActiveSeconds = sessions.reduce((sum, session) => sum + (session.active_duration ?? 0), 0);
  const totalIdleSeconds = sessions.reduce((sum, session) => sum + (session.idle_duration ?? 0), 0);
  const totalTimeSeconds = totalActiveSeconds + totalIdleSeconds;
  const avgIdlePercent = totalTimeSeconds > 0 ? (totalIdleSeconds / totalTimeSeconds) * 100 : 0;

  // Count days with actual work
  const daysWithWork = activeHours.filter(h => h > 0).length;
  const avgDailyHours = daysWithWork > 0 ? (totalActiveSeconds / 3600) / daysWithWork : (totalActiveSeconds / 3600) / 30;

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
  const totalMinutes = Math.round(totalSeconds / 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  
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

  // Convert to arrays and sort by total time (descending)
  const projectData = Array.from(projectMap.entries())
    .map(([id, data]) => ({
      id,
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
  const requestedFreelancer = (() => {
    const value = resolvedSearchParams?.freelancer;
    if (Array.isArray(value)) {
      return value[0];
    }
    return value ?? null;
  })();

  const defaultSummary = {
    labels: [] as string[],
    activeHours: [] as number[],
    idleHours: [] as number[],
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
  let isClient = false;
  let reportEmail: string | null = decodedEmail;
  const clientEmailForSelector = decodedEmail;
  let teamMembers: TeamMemberSummary[] = [];
  let showTeamOverview = false;
  let assignedProjects: ProjectRecord[] = [];

  try {
    // Fetch viewer details (the person whose email is in the URL)
    viewerName = await fetchUserName(decodedEmail);

    // Fetch user role to determine if this is a Client
    userRole = await fetchUserRole(decodedEmail);
    isClient = userRole === 'Client';

    // If the user is a Client, build team overview and decide whether to show an individual report
    if (isClient) {
      // Get client's company from profile
      const clientProfile = await fetchUserProfile(decodedEmail);
      const clientCompany = clientProfile?.company || null;
      teamMembers = await fetchClientTeamMembers(decodedEmail, clientCompany);
      const assignedFreelancers = teamMembers.map((member) => member.email);
      const hasRequestedFreelancer =
        requestedFreelancer && assignedFreelancers.includes(requestedFreelancer);

      if (requestedFreelancer && !hasRequestedFreelancer) {
        redirect(`/reports/${encodeURIComponent(decodedEmail)}`);
      }

      showTeamOverview = !hasRequestedFreelancer;
      reportEmail = hasRequestedFreelancer ? requestedFreelancer : decodedEmail;
      
      // For clients, validate that the requested freelancer is from the same company
      if (hasRequestedFreelancer && reportEmail && clientCompany) {
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
        if (userCompanyFromDb !== clientCompany) {
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
      projectSummary = buildProjectSummary(sessions);
      if (!isClient) {
        assignedProjects = await fetchFreelancerProjects(reportEmail);
      }
    }
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error('Error loading reports:', errorMsg, error);
    errorMessage = errorMsg || 'Failed to load reports';
    summary = defaultSummary;
    projectSummary = [];
  }

  if (!errorMessage && isClient) {
    const queryEmail = requestedFreelancer ?? null;
    if (reportEmail === decodedEmail) {
      // Viewing own data; remove stale freelancer param if present
      if (queryEmail) {
        redirect(`/reports/${userEmail}`);
      }
    } else if (queryEmail !== reportEmail) {
      redirect(`/reports/${userEmail}?freelancer=${encodeURIComponent(reportEmail)}`);
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

      const lastActiveLabel = member.lastActiveAt
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

  const projectHoursMap = new Map<number, { totalHours: number }>();
  projectSummary.forEach((project) => {
    projectHoursMap.set(project.id, { totalHours: project.totalHours });
  });

  const freelancerProjectOverview = assignedProjects.map((project) => ({
    ...project,
    totalHours: projectHoursMap.get(project.id)?.totalHours ?? 0,
  }));

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
          <div className="flex items-center gap-4">
            <Image
              src="/SupagigsIcon.ico"
              alt="Supatimetracker logo"
              width={56}
              height={56}
              className="h-14 w-14 rounded-xl border border-border bg-secondary object-contain shadow"
              priority
            />
            <div>
              <h1 className="text-3xl font-bold text-foreground">
                {showTeamOverview ? 'Team overview' : `Reports for ${reportDisplayName}`}
              </h1>
              <p className="text-sm text-muted-foreground">
                {showTeamOverview
                  ? 'Monitor your freelancers at a glance and jump into detailed reports when needed.'
                  : 'Summary of the last 30 days'}
              </p>
              {!showTeamOverview && reportOwnerName && (
                <p className="text-xs text-muted-foreground">{reportEmail}</p>
              )}
            </div>
          </div>
          {errorMessage && (
            <div className="mt-2 rounded-lg border border-destructive bg-destructive/20 p-4 text-sm text-destructive-foreground">
              <strong>Error:</strong> {errorMessage}
            </div>
          )}
        </header>

        {isClient && !showTeamOverview && (
          <FreelancerSelector
            clientEmail={clientEmailForSelector}
            currentFreelancerEmail={reportEmail}
          />
        )}

        {showTeamOverview ? (
          <ClientOverview
            clientName={viewerName}
            clientEmail={decodedEmail}
            members={overviewMembers}
            metrics={overviewMetrics}
          />
        ) : isClient ? (
          <>
            <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <SummaryCard title="Total Work (30 days)" value={formatHoursMinutes(summary.totalHours)} />
              <SummaryCard title="Avg. Daily Work" value={formatHoursMinutes(summary.avgDailyHours)} />
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
              />
            </section>

            {projectSummary.length > 0 && (
              <section className="rounded-xl border border-border bg-card p-6 shadow-sm">
                <h2 className="mb-4 text-xl font-semibold text-foreground">Time Distribution by Project</h2>
                <WeeklyActivityChart
                  labels={projectSummary.map((p) => p.name)}
                  activeHours={projectSummary.map((p) => p.totalHours)}
                  idleHours={[]}
                />
              </section>
            )}
          </>
        ) : (
          <>
            <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <SummaryCard title="Assigned Projects" value={freelancerProjectOverview.length.toString()} />
              <SummaryCard title="Total Work (30 days)" value={formatHoursMinutes(summary.totalHours)} />
              <SummaryCard title="Active Today" value={formatSecondsToHoursMinutes(todayActiveSeconds)} />
              <SummaryCard title="Avg. Daily Work" value={formatHoursMinutes(summary.avgDailyHours)} />
            </section>

            <section className="rounded-xl border border-border bg-card p-6 shadow-sm">
              <h2 className="mb-4 text-xl font-semibold text-foreground">Assigned Projects</h2>
              {freelancerProjectOverview.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Your client hasn&apos;t assigned any projects to you yet.
                </p>
              ) : (
                <div className="space-y-4">
                  {freelancerProjectOverview.map((project) => (
                    <div
                      key={project.id}
                      className="rounded-xl border border-border/80 bg-card/60 p-4 shadow-sm transition hover:shadow-md"
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <h3 className="text-lg font-semibold text-foreground">{project.name}</h3>
                          {project.clientEmail && (
                            <p className="text-xs text-muted-foreground">
                              Assigned by {project.clientName ?? project.clientEmail}
                            </p>
                          )}
                          {project.description && (
                            <p className="mt-1 text-sm text-muted-foreground line-clamp-2">
                              {project.description}
                            </p>
                          )}
                        </div>
                        <div className="text-right">
                          <p className="text-xs uppercase text-muted-foreground">Tracked (30 days)</p>
                          <p className="text-lg font-semibold text-emerald-600">
                            {formatHoursMinutes(project.totalHours)}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>

            {projectSummary.length > 0 && (
              <section className="rounded-xl border border-border bg-card p-6 shadow-sm">
                <h2 className="mb-4 text-xl font-semibold text-foreground">Recent Activity</h2>
                <WeeklyActivityChart
                  labels={summary.labels.slice(-7)}
                  activeHours={summary.activeHours.slice(-7)}
                  idleHours={summary.idleHours.slice(-7)}
                />
              </section>
            )}
          </>
        )}
      </div>
    </DashboardShell>
  );
}

