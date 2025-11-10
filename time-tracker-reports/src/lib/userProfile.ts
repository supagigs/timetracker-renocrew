import { createServerSupabaseClient } from './supabaseServer';

export type UserProfile = {
  id: number | null;
  email: string;
  displayName: string | null;
  category: string | null;
};

export async function fetchUserProfile(email: string): Promise<UserProfile | null> {
  const normalizedEmail = email.trim().toLowerCase();

  if (!normalizedEmail) {
    return null;
  }

  const supabase = createServerSupabaseClient();

  const { data, error } = await supabase
    .from('users')
    .select('id, email, display_name, category')
    .eq('email', normalizedEmail)
    .maybeSingle();

  if (error) {
    console.error('[userProfile] Failed to fetch profile:', error);
    return null;
  }

  if (!data) {
    return null;
  }

  return {
    id: typeof data.id === 'number' ? data.id : null,
    email: data.email,
    displayName: data.display_name ?? null,
    category: data.category ?? null,
  };
}



