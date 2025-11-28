import { createServerSupabaseClient } from './supabaseServer';

export type ClientSettings = {
  client_email: string;
  freelancer_intervals: Record<string, number>;
  updated_at: string | null;
};

export async function getClientSettings(
  clientEmail: string,
): Promise<ClientSettings | null> {
  const supabase = createServerSupabaseClient();
  const normalizedEmail = clientEmail.trim().toLowerCase();

  const { data, error } = await supabase
    .from('client_settings')
    .select(
      'client_email, freelancer_intervals, updated_at',
    )
    .eq('client_email', normalizedEmail)
    .maybeSingle();

  if (error) {
    console.error('[clientSettings] Failed to fetch settings:', error);
    return null;
  }

  if (!data) return null;

  return {
    client_email: data.client_email,
    freelancer_intervals: (data.freelancer_intervals ??
      {}) as Record<string, number>,
    updated_at: data.updated_at ?? null,
  };
}

export async function upsertClientFreelancerInterval(
  clientEmail: string,
  freelancerEmail: string,
  intervalSeconds: number,
): Promise<ClientSettings | null> {
  const supabase = createServerSupabaseClient();
  const normalizedClient = clientEmail.trim().toLowerCase();
  const normalizedFreelancer = freelancerEmail.trim().toLowerCase();

  // 1) Load current JSON map only
  const { data: existing, error: fetchError } = await supabase
    .from('client_settings')
    .select('client_email, freelancer_intervals, updated_at')
    .eq('client_email', normalizedClient)
    .maybeSingle();

  if (fetchError) {
    console.error(
      '[clientSettings] Failed to fetch settings for update:',
      fetchError,
    );
    return null;
  }

  const currentMap =
    (existing?.freelancer_intervals as Record<string, number> | null) ?? {};

  const newMap = {
    ...currentMap,
    [normalizedFreelancer]: intervalSeconds,
  };

  // 2) Upsert the freelancer intervals map
  const { data, error } = await supabase
    .from('client_settings')
    .upsert(
      {
        client_email: normalizedClient,
        freelancer_intervals: newMap,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'client_email' },
    )
    .select(
      'client_email, freelancer_intervals, updated_at',
    )
    .maybeSingle();

  if (error) {
    console.error(
      '[clientSettings] Failed to upsert freelancer interval:',
      error,
    );
    return null;
  }

  return {
    client_email: data!.client_email,
    freelancer_intervals: (data!.freelancer_intervals ??
      {}) as Record<string, number>,
    updated_at: data!.updated_at ?? null,
  };
}

