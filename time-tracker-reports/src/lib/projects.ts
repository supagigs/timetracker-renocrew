import { getAllFrappeProjects, getFrappeProjectsForUser } from './frappeClient';
import { createServerSupabaseClient } from './supabaseServer';

export type ProjectRecord = {
  id: number;
  name: string;
  frappeProjectId?: string; // Frappe project ID (e.g., "PROJ-0021")
  description: string | null;
  createdAt: string | null;
  managerEmail?: string | null;
  managerName?: string | null;
};

export async function fetchManagerProjects({
  email,
  userId,
  company,
}: {
  email: string;
  userId: number | null;
  company?: string | null;
}): Promise<ProjectRecord[]> {
  // For managers, fetch ALL projects from Frappe (not filtered by company)
  // NOTE: We do NOT store these in the projects table because not all projects
  // are assigned to the manager. The projects table should only contain projects
  // that are actually assigned to specific users (which happens when employees
  // fetch their projects via fetchEmployeeProjects).
  try {
    const frappeProjects = await getAllFrappeProjects(company);
    
    // Return projects without storing them in database
    // Managers can view all projects, but we shouldn't create "fake" assignments
    return frappeProjects.map((project, index) => ({
      id: index + 1, // Use index as ID since Frappe projects don't have numeric IDs
      name: project.name,
      frappeProjectId: project.id, // Store the Frappe project ID for later use
      description: null,
      managerEmail: null,
      managerName: null,
      createdAt: null,
    }));
  } catch (error) {
    console.error('[manager-projects] Failed to fetch Frappe projects:', error);
    return [];
  }
}

export async function fetchEmployeeProjects(email: string): Promise<ProjectRecord[]> {
  const normalizedEmail = email.trim().toLowerCase();
  if (!normalizedEmail) return [];

  // For employees, fetch projects assigned to them from Frappe
  try {
    const frappeProjects = await getFrappeProjectsForUser(normalizedEmail);
    
    // Store projects in database using user_email
    if (frappeProjects.length > 0) {
      const supabase = createServerSupabaseClient();
      
      for (const project of frappeProjects) {
        const { error } = await supabase
          .from('projects')
          .upsert(
            {
              user_email: normalizedEmail,
              frappe_project_id: project.id,
              project_name: project.name,
            },
            {
              onConflict: 'user_email,frappe_project_id',
              ignoreDuplicates: false,
            }
          );
        
        if (error) {
          console.warn('[employee-projects] Failed to upsert project:', error);
        }
      }
    }
    
    // Return Frappe projects mapped to ProjectRecord format
    return frappeProjects.map((project, index) => ({
      id: index + 1000000, // Use generated ID since we don't have database IDs
      name: project.name,
      description: null,
      managerEmail: null,
      managerName: null,
      createdAt: null,
    }));
  } catch (error) {
    console.error('[employee-projects] Failed to fetch Frappe projects:', error);
    return [];
  }
}
