'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';

type Category = 'Client' | 'Freelancer' | null;

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

const STORAGE_KEY = 'supatimetracker:web-user';
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function Home() {
  const [user, setUser] = useState<AuthenticatedUser | null>(null);

  const [loginEmail, setLoginEmail] = useState('');
  const [loginError, setLoginError] = useState('');
  const [loginPending, setLoginPending] = useState(false);
  const [loginSuccess, setLoginSuccess] = useState('');
  const [activeView, setActiveView] = useState<'login' | 'signup' | null>(null);

  const [signup, setSignup] = useState<SignupFormState>({
    email: '',
    displayName: '',
    category: 'Freelancer',
    projectInput: '',
    projects: [],
  });
  const [signupError, setSignupError] = useState('');
  const [signupSuccess, setSignupSuccess] = useState('');
  const [signupPending, setSignupPending] = useState(false);

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
      console.warn('[page] Unable to parse saved user data:', error);
    }
  }, []);

  const loginButtonDisabled = useMemo(() => loginPending || !EMAIL_REGEX.test(loginEmail), [loginPending, loginEmail]);

  const handleLogin = async (event: FormEvent) => {
    event.preventDefault();
    setLoginError('');
    setLoginSuccess('');

    if (!EMAIL_REGEX.test(loginEmail)) {
      setLoginError('Enter a valid email address before logging in.');
      return;
    }

    setLoginPending(true);
    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: loginEmail }),
      });

      const payload = await response.json();

      if (!response.ok) {
        setLoginError(payload.error ?? 'Unable to log in right now.');
        return;
      }

      const authenticatedUser = normalizeUser(payload.user);
      setUser(authenticatedUser);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(authenticatedUser));
      setLoginSuccess('Login successful. Welcome back!');
      setSignupSuccess('');
    } catch (error) {
      console.error('[page] Login failed:', error);
      setLoginError('Unexpected error occurred while logging in.');
    } finally {
      setLoginPending(false);
    }
  };

  const handleSignupChange = (field: keyof SignupFormState, value: string | Category) => {
    setSignup((prev) => ({ ...prev, [field]: value } as SignupFormState));
  };

  const handleAddProject = () => {
    setSignupError('');
    const project = signup.projectInput.trim();
    if (!project) {
      setSignupError('Enter a project name before adding it.');
      return;
    }

    if (signup.projects.some((existing) => existing.toLowerCase() === project.toLowerCase())) {
      setSignupError('This project is already on the list.');
      return;
    }

    setSignup((prev) => ({
      ...prev,
      projectInput: '',
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
    setSignupError('');
    setSignupSuccess('');

    if (!EMAIL_REGEX.test(signup.email)) {
      setSignupError('Please enter a valid email address.');
      return;
    }

    if (!signup.category) {
      setSignupError('Select whether you are a Client or Freelancer.');
      return;
    }

    if (signup.category === 'Client' && signup.projects.length === 0) {
      setSignupError('Add at least one project so we can prepare your reports.');
      return;
    }

    setSignupPending(true);
    try {
      const response = await fetch('/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: signup.email,
          displayName: signup.displayName || undefined,
          category: signup.category,
          projects: signup.category === 'Client' ? signup.projects : [],
        }),
      });

      const payload = await response.json();

      if (!response.ok) {
        setSignupError(payload.error ?? 'Unable to create your account.');
        return;
      }

      const authenticatedUser = normalizeUser(payload.user);
      setUser(authenticatedUser);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(authenticatedUser));

      setSignupSuccess('Account created! You are ready to use the reports website.');
      setLoginSuccess('');
      setLoginEmail(authenticatedUser.email);

      setSignup({
        email: '',
        displayName: '',
        category: 'Freelancer',
        projectInput: '',
        projects: [],
      });
    } catch (error) {
      console.error('[page] Signup failed:', error);
      setSignupError('Unexpected error occurred while creating your account.');
    } finally {
      setSignupPending(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem(STORAGE_KEY);
    setUser(null);
    setLoginSuccess('');
    setSignupSuccess('');
  };

  const reportsHref = user ? `/reports/${encodeURIComponent(user.email)}` : '#';
  const toggleView = (view: 'login' | 'signup') => {
    setActiveView((prev) => (prev === view ? null : view));
  };

  return (
    <div className="min-h-screen bg-slate-900 text-white">
      <main className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-6 py-10">
        <header className="space-y-6 text-center">
          <div className="flex flex-col items-center gap-4">
            <Image
              src="/supagigs-logo.png"
              alt="Supatimetracker logo"
              width={96}
              height={96}
              priority
              className="h-24 w-24 rounded-2xl border border-slate-700 bg-slate-800 object-contain shadow-lg"
            />
            <p className="text-sm uppercase tracking-wide text-emerald-300">Supatimetracker</p>
          </div>
          <h1 className="text-3xl font-bold sm:text-4xl">Welcome to your dashboard</h1>
          <p className="mx-auto max-w-2xl text-slate-300">
            Track your time in the desktop app and come here to manage your account or view detailed reports.
            You can log in or create an account directly on the website—your data is stored securely.
          </p>
          <div className="flex flex-wrap justify-center gap-4">
            <button
              type="button"
              onClick={() => toggleView('login')}
              aria-pressed={activeView === 'login'}
              className={`inline-flex items-center justify-center rounded-lg px-6 py-3 text-sm font-semibold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-200 ${
                activeView === 'login'
                  ? 'bg-emerald-500 text-slate-900 shadow-lg shadow-emerald-500/40'
                  : 'bg-slate-800 text-slate-100 hover:bg-slate-700'
              }`}
            >
              Log in
            </button>
            <button
              type="button"
              onClick={() => toggleView('signup')}
              aria-pressed={activeView === 'signup'}
              className={`inline-flex items-center justify-center rounded-lg px-6 py-3 text-sm font-semibold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-200 ${
                activeView === 'signup'
                  ? 'bg-emerald-500 text-slate-900 shadow-lg shadow-emerald-500/40'
                  : 'bg-slate-800 text-slate-100 hover:bg-slate-700'
              }`}
            >
              Sign up
            </button>
            <Link
              href={reportsHref}
              className={`inline-flex items-center justify-center rounded-lg px-6 py-3 text-sm font-semibold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-200 ${
                user ? 'bg-emerald-100 text-emerald-900 hover:bg-emerald-200' : 'cursor-not-allowed bg-slate-700 text-slate-400'
              }`}
              aria-disabled={!user}
            >
              View reports
            </Link>
          </div>
        </header>

        <div className="space-y-6">
          {activeView === 'login' && (
            <section className="rounded-2xl border border-slate-700 bg-slate-800/80 p-6 shadow-lg">
            <h2 className="text-xl font-semibold">Log in</h2>
            <p className="mt-2 text-sm text-slate-300">
              Enter the email you use in the desktop app to access your reports here.
            </p>
            <form className="mt-6 space-y-5" onSubmit={handleLogin}>
              <label className="block">
                <span className="text-sm font-medium text-slate-200">Email address</span>
                <input
                  type="email"
                  value={loginEmail}
                  onChange={(event) => setLoginEmail(event.target.value.trim().toLowerCase())}
                  className="mt-1 w-full rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-base text-white placeholder-slate-500 focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/60"
                  placeholder="you@example.com"
                  autoComplete="email"
                />
              </label>

              {loginError ? (
                <p className="text-sm text-rose-400">{loginError}</p>
              ) : loginSuccess ? (
                <p className="text-sm text-emerald-400">{loginSuccess}</p>
              ) : null}

              <button
                type="submit"
                disabled={loginButtonDisabled}
                className="inline-flex w-full items-center justify-center rounded-lg bg-emerald-500 px-4 py-2 text-sm font-semibold text-slate-900 transition hover:bg-emerald-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-200 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-400"
              >
                {loginPending ? 'Logging in…' : 'Log in'}
              </button>
            </form>
          </section>
          )}

          {activeView === 'signup' && (
            <section className="rounded-2xl border border-slate-700 bg-slate-800/80 p-6 shadow-lg">
            <h2 className="text-xl font-semibold">Create an account</h2>
            <p className="mt-2 text-sm text-slate-300">
              New here? Sign up with the same details you use in the desktop app. Client accounts can register their projects too.
            </p>

            <form className="mt-6 space-y-4" onSubmit={handleSignup}>
              <label className="block">
                <span className="text-sm font-medium text-slate-200">Email address</span>
                <input
                  type="email"
                  value={signup.email}
                  onChange={(event) => handleSignupChange('email', event.target.value.trim().toLowerCase())}
                  className="mt-1 w-full rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-base text-white placeholder-slate-500 focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/60"
                  placeholder="you@example.com"
                  autoComplete="email"
                  required
                />
              </label>

              <label className="block">
                <span className="text-sm font-medium text-slate-200">Display name (optional)</span>
                <input
                  type="text"
                  value={signup.displayName}
                  onChange={(event) => handleSignupChange('displayName', event.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-base text-white placeholder-slate-500 focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/60"
                  placeholder="How should we greet you?"
                  maxLength={120}
                />
              </label>

              <fieldset>
                <legend className="text-sm font-medium text-slate-200">Account type</legend>
                <div className="mt-2 grid gap-3 sm:grid-cols-2">
                  {(['Client', 'Freelancer'] as const).map((category) => (
                    <label
                      key={category}
                      className={`flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2 transition ${
                        signup.category === category
                          ? 'border-emerald-400 bg-emerald-500/10'
                          : 'border-slate-600 bg-slate-900'
                      }`}
                    >
                      <input
                        type="radio"
                        name="category"
                        value={category}
                        checked={signup.category === category}
                        onChange={() => handleSignupChange('category', category)}
                        className="h-4 w-4 text-emerald-500 focus:ring-emerald-500"
                      />
                      <span className="text-sm font-medium text-slate-100">{category}</span>
                    </label>
                  ))}
                </div>
              </fieldset>

              {signup.category === 'Client' && (
                <div className="space-y-3">
                  <div>
                    <label className="text-sm font-medium text-slate-200">Projects</label>
                    <p className="text-xs text-slate-400">Add the projects you want to see in reports.</p>
                  </div>
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <input
                      type="text"
                      value={signup.projectInput}
                      onChange={(event) => handleSignupChange('projectInput', event.target.value)}
                      className="w-full rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-base text-white placeholder-slate-500 focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/60"
                      placeholder="Project name"
                    />
                    <button
                      type="button"
                      onClick={handleAddProject}
                      className="inline-flex items-center justify-center rounded-lg border border-emerald-400 px-3 py-2 text-sm font-semibold text-emerald-300 transition hover:bg-emerald-500/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-200"
                    >
                      Add project
                    </button>
                  </div>

                  {signup.projects.length > 0 ? (
                    <ul className="flex flex-wrap gap-2">
                      {signup.projects.map((project) => (
                        <li
                          key={project}
                          className="flex items-center gap-2 rounded-full bg-slate-900 px-3 py-1 text-sm text-slate-200"
                        >
                          {project}
                          <button
                            type="button"
                            onClick={() => handleRemoveProject(project)}
                            className="text-xs text-rose-400 transition hover:text-rose-300"
                            aria-label={`Remove ${project}`}
                          >
                            ×
                          </button>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-xs italic text-slate-500">No projects added yet.</p>
                  )}
                </div>
              )}

              {signupError ? (
                <p className="text-sm text-rose-400">{signupError}</p>
              ) : signupSuccess ? (
                <p className="text-sm text-emerald-400">{signupSuccess}</p>
              ) : null}

              <button
                type="submit"
                disabled={signupPending}
                className="inline-flex w-full items-center justify-center rounded-lg bg-emerald-500 px-4 py-2 text-sm font-semibold text-slate-900 transition hover:bg-emerald-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-200 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-400"
              >
                {signupPending ? 'Creating account…' : 'Create account'}
              </button>
            </form>
          </section>
          )}
        </div>

        <section className="rounded-2xl border border-slate-700 bg-slate-800/80 p-6 shadow-lg">
          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div className="space-y-3">
              <h2 className="text-xl font-semibold">Home overview</h2>
              {user ? (
                <div className="space-y-2 text-sm text-slate-200">
                  <p>
                    Hello, <span className="font-semibold text-emerald-200">{user.displayName || user.email}</span>!
                  </p>
                  <p>
                    Account type: <span className="font-semibold">{user.category ?? 'Not set'}</span>
                  </p>
                  <p className="text-slate-300">
                    Time tracking stays in the desktop app. Use the buttons here to jump into your reports or access account details.
                  </p>
                  {user.category === 'Client' && user.projects.length > 0 && (
                    <div className="space-y-1">
                      <p className="font-medium text-slate-200">Projects</p>
                      <ul className="flex flex-wrap gap-2 text-xs text-slate-300">
                        {user.projects.map((project) => (
                          <li key={project} className="rounded-full border border-slate-600 px-3 py-1">
                            {project}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-sm text-slate-300">
                  Log in to see your personalised greeting and quick links. Need to track time? Launch the Supatimetracker desktop app.
                </p>
              )}
            </div>

            <div className="flex flex-col gap-2 md:items-end">
              <Link
                href={reportsHref}
                className={`inline-flex items-center justify-center rounded-lg px-4 py-2 text-sm font-semibold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-200 ${
                  user
                    ? 'bg-emerald-500 text-slate-900 hover:bg-emerald-400'
                    : 'cursor-not-allowed bg-slate-700 text-slate-400'
                }`}
                aria-disabled={!user}
              >
                View reports
              </Link>
              {user && (
                <button
                  type="button"
                  onClick={handleLogout}
                  className="inline-flex items-center justify-center rounded-lg border border-slate-500 px-4 py-2 text-sm font-semibold text-slate-200 transition hover:bg-slate-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-400"
                >
                  Log out of website
                </button>
              )}
            </div>
          </div>
          <p className="mt-6 text-xs uppercase tracking-wide text-slate-400">
            No clock-in option is available on the website—open the desktop app to record time.
          </p>
        </section>
      </main>
    </div>
  );
}

type RawUserPayload = Partial<AuthenticatedUser> & {
  display_name?: string | null;
  projects?: string[] | null;
};

function normalizeUser(raw: RawUserPayload | null | undefined): AuthenticatedUser {
  if (!raw) {
    throw new Error('User payload missing');
  }

  const email = (raw.email ?? '').toLowerCase();
  const displayName = raw.displayName ?? raw.display_name ?? null;
  const category = normalizeCategory(raw.category);

  const projects = Array.isArray(raw.projects)
    ? Array.from(
        new Set(raw.projects.filter((project): project is string => typeof project === 'string' && project.trim().length > 0).map((project) => project.trim())),
      )
    : [];

  return {
    email,
    displayName,
    category,
    createdAt: raw.createdAt,
    projects,
  };
}

function normalizeCategory(category: Category | string | null | undefined): Category {
  if (category === 'Client' || category === 'Freelancer') {
    return category;
  }
  return null;
}
