import { format } from 'date-fns';
import ScreenshotSelector from '@/components/ScreenshotSelector';
import FreelancerSelector from '@/components/FreelancerSelector';
import { DashboardShell } from '@/components/dashboard';
import { createServerSupabaseClient } from '@/lib/supabaseServer';
import { fetchUserProfile } from '@/lib/userProfile';
import { type DateRange, normalizeDateRange } from '@/lib/dateRange';

type TimeSession = {
  id: number;
  session_date: string;
  start_time: string;
  end_time: string | null;
};

type Screenshot = {
  id: number;
  session_id: number;
  screenshot_data: string;
  captured_at: string;
  app_name: string | null;
  captured_idle: boolean | null;
};

async function fetchSessionsInRange(userEmail: string, dateRange: DateRange): Promise<TimeSession[]> {
  const supabase = createServerSupabaseClient();

  const { data, error } = await supabase
    .from('time_sessions')
    .select('id, session_date, start_time, end_time')
    .eq('user_email', userEmail)
    .gte('session_date', dateRange.start)
    .lte('session_date', dateRange.end)
    .order('session_date', { ascending: false })
    .order('start_time', { ascending: false });

  if (error) {
    console.error('[screenshots-page] Failed to load sessions', error);
    return [];
  }

  return (data ?? []) as TimeSession[];
}

async function fetchScreenshots(userEmail: string, sessionId?: number): Promise<Screenshot[]> {
  const supabase = createServerSupabaseClient();

  const buildQuery = (includeMeta: boolean) =>
    supabase
      .from('screenshots')
      .select(
        includeMeta
          ? 'id, session_id, screenshot_data, captured_at, app_name, captured_idle'
          : 'id, session_id, screenshot_data, captured_at'
      )
      .eq('user_email', userEmail)
      .order('captured_at', { ascending: true })
      .limit(100);

  let query = buildQuery(true);

  if (sessionId) {
    query = query.eq('session_id', sessionId);
  }

  const { data, error } = await query;
  if (error) {
    if (error.code === '42703' || /(app_name|captured_idle)/.test(error.message ?? '')) {
      const fallbackQuery = buildQuery(false);
      const fallbackResult = sessionId ? fallbackQuery.eq('session_id', sessionId) : fallbackQuery;
      const { data: fallbackData, error: fallbackError } = await fallbackResult;
      if (fallbackError) {
        console.error('[screenshots-page] Failed to load screenshots (fallback)', fallbackError);
        return [];
      }
      return (fallbackData ?? []).map((row) => ({ ...row, app_name: null, captured_idle: null })) as Screenshot[];
    }

    console.error('[screenshots-page] Failed to load screenshots', error);
    return [];
  }

  return (data ?? []) as Screenshot[];
}

export default async function ScreenshotsPage({
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

  const isClient = profile.category === 'Client';

  const requestedFreelancer = (() => {
    const value = resolvedSearchParams?.freelancer;
    if (Array.isArray(value)) {
      return value[0];
    }
    return value ?? null;
  })();

  const targetEmail = isClient ? requestedFreelancer ?? null : profile.email;
  const dateRange = normalizeDateRange(resolvedSearchParams);

  const sessions = targetEmail ? await fetchSessionsInRange(targetEmail, dateRange) : [];
  const latestSessionId = sessions[0]?.id;
  const screenshots = targetEmail ? await fetchScreenshots(targetEmail, latestSessionId) : [];

  const showPicker = isClient;
  const hasSelection = Boolean(targetEmail);

  return (
    <DashboardShell
      userName={profile.displayName || profile.email}
      userEmail={profile.email}
      userRole={profile.category}
    >
      <div className="space-y-6">
        <header className="space-y-2">
          <h1 className="text-3xl font-bold text-foreground">Screenshots</h1>
          <p className="text-sm text-muted-foreground">
            Browse captured screenshots by session{isClient ? '. Choose a freelancer to get started.' : '.'}
          </p>
        </header>

        <section className="rounded-2xl border border-border bg-card p-6 shadow-sm">
          <form className="flex flex-col gap-4 sm:flex-row sm:items-end" method="get">
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
            {isClient && requestedFreelancer ? (
              <input type="hidden" name="freelancer" value={requestedFreelancer} />
            ) : null}
            <button
              type="submit"
              className="inline-flex h-10 items-center justify-center rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-sm transition hover:bg-primary/90"
            >
              Apply Filters
            </button>
          </form>
        </section>

        {showPicker && (
          <section className="rounded-2xl border border-border bg-card p-6 shadow-sm">
            <p className="text-sm text-muted-foreground">
              Select a freelancer to load their latest sessions and screenshots.
            </p>
            <div className="mt-6">
              <FreelancerSelector
                clientEmail={profile.email}
                currentFreelancerEmail={requestedFreelancer ?? undefined}
                redirectBasePath={`/reports/${encodeURIComponent(profile.email)}/screenshots`}
                autoSelectFirst={false}
              />
            </div>
          </section>
        )}

        {!hasSelection && showPicker ? (
          <section className="rounded-2xl border border-dashed border-border/60 bg-card p-10 text-center shadow-sm">
            <h2 className="text-xl font-semibold text-foreground">No freelancer selected</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Pick a freelancer from the selector above to view their screenshots.
            </p>
          </section>
        ) : sessions.length === 0 ? (
          <section className="rounded-2xl border border-dashed border-border/60 bg-card p-10 text-center shadow-sm">
            <h2 className="text-xl font-semibold text-foreground">No sessions available</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              {isClient
                ? 'We could not find any recent sessions for this freelancer.'
                : 'You have not captured any screenshots during the selected period.'}
            </p>
          </section>
        ) : (
          <section className="rounded-2xl border border-border bg-card p-6 shadow-sm">
            <ScreenshotSelector
              userEmail={targetEmail ?? profile.email}
              sessions={sessions}
              initialScreenshots={screenshots}
              initialSessionId={latestSessionId}
            />
          </section>
        )}
      </div>
    </DashboardShell>
  );
}

