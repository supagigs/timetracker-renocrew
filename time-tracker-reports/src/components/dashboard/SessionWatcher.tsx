"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

// No-op: user_sessions table is no longer used

type SessionWatcherProps = {
  email?: string | null;
};

export function SessionWatcher({ email }: SessionWatcherProps) {
  const router = useRouter();

  useEffect(() => {
    // No-op: user_sessions table is no longer used
    // Session watching functionality has been disabled
    if (!email) {
      return;
    }

    // Return no-op cleanup function
    return () => {
      // No-op
    };
  }, [email, router]);

  return null;
}


