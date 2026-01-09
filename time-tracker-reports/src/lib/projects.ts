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
    console.log('[manager-projects] Fetching all projects from Frappe for manager');
    // Pass null/undefined to fetch ALL projects, not filtered by company
    const frappeProjects = await getAllFrappeProjects(null);
    
    console.log(`[manager-projects] Successfully fetched ${frappeProjects.length} project(s) from Frappe`);
    
    // Sort projects by name for consistent ordering (avoid hydration mismatches)
    const sortedProjects = [...frappeProjects].sort((a, b) => {
      const nameA = a.name.toLowerCase();
      const nameB = b.name.toLowerCase();
      return nameA.localeCompare(nameB);
    });
    
    // Return projects without storing them in database
    // Managers can view all projects, but we shouldn't create "fake" assignments
    // Use frappeProjectId as a stable ID to avoid hydration mismatches
    // Use index-based numeric ID (starting at 2000000 to avoid conflicts with employee projects)
    return sortedProjects.map((project, index) => ({
      id: index + 2000000, // Use generated ID since we don't have database IDs (2000000+ to avoid conflicts)
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
