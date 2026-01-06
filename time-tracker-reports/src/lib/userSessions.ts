import type {
  SupabaseClient,
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
  // No-op: user_sessions table is no longer used
  // Return a mock response to maintain compatibility
  const normalizedEmail = email.trim().toLowerCase();

  if (!normalizedEmail) {
    throw new Error('Email is required for session state update');
  }

  // Return mock payload without database access
  return {
    email: normalizedEmail,
    web_logged_in: updates.web_logged_in ?? null,
    app_logged_in: updates.app_logged_in ?? null,
    updated_at: new Date().toISOString(),
  };
}

export function subscribeToSessionChanges(
  supabase: SupabaseClient,
  email: string,
  handler: (payload: RealtimePostgresChangesPayload<UserSessionRow>) => void,
) {
  // No-op: user_sessions table is no longer used
  // Return a no-op unsubscribe function to maintain compatibility
  return () => {
    // No-op unsubscribe
  };
}

