import { createServerSupabaseClient } from './supabaseServer';

export type ProjectRecord = {
  id: number;
  name: string;
  description: string | null;
  createdAt: string | null;
  clientEmail?: string | null;
  clientName?: string | null;
};

// Raw row types from Supabase
type ProjectRow = {
  id: number;
  project_name: string | null;
  created_at: string | null;
  user_email?: string | null;
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

  // ------------- QUERY BY USER ID ------------- //
  if (userId !== null) {
    const { data, error } = await supabase
      .from('projects')
      .select(selectColumns)
      .eq('user_id', userId)
      .order('project_name', { ascending: true }) as {
        data: ProjectRow[] | null;
        error: any;
      };

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

  // ------------- FALLBACK QUERY ------------- //
  const { data: fallbackData, error: fallbackError } = await supabase
    .from('projects')
    .select(`${selectColumns}, user_email`)
    .eq('user_email', email)
    .order('project_name', { ascending: true }) as {
      data: ProjectRow[] | null;
      error: any;
    };

  if (fallbackError) {
    console.warn('[client-projects] Fallback query failed.', fallbackError);
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
  if (!normalizedEmail) return [];

  const supabase = createServerSupabaseClient();

  // Load assignments
  const { data: assignments, error: assignmentsError } = await supabase
    .from('project_assignments')
    .select('project_id')
    .eq('freelancer_email', normalizedEmail);

  if (assignmentsError) {
    console.warn('[freelancer-projects] Failed to load assignments.', assignmentsError);
    return [];
  }

  const projectIds = Array.from(
    new Set(
      (assignments ?? [])
        .map((a) => a.project_id)
        .filter((id): id is number => typeof id === 'number'),
    ),
  );

  if (projectIds.length === 0) return [];

  // Load project metadata
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
    .order('assigned_at', { ascending: false }) as {
      data: {
        project_id: number;
        assigned_by: string | null;
        projects: ProjectRow | null;
      }[] | null;
      error: any;
    };

  if (projectsError) {
    console.warn('[freelancer-projects] Failed to fetch projects.', projectsError);
    return [];
  }

  if (!projectsData) return [];

  const clientEmails = Array.from(
    new Set(
      projectsData
        .map((row) => row.assigned_by ?? row.projects?.user_email ?? null)
        .filter((value): value is string => Boolean(value)),
    ),
  );

  const clientNameMap = new Map<string, string | null>();

  // Load client names
  if (clientEmails.length > 0) {
    const { data: clientRows, error: clientError } = await supabase
      .from('users')
      .select('email, display_name')
      .in('email', clientEmails);

    if (!clientError) {
      (clientRows ?? []).forEach((c) => {
        clientNameMap.set(c.email, c.display_name ?? null);
      });
    }
  }

  return projectsData
    .map((row) => {
      const project = row.projects;

      if (!project?.id) return null;

      const clientEmail = row.assigned_by ?? project.user_email ?? null;

      return {
        id: project.id,
        name: project.project_name ?? 'Untitled project',
        description: null,
        createdAt: project.created_at ?? null,
        clientEmail,
        clientName: clientEmail ? clientNameMap.get(clientEmail) ?? null : null,
      } as ProjectRecord;
    })
    .filter((x): x is ProjectRecord => x !== null);
}
