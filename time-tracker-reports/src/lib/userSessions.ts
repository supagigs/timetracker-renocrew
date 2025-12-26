import type {
  SupabaseClient,
  RealtimeChannel,
  RealtimePostgresChangesPayload,
} from '@supabase/supabase-js';

export type UserSessionRow = {
  email: string;
  web_logged_in: boolean | null;
  app_logged_in: boolean | null;
  updated_at: string | null;
};

export async function setUserSessionState(
  supabase: SupabaseClient,
  email: string,
  updates: Partial<Pick<UserSessionRow, 'web_logged_in' | 'app_logged_in'>>,
) {
  const normalizedEmail = email.trim().toLowerCase();

  if (!normalizedEmail) {
    throw new Error('Email is required for session state update');
  }

  try {
    // First, verify the Supabase client is properly configured
    // by checking if we can make a simple query
    const { data: existing, error: fetchError } = await supabase
      .from('user_sessions')
      .select('web_logged_in, app_logged_in')
      .eq('email', normalizedEmail)
      .maybeSingle();

    if (fetchError) {
      // Check for common error codes
      if (fetchError.code === '42P01') {
        // Table doesn't exist
        console.warn('[userSessions] user_sessions table does not exist. Please run the migration script.');
        throw new Error('user_sessions table does not exist. Please run the database migration.');
      }
      
      // Check for authentication errors
      if (fetchError.message?.includes('Invalid API key') || 
          fetchError.message?.includes('JWT') ||
          fetchError.code === 'PGRST301' ||
          fetchError.code === 'PGRST116') {
        console.error('[userSessions] Supabase authentication error. Please check your SUPABASE_SERVICE_ROLE_KEY in .env.local');
        throw new Error(
          'Supabase authentication failed. Please verify that SUPABASE_SERVICE_ROLE_KEY is correctly set in your .env.local file. ' +
          'Get it from: https://app.supabase.com → Project Settings → API → service_role key'
        );
      }
      
      // Provide more context about the error
      const errorMessage = fetchError.message || 'Unknown error';
      const errorCode = fetchError.code || 'UNKNOWN';
      throw new Error(`Failed to fetch session state: ${errorMessage} (code: ${errorCode})`);
    }

    const payload = {
      email: normalizedEmail,
      web_logged_in:
        updates.web_logged_in ?? existing?.web_logged_in ?? null,
      app_logged_in:
        updates.app_logged_in ?? existing?.app_logged_in ?? null,
      updated_at: new Date().toISOString(),
    };

    const { error: upsertError } = await supabase
      .from('user_sessions')
      .upsert(payload, {
        onConflict: 'email',
      });

    if (upsertError) {
      // Check for common error codes
      if (upsertError.code === '42P01') {
        // Table doesn't exist
        console.warn('[userSessions] user_sessions table does not exist. Please run the migration script.');
        throw new Error('user_sessions table does not exist. Please run the database migration.');
      }
      
      // Provide more context about the error
      const errorMessage = upsertError.message || 'Unknown error';
      const errorCode = upsertError.code || 'UNKNOWN';
      const errorDetails = upsertError.details || '';
      const errorHint = upsertError.hint || '';
      
      throw new Error(
        `Failed to update session state: ${errorMessage} (code: ${errorCode})${errorDetails ? ` - ${errorDetails}` : ''}${errorHint ? ` - Hint: ${errorHint}` : ''}`
      );
    }

    return payload;
  } catch (error) {
    // Re-throw with better error information
    if (error instanceof Error) {
      throw error;
    }
    
    // Handle non-Error objects
    const errorStr = typeof error === 'object' && error !== null
      ? JSON.stringify(error, Object.getOwnPropertyNames(error))
      : String(error);
    
    throw new Error(`Unexpected error in setUserSessionState: ${errorStr}`);
  }
}

export function subscribeToSessionChanges(
  supabase: SupabaseClient,
  email: string,
  handler: (payload: RealtimePostgresChangesPayload<UserSessionRow>) => void,
) {
  const normalizedEmail = email.trim().toLowerCase();

  const channel: RealtimeChannel = supabase
    .channel(`user-session-${normalizedEmail}`)
    .on<UserSessionRow>(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'user_sessions',
        filter: `email=eq.${normalizedEmail}`,
      },
      (payload) => handler(payload),
    );

  channel.subscribe((status, err) => {
    if (status === 'CHANNEL_ERROR' && err) {
      console.error('[userSessions] Realtime channel error:', err);
    } else if (status === 'TIMED_OUT' || status === 'CLOSED') {
      console.warn('[userSessions] Realtime channel closed:', status);
    }
  });

  return () => {
    supabase.removeChannel(channel);
  };
}

