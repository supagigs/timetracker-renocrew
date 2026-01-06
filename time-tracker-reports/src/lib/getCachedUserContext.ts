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
  // No-op: user_context table is no longer used
  return null;
}

