'use client';

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";

import { DashboardShell } from "@/components/dashboard";
import { createSupabaseBrowserClient } from "@/lib/supabaseBrowser";
import { setUserSessionState } from "@/lib/userSessions";
import { WEB_USER_STORAGE_KEY } from "@/lib/constants";

type Category = "Client" | "Freelancer" | null;

type AuthenticatedUser = {
  email: string;
  displayName: string | null;
  category: Category;
  createdAt?: string;
  projects: string[];
};

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const NEW_USER_MESSAGE = "Please sign up first from the desktop time tracker app.";

export default function Home() {
  const [user, setUser] = useState<AuthenticatedUser | null>(null);
  const [loginEmail, setLoginEmail] = useState("");
  const [loginError, setLoginError] = useState("");
  const [loginPending, setLoginPending] = useState(false);
  const [loginSuccess, setLoginSuccess] = useState("");

  const router = useRouter();
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);

  const updateWebSession = useCallback(
    async (email: string, loggedIn: boolean) => {
      try {
        await setUserSessionState(supabase, email, { web_logged_in: loggedIn });
      } catch (error) {
        console.error("[page] Failed to update web session state:", error);
      }
    },
    [supabase],
  );

  useEffect(() => {
    const raw = typeof window !== "undefined" ? localStorage.getItem(WEB_USER_STORAGE_KEY) : null;
    if (!raw) {
      return;
    }

    let saved: AuthenticatedUser | null = null;
    try {
      saved = JSON.parse(raw) as AuthenticatedUser | null;
    } catch (error) {
      console.warn("[page] Unable to parse saved user data:", error);
    }

    if (!saved?.email) {
      return;
    }

    const normalized = normalizeUser(saved);
    const isClientUser = normalized.category === "Client";

    const restoreSession = () => {
      setUser({ ...normalized, projects: normalized.projects ?? [] });
      setLoginEmail(normalized.email);
      void updateWebSession(normalized.email, true);
    };

    restoreSession();
  }, [supabase, updateWebSession]);

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
        if (response.status === 404) {
          setLoginError(NEW_USER_MESSAGE);
        } else {
          setLoginError(payload.error ?? "Unable to log in right now.");
        }
        return;
      }

      const authenticatedUser = normalizeUser(payload.user);
      setUser(authenticatedUser);
      localStorage.setItem(WEB_USER_STORAGE_KEY, JSON.stringify(authenticatedUser));
      void updateWebSession(authenticatedUser.email, true);
      setLoginSuccess("Login successful. Redirecting…");
      router.push(`/post-login?email=${encodeURIComponent(authenticatedUser.email)}`);
    } catch (error) {
      console.error("[page] Login failed:", error);
      setLoginError("Unexpected error occurred while logging in.");
    } finally {
      setLoginPending(false);
    }
  };

  return (
    <DashboardShell
      userName={user?.displayName || user?.email || null}
      userEmail={user?.email || null}
      userRole={user?.category || null}
      showBreadcrumb={false}
      showAccountControls={false}
      showSidebar={false}
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
            Log into the desktop Time Tracker application to record time. Use this website to review your account after you
            log in below.
          </p>
        </div>

        <div className="mt-8 flex justify-center">
          <form className="w-full max-w-xl space-y-4 rounded-xl border border-border bg-card p-6 text-left shadow-sm" onSubmit={handleLogin}>
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
            ) : (
              <p className="text-xs text-muted-foreground">
                Existing users can log in here. New users should create an account from the desktop Time Tracker app first.
              </p>
            )}

            <button
              type="submit"
              disabled={loginButtonDisabled}
              className="inline-flex w-full items-center justify-center rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground"
            >
              {loginPending ? "Logging in…" : "Log in"}
            </button>
          </form>
        </div>
      </section>
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
  if (!category) {
    return null;
  }

  const normalized = category.toString().trim().toLowerCase();

  if (normalized === "client") {
    return "Client";
  }

  if (normalized === "freelancer") {
    return "Freelancer";
  }

  return null;
};
