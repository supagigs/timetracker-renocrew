import { createServerSupabaseClient } from '@/lib/supabaseServer';
import { NextRequest, NextResponse } from 'next/server';
import { getAllFrappeUsers } from '@/lib/frappeClient';
import { fetchUserProfile } from '@/lib/userProfile';

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

    // Check if the user is a client
    const profile = await fetchUserProfile(clientEmail);
    const isClient = profile?.role === 'Client';

    // If user is a client, return users from Frappe filtered by company
    if (isClient) {
      try {
        // Get company from client's profile
        const clientCompany = profile?.company;
        const frappeUsers = await getAllFrappeUsers(clientCompany || undefined);
        // Exclude the client themselves from the list
        const filteredUsers = frappeUsers
          .filter((user) => user.email.toLowerCase() !== clientEmail.toLowerCase())
          .map((user) => ({
            email: user.email,
            display_name: user.full_name,
          }));
        return NextResponse.json(filteredUsers);
      } catch (error) {
        console.error('Error fetching Frappe users:', error);
        // Fall back to Supabase if Frappe fails
        const supabase = createServerSupabaseClient();
        if (profile?.company) {
          const { data: supabaseUsers, error: usersError } = await supabase
            .from('users')
            .select('email, display_name')
            .eq('company', profile.company)
            .neq('email', clientEmail); // Exclude the client themselves
          
          if (!usersError && supabaseUsers) {
            return NextResponse.json(supabaseUsers);
          }
        }
      }
    }

    // Otherwise, use the existing logic for assigned freelancers
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
      .eq('role', 'Freelancer');

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






















