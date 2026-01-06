import { NextResponse } from 'next/server';
import { upsertManagerEmployeeInterval } from '@/lib/clientSettings';
import { fetchUserProfile } from '@/lib/userProfile';
import { getFrappeCompanyForUser } from '@/lib/frappeClient';
import { createServerSupabaseClient } from '@/lib/supabaseServer';

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));

    const managerEmail =
      typeof body.managerEmail === 'string' ? body.managerEmail : '';
    const employeeEmail =
      typeof body.employeeEmail === 'string' ? body.employeeEmail : '';
    const intervalSeconds = Number(body.intervalSeconds);

    if (
      !managerEmail ||
      !employeeEmail ||
      !Number.isFinite(intervalSeconds) ||
      intervalSeconds <= 0
    ) {
      return NextResponse.json(
        { error: 'Invalid payload' },
        { status: 400 },
      );
    }

    // Validate that employee is from the same company as manager
    const managerProfile = await fetchUserProfile(managerEmail);
    if (!managerProfile || managerProfile.role !== 'Manager') {
      return NextResponse.json(
        { error: 'Unauthorized: Manager access required' },
        { status: 403 },
      );
    }

    const managerCompany = managerProfile.company;
    if (managerCompany) {
      // Check employee's company from Frappe
      const employeeCompany = await getFrappeCompanyForUser(employeeEmail);
      
      // Also check Supabase as fallback
      const supabase = createServerSupabaseClient();
      const { data: userData } = await supabase
        .from('users')
        .select('company')
        .eq('email', employeeEmail)
        .maybeSingle();
      
      const employeeCompanyFromDb = userData?.company || employeeCompany;
      
      // Only allow if company matches
      if (employeeCompanyFromDb !== managerCompany) {
        return NextResponse.json(
          { error: 'Unauthorized: Employee must be from the same company' },
          { status: 403 },
        );
      }
    }

    const settings = await upsertManagerEmployeeInterval(
      managerEmail,
      employeeEmail,
      intervalSeconds,
    );

    if (!settings) {
      return NextResponse.json(
        { error: 'Failed to save settings' },
        { status: 500 },
      );
    }

    return NextResponse.json({ ok: true, settings });
  } catch (error) {
    console.error('[api] screenshot-interval POST failed:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    );
  }
}
