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
};

export default function WeeklyActivityChart({ labels, activeHours, idleHours }: WeeklyActivityChartProps) {
  const datasets = [
    {
      label: 'Active hours',
      data: activeHours,
      backgroundColor: 'rgba(16, 185, 129, 0.8)',
      borderRadius: 6,
    },
  ];

  // Only add idle hours dataset if there are idle hours
  if (idleHours && idleHours.length > 0 && idleHours.some(h => h > 0)) {
    datasets.push({
      label: 'Idle hours',
      data: idleHours,
      backgroundColor: 'rgba(239, 68, 68, 0.8)',
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
            return `${ctx.dataset.label}: ${value.toFixed(2)} h`;
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

