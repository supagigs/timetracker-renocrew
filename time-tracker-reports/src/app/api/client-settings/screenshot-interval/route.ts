import { NextResponse } from 'next/server';
import { upsertClientFreelancerInterval } from '@/lib/clientSettings';
import { fetchUserProfile } from '@/lib/userProfile';
import { getFrappeCompanyForUser } from '@/lib/frappeClient';
import { createServerSupabaseClient } from '@/lib/supabaseServer';

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));

    const clientEmail =
      typeof body.clientEmail === 'string' ? body.clientEmail : '';
    const freelancerEmail =
      typeof body.freelancerEmail === 'string' ? body.freelancerEmail : '';
    const intervalSeconds = Number(body.intervalSeconds);

    if (
      !clientEmail ||
      !freelancerEmail ||
      !Number.isFinite(intervalSeconds) ||
      intervalSeconds <= 0
    ) {
      return NextResponse.json(
        { error: 'Invalid payload' },
        { status: 400 },
      );
    }

    // Validate that freelancer is from the same company as client
    const clientProfile = await fetchUserProfile(clientEmail);
    if (!clientProfile || clientProfile.role !== 'Client') {
      return NextResponse.json(
        { error: 'Unauthorized: Client access required' },
        { status: 403 },
      );
    }

    const clientCompany = clientProfile.company;
    if (clientCompany) {
      // Check freelancer's company from Frappe
      const freelancerCompany = await getFrappeCompanyForUser(freelancerEmail);
      
      // Also check Supabase as fallback
      const supabase = createServerSupabaseClient();
      const { data: userData } = await supabase
        .from('users')
        .select('company')
        .eq('email', freelancerEmail)
        .maybeSingle();
      
      const freelancerCompanyFromDb = userData?.company || freelancerCompany;
      
      // Only allow if company matches
      if (freelancerCompanyFromDb !== clientCompany) {
        return NextResponse.json(
          { error: 'Unauthorized: Freelancer must be from the same company' },
          { status: 403 },
        );
      }
    }

    const settings = await upsertClientFreelancerInterval(
      clientEmail,
      freelancerEmail,
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
