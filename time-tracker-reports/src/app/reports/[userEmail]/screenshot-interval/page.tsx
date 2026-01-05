import { DashboardShell } from '@/components/dashboard';
import { ScreenshotIntervalForm } from '@/components/ScreenshotIntervalForm';
import FreelancerSelector from '@/components/FreelancerSelector';
import { getClientSettings } from '@/lib/clientSettings';
import { fetchUserProfile } from '@/lib/userProfile';
import { redirect } from 'next/navigation';

const DEFAULT_INTERVAL_SECONDS = 1800; // 30 minutes

export default async function ScreenshotIntervalPage({
  params,
  searchParams,
}: {
  params: Promise<{ userEmail: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ userEmail }, resolvedSearchParams] = await Promise.all([
    params,
    searchParams,
  ]);
  const decodedEmail = decodeURIComponent(userEmail);

  const selectedFreelancerEmail = (() => {
    const value = resolvedSearchParams?.freelancer;
    if (Array.isArray(value)) return value[0];
    return value ?? null;
  })();

  const profile = await fetchUserProfile(decodedEmail);

  if (!profile) {
    return (
      <DashboardShell
        userName={decodedEmail}
        userEmail={decodedEmail}
        userRole={null}
      >
        <div className="space-y-6">
          <section className="rounded-2xl border border-border bg-card p-6 text-center shadow-sm">
            <h1 className="text-2xl font-semibold text-foreground">
              Account not found
            </h1>
          </section>
        </div>
      </DashboardShell>
    );
  }

  if (profile.role !== 'Client') {
    redirect(`/reports/${encodeURIComponent(decodedEmail)}`);
  }

  // Validate that selected freelancer is from the same company
  if (selectedFreelancerEmail && profile.company) {
    const { getFrappeCompanyForUser } = await import('@/lib/frappeClient');
    const { createServerSupabaseClient } = await import('@/lib/supabaseServer');
    const freelancerCompany = await getFrappeCompanyForUser(selectedFreelancerEmail);
    
    // Also check Supabase as fallback
    const supabase = createServerSupabaseClient();
    const { data: userData } = await supabase
      .from('users')
      .select('company')
      .eq('email', selectedFreelancerEmail)
      .maybeSingle();
    
    const freelancerCompanyFromDb = userData?.company || freelancerCompany;
    
    // Only allow if company matches, otherwise redirect
    if (freelancerCompanyFromDb !== profile.company) {
      redirect(`/reports/${encodeURIComponent(decodedEmail)}/screenshot-interval`);
    }
  }

  const existingSettings = await getClientSettings(decodedEmail);

  const perFreelancerInterval =
    selectedFreelancerEmail && existingSettings?.freelancer_intervals
      ? existingSettings.freelancer_intervals[
          selectedFreelancerEmail.trim().toLowerCase()
        ]
      : undefined;

  const intervalSeconds = perFreelancerInterval ?? DEFAULT_INTERVAL_SECONDS;

  return (
    <DashboardShell
      userName={profile.displayName || profile.email}
      userEmail={profile.email}
      userRole={profile.role}
    >
      <div className="space-y-6">
        <header className="space-y-2">
          <h1 className="text-3xl font-bold text-foreground">
            Screenshot Settings
          </h1>
          <p className="text-sm text-muted-foreground">
            Control screenshot capture intervals and manage old screenshots
          </p>
        </header>

        <section className="rounded-2xl border border-border bg-card p-6 shadow-sm">
          <FreelancerSelector
            clientEmail={decodedEmail}
            currentFreelancerEmail={selectedFreelancerEmail ?? undefined}
            autoSelectFirst={false}
          />
        </section>

        {selectedFreelancerEmail && (
          <div className="rounded-lg border border-primary/20 bg-primary/5 p-4">
            <p className="text-sm font-medium text-primary">
              Managing settings for:{' '}
              <strong>{selectedFreelancerEmail}</strong>
            </p>
          </div>
        )}

        {selectedFreelancerEmail ? (
          <section className="rounded-2xl border border-border bg-card p-6 shadow-sm max-w-xl">
            <ScreenshotIntervalForm
              clientEmail={decodedEmail}
              freelancerEmail={selectedFreelancerEmail}
              initialIntervalSeconds={intervalSeconds}
            />
          </section>
        ) : (
          <section className="rounded-2xl border border-yellow-200 bg-yellow-50 p-6">
            <p className="text-sm text-yellow-800">
              Please select a freelancer from the dropdown above to manage their
              screenshot settings.
            </p>
          </section>
        )}
      </div>
    </DashboardShell>
  );
}
