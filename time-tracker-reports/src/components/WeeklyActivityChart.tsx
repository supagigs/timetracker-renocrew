'use client';

import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Tooltip,
  Legend,
  ChartOptions,
} from 'chart.js';
import { Bar } from 'react-chartjs-2';

ChartJS.register(CategoryScale, LinearScale, BarElement, Tooltip, Legend);

type WeeklyActivityChartProps = {
  labels: string[];
  activeHours: number[];
  idleHours: number[];
  breakHours?: number[];
};

/**
 * Convert hours to hh:mm:ss format (whole seconds only, no decimals)
 * @param hours - Time in hours (e.g., 7.5 = 7 hours 30 minutes, 0.25 = 15 minutes)
 * @returns Formatted string like "07:30:00" or "07:45:39"
 */
function formatHoursToHHMMSSSSSS(hours: number): string {
  if (hours === 0) {
    return '00:00:00';
  }

  // Calculate total seconds from hours and round to whole seconds
  const totalSeconds = Math.round(hours * 3600);
  const h = Math.floor(totalSeconds / 3600);
  const remainingAfterHours = totalSeconds % 3600;
  const m = Math.floor(remainingAfterHours / 60);
  const s = remainingAfterHours % 60; // Whole seconds only

  // Format with leading zeros
  const hoursStr = h.toString().padStart(2, '0');
  const minutesStr = m.toString().padStart(2, '0');
  const secondsStr = s.toString().padStart(2, '0');

  return `${hoursStr}:${minutesStr}:${secondsStr}`;
}

export default function WeeklyActivityChart({ labels, activeHours, idleHours, breakHours = [] }: WeeklyActivityChartProps) {
  const datasets = [
    {
      label: 'Active hours',
      data: activeHours,
      backgroundColor: 'rgba(16, 185, 129, 0.8)', // emerald-500
      borderRadius: 6,
    },
  ];

  // Add break hours dataset if provided
  if (breakHours && breakHours.length > 0 && breakHours.some(h => h > 0)) {
    datasets.push({
      label: 'Break hours',
      data: breakHours,
      backgroundColor: 'rgba(251, 146, 60, 0.8)', // orange-400
      borderRadius: 6,
    });
  }

  // Only add idle hours dataset if there are idle hours
  if (idleHours && idleHours.length > 0 && idleHours.some(h => h > 0)) {
    datasets.push({
      label: 'Idle hours',
      data: idleHours,
      backgroundColor: 'rgba(239, 68, 68, 0.8)', // red-500
      borderRadius: 6,
    });
  }

  // Determine if this is a project chart (fewer labels, likely longer names)
  const isProjectChart = labels.length < 15;

  const data = {
    labels,
    datasets,
  };

  const options: ChartOptions<'bar'> = {
    responsive: true,
    plugins: {
      legend: {
        position: 'top',
        labels: {
          color: '#cbd5f5',
        },
      },
      tooltip: {
        callbacks: {
          label: (ctx) => {
            const value = ctx.parsed?.y ?? 0;
            const formattedTime = formatHoursToHHMMSSSSSS(value);
            return `${ctx.dataset.label}: ${formattedTime}`;
          },
          afterBody: (tooltipItems) => {
            // Calculate total time (active + break + idle) for this day
            if (tooltipItems && tooltipItems.length > 0) {
              const firstItem = tooltipItems[0];
              const index = firstItem?.dataIndex ?? -1;
              const chart = firstItem?.chart;
              
              if (index >= 0 && chart && chart.data && chart.data.datasets) {
                // Sum up all values for this index across all datasets
                let total = 0;
                chart.data.datasets.forEach((dataset: any) => {
                  const value = dataset.data?.[index];
                  if (typeof value === 'number') {
                    total += value;
                  }
                });
                
                if (total > 0) {
                  const formattedTotal = formatHoursToHHMMSSSSSS(total);
                  return `Total time: ${formattedTotal}`;
                }
              }
            }
            return '';
          },
        },
      },
    },
    scales: {
      x: {
        ticks: { 
          color: '#94a3b8',
          maxRotation: isProjectChart ? 60 : 45,
          minRotation: isProjectChart ? 60 : 45,
          autoSkip: !isProjectChart, // Don't skip for project charts
          maxTicksLimit: isProjectChart ? undefined : 15, // Show approximately every other day for better readability with 30 days
        },
        grid: { color: 'rgba(148, 163, 184, 0.2)' },
      },
      y: {
        ticks: { color: '#94a3b8' },
        grid: { color: 'rgba(148, 163, 184, 0.2)' },
        beginAtZero: true,
      },
    },
  };

  return <Bar data={data} options={options} />;
}

