import { DashboardShell } from '@/components/dashboard';
import FreelancerSelector from '@/components/FreelancerSelector';
import { fetchUserProfile } from '@/lib/userProfile';

export default async function ClientReportsSelectionPage({
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

  const isClient = profile.category === 'Client';

  return (
    <DashboardShell
      userName={profile.displayName || profile.email}
      userEmail={profile.email}
      userRole={profile.category}
    >
      <div className="space-y-6">
        <header className="space-y-2">
          <h1 className="text-3xl font-bold text-foreground">Reports</h1>
          <p className="text-sm text-muted-foreground">
            Choose a freelancer to open their detailed reports dashboard.
          </p>
        </header>

        {!isClient ? (
          <section className="rounded-2xl border border-border bg-card p-6 shadow-sm">
            <p className="text-sm text-muted-foreground">
              Only client accounts can browse team-wide reports. Log in with a client account to proceed.
            </p>
          </section>
        ) : (
          <section className="rounded-2xl border border-border bg-card p-6 shadow-sm">
            <p className="text-sm text-muted-foreground">
              Use the selector below to switch between the freelancers assigned to you. We'll open their
              reports in a new tab.
            </p>
            <div className="mt-6">
              <FreelancerSelector
                clientEmail={profile.email}
                currentFreelancerEmail={undefined}
                redirectBasePath={`/reports/${encodeURIComponent(profile.email)}`}
                autoSelectFirst={false}
              />
            </div>
          </section>
        )}
      </div>
    </DashboardShell>
  );
}

