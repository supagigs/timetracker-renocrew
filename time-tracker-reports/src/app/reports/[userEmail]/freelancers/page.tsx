import { formatDistanceToNow } from 'date-fns';
import { Users } from 'lucide-react';
import { DashboardShell } from '@/components/dashboard';
import { fetchUserProfile } from '@/lib/userProfile';
import { createServerSupabaseClient } from '@/lib/supabaseServer';
import { format } from 'date-fns';
import { getAllFrappeUsers } from '@/lib/frappeClient';

type FreelancerSummary = {
  email: string;
  displayName: string | null;
  status: 'active' | 'offline' | 'no-data';
  todayActiveSeconds: number;
  last30ActiveSeconds: number;
  lastActiveAt: string | null;
};

async function fetchClientFreelancers(clientEmail: string, clientCompany: string | null): Promise<FreelancerSummary[]> {
  const supabase = createServerSupabaseClient();

  // For clients, fetch users from Frappe filtered by company
  let freelancerEmails: string[] = [];
  try {
    const frappeUsers = await getAllFrappeUsers(clientCompany || undefined);
    // Exclude the client themselves from the list
    freelancerEmails = frappeUsers
      .filter((user) => user.email.toLowerCase() !== clientEmail.toLowerCase())
      .map((user) => user.email);
  } catch (error) {
    console.error('[client-freelancers] Failed to fetch Frappe users, falling back to Supabase:', error);
    // Fall back to Supabase users with same company if Frappe fails
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

  if (freelancerEmails.length === 0) {
    return [];
  }

  const { data: userRows, error: usersError } = await supabase
    .from('users')
    .select('email, display_name')
    .in('email', freelancerEmails);

  if (usersError) {
    console.error('[client-freelancers] Failed to fetch freelancer details:', usersError);
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
    .in('user_email', freelancerEmails)
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

  return freelancerEmails.map((email) => {
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

    // No-op: user_sessions table is no longer used
    // Determine status based on time_sessions only
    const activeSession = memberSessions.find(
      (session) => session.end_time === null && session.session_date === todayStr,
    );

    let status: FreelancerSummary['status'] = 'no-data';
    if (memberSessions.length === 0) {
      status = 'no-data';
    } else if (activeSession) {
      status = 'active';
    } else {
      status = 'offline';
    }

    const lastActiveAt = lastSessionTimestamp;

    return {
      email,
      displayName: nameMap.get(email) ?? null,
      status,
      todayActiveSeconds,
      last30ActiveSeconds,
      lastActiveAt,
    } satisfies FreelancerSummary;
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

export default async function ClientFreelancersPage({
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

  const freelancers = profile.role === 'Client'
    ? await fetchClientFreelancers(profile.email, profile.company)
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

        {profile.role !== 'Client' ? (
          <section className="rounded-2xl border border-border bg-card p-6 shadow-sm">
            <p className="text-sm text-muted-foreground">
              Only client accounts can manage user assignments.
            </p>
          </section>
        ) : freelancers.length === 0 ? (
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
                  {freelancers.map((freelancer) => {
                    const lastActiveLabel = freelancer.lastActiveAt
                      ? formatDistanceToNow(new Date(freelancer.lastActiveAt), { addSuffix: true })
                      : 'No activity yet';

                    const statusConfig: Record<FreelancerSummary['status'], { label: string; classes: string }> = {
                      active: { label: 'Working now', classes: 'bg-emerald-100 text-emerald-700' },
                      offline: { label: 'Offline', classes: 'bg-slate-200 text-slate-700' },
                      'no-data': { label: 'No activity', classes: 'bg-amber-100 text-amber-700' },
                    };

                    const { label, classes } = statusConfig[freelancer.status];

                    return (
                      <tr key={freelancer.email} className="border-b border-border/60 transition-colors hover:bg-secondary/60">
                        <td className="px-4 py-3 text-foreground">
                          <div className="font-semibold">{freelancer.displayName || freelancer.email}</div>
                          <div className="text-xs text-muted-foreground">{freelancer.email}</div>
                        </td>
                        <td className="px-4 py-3 text-foreground">
                          {formatSecondsToHoursMinutes(freelancer.todayActiveSeconds)}
                        </td>
                        <td className="px-4 py-3 text-foreground">
                          {formatSecondsToHoursMinutes(freelancer.last30ActiveSeconds)}
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



