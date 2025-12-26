import { createServerSupabaseClient } from '@/lib/supabaseServer';

export type CachedUserContext = {
  email: string;
  full_name: string | null;
  role_profile: string | null;
  company: string | null;
  updated_at: string;
};

/**
 * Get cached user context from Supabase
 * This is a fast read operation that doesn't require a Frappe API call
 * 
 * @param email - User email to look up
 * @returns Cached user context or null if not found
 */
export async function getCachedUserContext(email: string): Promise<CachedUserContext | null> {
  if (!email) {
    return null;
  }

  const supabase = createServerSupabaseClient();

  const { data, error } = await supabase
    .from('user_context')
    .select('*')
    .eq('email', email.trim().toLowerCase())
    .maybeSingle();

  if (error) {
    // If table doesn't exist, return null (non-fatal)
    if (error.code === '42P01' || error.code === 'PGRST116') {
      return null;
    }
    console.error('[getCachedUserContext] Error fetching cached context:', error);
    return null;
  }

  return data;
}

