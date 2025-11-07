import { format } from 'date-fns';
import { FolderOpen } from 'lucide-react';
import { DashboardShell } from '@/components/dashboard';
import { fetchUserProfile } from '@/lib/userProfile';
import { createServerSupabaseClient } from '@/lib/supabaseServer';

type ProjectRecord = {
  id: number;
  name: string;
  description: string | null;
  createdAt: string | null;
};

async function fetchClientProjects({
  email,
  userId,
}: {
  email: string;
  userId: number | null;
}): Promise<ProjectRecord[]> {
  const supabase = createServerSupabaseClient();

  const selectColumns = 'id, project_name, description, created_at';

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
        description: project.description ?? null,
        createdAt: project.created_at ?? null,
      }));
    }
  }

  const { data: fallbackData, error: fallbackError } = await supabase
    .from('projects')
    .select(selectColumns)
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
    description: project.description ?? null,
    createdAt: project.created_at ?? null,
  }));
}

export default async function ClientProjectsPage({
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
              We couldn't locate your account details. Please ensure you are logged in with the correct email.
            </p>
          </section>
        </div>
      </DashboardShell>
    );
  }

  const projects = profile.category === 'Client'
    ? await fetchClientProjects({ email: profile.email, userId: profile.id })
    : [];

  return (
    <DashboardShell
      userName={profile.displayName || profile.email}
      userEmail={profile.email}
      userRole={profile.category}
    >
      <div className="space-y-6">
        <header className="space-y-2">
          <h1 className="text-3xl font-bold text-foreground">Projects</h1>
          <p className="text-sm text-muted-foreground">
            Review the projects you've created and assigned to your freelancers.
          </p>
        </header>

        {profile.category !== 'Client' ? (
          <section className="rounded-2xl border border-border bg-card p-6 shadow-sm">
            <p className="text-sm text-muted-foreground">
              Projects are managed by clients. Log in with a client account to view project listings.
            </p>
          </section>
        ) : projects.length === 0 ? (
          <section className="rounded-2xl border border-dashed border-border/60 bg-card p-10 text-center shadow-sm">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-secondary/70 text-secondary-foreground">
              <FolderOpen size={24} />
            </div>
            <h2 className="mt-4 text-xl font-semibold text-foreground">No projects yet</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Create a project from the desktop app to start tracking time and assigning freelancers.
            </p>
          </section>
        ) : (
          <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {projects.map((project) => (
              <article
                key={project.id}
                className="flex flex-col rounded-2xl border border-border bg-card p-5 shadow-sm transition hover:shadow-md"
              >
                <div className="flex items-center justify-between">
                  <h2 className="text-lg font-semibold text-foreground">{project.name}</h2>
                </div>
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

