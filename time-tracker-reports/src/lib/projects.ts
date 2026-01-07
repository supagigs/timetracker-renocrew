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
  try {
    const frappeProjects = await getAllFrappeProjects(); // No company filter - get all projects
    
    // Store projects in database if user_id is available
    if (userId && frappeProjects.length > 0) {
      const supabase = createServerSupabaseClient();
      
      for (const project of frappeProjects) {
        const { error } = await supabase
          .from('projects')
          .upsert(
            {
              user_id: userId,
              frappe_project_id: project.id,
              project_name: project.name,
            },
            {
              onConflict: 'user_id,frappe_project_id',
              ignoreDuplicates: false,
            }
          );
        
        if (error) {
          console.warn('[manager-projects] Failed to upsert project:', error);
        }
      }
    }
    
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
    
    // Store projects in database
    if (frappeProjects.length > 0) {
      const supabase = createServerSupabaseClient();
      
      // Get user_id
      const { data: userData } = await supabase
        .from('users')
        .select('id')
        .eq('email', normalizedEmail)
        .maybeSingle();
      
      const userId = userData?.id || null;
      
      if (userId) {
        for (const project of frappeProjects) {
          const { error } = await supabase
            .from('projects')
            .upsert(
              {
                user_id: userId,
                frappe_project_id: project.id,
                project_name: project.name,
              },
              {
                onConflict: 'user_id,frappe_project_id',
                ignoreDuplicates: false,
              }
            );
          
          if (error) {
            console.warn('[employee-projects] Failed to upsert project:', error);
          }
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
