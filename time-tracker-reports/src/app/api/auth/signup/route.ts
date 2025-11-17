import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabaseServer';


export type SignupPayload = {
  email: string;
  displayName?: string;
  category?: 'Client' | 'Freelancer';
  projects: string[];      
};

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const VALID_CATEGORIES = new Set(['Client', 'Freelancer']);



export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const payload = normalizePayload(body);


    if (!EMAIL_REGEX.test(payload.email)) {
      return NextResponse.json(
        { error: 'Please provide a valid email address.' },
        { status: 400 },
      );
    }

    if (payload.category && !VALID_CATEGORIES.has(payload.category)) {
      return NextResponse.json(
        { error: 'Invalid category. Choose Client or Freelancer.' },
        { status: 400 },
      );
    }

    const supabase = createServerSupabaseClient();

    
    const { data: existingUser, error: existingError } = await supabase
      .from('users')
      .select('id, email')
      .ilike('email', payload.email)
      .maybeSingle();

    if (existingError) {
      console.error('[auth/signup] Failed to check existing user:', existingError);
      return NextResponse.json(
        { error: 'Unable to check existing users at the moment.' },
        { status: 500 },
      );
    }

    if (existingUser) {
      return NextResponse.json(
        { error: 'An account with this email already exists. Please log in instead.' },
        { status: 409 },
      );
    }

    
    const { data: insertedUser, error: insertError } = await supabase
      .from('users')
      .insert({
        email: payload.email,
        display_name: payload.displayName ?? null,
        category: payload.category ?? null,
      })
      .select('id, email, display_name, category, created_at')
      .single();

    if (insertError || !insertedUser) {
      console.error('[auth/signup] Failed to create user:', insertError);
      return NextResponse.json(
        { error: 'Unable to create account. Please try again later.' },
        { status: 500 },
      );
    }

    
    let savedProjects: string[] = [];

    if (payload.category === 'Client' && payload.projects.length > 0) {
      const projectsResult = await upsertProjects(
        supabase,
        insertedUser.id,
        insertedUser.email,
        payload.projects,
      );

      savedProjects = projectsResult.projects;

      if (projectsResult.error) {
        console.warn('[auth/signup] Some projects could not be saved:', projectsResult.error);
      }
    }

    
    return NextResponse.json({
      user: {
        email: insertedUser.email,
        displayName: insertedUser.display_name,
        category: insertedUser.category,
        createdAt: insertedUser.created_at,
        projects: savedProjects,
      },
    });

  } catch (error) {
    console.error('[auth/signup] Unexpected error:', error);
    return NextResponse.json(
      { error: 'Unexpected error occurred while signing up.' },
      { status: 500 },
    );
  }
}



function normalizePayload(raw: Partial<SignupPayload>): SignupPayload {
  const email =
    typeof raw.email === 'string'
      ? raw.email.trim().toLowerCase()
      : '';

  const displayName =
    typeof raw.displayName === 'string' && raw.displayName.trim().length > 0
      ? raw.displayName.trim()
      : undefined;

  const category =
    typeof raw.category === 'string'
      ? (raw.category.trim() as SignupPayload['category'])
      : undefined;

  const projects = Array.from(
    new Set(
      (Array.isArray(raw.projects) ? raw.projects : [])
        .filter((p): p is string => typeof p === 'string')
        .map((p) => p.trim())
        .filter((p) => p.length > 0)
    )
  );

  return { email, displayName, category, projects };
}



async function upsertProjects(
  supabase: ReturnType<typeof createServerSupabaseClient>,
  userId: number,
  email: string,
  projects: string[],
) {
  const response: { projects: string[]; error: Error | null } = {
    projects,
    error: null,
  };


  const userIdPayload = projects.map((project_name) => ({
    user_id: userId,
    project_name,
  }));

  const byUserId = await supabase
    .from('projects')
    .upsert(userIdPayload, { onConflict: 'user_id,project_name' })
    .select('project_name');

  if (!byUserId.error && Array.isArray(byUserId.data)) {
    response.projects = byUserId.data
      .map((item) => item.project_name)
      .filter((name): name is string => !!name?.trim())
      .map((name) => name.trim());
    return response;
  }

  
  if (byUserId.error && !isMissingColumnError(byUserId.error, 'user_id')) {
    response.error = byUserId.error as unknown as Error;
    return response;
  }

  const emailPayload = projects.map((project_name) => ({
    user_email: email,
    project_name,
  }));

  const byEmail = await supabase
    .from('projects')
    .upsert(emailPayload, { onConflict: 'user_email,project_name' })
    .select('project_name');

  if (byEmail.error) {
    response.error = byEmail.error as unknown as Error;
    return response;
  }

  response.projects = (byEmail.data ?? [])
    .map((item) => item.project_name)
    .filter((name): name is string => !!name?.trim())
    .map((name) => name.trim());

  return response;
}


function isMissingColumnError(error: { message?: string | null }, column: string) {
  if (!error?.message) return false;

  return (
    error.message.includes(`column \"${column}\"`) ||
    error.message.includes(`column ${column}`)
  );
}
