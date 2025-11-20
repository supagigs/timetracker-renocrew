import { DashboardShell } from '@/components/dashboard';
import { ScreenshotIntervalForm } from '@/components/ScreenshotIntervalForm';
import { getClientSettings } from '@/lib/clientSettings';
import { fetchUserProfile } from '@/lib/userProfile';
import { redirect } from 'next/navigation';

const DEFAULT_INTERVAL_SECONDS = 300; // 5 minutes

export default async function ScreenshotIntervalPage({
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

  if (profile.category !== 'Client') {
    // Only clients can change screenshot interval – others go back to overview
    redirect(`/reports/${encodeURIComponent(decodedEmail)}`);
  }

  const existingSettings = await getClientSettings(decodedEmail);
  const intervalSeconds = existingSettings?.screenshot_interval_seconds ?? DEFAULT_INTERVAL_SECONDS;

  return (
    <DashboardShell
      userName={profile.displayName || profile.email}
      userEmail={profile.email}
      userRole={profile.category}
    >
      <div className="space-y-6">
        <header className="space-y-2">
          <h1 className="text-3xl font-bold text-foreground">Change screenshot interval</h1>
          <p className="text-sm text-muted-foreground">
            Control how frequently screenshots are captured for freelancers working on your projects.
          </p>
        </header>

        <section className="rounded-2xl border border-border bg-card p-6 shadow-sm max-w-xl">
          <ScreenshotIntervalForm clientEmail={decodedEmail} initialIntervalSeconds={intervalSeconds} />
        </section>
      </div>
    </DashboardShell>
  );
}








