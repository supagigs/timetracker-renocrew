'use client';

import React from 'react';
import ExcelJS from 'exceljs';
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
  const downloadExcel = async () => {
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

    // Create a new workbook and worksheet
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Timesheet');

    // Define columns with headers
    worksheet.columns = [
      { header: 'Date', key: 'Date', width: 12 },
      { header: 'Employee', key: 'Employee', width: 25 },
      { header: 'Employee Email', key: 'Employee Email', width: 30 },
      { header: 'Project', key: 'Project', width: 20 },
      { header: 'Active Time', key: 'Active Time', width: 12 },
      { header: 'Break Time', key: 'Break Time', width: 12 },
      { header: 'Idle Time', key: 'Idle Time', width: 12 },
      { header: 'Total Time', key: 'Total Time', width: 12 },
      { header: 'Clock In', key: 'Clock In', width: 20 },
      { header: 'Clock Out', key: 'Clock Out', width: 20 },
    ];

    // Style the header row
    worksheet.getRow(1).font = { bold: true };
    worksheet.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFE0E0E0' },
    };

    // Add data rows
    exportData.forEach((row) => {
      worksheet.addRow(row);
    });

    // Generate filename
    const employeeNameForFile = employeeName || employeeEmail || 'Employee';
    const startDate = format(new Date(dateRange.start), 'yyyy-MM-dd');
    const endDate = format(new Date(dateRange.end), 'yyyy-MM-dd');
    const fileName = `Timesheet_${employeeNameForFile.replace(/[^a-zA-Z0-9]/g, '_')}_${startDate}_to_${endDate}.xlsx`;

    // Write the file
    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    link.click();
    window.URL.revokeObjectURL(url);
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

