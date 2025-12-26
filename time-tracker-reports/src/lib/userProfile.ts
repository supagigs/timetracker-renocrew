import { createServerSupabaseClient } from './supabaseServer';

export type UserProfile = {
  id: number | null;
  email: string;
  displayName: string | null;
  role: string | null;
  company: string | null;
};

export async function fetchUserProfile(email: string): Promise<UserProfile | null> {
  const normalizedEmail = email.trim().toLowerCase();

  if (!normalizedEmail) {
    return null;
  }

  const supabase = createServerSupabaseClient();

  const { data, error } = await supabase
    .from('users')
    .select('id, email, display_name, role, company')
    .eq('email', normalizedEmail)
    .maybeSingle();

  if (error) {
    console.error('[userProfile] Failed to fetch profile:', error.message || JSON.stringify(error));
    return null;
  }

  if (!data) {
    return null;
  }

  return {
    id: typeof data.id === 'number' ? data.id : null,
    email: data.email,
    displayName: data.display_name ?? null,
    role: data.role ?? null,
    company: data.company ?? null,
  };
}















