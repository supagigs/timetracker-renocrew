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

  const { data: existing, error: fetchError } = await supabase
    .from('user_sessions')
    .select('web_logged_in, app_logged_in')
    .eq('email', normalizedEmail)
    .maybeSingle();

  if (fetchError) {
    throw fetchError;
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
    .upsert(payload);

  if (upsertError) {
    throw upsertError;
  }

  return payload;
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

