'use client';

import {
  Chart as ChartJS,
  ArcElement,
  Tooltip,
  Legend,
  ChartOptions,
} from 'chart.js';
import { Pie } from 'react-chartjs-2';

ChartJS.register(ArcElement, Tooltip, Legend);

type ProjectPieChartProps = {
  labels: string[];
  totalHours: number[];
};

/**
 * Convert hours to hh:mm:ss format (whole seconds only, no decimals)
 */
function formatHoursToHHMMSS(hours: number): string {
  if (hours === 0) {
    return '00:00:00';
  }

  const totalSeconds = Math.round(hours * 3600);
  const h = Math.floor(totalSeconds / 3600);
  const remainingAfterHours = totalSeconds % 3600;
  const m = Math.floor(remainingAfterHours / 60);
  const s = remainingAfterHours % 60;

  const hoursStr = h.toString().padStart(2, '0');
  const minutesStr = m.toString().padStart(2, '0');
  const secondsStr = s.toString().padStart(2, '0');

  return `${hoursStr}:${minutesStr}:${secondsStr}`;
}

export default function ProjectPieChart({ labels, totalHours }: ProjectPieChartProps) {
  // Generate distinct colors for each project
  const colors = [
    'rgba(16, 185, 129, 0.8)',   // emerald-500
    'rgba(59, 130, 246, 0.8)',   // blue-500
    'rgba(139, 92, 246, 0.8)',   // violet-500
    'rgba(236, 72, 153, 0.8)',   // pink-500
    'rgba(251, 146, 60, 0.8)',   // orange-400
    'rgba(34, 197, 94, 0.8)',    // green-500
    'rgba(168, 85, 247, 0.8)',   // purple-500
    'rgba(239, 68, 68, 0.8)',    // red-500
    'rgba(245, 158, 11, 0.8)',   // amber-500
    'rgba(20, 184, 166, 0.8)',   // teal-500
  ];

  const data = {
    labels,
    datasets: [
      {
        label: 'Total time',
        data: totalHours,
        backgroundColor: labels.map((_, index) => colors[index % colors.length]),
        borderColor: labels.map((_, index) => {
          const baseColor = colors[index % colors.length];
          // Make border slightly darker by removing alpha and darkening
          return baseColor.replace('0.8', '1').replace('rgba', 'rgb');
        }),
        borderWidth: 2,
      },
    ],
  };

  const options: ChartOptions<'pie'> = {
    responsive: true,
    maintainAspectRatio: true,
    plugins: {
      legend: {
        position: 'right',
        labels: {
          color: '#cbd5f5',
          padding: 15,
          font: {
            size: 12,
          },
          generateLabels: (chart) => {
            const data = chart.data;
            if (data.labels?.length && data.datasets?.length && data.datasets[0]) {
              const dataset = data.datasets[0];
              const total = (dataset.data as number[]).reduce((a, b) => a + b, 0);
              return data.labels.map((label, index) => {
                const value = typeof dataset.data[index] === 'number' ? dataset.data[index] as number : 0;
                const formattedTime = formatHoursToHHMMSS(value);
                const backgroundColor = Array.isArray(dataset.backgroundColor) 
                  ? dataset.backgroundColor[index] 
                  : typeof dataset.backgroundColor === 'string'
                    ? dataset.backgroundColor
                    : '#000';
                return {
                  text: `${label}: ${formattedTime}`,
                  fillStyle: backgroundColor as string,
                  strokeStyle: backgroundColor as string,
                  hidden: false,
                  index,
                  datasetIndex: 0,
                } as any;
              });
            }
            return [];
          },
        },
      },
      tooltip: {
        callbacks: {
          label: (ctx) => {
            const label = ctx.label || '';
            const value = typeof ctx.parsed === 'number' ? ctx.parsed : 0;
            const formattedTime = formatHoursToHHMMSS(value);
            const total = (ctx.dataset.data as number[]).reduce((a, b) => a + (typeof b === 'number' ? b : 0), 0);
            const percentage = total > 0 ? ((value / total) * 100).toFixed(1) : '0';
            return `${label}: ${formattedTime} (${percentage}%)`;
          },
        },
      },
    },
  };

  return <Pie data={data} options={options} />;
}

