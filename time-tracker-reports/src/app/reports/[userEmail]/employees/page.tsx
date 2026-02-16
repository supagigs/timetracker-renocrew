import { Users } from 'lucide-react';
import { RelativeTime } from '@/components/RelativeTime';
import { DashboardShell } from '@/components/dashboard';
import { fetchUserProfile } from '@/lib/userProfile';
import { createServerSupabaseClient } from '@/lib/supabaseServer';
import { format } from 'date-fns';
import { getAllFrappeUsers, determineRoleFromRoleProfile, getFrappeRoleProfileForEmail, getFrappeCompanyForUser, batchGetFrappeCompaniesForUsers } from '@/lib/frappeClient';

type UserSummary = {
  email: string;
  displayName: string | null;
  role: string | null;
  company: string | null;
  status: 'active' | 'offline' | 'no-data';
  todayActiveSeconds: number;
  last30ActiveSeconds: number;
  lastActiveAt: string | null;
};

/**
 * Normalize company value to ensure it's always a string or null, never an object
 */
function normalizeCompany(company: any): string | null {
  if (!company) return null;
  
  // Handle string values (including JSON strings like "{}")
  if (typeof company === 'string') {
    const trimmed = company.trim();
    // Check if it's a JSON string representation of an empty object
    if (trimmed === '{}' || trimmed === 'null' || trimmed === '') {
      return null;
    }
    // Try to parse as JSON if it looks like JSON
    if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
      try {
        const parsed = JSON.parse(trimmed);
        if (typeof parsed === 'object' && parsed !== null) {
          return normalizeCompany(parsed); // Recursively handle parsed object
        }
      } catch {
        // Not valid JSON, return as string if it's not empty
        return trimmed || null;
      }
    }
    return trimmed || null;
  }
  
  // Handle objects
  if (typeof company === 'object' && company !== null) {
    // Check if it's an empty object
    if (Object.keys(company).length === 0) {
      return null;
    }
    // Handle object with name property (common Frappe format)
    if (company.name && typeof company.name === 'string') {
      return company.name.trim() || null;
    }
    // Try to find a string value in the object
    const stringValue = Object.values(company).find((v: any) => typeof v === 'string' && v.trim());
    return stringValue ? (stringValue as string).trim() : null;
  }
  
  return null;
}

async function fetchAllUsers(): Promise<UserSummary[]> {
  const supabase = createServerSupabaseClient();

  // For managers, fetch ALL users from Frappe (not filtered by company)
  let allUserEmails: string[] = [];
  const fullNameMap = new Map<string, string | null>();
  const companyMap = new Map<string, string | null>();
  try {
    const frappeUsers = await getAllFrappeUsers(); // No company filter - get all users
    allUserEmails = frappeUsers.map((user) => {
      fullNameMap.set(user.email, user.full_name ?? null);
      companyMap.set(user.email, normalizeCompany(user.company));
      return user.email;
    });
    
    // Log company information availability
    const usersWithCompany = Array.from(companyMap.values()).filter(c => c).length;
    console.log(`[users-page] Fetched ${allUserEmails.length} users from Frappe, ${usersWithCompany} have company information from batch fetch`);
  } catch (error) {
    console.error('[users-page] Failed to fetch Frappe users, falling back to Supabase:', error);
    // Fall back to Supabase users
    const { data: supabaseUsers, error: usersError } = await supabase
      .from('users')
      .select('email');
    
    if (!usersError && supabaseUsers) {
      allUserEmails = supabaseUsers.map(u => u.email);
    }
    
    if (allUserEmails.length === 0) {
      return [];
    }
  }

  if (allUserEmails.length === 0) {
    return [];
  }

  // Get display names (prefer Frappe full_name, fallback to Supabase display_name)
  const { data: userRows, error: usersError } = await supabase
    .from('users')
    .select('email, display_name, role, company')
    .in('email', allUserEmails);

  if (usersError) {
    console.error('[users-page] Failed to fetch user details:', usersError);
    return [];
  }

  const userMap = new Map<string, { displayName: string | null; role: string | null; company: string | null }>();
  (userRows ?? []).forEach((row) => {
    userMap.set(row.email, {
      displayName: fullNameMap.get(row.email) ?? row.display_name ?? null,
      role: row.role ?? null,
      // Prefer company from Frappe (companyMap) if available, otherwise use Supabase value (normalized)
      company: companyMap.get(row.email) ?? normalizeCompany(row.company),
    });
  });

  // Batch fetch company information from Employee doctype for users missing company info
  let usersMissingCompany = allUserEmails.filter(email => !companyMap.get(email));
  if (usersMissingCompany.length > 0) {
    console.log(`[users-page] Batch fetching company for ${usersMissingCompany.length} users missing company info`);
    const batchCompanyMap = await batchGetFrappeCompaniesForUsers(usersMissingCompany);
    // Merge batch results into companyMap - the batch function already uses the correct email keys
    batchCompanyMap.forEach((company, email) => {
      if (company) {
        const normalized = normalizeCompany(company);
        if (normalized && !companyMap.has(email)) {
          companyMap.set(email, normalized);
        }
      }
    });
    console.log(`[users-page] After batch fetch, ${Array.from(companyMap.values()).filter(c => c).length} users have company information`);
    
    // For users still missing company, try individual fetches (fallback)
    usersMissingCompany = allUserEmails.filter(email => !companyMap.get(email));
    if (usersMissingCompany.length > 0) {
      console.log(`[users-page] Attempting individual company fetches for ${usersMissingCompany.length} remaining users`);
      for (const email of usersMissingCompany.slice(0, 10)) { // Limit to 10 to avoid rate limiting
        try {
          const company = await getFrappeCompanyForUser(email);
          if (company) {
            const normalized = normalizeCompany(company);
            if (normalized) {
              companyMap.set(email, normalized);
            }
          }
        } catch (error) {
          console.warn(`[users-page] Failed to fetch company individually for ${email}:`, error);
        }
      }
      console.log(`[users-page] After individual fetches, ${Array.from(companyMap.values()).filter(c => c).length} users have company information`);
    }
  }
  
  // Fetch role from Frappe for all users and update Supabase with company info
  for (const email of allUserEmails) {
    try {
      const roleProfile = await getFrappeRoleProfileForEmail(email);
      
      const existing = userMap.get(email);
      const companyFromFrappe = companyMap.get(email);
      
      // Use company from Frappe (batch or individual), fallback to Supabase (normalized)
      const company = normalizeCompany(companyFromFrappe ?? existing?.company);
      
      userMap.set(email, {
        displayName: existing?.displayName ?? fullNameMap.get(email) ?? null,
        role: roleProfile ?? existing?.role ?? null,
        company: company,
      });
      
      // Update Supabase with company information if we have it from Frappe and it's different
      if (company && company !== existing?.company) {
        try {
          await supabase
            .from('users')
            .update({ company: company })
            .eq('email', email);
        } catch (updateError) {
          console.warn(`[users-page] Failed to update company in Supabase for ${email}:`, updateError);
        }
      }
    } catch (error) {
      console.warn(`[users-page] Failed to fetch role for ${email}:`, error);
    }
  }

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
    .in('user_email', allUserEmails)
    .gte('session_date', startDateStr)
    .lte('session_date', endDateStr)
    .order('start_time', { ascending: false });

  if (sessionsError) {
    console.error('Error fetching employee sessions:', sessionsError);
    throw sessionsError;
  }

  // Key by lowercase email so lookups match regardless of DB vs Frappe casing
  const sessionsByUser = new Map<string, typeof sessionRows>();
  (sessionRows ?? []).forEach((session) => {
    const key = (session.user_email ?? '').trim().toLowerCase();
    const list = sessionsByUser.get(key) ?? [];
    list.push(session);
    sessionsByUser.set(key, list);
  });

  // Open session counts as "active" if it's from today (server) OR started within last 24h (timezone-safe)
  const now = new Date();
  const ms24h = 24 * 60 * 60 * 1000;
  const isOpenSessionActive = (session: { end_time: string | null; session_date: string; start_time: string | null }) => {
    if (session.end_time != null) return false;
    if (session.session_date === todayStr) return true;
    if (!session.start_time) return false;
    const start = new Date(session.start_time).getTime();
    return now.getTime() - start < ms24h;
  };

  return allUserEmails.map((email) => {
    const key = email.trim().toLowerCase();
    const memberSessions = sessionsByUser.get(key) ?? [];
    const userData = userMap.get(email);

    const todayActiveSeconds = memberSessions
      .filter((session) => session.session_date === todayStr)
      .reduce((total, session) => total + (session.active_duration ?? 0), 0);

    const last30ActiveSeconds = memberSessions.reduce(
      (total, session) => total + (session.active_duration ?? 0),
      0,
    );

    const lastSession = memberSessions[0];

    // Determine status: active = open session that is today or started within 24h (timezone-safe)
    const activeSession = memberSessions.find(isOpenSessionActive);

    let status: UserSummary['status'] = 'no-data';
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
      displayName: userData?.displayName ?? null,
      role: userData?.role ?? null,
      company: userData?.company ?? null,
      status,
      todayActiveSeconds,
      last30ActiveSeconds,
      lastActiveAt,
    } satisfies UserSummary;
  });
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
  const isManager = convertedRole === 'Manager';
  const users = isManager
    ? await fetchAllUsers()
    : [];
  const sortedUsers = [...users].sort((a, b) => {
    const nameA = (a.displayName || a.email).toLowerCase();
    const nameB = (b.displayName || b.email).toLowerCase();
    return nameA.localeCompare(nameB);
  });

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
            {isManager
              ? 'View all users in Frappe with their role and company information.'
              : 'Only manager accounts can view user listings.'}
          </p>
        </header>

        {!isManager ? (
          <section className="rounded-2xl border border-border bg-card p-6 shadow-sm">
            <p className="text-sm text-muted-foreground">
              Only manager accounts can view user listings.
            </p>
          </section>
        ) : sortedUsers.length === 0 ? (
          <section className="rounded-2xl border border-dashed border-border/60 bg-card p-10 text-center shadow-sm">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-secondary/70 text-secondary-foreground">
              <Users size={24} />
            </div>
            <h2 className="mt-4 text-xl font-semibold text-foreground">No users found</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              No users were found in Frappe.
            </p>
          </section>
        ) : (
          <section className="rounded-2xl border border-border bg-card p-6 shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-muted-foreground">
                    <th className="px-4 py-3 font-medium">User</th>
                    <th className="px-4 py-3 font-medium">Role</th>
                    <th className="px-4 py-3 font-medium">Company</th>
                    <th className="px-4 py-3 font-medium">Today</th>
                    <th className="px-4 py-3 font-medium">Last 30 days</th>
                    <th className="px-4 py-3 font-medium">Status</th>
                    <th className="px-4 py-3 font-medium">Last active</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedUsers.map((user) => {
                    const statusConfig: Record<UserSummary['status'], { label: string; classes: string }> = {
                      active: { label: 'Working now', classes: 'bg-emerald-100 text-emerald-700' },
                      offline: { label: 'Offline', classes: 'bg-slate-200 text-slate-700' },
                      'no-data': { label: 'No activity', classes: 'bg-amber-100 text-amber-700' },
                    };

                    const { label, classes } = statusConfig[user.status];

                    return (
                      <tr key={user.email} className="border-b border-border/60 transition-colors hover:bg-secondary/60">
                        <td className="px-4 py-3 text-foreground">
                          <div className="font-semibold">{user.displayName || user.email}</div>
                          <div className="text-xs text-muted-foreground">{user.email}</div>
                        </td>
                        <td className="px-4 py-3 text-foreground">
                          {user.role || '—'}
                        </td>
                        <td className="px-4 py-3 text-foreground">
                          {normalizeCompany(user.company) || '—'}
                        </td>
                        <td className="px-4 py-3 text-foreground">
                          {formatSecondsToHoursMinutes(user.todayActiveSeconds)}
                        </td>
                        <td className="px-4 py-3 text-foreground">
                          {formatSecondsToHoursMinutes(user.last30ActiveSeconds)}
                        </td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ${classes}`}>
                            {label}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-foreground">
                          {user.status === 'active'
                            ? 'Active now'
                            : user.lastActiveAt
                              ? <RelativeTime isoDate={user.lastActiveAt} />
                              : 'No activity yet'}
                        </td>
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

