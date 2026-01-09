import { DashboardShell } from '@/components/dashboard';
import { ScreenshotIntervalForm } from '@/components/ScreenshotIntervalForm';
import EmployeeSelector from '@/components/FreelancerSelector';
import { getManagerSettings } from '@/lib/clientSettings';
import { fetchUserProfile } from '@/lib/userProfile';
import { determineRoleFromRoleProfile } from '@/lib/frappeClient';
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

  const selectedEmployeeEmail = (() => {
    const value = resolvedSearchParams?.employee;
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

  // Convert role_profile_name to Manager/Employee for logic
  const convertedRole = determineRoleFromRoleProfile(profile.role);
  const isManager = convertedRole === 'Manager';
  
  if (!isManager) {
    redirect(`/reports/${encodeURIComponent(decodedEmail)}`);
  }

  // Validate that selected employee is from the same company
  // Note: The EmployeeSelector component already filters employees by company via the API,
  // so we only need to do a basic validation here. If the employee is in the dropdown,
  // they should be valid. We only redirect if there's a clear company mismatch.
  if (selectedEmployeeEmail && profile.company) {
    const { getFrappeCompanyForUser } = await import('@/lib/frappeClient');
    const { createServerSupabaseClient } = await import('@/lib/supabaseServer');
    
    // Normalize company names for comparison (trim and lowercase)
    const normalizeCompany = (company: string | null | undefined): string | null => {
      if (!company || typeof company !== 'string') return null;
      return company.trim().toLowerCase();
    };
    
    const managerCompany = normalizeCompany(profile.company);
    
    // Only validate if manager has a company set
    if (managerCompany) {
      // Try to get employee company from multiple sources
      let employeeCompany = await getFrappeCompanyForUser(selectedEmployeeEmail);
      
      // Also check Supabase as fallback
      const supabase = createServerSupabaseClient();
      const { data: userData } = await supabase
        .from('users')
        .select('company')
        .eq('email', selectedEmployeeEmail)
        .maybeSingle();
      
      const employeeCompanyFromDb = userData?.company || employeeCompany;
      const normalizedEmployeeCompany = normalizeCompany(employeeCompanyFromDb);
      
      // Only redirect if employee has a company set AND it doesn't match manager's company
      // If employee has no company, allow access (they might be a freelancer, unassigned, or the API already validated them)
      if (normalizedEmployeeCompany && normalizedEmployeeCompany !== managerCompany) {
        console.warn(`[screenshot-interval] Company mismatch for ${selectedEmployeeEmail}: manager=${managerCompany}, employee=${normalizedEmployeeCompany}`);
        redirect(`/reports/${encodeURIComponent(decodedEmail)}/screenshot-interval`);
      }
    }
  }

  const existingSettings = await getManagerSettings(decodedEmail);

  const perEmployeeInterval =
    selectedEmployeeEmail && existingSettings?.employee_intervals
      ? existingSettings.employee_intervals[
          selectedEmployeeEmail.trim().toLowerCase()
        ]
      : undefined;

  const intervalSeconds = perEmployeeInterval ?? DEFAULT_INTERVAL_SECONDS;

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
          <EmployeeSelector
            managerEmail={decodedEmail}
            currentEmployeeEmail={selectedEmployeeEmail ?? undefined}
            autoSelectFirst={false}
          />
        </section>

        {selectedEmployeeEmail && (
          <div className="rounded-lg border border-primary/20 bg-primary/5 p-4">
            <p className="text-sm font-medium text-primary">
              Managing settings for:{' '}
              <strong>{selectedEmployeeEmail}</strong>
            </p>
          </div>
        )}

        {selectedEmployeeEmail ? (
          <section className="rounded-2xl border border-border bg-card p-6 shadow-sm max-w-xl">
            <ScreenshotIntervalForm
              managerEmail={decodedEmail}
              employeeEmail={selectedEmployeeEmail}
              initialIntervalSeconds={intervalSeconds}
            />
          </section>
        ) : (
          <section className="rounded-2xl border border-yellow-200 bg-yellow-50 p-6">
            <p className="text-sm text-yellow-800">
              Please select an employee from the dropdown above to manage their
              screenshot settings.
            </p>
          </section>
        )}
      </div>
    </DashboardShell>
  );
}
