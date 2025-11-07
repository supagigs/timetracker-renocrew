import { format } from 'date-fns';
import { CalendarClock } from 'lucide-react';
import { DashboardShell } from '@/components/dashboard';
import { fetchUserProfile } from '@/lib/userProfile';
import { createServerSupabaseClient } from '@/lib/supabaseServer';

type TimesheetRow = {
  id: number;
  freelancerEmail: string;
  freelancerName: string | null;
  projectName: string | null;
  sessionDate: string;
  startTime: string | null;
  endTime: string | null;
  activeSeconds: number;
  breakSeconds: number;
  idleSeconds: number;
  totalSeconds: number;
};

async function fetchClientTimesheet({
  email,
}: {
  email: string;
}): Promise<TimesheetRow[]> {
  const supabase = createServerSupabaseClient();

  const { data: assignments, error: assignmentsError } = await supabase
    .from('client_freelancer_assignments')
    .select('freelancer_email')
    .eq('client_email', email)
    .eq('is_active', true);

  if (assignmentsError) {
    console.error('[client-timesheet] Failed to fetch assignments:', assignmentsError);
    return [];
  }

  const freelancerEmails = Array.from(
    new Set(
      (assignments ?? [])
        .map((entry) => entry.freelancer_email)
        .filter((value): value is string => Boolean(value)),
    ),
  );

  if (freelancerEmails.length === 0) {
    return [];
  }

  const { data: userRows, error: usersError } = await supabase
    .from('users')
    .select('email, display_name')
    .in('email', freelancerEmails);

  if (usersError) {
    console.error('[client-timesheet] Failed to fetch freelancer names:', usersError);
    return [];
  }

  const nameMap = new Map<string, string | null>();
  (userRows ?? []).forEach((row) => {
    nameMap.set(row.email, row.display_name ?? null);
  });

  const { data: sessions, error: sessionsError } = await supabase
    .from('time_sessions')
    .select(
      `
        id,
        user_email,
        session_date,
        start_time,
        end_time,
        total_duration,
        active_duration,
        break_duration,
        idle_duration,
        projects ( project_name )
      `,
    )
    .in('user_email', freelancerEmails)
    .order('session_date', { ascending: false })
    .order('start_time', { ascending: false })
    .limit(200);

  if (sessionsError) {
    console.warn('[client-timesheet] Time session query returned an error, defaulting to empty list.', sessionsError);
    return [];
  }

  if (!sessions) {
    return [];
  }

  return sessions.map((session) => ({
    id: session.id,
    freelancerEmail: session.user_email,
    freelancerName: nameMap.get(session.user_email) ?? session.user_email,
    projectName: session.projects?.project_name ?? null,
    sessionDate: session.session_date,
    startTime: session.start_time,
    endTime: session.end_time,
    activeSeconds: session.active_duration ?? 0,
    breakSeconds: session.break_duration ?? 0,
    idleSeconds: session.idle_duration ?? 0,
    totalSeconds: session.total_duration ?? (session.active_duration ?? 0) + (session.break_duration ?? 0) + (session.idle_duration ?? 0),
  }));
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

export default async function ClientTimesheetPage({
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
              We couldn't locate your account details. Please ensure you are logged in with the correct email.
            </p>
          </section>
        </div>
      </DashboardShell>
    );
  }

  const timesheetRows = profile.category === 'Client'
    ? await fetchClientTimesheet({ email: profile.email })
    : [];

  return (
    <DashboardShell
      userName={profile.displayName || profile.email}
      userEmail={profile.email}
      userRole={profile.category}
    >
      <div className="space-y-6">
        <header className="space-y-2">
          <h1 className="text-3xl font-bold text-foreground">Timesheet</h1>
          <p className="text-sm text-muted-foreground">
            Review detailed session logs for each freelancer assigned to your projects.
          </p>
        </header>

        {profile.category !== 'Client' ? (
          <section className="rounded-2xl border border-border bg-card p-6 shadow-sm">
            <p className="text-sm text-muted-foreground">
              Timesheets are available for client accounts only.
            </p>
          </section>
        ) : timesheetRows.length === 0 ? (
          <section className="rounded-2xl border border-dashed border-border/60 bg-card p-10 text-center shadow-sm">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-secondary/70 text-secondary-foreground">
              <CalendarClock size={24} />
            </div>
            <h2 className="mt-4 text-xl font-semibold text-foreground">No timesheet entries yet</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Once your freelancers track time in the desktop app, their sessions will show up here.
            </p>
          </section>
        ) : (
          <section className="rounded-2xl border border-border bg-card p-6 shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-muted-foreground">
                    <th className="px-4 py-3 font-medium">Date</th>
                    <th className="px-4 py-3 font-medium">Freelancer</th>
                    <th className="px-4 py-3 font-medium">Project</th>
                    <th className="px-4 py-3 font-medium">Active</th>
                    <th className="px-4 py-3 font-medium">Break</th>
                    <th className="px-4 py-3 font-medium">Idle</th>
                    <th className="px-4 py-3 font-medium">Total</th>
                    <th className="px-4 py-3 font-medium">Start</th>
                    <th className="px-4 py-3 font-medium">End</th>
                  </tr>
                </thead>
                <tbody>
                  {timesheetRows.map((row) => (
                    <tr key={row.id} className="border-b border-border/60 transition-colors hover:bg-secondary/60">
                      <td className="px-4 py-3 text-foreground">{format(new Date(row.sessionDate), 'PPP')}</td>
                      <td className="px-4 py-3 text-foreground">
                        <div className="font-semibold">{row.freelancerName || row.freelancerEmail}</div>
                        <div className="text-xs text-muted-foreground">{row.freelancerEmail}</div>
                      </td>
                      <td className="px-4 py-3 text-foreground">{row.projectName ?? '—'}</td>
                      <td className="px-4 py-3 text-foreground">{formatSecondsToHoursMinutes(row.activeSeconds)}</td>
                      <td className="px-4 py-3 text-foreground">{formatSecondsToHoursMinutes(row.breakSeconds)}</td>
                      <td className="px-4 py-3 text-foreground">{formatSecondsToHoursMinutes(row.idleSeconds)}</td>
                      <td className="px-4 py-3 text-foreground">{formatSecondsToHoursMinutes(row.totalSeconds)}</td>
                      <td className="px-4 py-3 text-foreground">{row.startTime ? format(new Date(row.startTime), 'p') : '—'}</td>
                      <td className="px-4 py-3 text-foreground">{row.endTime ? format(new Date(row.endTime), 'p') : '—'}</td>
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

