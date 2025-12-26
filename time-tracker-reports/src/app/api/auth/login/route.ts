import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabaseServer';
import { frappeLogin, getFrappeCurrentUserRoleProfile, getFrappeUserCompany } from '@/lib/frappeClient';

type UserRecord = {
  id: number;
  email: string;
  display_name: string | null;
  role: 'Client' | 'Freelancer' | null;
  created_at: string;
};

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const email: string = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
    const password: string = typeof body.password === 'string' ? body.password : '';

    if (!EMAIL_REGEX.test(email)) {
      return NextResponse.json(
        { error: 'Please provide a valid email address.' },
        { status: 400 },
      );
    }

    if (!password) {
      return NextResponse.json(
        { error: 'Password is required.' },
        { status: 400 },
      );
    }

    // Authenticate with Frappe first
    const frappeAuthResult = await frappeLogin(email, password);
    
    if (!frappeAuthResult.success) {
      return NextResponse.json(
        { error: frappeAuthResult.error || 'Invalid login credentials.' },
        { status: 401 },
      );
    }

    // Check user role profile to determine if user is a client
    // Use session-based auth (recommended) - role_profile_name is the correct field
    const userProfile = await getFrappeCurrentUserRoleProfile();
    const roleProfile = userProfile?.role_profile || null;
    const isClient = roleProfile === 'SuperAdmin';

    // Get company from Frappe using the email we already have
    const { getFrappeCompanyForUser } = await import('@/lib/frappeClient');
    const company = await getFrappeCompanyForUser(email);

    // After successful Frappe authentication, get or create user profile in Supabase
    const supabase = createServerSupabaseClient();

    // Try to get existing user from Supabase
    const { data: existingUser, error: userError } = await supabase
      .from('users')
      .select('id, email, display_name, role, company, created_at')
      .ilike('email', email)
      .maybeSingle();

    if (userError && userError.code !== 'PGRST116') {
      console.error('[auth/login] Failed to fetch user:', userError);
    }

    let user = existingUser;

    // Determine role based on Frappe role
    const userRole: 'Client' | 'Freelancer' = isClient ? 'Client' : 'Freelancer';

    // If user doesn't exist in Supabase, create a basic record
    // This ensures the user exists in Supabase for the reports to work
    if (!user) {
      console.log('[auth/login] User not found in Supabase, creating profile for:', email);
      const { data: insertedUser, error: insertError } = await supabase
        .from('users')
        .insert({
          email: email,
          display_name: null,
          role: userRole,
          company: company || null,
        })
        .select('id, email, display_name, role, company, created_at')
        .maybeSingle();

      if (insertError) {
        console.error('[auth/login] Failed to create user in Supabase:', insertError);
        // Still return success since Frappe auth worked, but with limited data
        return NextResponse.json({
          user: {
            email: email,
            displayName: null,
            role: userRole,
            createdAt: null,
            projects: [],
          },
        });
      }

      user = insertedUser;
    } else if (user.role !== userRole || user.company !== company) {
      // Update role and/or company if they have changed (e.g., role or company was updated in Frappe)
      const updateData: { role?: string; company?: string | null } = {};
      if (user.role !== userRole) {
        updateData.role = userRole;
      }
      if (user.company !== company) {
        updateData.company = company || null;
      }
      
      const { data: updatedUser, error: updateError } = await supabase
        .from('users')
        .update(updateData)
        .eq('id', user.id)
        .select('id, email, display_name, role, company, created_at')
        .maybeSingle();

      if (!updateError && updatedUser) {
        user = updatedUser;
      }
    }

    // Fetch projects (will return empty array if projects table doesn't exist or user has none)
    const projects = user ? await fetchUserProjects(supabase, user) : [];

    // Sync user context from Frappe and cache it
    try {
      await syncUserContextFromFrappe();
    } catch (contextError) {
      console.warn('[auth/login] Failed to sync user context from Frappe:', contextError);
      // Non-fatal - continue with login
    }

    // Create response with user data
    const response = NextResponse.json({
      user: {
        email: user?.email || email,
        displayName: user?.display_name || null,
        role: user?.role || null,
        createdAt: user?.created_at || null,
        projects,
      },
    });

    // Set email cookie for middleware authentication
    response.cookies.set('user_email', user?.email || email, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      maxAge: 60 * 60 * 24 * 7, // 7 days
    });

    return response;
  } catch (error) {
    console.error('[auth/login] Unexpected error:', error);
    return NextResponse.json(
      { error: 'Unexpected error occurred while logging in.' },
      { status: 500 },
    );
  }
}

async function fetchUserProjects(
  supabase: ReturnType<typeof createServerSupabaseClient>,
  user: UserRecord,
) {
  const projectNames: string[] = [];

  if (!user?.email) {
    return projectNames;
  }

  // Prefer user_id if schema already migrated
  let queryByUserId:
    | { data: { project_name: string | null }[] | null; error: { message?: string | null } | null }
    = { data: null, error: null };

  if (user?.id) {
    queryByUserId = await supabase
      .from('projects')
      .select('project_name')
      .eq('user_id', user.id)
      .order('project_name', { ascending: true });
  }

  if (!queryByUserId.error && Array.isArray(queryByUserId.data) && queryByUserId.data.length > 0) {
    return queryByUserId.data
      .map((project) => project.project_name)
      .filter((name): name is string => Boolean(name && name.trim()))
      .map((name) => name.trim());
  }

  if (queryByUserId.error && !isMissingColumnError(queryByUserId.error, 'user_id')) {
    console.warn('[auth/login] Failed to fetch projects by user_id:', queryByUserId.error);
  }

  const { data: byEmail, error: byEmailError } = await supabase
    .from('projects')
    .select('project_name')
    .eq('user_email', user.email)
    .order('project_name', { ascending: true });

  if (byEmailError) {
    console.warn('[auth/login] Failed to fetch projects by user_email:', byEmailError);
    return projectNames;
  }

  return (byEmail ?? [])
    .map((project) => project.project_name)
    .filter((name): name is string => Boolean(name && name.trim()))
    .map((name) => name.trim());
}

function isMissingColumnError(error: { message?: string | null }, column: string) {
  if (!error?.message) {
    return false;
  }
  return error.message.includes(`column \"${column}\"`) || error.message.includes(`column ${column}`);
}


