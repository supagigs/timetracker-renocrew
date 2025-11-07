'use client';

import { FormEvent, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Image from "next/image";

import {
  DashboardShell,
  StatsCards,
  ActiveProjects,
  UpcomingSchedule,
  RecentActivity,
} from "@/components/dashboard";

type Category = "Client" | "Freelancer" | null;

type AuthenticatedUser = {
  email: string;
  displayName: string | null;
  category: Category;
  createdAt?: string;
  projects: string[];
};

type SignupFormState = {
  email: string;
  displayName: string;
  category: Category;
  projectInput: string;
  projects: string[];
};

const STORAGE_KEY = "supatimetracker:web-user";
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function Home() {
  const [user, setUser] = useState<AuthenticatedUser | null>(null);

  const [loginEmail, setLoginEmail] = useState("");
  const [loginError, setLoginError] = useState("");
  const [loginPending, setLoginPending] = useState(false);
  const [loginSuccess, setLoginSuccess] = useState("");

  const [signup, setSignup] = useState<SignupFormState>({
    email: "",
    displayName: "",
    category: "Freelancer",
    projectInput: "",
    projects: [],
  });
  const [signupError, setSignupError] = useState("");
  const [signupSuccess, setSignupSuccess] = useState("");
  const [signupPending, setSignupPending] = useState(false);

  const [activeView, setActiveView] = useState<"login" | "signup">("login");

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const saved = JSON.parse(raw) as AuthenticatedUser | null;
        if (saved?.email) {
          setUser({ ...saved, projects: saved.projects ?? [] });
          setLoginEmail(saved.email);
        }
      }
    } catch (error) {
      console.warn("[page] Unable to parse saved user data:", error);
    }
  }, []);

  const loginButtonDisabled = useMemo(
    () => loginPending || !EMAIL_REGEX.test(loginEmail),
    [loginPending, loginEmail],
  );

  const handleLogin = async (event: FormEvent) => {
    event.preventDefault();
    setLoginError("");
    setLoginSuccess("");

    if (!EMAIL_REGEX.test(loginEmail)) {
      setLoginError("Enter a valid email address before logging in.");
      return;
    }

    setLoginPending(true);
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: loginEmail }),
      });

      const payload = await response.json();

      if (!response.ok) {
        setLoginError(payload.error ?? "Unable to log in right now.");
        return;
      }

      const authenticatedUser = normalizeUser(payload.user);
      setUser(authenticatedUser);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(authenticatedUser));
      setLoginSuccess("Login successful. Welcome back!");
      setSignupSuccess("");
    } catch (error) {
      console.error("[page] Login failed:", error);
      setLoginError("Unexpected error occurred while logging in.");
    } finally {
      setLoginPending(false);
    }
  };

  const handleSignupChange = (field: keyof SignupFormState, value: string | Category) => {
    setSignup((prev) => ({ ...prev, [field]: value } as SignupFormState));
  };

  const handleAddProject = () => {
    setSignupError("");
    const project = signup.projectInput.trim();
    if (!project) {
      setSignupError("Enter a project name before adding it.");
      return;
    }

    if (signup.projects.some((existing) => existing.toLowerCase() === project.toLowerCase())) {
      setSignupError("This project is already on the list.");
      return;
    }

    setSignup((prev) => ({
      ...prev,
      projectInput: "",
      projects: [...prev.projects, project],
    }));
  };

  const handleRemoveProject = (projectName: string) => {
    setSignup((prev) => ({
      ...prev,
      projects: prev.projects.filter((project) => project !== projectName),
    }));
  };

  const handleSignup = async (event: FormEvent) => {
    event.preventDefault();
    setSignupError("");
    setSignupSuccess("");

    if (!EMAIL_REGEX.test(signup.email)) {
      setSignupError("Please enter a valid email address.");
      return;
    }

    if (!signup.category) {
      setSignupError("Select whether you are a Client or Freelancer.");
      return;
    }

    if (signup.category === "Client" && signup.projects.length === 0) {
      setSignupError("Add at least one project so we can prepare your reports.");
      return;
    }

    setSignupPending(true);
    try {
      const response = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: signup.email,
          displayName: signup.displayName || undefined,
          category: signup.category,
          projects: signup.category === "Client" ? signup.projects : [],
        }),
      });

      const payload = await response.json();

      if (!response.ok) {
        setSignupError(payload.error ?? "Unable to create your account.");
        return;
      }

      const authenticatedUser = normalizeUser(payload.user);
      setUser(authenticatedUser);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(authenticatedUser));

      setSignupSuccess("Account created! You are ready to use the reports website.");
      setLoginSuccess("");
      setLoginEmail(authenticatedUser.email);

      setSignup({
        email: "",
        displayName: "",
        category: "Freelancer",
        projectInput: "",
        projects: [],
      });
    } catch (error) {
      console.error("[page] Signup failed:", error);
      setSignupError("Unexpected error occurred while creating your account.");
    } finally {
      setSignupPending(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem(STORAGE_KEY);
    setUser(null);
    setLoginSuccess("");
    setSignupSuccess("");
  };

  const reportsHref = user ? `/reports/${encodeURIComponent(user.email)}` : "#";

  return (
    <DashboardShell
      userName={user?.displayName || user?.email || null}
      userEmail={user?.email || null}
      userRole={user?.category || null}
      showNotifications={false}
      showMessages={false}
    >
      <section className="rounded-2xl border border-border bg-card p-8 text-center shadow-sm">
        <div className="flex flex-col items-center gap-4">
          <Image
            src="/supagigs-logo.png"
            alt="Supatimetracker logo"
            width={96}
            height={96}
            priority
            className="h-24 w-24 rounded-2xl border border-border bg-secondary object-contain"
          />
          <p className="text-sm font-semibold uppercase tracking-wide text-primary">Supatimetracker</p>
          <h1 className="text-3xl font-bold sm:text-4xl">Welcome to your dashboard</h1>
          <p className="max-w-2xl text-sm text-muted-foreground">
            Track your time in the desktop app and come here to manage your account or view detailed reports. You can log
            in or create an account directly on the website—your data is stored securely.
          </p>
        </div>

        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <button
            type="button"
            onClick={() => setActiveView("login")}
            aria-pressed={activeView === "login"}
            className={`rounded-lg px-6 py-3 text-sm font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 ${
              activeView === "login"
                ? "bg-primary text-primary-foreground"
                : "bg-secondary text-secondary-foreground hover:bg-secondary/80"
            }`}
          >
            Log in
          </button>
          <button
            type="button"
            onClick={() => setActiveView("signup")}
            aria-pressed={activeView === "signup"}
            className={`rounded-lg px-6 py-3 text-sm font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 ${
              activeView === "signup"
                ? "bg-primary text-primary-foreground"
                : "bg-secondary text-secondary-foreground hover:bg-secondary/80"
            }`}
          >
            Sign up
          </button>
          <Link
            href={reportsHref}
            className={`rounded-lg px-6 py-3 text-sm font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 ${
              user ? "bg-primary/10 text-primary hover:bg-primary/20" : "cursor-not-allowed bg-secondary text-muted-foreground"
            }`}
            aria-disabled={!user}
          >
            View reports
          </Link>
        </div>

        <div className="mt-8 flex justify-center">
          <div className="w-full max-w-xl text-left">
            {activeView === "login" ? (
              <form className="space-y-4 rounded-xl border border-border bg-card p-6 text-left shadow-sm" onSubmit={handleLogin}>
                <label className="block">
                  <span className="text-sm font-medium text-foreground">Email address</span>
                  <input
                    type="email"
                    value={loginEmail}
                    onChange={(event) => setLoginEmail(event.target.value.trim().toLowerCase())}
                    className="mt-1 w-full rounded-lg border border-border bg-white px-3 py-2 text-base text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/40"
                    placeholder="you@example.com"
                    autoComplete="email"
                  />
                </label>

                {loginError ? (
                  <p className="text-sm text-destructive-foreground">{loginError}</p>
                ) : loginSuccess ? (
                  <p className="text-sm text-emerald-600">{loginSuccess}</p>
                ) : null}

                <button
                  type="submit"
                  disabled={loginButtonDisabled}
                  className="inline-flex w-full items-center justify-center rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground"
                >
                  {loginPending ? "Logging in…" : "Log in"}
                </button>
              </form>
            ) : (
              <form className="space-y-4 rounded-xl border border-border bg-card p-6 text-left shadow-sm" onSubmit={handleSignup}>
                <label className="block">
                  <span className="text-sm font-medium text-foreground">Email address</span>
                  <input
                    type="email"
                    value={signup.email}
                    onChange={(event) => handleSignupChange("email", event.target.value.trim().toLowerCase())}
                    className="mt-1 w-full rounded-lg border border-border bg-white px-3 py-2 text-base text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/40"
                    placeholder="you@example.com"
                    autoComplete="email"
                    required
                  />
                </label>

                <label className="block">
                  <span className="text-sm font-medium text-foreground">Display name (optional)</span>
                  <input
                    type="text"
                    value={signup.displayName}
                    onChange={(event) => handleSignupChange("displayName", event.target.value)}
                    className="mt-1 w-full rounded-lg border border-border bg-white px-3 py-2 text-base text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/40"
                    placeholder="How should we greet you?"
                    maxLength={120}
                  />
                </label>

                <fieldset>
                  <legend className="text-sm font-medium text-foreground">Account type</legend>
                  <div className="mt-2 grid gap-3 sm:grid-cols-2">
                    {(["Client", "Freelancer"] as const).map((category) => (
                      <label
                        key={category}
                        className={`flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2 transition ${
                          signup.category === category
                            ? "border-primary bg-primary/10"
                            : "border-border bg-white"
                        }`}
                      >
                        <input
                          type="radio"
                          name="category"
                          value={category}
                          checked={signup.category === category}
                          onChange={() => handleSignupChange("category", category)}
                          className="h-4 w-4 text-primary focus:ring-primary"
                        />
                        <span className="text-sm font-medium text-foreground">{category}</span>
                      </label>
                    ))}
                  </div>
                </fieldset>

                {signup.category === "Client" && (
                  <div className="space-y-3">
                    <div>
                      <label className="text-sm font-medium text-foreground">Projects</label>
                      <p className="text-xs text-muted-foreground">Add the projects you want to see in reports.</p>
                    </div>
                    <div className="flex flex-col gap-2 sm:flex-row">
                      <input
                        type="text"
                        value={signup.projectInput}
                        onChange={(event) => handleSignupChange("projectInput", event.target.value)}
                        className="w-full rounded-lg border border-border bg-white px-3 py-2 text-base text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/40"
                        placeholder="Project name"
                      />
                      <button
                        type="button"
                        onClick={handleAddProject}
                        className="inline-flex items-center justify-center rounded-lg border border-primary px-3 py-2 text-sm font-semibold text-primary transition hover:bg-primary/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                      >
                        Add project
                      </button>
                    </div>

                    {signup.projects.length > 0 ? (
                      <ul className="flex flex-wrap gap-2">
                        {signup.projects.map((project) => (
                          <li
                            key={project}
                            className="flex items-center gap-2 rounded-full bg-secondary px-3 py-1 text-sm text-foreground"
                          >
                            {project}
                            <button
                              type="button"
                              onClick={() => handleRemoveProject(project)}
                              className="text-xs text-muted-foreground transition hover:text-foreground"
                              aria-label={`Remove ${project}`}
                            >
                              ×
                            </button>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-xs italic text-muted-foreground">No projects added yet.</p>
                    )}
                  </div>
                )}

                {signupError ? (
                  <p className="text-sm text-destructive-foreground">{signupError}</p>
                ) : signupSuccess ? (
                  <p className="text-sm text-emerald-600">{signupSuccess}</p>
                ) : null}

                <button
                  type="submit"
                  disabled={signupPending}
                  className="inline-flex w-full items-center justify-center rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground"
                >
                  {signupPending ? "Creating account…" : "Create account"}
                </button>
              </form>
            )}
          </div>
        </div>
      </section>

      {user && (
        <section className="rounded-2xl border border-border bg-card p-6 shadow-sm">
          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div className="space-y-3">
              <h2 className="text-xl font-semibold text-foreground">Account overview</h2>
              <div className="space-y-2 text-sm text-muted-foreground">
                <p>
                  Hello, <span className="font-semibold text-foreground">{user.displayName || user.email}</span>!
                </p>
                <p>
                  Account type: <span className="font-semibold text-foreground">{user.category ?? "Not set"}</span>
                </p>
                <p>
                  Time tracking stays in the desktop app. Use the shortcuts here to jump into your reports or manage your
                  account details.
                </p>
                {user.category === "Client" && user.projects.length > 0 && (
                  <div className="space-y-1">
                    <p className="text-sm font-medium text-foreground">Projects</p>
                    <ul className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                      {user.projects.map((project) => (
                        <li key={project} className="rounded-full border border-border px-3 py-1">
                          {project}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </div>
            <div className="flex flex-col gap-2 md:items-end">
              <Link
                href={reportsHref}
                className="inline-flex items-center justify-center rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
              >
                View reports
              </Link>
              <button
                type="button"
                onClick={handleLogout}
                className="inline-flex items-center justify-center rounded-lg border border-border px-4 py-2 text-sm font-semibold text-foreground transition hover:bg-secondary"
              >
                Log out of website
              </button>
            </div>
          </div>
          <p className="mt-6 text-xs uppercase tracking-wide text-muted-foreground">
            No clock-in option is available on the website—open the desktop app to record time.
          </p>
        </section>
      )}

      {user && <StatsCards />}

      {user && (
        <div className="grid gap-8 lg:grid-cols-2">
          <ActiveProjects />
          <UpcomingSchedule />
        </div>
      )}

      {user && <RecentActivity />}
    </DashboardShell>
  );
}

const normalizeUser = (raw: RawUserPayload | null | undefined): AuthenticatedUser => {
  if (!raw) {
    throw new Error("User payload missing");
  }

  const email = (raw.email ?? "").toLowerCase();
  const displayName = raw.displayName ?? raw.display_name ?? null;
  const category = normalizeCategory(raw.category);

  const projects = Array.isArray(raw.projects)
    ? Array.from(
        new Set(
          raw.projects
            .filter((project): project is string => typeof project === "string" && project.trim().length > 0)
            .map((project) => project.trim()),
        ),
      )
    : [];

  return {
    email,
    displayName,
    category,
    createdAt: raw.createdAt,
    projects,
  };
};

type RawUserPayload = Partial<AuthenticatedUser> & {
  display_name?: string | null;
  projects?: string[] | null;
};

const normalizeCategory = (category: Category | string | null | undefined): Category => {
  if (category === "Client" || category === "Freelancer") {
    return category;
  }
  return null;
};
