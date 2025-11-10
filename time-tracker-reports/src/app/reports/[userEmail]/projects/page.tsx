import { format } from 'date-fns';
import { FolderOpen } from 'lucide-react';
import { DashboardShell } from '@/components/dashboard';
import { fetchUserProfile } from '@/lib/userProfile';
import { fetchClientProjects, fetchFreelancerProjects, type ProjectRecord } from '@/lib/projects';

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

  const isClient = profile.category === 'Client';
  const isFreelancer = profile.category === 'Freelancer';

  const projects = isClient
    ? await fetchClientProjects({ email: profile.email, userId: profile.id })
    : isFreelancer
      ? await fetchFreelancerProjects(profile.email)
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
            {isClient
              ? "Review the projects you've created and assigned to your freelancers."
              : isFreelancer
                ? "See the projects your clients have assigned to you."
                : "Projects are managed by clients. Log in with a client account to view project listings."}
          </p>
        </header>

        {!isClient && !isFreelancer ? (
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
              {isClient
                ? 'Create a project from the desktop app to start tracking time and assigning freelancers.'
                : 'Your client has not assigned any projects to you yet.'}
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
                {project.clientEmail && (
                  <p className="mt-1 text-xs font-medium text-muted-foreground">
                    Assigned by {project.clientName ?? project.clientEmail}
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

