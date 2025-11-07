'use client';

import { useState, useEffect, useTransition } from 'react';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';

type Freelancer = {
  email: string;
  display_name: string | null;
};

type FreelancerSelectorProps = {
  clientEmail: string;
  currentFreelancerEmail?: string;
  redirectBasePath?: string;
  autoSelectFirst?: boolean;
};

export default function FreelancerSelector({
  clientEmail,
  currentFreelancerEmail,
  redirectBasePath,
  autoSelectFirst = true,
}: FreelancerSelectorProps) {
  const [freelancers, setFreelancers] = useState<Freelancer[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedEmail, setSelectedEmail] = useState<string>('');
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    fetchFreelancers();
  }, [clientEmail]);

  useEffect(() => {
    const emailFromParams = searchParams?.get('freelancer');
    if (emailFromParams) {
      setSelectedEmail(emailFromParams);
    } else if (currentFreelancerEmail) {
      setSelectedEmail(currentFreelancerEmail);
    }
  }, [currentFreelancerEmail, searchParams]);

  async function fetchFreelancers() {
    try {
      setLoading(true);
      const response = await fetch(
        `/api/freelancers?clientEmail=${encodeURIComponent(clientEmail)}`
      );
      if (!response.ok) {
        throw new Error('Failed to fetch freelancers');
      }
      const data = await response.json();
      setFreelancers(data);
      
      const currentFromParams = searchParams?.get('freelancer') ?? '';

      if (!currentFromParams && data.length > 0) {
        const nextEmail = data[0].email;
        setSelectedEmail(nextEmail);
        if (autoSelectFirst) {
          updateRoute(nextEmail, { replace: true });
        }
      }
    } catch (error) {
      console.error('Error fetching freelancers:', error);
    } finally {
      setLoading(false);
    }
  }

  function handleFreelancerChange(event: React.ChangeEvent<HTMLSelectElement>) {
    const newEmail = event.target.value;
    if (newEmail) {
      setSelectedEmail(newEmail);
      updateRoute(newEmail);
    }
  }

  function updateRoute(email: string, options?: { replace?: boolean }) {
    startTransition(() => {
      const params = new URLSearchParams(searchParams?.toString() ?? '');
      params.set('freelancer', email);
      const basePath = redirectBasePath ?? pathname;
      const url = `${basePath}?${params.toString()}`;
      if (options?.replace) {
        router.replace(url);
      } else {
        router.push(url);
      }
    });
  }

  if (loading) {
    return (
      <div className="rounded-xl border border-border bg-card p-4 text-sm text-muted-foreground">
        Loading freelancers...
      </div>
    );
  }

  if (freelancers.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-card p-4 text-sm text-muted-foreground">
        No freelancers assigned to you.
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:gap-4">
        <label htmlFor="freelancer-select" className="text-sm font-medium text-foreground">
          Select Freelancer:
        </label>
        <select
          id="freelancer-select"
          value={selectedEmail}
          onChange={handleFreelancerChange}
          className="min-w-[250px] rounded-lg border border-border bg-white px-4 py-2 text-sm text-foreground shadow-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
          disabled={isPending}
        >
          {freelancers.map((freelancer) => (
            <option key={freelancer.email} value={freelancer.email}>
              {freelancer.display_name || freelancer.email}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}

