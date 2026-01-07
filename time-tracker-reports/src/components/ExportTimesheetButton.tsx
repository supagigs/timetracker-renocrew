'use client';

import React from 'react';
import * as XLSX from 'xlsx';
import { Download } from 'lucide-react';
import { format } from 'date-fns';

type TimesheetRow = {
  id: number;
  employeeEmail: string;
  employeeName: string | null;
  projectName: string | null;
  sessionDate: string;
  startTime: string | null;
  endTime: string | null;
  activeSeconds: number;
  breakSeconds: number;
  idleSeconds: number;
  totalSeconds: number;
};

type ExportTimesheetButtonProps = {
  timesheetData: TimesheetRow[];
  employeeEmail: string | null;
  employeeName: string | null;
  dateRange: { start: string; end: string };
  disabled?: boolean;
};

function formatSecondsToHoursMinutes(totalSeconds: number): string {
  const totalMinutes = Math.round(totalSeconds / 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (hours === 0 && minutes === 0) {
    return '0h 0m';
  }
  if (hours === 0) {
    return `${minutes}m`;
  }
  if (minutes === 0) {
    return `${hours}h`;
  }
  return `${hours}h ${minutes}m`;
}

function formatDateTime(dateString: string | null): string {
  if (!dateString) return '—';
  try {
    return format(new Date(dateString), 'MM/dd/yyyy hh:mm a');
  } catch {
    return dateString;
  }
}

export function ExportTimesheetButton({
  timesheetData,
  employeeEmail,
  employeeName,
  dateRange,
  disabled = false,
}: ExportTimesheetButtonProps) {
  const downloadExcel = () => {
    if (!Array.isArray(timesheetData) || timesheetData.length === 0) {
      console.error('Timesheet data must be a non-empty array.');
      return;
    }

    // Prepare data for export
    const exportData = timesheetData.map((row) => ({
      Date: format(new Date(row.sessionDate), 'MM/dd/yyyy'),
      Employee: row.employeeName || row.employeeEmail,
      'Employee Email': row.employeeEmail,
      Project: row.projectName || '—',
      'Active Time': formatSecondsToHoursMinutes(row.activeSeconds),
      'Break Time': formatSecondsToHoursMinutes(row.breakSeconds),
      'Idle Time': formatSecondsToHoursMinutes(row.idleSeconds),
      'Total Time': formatSecondsToHoursMinutes(row.totalSeconds),
      'Clock In': formatDateTime(row.startTime),
      'Clock Out': formatDateTime(row.endTime),
    }));

    // Create a worksheet from the data
    const worksheet = XLSX.utils.json_to_sheet(exportData);

    // Set column widths for better readability
    const columnWidths = [
      { wch: 12 }, // Date
      { wch: 25 }, // Employee
      { wch: 30 }, // Employee Email
      { wch: 20 }, // Project
      { wch: 12 }, // Active Time
      { wch: 12 }, // Break Time
      { wch: 12 }, // Idle Time
      { wch: 12 }, // Total Time
      { wch: 20 }, // Clock In
      { wch: 20 }, // Clock Out
    ];
    worksheet['!cols'] = columnWidths;

    // Create a new workbook and append the worksheet
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Timesheet');

    // Generate filename
    const employeeNameForFile = employeeName || employeeEmail || 'Employee';
    const startDate = format(new Date(dateRange.start), 'yyyy-MM-dd');
    const endDate = format(new Date(dateRange.end), 'yyyy-MM-dd');
    const fileName = `Timesheet_${employeeNameForFile.replace(/[^a-zA-Z0-9]/g, '_')}_${startDate}_to_${endDate}.xlsx`;

    // Write the file
    XLSX.writeFile(workbook, fileName);
  };

  return (
    <button
      onClick={downloadExcel}
      disabled={disabled || timesheetData.length === 0}
      className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-sm transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-primary"
      title={disabled || timesheetData.length === 0 ? 'Select an employee to export timesheet' : 'Export timesheet to Excel'}
    >
      <Download size={16} />
      Export to Excel
    </button>
  );
}

