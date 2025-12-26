import { createServerSupabaseClient } from './supabaseServer';
import { getAllFrappeProjects } from './frappeClient';

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
  company,
}: {
  email: string;
  userId: number | null;
  company?: string | null;
}): Promise<ProjectRecord[]> {
  // For clients, fetch projects from Frappe filtered by company
  try {
    const frappeProjects = await getAllFrappeProjects(company || undefined);
    return frappeProjects.map((project, index) => ({
      id: index + 1, // Use index as ID since Frappe projects don't have numeric IDs
      name: project.name,
      description: null,
      clientEmail: null,
      clientName: null,
      createdAt: null,
    }));
  } catch (error) {
    console.error('[client-projects] Failed to fetch Frappe projects, falling back to Supabase:', error);
    // Fall back to Supabase if Frappe fails
  }

  const supabase = createServerSupabaseClient();
  const selectColumns = 'id, project_name, created_at';

  if (userId !== null) {
    const { data, error } = await supabase
      .from('projects')
      .select(selectColumns)
      .eq('user_id', userId)
      .order('project_name', { ascending: true });

    if (!error && Array.isArray(data) && data.length > 0) {
      return (data as any[]).map((project) => ({
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
  if (!fallbackData) return [];

  return (fallbackData as any[]).map((project) => ({
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

  // Since project_assignments table has been deleted, fetch projects directly from Supabase
  // that belong to this freelancer (by user_email)
  const { data: projectsData, error: projectsError } = await supabase
    .from('projects')
    .select('id, project_name, created_at, user_email')
    .eq('user_email', normalizedEmail)
    .order('project_name', { ascending: true });

  if (projectsError) {
    // If table doesn't exist or other error, return empty list
    if (projectsError.code === 'PGRST205' || projectsError.code === '42P01') {
      console.warn('[freelancer-projects] Projects table not found, returning empty list.');
    } else {
      console.warn('[freelancer-projects] Failed to load projects, returning empty list.', projectsError);
    }
    return [];
  }

  if (!projectsData || projectsData.length === 0) {
    return [];
  }

  // Map projects to ProjectRecord format
  return projectsData.map((project: any) => ({
    id: project.id,
    name: project.project_name ?? 'Untitled project',
    description: null,
    clientEmail: project.user_email ?? null,
    clientName: null, // We don't have client name without joining users table
    createdAt: project.created_at ?? null,
  }));
}
