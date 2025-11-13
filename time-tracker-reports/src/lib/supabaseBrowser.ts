import { createClient, type SupabaseClient } from '@supabase/supabase-js';

let cachedBrowserClient: SupabaseClient | null = null;

export function createSupabaseBrowserClient() {
  if (cachedBrowserClient) {
    return cachedBrowserClient;
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    throw new Error('Supabase URL or anon key missing');
  }

  cachedBrowserClient = createClient(url, anonKey);
  return cachedBrowserClient;
}

