import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabaseServer';
import { frappeLogin } from '@/lib/frappeClient';

type UserRecord = {
  id: number;
  email: string;
  display_name: string | null;
  category: 'Client' | 'Freelancer' | null;
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

    // After successful Frappe authentication, get user profile from Supabase
    const supabase = createServerSupabaseClient();

    const { data: user, error: userError } = await supabase
      .from('users')
      .select('id, email, display_name, category, created_at')
      .ilike('email', email)
      .maybeSingle();

    if (userError) {
      console.error('[auth/login] Failed to fetch user:', userError);
      // Even if Supabase lookup fails, we can still return success since Frappe auth worked
      // The user exists in Frappe, which is the source of truth
      return NextResponse.json({
        user: {
          email: email,
          displayName: null,
          category: null,
          createdAt: null,
          projects: [],
        },
      });
    }

    // If user doesn't exist in Supabase, create a basic record (optional)
    // For now, we'll just return what we have
    const projects = user ? await fetchUserProjects(supabase, user) : [];

    return NextResponse.json({
      user: {
        email: user?.email || email,
        displayName: user?.display_name || null,
        category: user?.category || null,
        createdAt: user?.created_at || null,
        projects,
      },
    });
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


