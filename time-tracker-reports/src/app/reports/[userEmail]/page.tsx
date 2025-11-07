import { format } from 'date-fns';
import Image from 'next/image';
import SummaryCard from '@/components/SummaryCard';
import WeeklyActivityChart from '@/components/WeeklyActivityChart';
import ScreenshotSelector from '@/components/ScreenshotSelector';
import FreelancerSelector from '@/components/FreelancerSelector';
import { createServerSupabaseClient } from '@/lib/supabaseServer';

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

type Screenshot = {
  id: number;
  session_id: number;
  screenshot_data: string;
  captured_at: string;
};

async function fetchLastMonthSessions(userEmail: string): Promise<TimeSession[]> {
  const supabase = createServerSupabaseClient();

  const endDate = new Date();
  const startDate = new Date();
  startDate.setDate(endDate.getDate() - 29); // 30 days total (0-29 = 30 days)

  const startDateStr = format(startDate, 'yyyy-MM-dd');
  const endDateStr = format(endDate, 'yyyy-MM-dd');

  console.log('Fetching sessions for:', { userEmail, startDate: startDateStr, endDate: endDateStr });

  const { data, error } = await supabase
    .from('time_sessions')
    .select(`
      *,
      projects (
        id,
        project_name
      )
    `)
    .eq('user_email', userEmail)
    .gte('session_date', startDateStr)
    .lte('session_date', endDateStr)
    .order('start_time', { ascending: false });

  if (error) {
    console.error('Error fetching sessions:', error);
    throw error;
  }

  console.log(`Found ${data?.length ?? 0} sessions for ${userEmail}`);
  return (data ?? []) as TimeSession[];
}

async function fetchScreenshots(userEmail: string, sessionId?: number): Promise<Screenshot[]> {
  const supabase = createServerSupabaseClient();
  let query = supabase
    .from('screenshots')
    .select('id, session_id, screenshot_data, captured_at')
    .eq('user_email', userEmail)
    .order('captured_at', { ascending: true })
    .limit(100);

  if (sessionId) {
    query = query.eq('session_id', sessionId);
  }

  const { data, error } = await query;
  if (error) {
    throw error;
  }

  return (data ?? []) as Screenshot[];
}

async function fetchUserName(userEmail: string): Promise<string | null> {
  const supabase = createServerSupabaseClient();
  
  const { data, error } = await supabase
    .from('users')
    .select('display_name')
    .eq('email', userEmail)
    .single();

  if (error) {
    console.error('Error fetching user name:', error);
    return null;
  }

  return data?.display_name || null;
}

async function fetchUserCategory(userEmail: string): Promise<string | null> {
  const supabase = createServerSupabaseClient();
  
  const { data, error } = await supabase
    .from('users')
    .select('category')
    .eq('email', userEmail)
    .single();

  if (error) {
    console.error('Error fetching user category:', error);
    return null;
  }

  return data?.category || null;
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
      const projectName = session.projects.project_name || `Project ${projectId}`;
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
}: {
  params: Promise<{ userEmail: string }>;
}) {
  const { userEmail } = await params;
  const decodedEmail = decodeURIComponent(userEmail);
  
  let sessions: TimeSession[] = [];
  let summary;
  let projectSummary: Array<{ id: number; name: string; totalHours: number; totalSeconds: number }> = [];
  let screenshots: Screenshot[] = [];
  let errorMessage: string | null = null;
  let latestSessionId: number | undefined;
  let userName: string | null = null;
  let userCategory: string | null = null;
  let isClient = false;
  let reportEmail = decodedEmail; // Email of the person whose report we're showing
  let clientEmailForSelector = decodedEmail; // Client email to pass to selector

  try {
    const supabase = createServerSupabaseClient();
    
    // Fetch user category to determine if this is a Client
    userCategory = await fetchUserCategory(decodedEmail);
    isClient = userCategory === 'Client';

    // If the user is a Client, we need to determine which freelancer's report to show
    if (isClient) {
      clientEmailForSelector = decodedEmail; // Set the client email for the selector
      
      // Check if there's a freelancer assigned to this client
      // If the URL email is a Client, we'll show the first freelancer's report
      const { data: assignments } = await supabase
        .from('client_freelancer_assignments')
        .select('freelancer_email')
        .eq('client_email', decodedEmail)
        .eq('is_active', true)
        .limit(1)
        .single();
      
      if (assignments) {
        reportEmail = assignments.freelancer_email;
      } else {
        // No freelancers assigned, show empty report
        reportEmail = decodedEmail;
      }
    } else {
      // For freelancers, show their own report
      // The dropdown should NOT be visible for freelancers
      reportEmail = decodedEmail;
    }

    // Fetch user name for the report owner
    userName = await fetchUserName(reportEmail);
    
    sessions = await fetchLastMonthSessions(reportEmail);
    summary = buildMonthlySummary(sessions);
    projectSummary = buildProjectSummary(sessions);
    latestSessionId = sessions[0]?.id;
    screenshots = await fetchScreenshots(reportEmail, latestSessionId);
  } catch (error) {
    console.error('Error loading reports:', error);
    errorMessage = error instanceof Error ? error.message : 'Failed to load reports';
    summary = {
      labels: [],
      activeHours: [],
      idleHours: [],
      totalHours: 0,
      totalIdleSeconds: 0,
      avgIdlePercent: 0,
      avgDailyHours: 0,
    };
    projectSummary = [];
  }

  // Use display name if available, otherwise fallback to email
  const displayName = userName || reportEmail;

  return (
    <div className="min-h-screen bg-slate-900 text-white">
      <div className="mx-auto max-w-6xl space-y-10 px-6 py-10">
        <header className="space-y-3">
          <div className="flex items-center gap-4">
            <Image
              src="/supagigs-logo.png"
              alt="Supatimetracker logo"
              width={56}
              height={56}
              className="h-14 w-14 rounded-xl border border-slate-700 bg-slate-900 object-contain shadow-lg"
              priority
            />
            <div>
              <h1 className="text-3xl font-bold">Reports for {displayName}</h1>
              <p className="text-slate-400">Summary of the last 30 days</p>
              {userName && (
                <p className="text-sm text-slate-500">{reportEmail}</p>
              )}
            </div>
          </div>
          {errorMessage && (
            <div className="mt-2 rounded-lg bg-red-900/50 p-4 text-red-200">
              <strong>Error:</strong> {errorMessage}
            </div>
          )}
        </header>

        {/* Show freelancer selector only if user is a Client */}
        {isClient && (
          <FreelancerSelector
            clientEmail={clientEmailForSelector}
            currentFreelancerEmail={reportEmail}
          />
        )}

        <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <SummaryCard title="Total Work (30 days)" value={formatHoursMinutes(summary.totalHours)} />
          <SummaryCard title="Avg. Daily Work" value={formatHoursMinutes(summary.avgDailyHours)} />
          <SummaryCard title="Avg. Idle %" value={`${summary.avgIdlePercent.toFixed(1)}%`} />
          <SummaryCard title="Total Idle" value={formatSecondsToHoursMinutes(summary.totalIdleSeconds)} />
        </section>

        {/* Project Time Summary */}
        {projectSummary.length > 0 && (
          <section className="rounded-xl bg-slate-800 p-6 shadow">
            <h2 className="mb-4 text-xl font-semibold">Time by Project (Last 30 Days)</h2>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-slate-700">
                    <th className="px-4 py-3 text-left text-sm font-medium text-slate-300">Project Name</th>
                    <th className="px-4 py-3 text-right text-sm font-medium text-slate-300">Total Time</th>
                  </tr>
                </thead>
                <tbody>
                  {projectSummary.map((project) => (
                    <tr key={project.id} className="border-b border-slate-700/50 hover:bg-slate-700/30">
                      <td className="px-4 py-3 text-slate-200">{project.name}</td>
                      <td className="px-4 py-3 text-right font-semibold text-green-400">
                        {formatHoursMinutes(project.totalHours)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {/* Daily Activity Chart */}
        <section className="rounded-xl bg-slate-800 p-6 shadow">
          <h2 className="mb-4 text-xl font-semibold">Daily Activity (Last 30 Days)</h2>
          <WeeklyActivityChart
            labels={summary.labels}
            activeHours={summary.activeHours}
            idleHours={summary.idleHours}
          />
        </section>

        {/* Project Breakdown Chart */}
        {projectSummary.length > 0 && (
          <section className="rounded-xl bg-slate-800 p-6 shadow">
            <h2 className="mb-4 text-xl font-semibold">Time Distribution by Project</h2>
            <WeeklyActivityChart
              labels={projectSummary.map(p => p.name)}
              activeHours={projectSummary.map(p => p.totalHours)}
              idleHours={[]}
            />
          </section>
        )}

        <ScreenshotSelector
          userEmail={reportEmail}
          sessions={sessions.filter(session => {
            // Ensure we only show sessions from the last 30 days
            // Compare date strings directly (YYYY-MM-DD format)
            const sessionDateStr = session.session_date;
            const endDate = new Date();
            const startDate = new Date();
            startDate.setDate(endDate.getDate() - 29); // 30 days total
            
            const startDateStr = format(startDate, 'yyyy-MM-dd');
            const endDateStr = format(endDate, 'yyyy-MM-dd');
            
            return sessionDateStr >= startDateStr && sessionDateStr <= endDateStr;
          })}
          initialScreenshots={screenshots}
          initialSessionId={latestSessionId}
        />
      </div>
    </div>
  );
}

