import { createServerSupabaseClient } from './supabaseServer';

export type ManagerSettings = {
  manager_email: string;
  employee_intervals: Record<string, number>;
  updated_at: string | null;
};

export async function getManagerSettings(
  managerEmail: string,
): Promise<ManagerSettings | null> {
  const supabase = createServerSupabaseClient();
  const normalizedEmail = managerEmail.trim().toLowerCase();

  const { data, error } = await supabase
    .from('client_settings')
    .select(
      'client_email, employee_intervals, updated_at',
    )
    .eq('client_email', normalizedEmail)
    .maybeSingle();

  if (error) {
    console.error('[managerSettings] Failed to fetch settings:', {
      message: error.message,
      details: error.details,
      hint: error.hint,
      code: error.code,
    });
    return null;
  }

  if (!data) return null;

  return {
    manager_email: data.client_email,
    employee_intervals: (data.employee_intervals ??
      {}) as Record<string, number>,
    updated_at: data.updated_at ?? null,
  };
}

export async function upsertManagerEmployeeInterval(
  managerEmail: string,
  employeeEmail: string,
  intervalSeconds: number,
): Promise<ManagerSettings | null> {
  const supabase = createServerSupabaseClient();
  const normalizedManager = managerEmail.trim().toLowerCase();
  const normalizedEmployee = employeeEmail.trim().toLowerCase();

  // 1) Load current JSON map only
  const { data: existing, error: fetchError } = await supabase
    .from('client_settings')
    .select('client_email, employee_intervals, updated_at')
    .eq('client_email', normalizedManager)
    .maybeSingle();

  if (fetchError) {
    console.error(
      '[managerSettings] Failed to fetch settings for update:',
      fetchError,
    );
    return null;
  }

  const currentMap =
    (existing?.employee_intervals as Record<string, number> | null) ?? {};

  const newMap = {
    ...currentMap,
    [normalizedEmployee]: intervalSeconds,
  };

  // 2) Upsert the employee intervals map
  const { data, error } = await supabase
    .from('client_settings')
    .upsert(
      {
        client_email: normalizedManager,
        employee_intervals: newMap,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'client_email' },
    )
    .select(
      'client_email, employee_intervals, updated_at',
    )
    .maybeSingle();

  if (error) {
    console.error(
      '[managerSettings] Failed to upsert employee interval:',
      error,
    );
    return null;
  }

  return {
    manager_email: data!.client_email,
    employee_intervals: (data!.employee_intervals ??
      {}) as Record<string, number>,
    updated_at: data!.updated_at ?? null,
  };
}

