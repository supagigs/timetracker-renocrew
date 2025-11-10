import { createServerSupabaseClient } from './supabaseServer';

export type ProjectRecord = {
  id: number;
  name: string;
  description: string | null;
  createdAt: string | null;
  clientEmail?: string | null;
  clientName?: string | null;
};

export async function fetchClientProjects({
  email,
  userId,
}: {
  email: string;
  userId: number | null;
}): Promise<ProjectRecord[]> {
  const supabase = createServerSupabaseClient();

  const selectColumns = 'id, project_name, created_at';

  if (userId !== null) {
    const { data, error } = await supabase
      .from('projects')
      .select(selectColumns)
      .eq('user_id', userId)
      .order('project_name', { ascending: true });

    if (!error && Array.isArray(data) && data.length > 0) {
      return data.map((project) => ({
        id: project.id,
        name: project.project_name ?? 'Untitled project',
        description: null,
        clientEmail: null,
        clientName: null,
        createdAt: project.created_at ?? null,
      }));
    }
  }

  const { data: fallbackData, error: fallbackError } = await supabase
    .from('projects')
    .select(`${selectColumns}, user_email`)
    .eq('user_email', email)
    .order('project_name', { ascending: true });

  if (fallbackError) {
    console.warn('[client-projects] Fallback query returned an error, defaulting to empty list.', fallbackError);
    return [];
  }

  if (!fallbackData) {
    return [];
  }

  return fallbackData.map((project) => ({
    id: project.id,
    name: project.project_name ?? 'Untitled project',
    description: null,
    clientEmail: project.user_email ?? null,
    clientName: null,
    createdAt: project.created_at ?? null,
  }));
}

export async function fetchFreelancerProjects(email: string): Promise<ProjectRecord[]> {
  const normalizedEmail = email.trim().toLowerCase();

  if (!normalizedEmail) {
    return [];
  }

  const supabase = createServerSupabaseClient();

  const { data: assignments, error: assignmentsError } = await supabase
    .from('project_assignments')
    .select('project_id')
    .eq('freelancer_email', normalizedEmail);

  if (assignmentsError) {
    console.warn('[freelancer-projects] Failed to load assignments, returning empty list.', assignmentsError);
    return [];
  }

  const projectIds = Array.from(
    new Set(
      (assignments ?? [])
        .map((assignment) => assignment.project_id)
        .filter((projectId): projectId is number => typeof projectId === 'number'),
    ),
  );

  if (projectIds.length === 0) {
    return [];
  }

  const { data: projectsData, error: projectsError } = await supabase
    .from('project_assignments')
    .select(`
      project_id,
      assigned_by,
      projects:projects (
        id,
        project_name,
        created_at,
        user_email
      )
    `)
    .eq('freelancer_email', normalizedEmail)
    .in('project_id', projectIds)
    .order('assigned_at', { ascending: false });

  if (projectsError) {
    console.warn('[freelancer-projects] Project lookup failed, returning empty list.', projectsError);
    return [];
  }

  if (!projectsData) {
    return [];
  }

  const clientEmails = Array.from(
    new Set(
      projectsData
        .map((row) => row.assigned_by ?? row.projects?.user_email ?? null)
        .filter((value): value is string => Boolean(value)),
    ),
  );

  const clientNameMap = new Map<string, string | null>();

  if (clientEmails.length > 0) {
    const { data: clientRows, error: clientError } = await supabase
      .from('users')
      .select('email, display_name')
      .in('email', clientEmails);

    if (clientError) {
      console.warn('[freelancer-projects] Failed to fetch client names:', clientError);
    } else {
      (clientRows ?? []).forEach((client) => {
        clientNameMap.set(client.email, client.display_name ?? null);
      });
    }
  }

  return projectsData
    .map((row) => {
      const projectId = row.projects?.id ?? row.project_id;
      const projectName = row.projects?.project_name ?? 'Untitled project';
      if (!projectId || !projectName) {
        return null;
      }

      const clientEmail = row.assigned_by ?? row.projects?.user_email ?? null;
      const clientName = clientEmail ? clientNameMap.get(clientEmail) ?? null : null;

      return {
        id: projectId,
        name: projectName,
        description: null,
        createdAt: row.projects?.created_at ?? null,
        clientEmail,
        clientName,
      } satisfies ProjectRecord;
    })
    .filter((record): record is ProjectRecord => record !== null);
}


