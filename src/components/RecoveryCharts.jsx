import { useEffect, useRef } from 'react';
import {
  Chart,
  LineController,
  LineElement,
  PointElement,
  LinearScale,
  CategoryScale,
  BarController,
  BarElement,
  Tooltip,
  Filler,
  Legend,
} from 'chart.js';
import {
  getBreathSeries,
  getChartStreakSeries,
  getMoodSeries,
  getTomatoSeries,
  getWushuBars,
  loadRecords,
} from '../utils/recoveryStorage.js';

Chart.register(
  LineController,
  LineElement,
  PointElement,
  LinearScale,
  CategoryScale,
  BarController,
  BarElement,
  Tooltip,
  Filler,
  Legend
);

const CHART_COLORS = {
  grid: 'rgba(255, 248, 231, 0.06)',
  text: 'rgba(255, 248, 231, 0.45)',
  line: 'rgba(139, 92, 246, 0.75)',
  fill: 'rgba(139, 92, 246, 0.08)',
  mood: 'rgba(120, 160, 140, 0.8)',
  bar: 'rgba(139, 92, 246, 0.55)',
  reset: 'rgba(180, 90, 90, 0.9)',
};

const baseOptions = {
  responsive: true,
  maintainAspectRatio: false,
  animation: { duration: 480, easing: 'easeOutQuart' },
  plugins: {
    legend: { display: false },
    tooltip: {
      backgroundColor: 'rgba(10, 10, 15, 0.92)',
      borderColor: 'rgba(255, 248, 231, 0.12)',
      borderWidth: 1,
      titleColor: 'rgba(255, 248, 231, 0.7)',
      bodyColor: 'rgba(255, 248, 231, 0.9)',
      padding: 10,
      cornerRadius: 8,
    },
  },
  scales: {
    x: {
      grid: { color: CHART_COLORS.grid },
      ticks: { color: CHART_COLORS.text, maxTicksLimit: 8, font: { size: 10 } },
    },
    y: {
      grid: { color: CHART_COLORS.grid },
      ticks: { color: CHART_COLORS.text, font: { size: 10 } },
      beginAtZero: true,
    },
  },
};

function useChart(canvasRef, buildConfig, deps) {
  const chartRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;

    if (chartRef.current) {
      chartRef.current.destroy();
      chartRef.current = null;
    }

    const records = loadRecords();
    const config = buildConfig(records);
    chartRef.current = new Chart(canvas, config);

    return () => {
      chartRef.current?.destroy();
      chartRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return chartRef;
}

export function StreakChart({ refreshKey }) {
  const ref = useRef(null);
  useChart(
    ref,
    (records) => {
      const { labels, streakLine, resetPoints } = getChartStreakSeries(records, 60);
      const pointRadius = streakLine.map((_, i) =>
        resetPoints.some((p) => p.index === i) ? 6 : 0
      );
      const pointBg = streakLine.map((_, i) =>
        resetPoints.some((p) => p.index === i) ? CHART_COLORS.reset : CHART_COLORS.line
      );

      return {
        type: 'line',
        data: {
          labels,
          datasets: [
            {
              label: '连续天数',
              data: streakLine,
              borderColor: CHART_COLORS.line,
              backgroundColor: CHART_COLORS.fill,
              fill: true,
              tension: 0.35,
              pointRadius,
              pointBackgroundColor: pointBg,
              pointHoverRadius: 5,
            },
          ],
        },
        options: {
          ...baseOptions,
          plugins: {
            ...baseOptions.plugins,
            tooltip: {
              ...baseOptions.plugins.tooltip,
              callbacks: {
                afterLabel(ctx) {
                  const rp = resetPoints.find((p) => p.index === ctx.dataIndex);
                  if (rp) return `中断：${rp.reason}`;
                  return '';
                },
              },
            },
          },
        },
      };
    },
    [refreshKey]
  );

  return (
    <div className="h-[220px] w-full sm:h-[240px]">
      <canvas ref={ref} />
    </div>
  );
}

export function MoodChart({ refreshKey }) {
  const ref = useRef(null);
  useChart(
    ref,
    (records) => {
      const { labels, data } = getMoodSeries(records, 30);
      return {
        type: 'line',
        data: {
          labels,
          datasets: [
            {
              label: '情绪',
              data,
              borderColor: CHART_COLORS.mood,
              backgroundColor: 'rgba(120, 160, 140, 0.1)',
              fill: true,
              tension: 0.35,
              spanGaps: false,
              pointRadius: 2,
              pointHoverRadius: 5,
            },
          ],
        },
        options: {
          ...baseOptions,
          scales: {
            ...baseOptions.scales,
            y: { ...baseOptions.scales.y, min: 1, max: 5, ticks: { stepSize: 1, color: CHART_COLORS.text } },
          },
        },
      };
    },
    [refreshKey]
  );

  return (
    <div className="h-[220px] w-full sm:h-[240px]">
      <canvas ref={ref} />
    </div>
  );
}

export function WushuChart({ refreshKey, mode }) {
  const ref = useRef(null);
  useChart(
    ref,
    (records) => {
      const { labels, data } = getWushuBars(records, mode);
      return {
        type: 'bar',
        data: {
          labels,
          datasets: [
            {
              label: '习武（分钟）',
              data,
              backgroundColor: CHART_COLORS.bar,
              borderRadius: 4,
              borderSkipped: false,
            },
          ],
        },
        options: baseOptions,
      };
    },
    [refreshKey, mode]
  );

  return (
    <div className="h-[220px] w-full sm:h-[240px]">
      <canvas ref={ref} />
    </div>
  );
}

export function TomatoChart({ refreshKey }) {
  const ref = useRef(null);
  useChart(
    ref,
    (records) => {
      const { labels, data } = getTomatoSeries(records, 30);
      return {
        type: 'line',
        data: {
          labels,
          datasets: [
            {
              label: '有效番茄',
              data,
              borderColor: 'rgba(126, 184, 212, 0.85)',
              backgroundColor: 'rgba(126, 184, 212, 0.12)',
              fill: true,
              tension: 0.3,
              pointRadius: 2,
            },
          ],
        },
        options: baseOptions,
      };
    },
    [refreshKey]
  );
  return (
    <div className="h-[200px] w-full">
      <canvas ref={ref} />
    </div>
  );
}

export function BreathChart({ refreshKey }) {
  const ref = useRef(null);
  useChart(
    ref,
    (records) => {
      const { labels, data } = getBreathSeries(records, 30);
      return {
        type: 'line',
        data: {
          labels,
          datasets: [
            {
              label: '呼吸轮次',
              data,
              borderColor: 'rgba(160, 200, 170, 0.85)',
              backgroundColor: 'rgba(160, 200, 170, 0.1)',
              fill: true,
              tension: 0.3,
              pointRadius: 2,
            },
          ],
        },
        options: baseOptions,
      };
    },
    [refreshKey]
  );
  return (
    <div className="h-[200px] w-full">
      <canvas ref={ref} />
    </div>
  );
}
