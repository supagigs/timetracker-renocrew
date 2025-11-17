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

// ----------------------------
// Update session flags
// ----------------------------
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

  const payload: UserSessionRow = {
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

// ----------------------------
// Subscribe to realtime changes
// ----------------------------
export function subscribeToSessionChanges(
  supabase: SupabaseClient,
  email: string,
  handler: (payload: {
    old: Partial<UserSessionRow> | null;
    new: Partial<UserSessionRow> | null;
  }) => void,
) {
  const normalizedEmail = email.trim().toLowerCase();

  const channel = supabase
    .channel(`user-session-${normalizedEmail}`)
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "user_sessions",
        filter: `email=eq.${normalizedEmail}`,
      },
      (payload: any) => {
        handler({
          old: (payload.old ?? null) as Partial<UserSessionRow> | null,
          new: (payload.new ?? null) as Partial<UserSessionRow> | null,
        });
      }
    );

  channel.subscribe((status, err) => {
    if (status === "CHANNEL_ERROR" && err) {
      console.error("[userSessions] Realtime channel error:", err);
    } else if (status === "TIMED_OUT" || status === "CLOSED") {
      console.warn("[userSessions] Realtime channel closed:", status);
    }
  });

  // FIXED CLEANUP — React-safe
  return () => {
    supabase.removeChannel(channel); // no return
  };
}


