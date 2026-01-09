import { createServerSupabaseClient } from '@/lib/supabaseServer';
import { NextRequest, NextResponse } from 'next/server';
import { getAllFrappeUsers, determineRoleFromRoleProfile } from '@/lib/frappeClient';
import { fetchUserProfile } from '@/lib/userProfile';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const managerEmail = searchParams.get('managerEmail');

    if (!managerEmail) {
      return NextResponse.json(
        { error: 'managerEmail parameter is required' },
        { status: 400 }
      );
    }

    // Check if the user is a manager
    const profile = await fetchUserProfile(managerEmail);
    // Convert role_profile_name to Manager/Employee for logic
    const convertedRole = determineRoleFromRoleProfile(profile?.role || null);
    const isManager = convertedRole === 'Manager';

    // If user is a manager, return users from Frappe filtered by company
    if (isManager) {
      try {
        // Get company from manager's profile
        const managerCompany = profile?.company;
        const frappeUsers = await getAllFrappeUsers(managerCompany || undefined);
        // Include all users from the company, including the manager themselves
        const filteredUsers = frappeUsers.map((user) => ({
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
            .eq('company', profile.company);
            // Include all users from the company, including the manager themselves
          
          if (!usersError && supabaseUsers) {
            return NextResponse.json(supabaseUsers);
          }
        }
        // If all fallbacks fail, return empty array
        return NextResponse.json([]);
      }
    }

    // Otherwise, use the existing logic for assigned employees
    const supabase = createServerSupabaseClient();

    // Fetch employees assigned to this manager
    const { data: assignments, error: assignmentsError } = await supabase
      .from('manager_freelancer_assignments')
      .select('freelancer_email')
      .eq('manager_email', managerEmail)
      .eq('is_active', true);

    if (assignmentsError) {
      console.error('Error fetching assignments:', assignmentsError);
      return NextResponse.json(
        { error: 'Failed to fetch employee assignments' },
        { status: 500 }
      );
    }

    if (!assignments || assignments.length === 0) {
      return NextResponse.json([]);
    }

    // Get unique employee emails
    const employeeEmails = [
      ...new Set(assignments.map((a) => a.freelancer_email)),
    ];

    // Fetch user details for each employee
    // Note: We no longer filter by role='Employee' since we store role_profile_name directly
    // The assignments table already ensures these are valid employee assignments
    const { data: users, error: usersError } = await supabase
      .from('users')
      .select('email, display_name')
      .in('email', employeeEmails);

    if (usersError) {
      console.error('Error fetching users:', usersError);
      return NextResponse.json(
        { error: 'Failed to fetch employee details' },
        { status: 500 }
      );
    }

    return NextResponse.json(users || []);
  } catch (error) {
    console.error('Error in employees API:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

