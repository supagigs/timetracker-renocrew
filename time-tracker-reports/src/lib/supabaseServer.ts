import { createClient } from '@supabase/supabase-js';

export function createServerSupabaseClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  // Debug logging (only in development)
  if (process.env.NODE_ENV === 'development') {
    console.log('[supabaseServer] Environment check:', {
      hasUrl: !!url,
      urlLength: url?.length || 0,
      hasServiceKey: !!serviceRoleKey,
      serviceKeyLength: serviceRoleKey?.length || 0,
      serviceKeyPrefix: serviceRoleKey?.substring(0, 20) || 'N/A',
    });
  }

  if (!url) {
    throw new Error(
      'NEXT_PUBLIC_SUPABASE_URL is missing. Please add it to your .env.local file.'
    );
  }

  if (!serviceRoleKey) {
    throw new Error(
      'SUPABASE_SERVICE_ROLE_KEY is missing. Please add it to your .env.local file. ' +
      'Get it from: https://app.supabase.com → Project Settings → API → service_role key'
    );
  }

  // Validate URL format
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    throw new Error(
      `Invalid NEXT_PUBLIC_SUPABASE_URL format: "${url}". It must start with http:// or https://`
    );
  }

  // Validate service role key format (should start with "eyJ")
  if (!serviceRoleKey.startsWith('eyJ')) {
    console.warn(
      '[supabaseServer] SUPABASE_SERVICE_ROLE_KEY does not appear to be a valid JWT token. ' +
      'Make sure you copied the full service_role key from Supabase.'
    );
  }

  // Check if key is too short (likely incomplete)
  if (serviceRoleKey.length < 100) {
    console.warn(
      '[supabaseServer] SUPABASE_SERVICE_ROLE_KEY appears to be too short. ' +
      'Service role keys are typically 200+ characters long. Make sure you copied the entire key.'
    );
  }

  return createClient(url, serviceRoleKey, {
    auth: {
      persistSession: false,
    },
    global: {
      headers: {
        'X-Client-Info': 'time-tracker-reports/1.0.0',
      },
    },
  });
}

