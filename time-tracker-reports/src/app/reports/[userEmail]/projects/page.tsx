import { format } from 'date-fns';
import { FolderOpen } from 'lucide-react';
import { DashboardShell } from '@/components/dashboard';
import { fetchUserProfile } from '@/lib/userProfile';
import { fetchManagerProjects, fetchEmployeeProjects } from '@/lib/projects';
import { determineRoleFromRoleProfile, createFrappeClient } from '@/lib/frappeClient';
import { createServerSupabaseClient } from '@/lib/supabaseServer';

export default async function ManagerProjectsPage({
  params,
}: {
  params: Promise<{ userEmail: string }>;
}) {
  const { userEmail } = await params;
  const decodedEmail = decodeURIComponent(userEmail);

  const profile = await fetchUserProfile(decodedEmail);

  if (!profile) {
    return (
      <DashboardShell userName={decodedEmail} userEmail={decodedEmail} userRole={null}>
        <div className="space-y-6">
          <section className="rounded-2xl border border-border bg-card p-6 text-center shadow-sm">
            <h1 className="text-2xl font-semibold text-foreground">Account not found</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              We couldn&apos;t locate your account details. Please ensure you are logged in with the correct email.
            </p>
          </section>
        </div>
      </DashboardShell>
    );
  }

  // Convert role_profile_name to Manager/Employee for logic
  const convertedRole = determineRoleFromRoleProfile(profile.role);
  const isManager = convertedRole === 'Manager';
  const isEmployee = convertedRole === 'Employee';

  const projects = isManager
    ? await fetchManagerProjects({ email: profile.email, userId: profile.id, company: profile.company })
    : isEmployee
      ? await fetchEmployeeProjects(profile.email)
      : [];

  // For managers, get assigned users for each project
  // Use the frappeProjectId stored in the project record
  const projectsWithUsers = isManager
    ? await Promise.all(
        projects.map(async (project) => {
          try {
            const frappe = createFrappeClient(true);
            const supabase = createServerSupabaseClient();
            
            // Use the Frappe project ID from the project record
            const frappeProjectId = project.frappeProjectId || project.name; // Use stored ID or fallback to name
            
            // Get users assigned to this project via multiple methods
            const assignedUsers: string[] = [];
            
            // Method 1: Get users from tasks assigned to this project
            try {
              const taskRes = await frappe.get('/api/resource/Task', {
                params: {
                  fields: JSON.stringify(['_assign']),
                  filters: JSON.stringify([
                    ['project', '=', frappeProjectId],
                    ['_assign', '!=', ''],
                  ]),
                  limit_page_length: 1000,
                },
              });
              
              const tasks = taskRes?.data?.data || [];
              tasks.forEach((task: any) => {
                if (task._assign) {
                  // _assign is a JSON string array
                  try {
                    const assignees = typeof task._assign === 'string' ? JSON.parse(task._assign) : task._assign;
                    if (Array.isArray(assignees)) {
                      assignees.forEach((email: string) => {
                        if (email && !assignedUsers.includes(email)) {
                          assignedUsers.push(email);
                        }
                      });
                    }
                  } catch {
                    // If parsing fails, treat as string
                    if (typeof task._assign === 'string' && !assignedUsers.includes(task._assign)) {
                      assignedUsers.push(task._assign);
                    }
                  }
                }
              });
            } catch (err) {
              console.warn(`[projects] Failed to get users from tasks for project ${project.name}:`, err);
            }
            
            // Method 2: Get users directly assigned via _assign field on Project
            try {
              const projectRes = await frappe.get(`/api/resource/Project/${frappeProjectId}`, {
                params: {
                  fields: JSON.stringify(['_assign']),
                },
              });
              
              const projectDoc = projectRes?.data?.data;
              if (projectDoc?._assign) {
                try {
                  const assignees = typeof projectDoc._assign === 'string' ? JSON.parse(projectDoc._assign) : projectDoc._assign;
                  if (Array.isArray(assignees)) {
                    assignees.forEach((email: string) => {
                      if (email && !assignedUsers.includes(email)) {
                        assignedUsers.push(email);
                      }
                    });
                  }
                } catch {
                  if (typeof projectDoc._assign === 'string' && !assignedUsers.includes(projectDoc._assign)) {
                    assignedUsers.push(projectDoc._assign);
                  }
                }
              }
            } catch (err) {
              console.warn(`[projects] Failed to get users from project _assign for ${project.name}:`, err);
            }
            
            // Get display names from Supabase and Frappe
            const userDisplayNames = new Map<string, string>();
            if (assignedUsers.length > 0) {
              // First, try to get names from Supabase
              const { data: userRows } = await supabase
                .from('users')
                .select('email, display_name')
                .in('email', assignedUsers);
              
              (userRows || []).forEach((row) => {
                userDisplayNames.set(row.email, row.display_name || row.email);
              });
              
              // For users not found in Supabase, try to get full_name from Frappe
              const { getAllFrappeUsers } = await import('@/lib/frappeClient');
              const frappeUsers = await getAllFrappeUsers();
              assignedUsers.forEach((email) => {
                if (!userDisplayNames.has(email)) {
                  const frappeUser = frappeUsers.find(u => u.email.toLowerCase() === email.toLowerCase());
                  if (frappeUser?.full_name) {
                    userDisplayNames.set(email, frappeUser.full_name);
                  } else {
                    userDisplayNames.set(email, email); // Fallback to email
                  }
                }
              });
            }
            
            return {
              ...project,
              assignedUsers: assignedUsers.map((email) => ({
                email,
                displayName: userDisplayNames.get(email) || email,
              })),
            };
          } catch (error) {
            console.warn(`[projects] Failed to get assigned users for project ${project.name}:`, error);
            return {
              ...project,
              assignedUsers: [],
            };
          }
        })
      )
    : projects.map((p) => ({ ...p, assignedUsers: [] }));

  return (
    <DashboardShell
      userName={profile.displayName || profile.email}
      userEmail={profile.email}
      userRole={profile.role}
    >
      <div className="space-y-6">
        <header className="space-y-2">
          <h1 className="text-3xl font-bold text-foreground">Projects</h1>
          <p className="text-sm text-muted-foreground">
            {isManager
              ? "Review the projects you've created and assigned to your employees."
              : isEmployee
                ? "See the projects your managers have assigned to you."
                : "Projects are managed by managers. Log in with a manager account to view project listings."}
          </p>
        </header>

        {!isManager && !isEmployee ? (
          <section className="rounded-2xl border border-border bg-card p-6 shadow-sm">
            <p className="text-sm text-muted-foreground">
              Projects are managed by managers. Log in with a manager account to view project listings.
            </p>
          </section>
        ) : projects.length === 0 ? (
          <section className="rounded-2xl border border-dashed border-border/60 bg-card p-10 text-center shadow-sm">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-secondary/70 text-secondary-foreground">
              <FolderOpen size={24} />
            </div>
            <h2 className="mt-4 text-xl font-semibold text-foreground">No projects yet</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              {isManager
                ? 'Create a project from the desktop app to start tracking time and assigning employees.'
                : 'Your manager has not assigned any projects to you yet.'}
            </p>
          </section>
        ) : (
          <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {projectsWithUsers.map((project) => (
              <article
                key={project.id}
                className="flex flex-col rounded-2xl border border-border bg-card p-5 shadow-sm transition hover:shadow-md"
              >
                <div className="flex items-center justify-between">
                  <h2 className="text-lg font-semibold text-foreground">{project.name}</h2>
                </div>
                {isManager && 'assignedUsers' in project && project.assignedUsers.length > 0 && (
                  <div className="mt-2">
                    <p className="text-xs font-medium text-muted-foreground mb-1">Assigned to:</p>
                    <div className="flex flex-wrap gap-1">
                      {project.assignedUsers.slice(0, 3).map((user) => (
                        <span
                          key={user.email}
                          className="inline-flex items-center rounded-full bg-secondary px-2 py-1 text-xs text-secondary-foreground"
                        >
                          {user.displayName}
                        </span>
                      ))}
                      {project.assignedUsers.length > 3 && (
                        <span className="inline-flex items-center rounded-full bg-secondary px-2 py-1 text-xs text-secondary-foreground">
                          +{project.assignedUsers.length - 3} more
                        </span>
                      )}
                    </div>
                  </div>
                )}
                {project.managerEmail && (
                  <p className="mt-1 text-xs font-medium text-muted-foreground">
                    Assigned by {project.managerName ?? project.managerEmail}
                  </p>
                )}
                {project.description ? (
                  <p className="mt-3 line-clamp-3 text-sm text-muted-foreground">{project.description}</p>
                ) : (
                  <p className="mt-3 text-sm text-muted-foreground">No additional details provided.</p>
                )}
                <div className="mt-6 text-xs uppercase tracking-wide text-muted-foreground">
                  Created {project.createdAt ? format(new Date(project.createdAt), 'PPP') : '—'}
                </div>
              </article>
            ))}
          </section>
        )}
      </div>
    </DashboardShell>
  );
}

