import { createServerSupabaseClient } from './supabaseServer';

export type ClientSettings = {
  client_email: string;
  screenshot_interval_seconds: number;
  updated_at: string | null;
};

export async function getClientSettings(
  clientEmail: string,
): Promise<ClientSettings | null> {
  const supabase = createServerSupabaseClient();
  const normalizedEmail = clientEmail.trim().toLowerCase();

  const { data, error } = await supabase
    .from('client_settings')
    .select('client_email, screenshot_interval_seconds, updated_at')
    .eq('client_email', normalizedEmail)
    .maybeSingle();

  if (error) {
    console.error('[clientSettings] Failed to fetch settings:', error);
    return null;
  }

  return (data as ClientSettings | null) ?? null;
}

export async function upsertClientScreenshotInterval(
  clientEmail: string,
  intervalSeconds: number,
): Promise<ClientSettings | null> {
  const supabase = createServerSupabaseClient();
  const normalizedEmail = clientEmail.trim().toLowerCase();

  const { data, error } = await supabase
    .from('client_settings')
    .upsert(
      {
        client_email: normalizedEmail,
        screenshot_interval_seconds: intervalSeconds,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'client_email' },
    )
    .select('client_email, screenshot_interval_seconds, updated_at')
    .maybeSingle();

  if (error) {
    console.error('[clientSettings] Failed to upsert settings:', error);
    return null;
  }

  return (data as ClientSettings | null) ?? null;
}





