'use client';

// Note: This component has been renamed to EmployeeSelector
// The file name is kept as FreelancerSelector.tsx for now to avoid breaking imports
// but all internal references use "Employee" terminology

import { useState, useEffect, useTransition } from 'react';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';

type Employee = {
  email: string;
  display_name: string | null;
};

type EmployeeSelectorProps = {
  managerEmail: string;
  currentEmployeeEmail?: string;
  redirectBasePath?: string;
  autoSelectFirst?: boolean;
};

export default function EmployeeSelector({
  managerEmail,
  currentEmployeeEmail,
  redirectBasePath,
  autoSelectFirst = true,
}: EmployeeSelectorProps) {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedEmail, setSelectedEmail] = useState<string>('');
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    fetchEmployees();
  }, [managerEmail]);

  useEffect(() => {
    const emailFromParams = searchParams?.get('employee');
    if (emailFromParams) {
      setSelectedEmail(emailFromParams);
    } else if (currentEmployeeEmail) {
      setSelectedEmail(currentEmployeeEmail);
    } else {
      setSelectedEmail('');
    }
  }, [currentEmployeeEmail, searchParams]);

  async function fetchEmployees() {
    try {
      setLoading(true);
      const response = await fetch(
        `/api/employees?managerEmail=${encodeURIComponent(managerEmail)}`
      );
      
      if (!response.ok) {
        // Try to get error message from response
        let errorMessage = 'Failed to fetch employees';
        try {
          const errorData = await response.json();
          errorMessage = errorData.error || errorMessage;
        } catch {
          // If response is not JSON, use default message
        }
        console.error('Error fetching employees:', errorMessage, response.status);
        // Set empty array on error instead of throwing
        setEmployees([]);
        return;
      }
      
      const data = await response.json();
      
      // Ensure data is an array
      const employeesList = Array.isArray(data) ? data : [];

      // Sort employees alphabetically by display name (fallback to email)
      employeesList.sort((a: Employee, b: Employee) => {
        const nameA = (a.display_name || a.email || '').toLowerCase();
        const nameB = (b.display_name || b.email || '').toLowerCase();
        if (nameA < nameB) return -1;
        if (nameA > nameB) return 1;
        return 0;
      });

      setEmployees(employeesList);
      
      const currentFromParams = searchParams?.get('employee') ?? '';

      if (!currentFromParams) {
        if (autoSelectFirst && employeesList.length > 0) {
          const nextEmail = employeesList[0].email;
          setSelectedEmail(nextEmail);
          updateRoute(nextEmail, { replace: true });
        } else {
          setSelectedEmail('');
        }
      }
    } catch (error) {
      console.error('Error fetching employees:', error);
      // Set empty array on error to prevent UI breakage
      setEmployees([]);
    } finally {
      setLoading(false);
    }
  }

  function handleEmployeeChange(event: React.ChangeEvent<HTMLSelectElement>) {
    const newEmail = event.target.value;
    setSelectedEmail(newEmail);

    if (!newEmail) {
      startTransition(() => {
        const params = new URLSearchParams(searchParams?.toString() ?? '');
        params.delete('employee');
        const basePath = redirectBasePath ?? pathname;
        const url = params.toString() ? `${basePath}?${params.toString()}` : basePath;
        router.push(url);
      });
      return;
    }

    updateRoute(newEmail);
  }

  function updateRoute(email: string, options?: { replace?: boolean }) {
    startTransition(() => {
      const params = new URLSearchParams(searchParams?.toString() ?? '');
      params.set('employee', email);
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
        Loading employees...
      </div>
    );
  }

  if (employees.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-card p-4 text-sm text-muted-foreground">
        No employees assigned to you.
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:gap-4">
        <label htmlFor="employee-select" className="text-sm font-medium text-foreground">
          Select Employee:
        </label>
        <select
          id="employee-select"
          value={selectedEmail}
          onChange={handleEmployeeChange}
          className="min-w-[250px] rounded-lg border border-border bg-white px-4 py-2 text-sm text-foreground shadow-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
          disabled={isPending}
        >
          <option value="">Select an employee</option>
          {employees.map((employee) => (
            <option key={employee.email} value={employee.email}>
              {employee.display_name || employee.email}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}

