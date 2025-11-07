'use client';

import { useState, useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';

type Freelancer = {
  email: string;
  display_name: string | null;
};

type FreelancerSelectorProps = {
  clientEmail: string;
  currentFreelancerEmail?: string;
};

export default function FreelancerSelector({
  clientEmail,
  currentFreelancerEmail,
}: FreelancerSelectorProps) {
  const [freelancers, setFreelancers] = useState<Freelancer[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedEmail, setSelectedEmail] = useState<string>(
    currentFreelancerEmail || ''
  );
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    fetchFreelancers();
  }, [clientEmail]);

  useEffect(() => {
    // Update selected email when currentFreelancerEmail changes
    if (currentFreelancerEmail) {
      setSelectedEmail(currentFreelancerEmail);
    }
  }, [currentFreelancerEmail]);

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
      
      // If no freelancer is selected and we have freelancers, select the first one
      if (!selectedEmail && data.length > 0) {
        const firstFreelancer = data[0].email;
        setSelectedEmail(firstFreelancer);
        // Navigate to the freelancer's report
        router.push(`/reports/${encodeURIComponent(firstFreelancer)}`);
      }
    } catch (error) {
      console.error('Error fetching freelancers:', error);
    } finally {
      setLoading(false);
    }
  }

  function handleFreelancerChange(event: React.ChangeEvent<HTMLSelectElement>) {
    const newEmail = event.target.value;
    setSelectedEmail(newEmail);
    if (newEmail) {
      // Navigate to the selected freelancer's report
      router.push(`/reports/${encodeURIComponent(newEmail)}`);
    }
  }

  if (loading) {
    return (
      <div className="rounded-lg bg-slate-800 p-4">
        <p className="text-slate-400">Loading freelancers...</p>
      </div>
    );
  }

  if (freelancers.length === 0) {
    return (
      <div className="rounded-lg bg-slate-800 p-4">
        <p className="text-slate-400">No freelancers assigned to you.</p>
      </div>
    );
  }

  return (
    <div className="rounded-lg bg-slate-800 p-4">
      <div className="flex items-center gap-4">
        <label htmlFor="freelancer-select" className="text-sm font-medium text-slate-300">
          Select Freelancer:
        </label>
        <select
          id="freelancer-select"
          value={selectedEmail}
          onChange={handleFreelancerChange}
          className="rounded-lg bg-slate-700 px-4 py-2 text-white focus:outline-none focus:ring-2 focus:ring-slate-500 min-w-[250px]"
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

