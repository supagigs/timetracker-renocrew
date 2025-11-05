import { format } from 'date-fns';
import SummaryCard from '@/components/SummaryCard';
import WeeklyActivityChart from '@/components/WeeklyActivityChart';
import ScreenshotSelector from '@/components/ScreenshotSelector';
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
};

type Screenshot = {
  id: number;
  session_id: number;
  screenshot_data: string;
  captured_at: string;
};

async function fetchLastWeekSessions(userEmail: string): Promise<TimeSession[]> {
  const supabase = createServerSupabaseClient();

  const endDate = new Date();
  const startDate = new Date();
  startDate.setDate(endDate.getDate() - 6);

  const startDateStr = format(startDate, 'yyyy-MM-dd');
  const endDateStr = format(endDate, 'yyyy-MM-dd');

  console.log('Fetching sessions for:', { userEmail, startDate: startDateStr, endDate: endDateStr });

  const { data, error } = await supabase
    .from('time_sessions')
    .select('*')
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

function buildWeeklySummary(sessions: TimeSession[]) {
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
  for (let i = 6; i >= 0; i -= 1) {
    const date = new Date(now);
    date.setDate(now.getDate() - i);
    const key = format(date, 'yyyy-MM-dd');
    const label = format(date, 'EEE');
    labels.push(label);
    const entry = daily.get(key);
    activeHours.push(((entry?.active ?? 0) / 3600));
    idleHours.push(((entry?.idle ?? 0) / 3600));
  }

  const totalActiveSeconds = sessions.reduce((sum, session) => sum + (session.active_duration ?? 0), 0);
  const totalIdleSeconds = sessions.reduce((sum, session) => sum + (session.idle_duration ?? 0), 0);
  const totalTimeSeconds = totalActiveSeconds + totalIdleSeconds;
  const avgIdlePercent = totalTimeSeconds > 0 ? (totalIdleSeconds / totalTimeSeconds) * 100 : 0;

  return {
    labels,
    activeHours,
    idleHours,
    totalHours: totalActiveSeconds / 3600,
    totalIdleSeconds,
    avgIdlePercent,
    avgDailyHours: (totalActiveSeconds / 3600) / 7,
  };
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
  let screenshots: Screenshot[] = [];
  let errorMessage: string | null = null;
  let latestSessionId: number | undefined;
  let userName: string | null = null;

  try {
    // Fetch user name
    userName = await fetchUserName(decodedEmail);
    
    sessions = await fetchLastWeekSessions(decodedEmail);
    summary = buildWeeklySummary(sessions);
    latestSessionId = sessions[0]?.id;
    screenshots = await fetchScreenshots(decodedEmail, latestSessionId);
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
  }

  // Use display name if available, otherwise fallback to email
  const displayName = userName || decodedEmail;

  return (
    <div className="min-h-screen bg-slate-900 text-white">
      <div className="mx-auto max-w-6xl space-y-10 px-6 py-10">
        <header className="space-y-1">
          <h1 className="text-3xl font-bold">Reports for {displayName}</h1>
          <p className="text-slate-400">Summary of the last 7 days</p>
          {userName && (
            <p className="text-sm text-slate-500">{decodedEmail}</p>
          )}
          {errorMessage && (
            <div className="mt-4 rounded-lg bg-red-900/50 p-4 text-red-200">
              <strong>Error:</strong> {errorMessage}
            </div>
          )}
        </header>

        <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <SummaryCard title="Total Work (7 days)" value={`${summary.totalHours.toFixed(1)} h`} />
          <SummaryCard title="Avg. Daily Work" value={`${summary.avgDailyHours.toFixed(1)} h`} />
          <SummaryCard title="Avg. Idle %" value={`${summary.avgIdlePercent.toFixed(1)}%`} />
          <SummaryCard title="Total Idle" value={`${Math.round(summary.totalIdleSeconds / 60)} min`} />
        </section>

        <section className="rounded-xl bg-slate-800 p-6 shadow">
          <WeeklyActivityChart
            labels={summary.labels}
            activeHours={summary.activeHours}
            idleHours={summary.idleHours}
          />
        </section>

        <ScreenshotSelector
          userEmail={decodedEmail}
          sessions={sessions}
          initialScreenshots={screenshots}
          initialSessionId={latestSessionId}
        />
      </div>
    </div>
  );
}

