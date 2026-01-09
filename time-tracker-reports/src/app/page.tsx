'use client';

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";

import { DashboardShell } from "@/components/dashboard";
import { WEB_USER_STORAGE_KEY } from "@/lib/constants";
import { determineRoleFromRoleProfile } from "@/lib/frappeClient";

type Role = "Manager" | "Employee" | null;

type AuthenticatedUser = {
  email: string;
  displayName: string | null;
  role: Role;
  createdAt?: string;
  projects: string[];
};

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const NEW_USER_MESSAGE = "Please sign up first from the desktop time tracker app.";

export default function Home() {
  const [user, setUser] = useState<AuthenticatedUser | null>(null);
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [loginError, setLoginError] = useState("");
  const [loginPending, setLoginPending] = useState(false);
  const [loginSuccess, setLoginSuccess] = useState("");

  const router = useRouter();

  const updateWebSession = useCallback(
    async (email: string, loggedIn: boolean) => {
      // No-op: user_sessions table is no longer used
      // Session state updates are no longer tracked
    },
    [],
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
    // normalized.role is already converted to "Manager" or "Employee" by normalizeRole
    // normalizeRole now uses determineRoleFromRoleProfile internally to convert role_profile_name

    const restoreSession = () => {
      setUser({ ...normalized, projects: normalized.projects ?? [] });
      setLoginEmail(normalized.email);
      void updateWebSession(normalized.email, true);
    };

    restoreSession();
  }, [updateWebSession]);

  const loginButtonDisabled = useMemo(
    () => loginPending || !EMAIL_REGEX.test(loginEmail) || !loginPassword.trim(),
    [loginPending, loginEmail, loginPassword],
  );

  const handleLogin = async (event: FormEvent) => {
    event.preventDefault();
    setLoginError("");
    setLoginSuccess("");

    if (!EMAIL_REGEX.test(loginEmail)) {
      setLoginError("Enter a valid email address before logging in.");
      return;
    }

    if (!loginPassword.trim()) {
      setLoginError("Password is required.");
      return;
    }

    setLoginPending(true);
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: loginEmail, password: loginPassword }),
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
        // for redirecting and fetching email for login from storage
        // const searchParams = useSearchParams();
        // const emailFromQuery = searchParams.get("email");

        // useEffect(() => {
        //   if (emailFromQuery) {
        //     setLoginEmail(emailFromQuery);
        //   }
        // }, [emailFromQuery]);

  };

  return (
    <DashboardShell
      userName={user?.displayName || user?.email || null}
      userEmail={user?.email || null}
      userRole={user?.role || null}
      showBreadcrumb={false}
      showAccountControls={false}
      showSidebar={false}
    >
      <section className="rounded-2xl border border-border bg-card p-8 text-center shadow-sm">
        <div className="flex flex-col items-center gap-4">
          <Image
            src="/android-chrome-512x512.png"
            alt="Renocrew Solutions logo"
            width={96}
            height={96}
            priority
            unoptimized
            className="h-24 w-24 rounded-2xl border border-border bg-secondary object-contain"
          />
          <p className="text-sm font-semibold uppercase tracking-wide text-primary">Renocrew Time Tracker</p>
          <h1 className="text-3xl font-bold sm:text-4xl">Welcome to your dashboard</h1>
          <p className="max-w-2xl text-sm text-muted-foreground">
            Log into the desktop Time Tracker application to record time. Use this website to review your account after you
            log in below.
          </p>
        </div>

        <div className="mt-8 flex justify-center">
          <form className="w-full max-w-xl space-y-4 rounded-xl border border-border bg-card p-6 text-left shadow-sm" onSubmit={handleLogin} suppressHydrationWarning>
            <label className="block">
              <span className="text-sm font-medium text-foreground">Email address</span>
              <input
                type="email"
                value={loginEmail}
                onChange={(event) => setLoginEmail(event.target.value.trim().toLowerCase())}
                className="mt-1 w-full rounded-lg border border-border bg-white px-3 py-2 text-base text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/40"
                placeholder="you@example.com"
                autoComplete="email"
                suppressHydrationWarning
              />
            </label>

            <label className="block">
              <span className="text-sm font-medium text-foreground">Password</span>
              <input
                type="password"
                value={loginPassword}
                onChange={(event) => setLoginPassword(event.target.value)}
                className="mt-1 w-full rounded-lg border border-border bg-white px-3 py-2 text-base text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/40"
                placeholder="Enter your password"
                autoComplete="current-password"
                suppressHydrationWarning
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
  const role = normalizeRole(raw.role);

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
    role,
    createdAt: raw.createdAt,
    projects,
  };
};

type RawUserPayload = Partial<AuthenticatedUser> & {
  display_name?: string | null;
  projects?: string[] | null;
};

const normalizeRole = (role: Role | string | null | undefined): Role => {
  if (!role) {
    return null;
  }

  const roleString = role.toString().trim();

  // If it's already "Manager" or "Employee", return it as is
  const normalized = roleString.toLowerCase();
  if (normalized === "manager") {
    return "Manager";
  }
  if (normalized === "employee") {
    return "Employee";
  }

  // Otherwise, treat it as a role_profile_name from Frappe (e.g., "SuperAdmin", "MainAdmin", etc.)
  // and convert it to Manager/Employee using determineRoleFromRoleProfile
  return determineRoleFromRoleProfile(roleString);
};
