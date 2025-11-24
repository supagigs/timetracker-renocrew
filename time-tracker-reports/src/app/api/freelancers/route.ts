import { createServerSupabaseClient } from '@/lib/supabaseServer';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const clientEmail = searchParams.get('clientEmail');

    if (!clientEmail) {
      return NextResponse.json(
        { error: 'clientEmail parameter is required' },
        { status: 400 }
      );
    }

    const supabase = createServerSupabaseClient();

    // Fetch freelancers assigned to this client
    const { data: assignments, error: assignmentsError } = await supabase
      .from('client_freelancer_assignments')
      .select('freelancer_email')
      .eq('client_email', clientEmail)
      .eq('is_active', true);

    if (assignmentsError) {
      console.error('Error fetching assignments:', assignmentsError);
      return NextResponse.json(
        { error: 'Failed to fetch freelancer assignments' },
        { status: 500 }
      );
    }

    if (!assignments || assignments.length === 0) {
      return NextResponse.json([]);
    }

    // Get unique freelancer emails
    const freelancerEmails = [
      ...new Set(assignments.map((a) => a.freelancer_email)),
    ];

    // Fetch user details for each freelancer
    const { data: users, error: usersError } = await supabase
      .from('users')
      .select('email, display_name')
      .in('email', freelancerEmails)
      .eq('category', 'Freelancer');

    if (usersError) {
      console.error('Error fetching users:', usersError);
      return NextResponse.json(
        { error: 'Failed to fetch freelancer details' },
        { status: 500 }
      );
    }

    return NextResponse.json(users || []);
  } catch (error) {
    console.error('Error in freelancers API:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}





















