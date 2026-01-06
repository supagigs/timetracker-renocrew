'use client';

import Link from "next/link";
import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";

import { DashboardShell } from "@/components/dashboard";
import { WEB_USER_STORAGE_KEY } from "@/lib/constants";

type StoredUser = {
  email: string;
  displayName: string | null;
  role: "Manager" | "Employee" | null;
  projects?: string[];
};

export default function PostLoginPage() {
  const searchParams = useSearchParams();
  const [storedUser, setStoredUser] = useState<StoredUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(WEB_USER_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as StoredUser | null;
        if (parsed?.email) {
          setStoredUser(parsed);
        }
      }
    } catch (error) {
      console.warn("[post-login] Unable to read stored user:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  const emailParam = searchParams.get("email");
  const effectiveEmail = storedUser?.email ?? emailParam ?? null;
  const displayName = storedUser?.displayName || storedUser?.email || effectiveEmail;

  return (
    <DashboardShell
      userName={displayName ?? null}
      userEmail={effectiveEmail}
      userRole={storedUser?.role ?? null}
      showBreadcrumb={false}
      showAccountControls={Boolean(storedUser)}
    >
      <section className="mx-auto max-w-3xl space-y-6 rounded-2xl border border-border bg-card p-8 text-center shadow-sm">
        <h1 className="text-3xl font-bold text-foreground">Welcome back</h1>
        <p className="text-sm text-muted-foreground">
          {storedUser
            ? 'You are signed in. Continue to your reports below.'
            : loading
              ? 'Checking your account details…'
              : 'We could not find an active session. Please return to the login page and sign in again.'}
        </p>

        {storedUser && effectiveEmail ? (
          <div className="mt-6">
            <Link
              href={`/reports/${encodeURIComponent(effectiveEmail)}`}
              className="inline-flex items-center justify-center rounded-lg bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
            >
              View reports
            </Link>
          </div>
        ) : null}

      </section>
    </DashboardShell>
  );
}
