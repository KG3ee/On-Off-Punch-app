'use client';

import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  Legend,
} from 'recharts';

type AttendanceTrend = {
  date: string;
  workedMinutes: number;
  lateMinutes: number;
  overtimeMinutes: number;
};

type BreakTrend = {
  date: string;
  breakCount: number;
  totalBreakMinutes: number;
};

const COLORS = {
  worked: '#22c55e',
  late: '#ef4444',
  overtime: '#3b82f6',
  breakCount: '#f59e0b',
  breakMinutes: '#8b5cf6',
  grid: 'rgba(255, 255, 255, 0.06)',
  text: '#71717a',
  textLight: '#52525b',
};

function formatMinutes(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function CustomTooltip({ active, payload, label }: any) {
  if (active && payload && payload.length) {
    return (
      <div
        style={{
          background: 'var(--card-elevated)',
          border: '1px solid var(--line-hover)',
          borderRadius: 'var(--radius)',
          padding: '0.75rem',
          boxShadow: 'var(--shadow-lg)',
          backdropFilter: 'blur(12px)',
        }}
      >
        <p style={{ margin: '0 0 0.5rem', fontWeight: 600, fontSize: '0.8125rem', color: 'var(--ink)' }}>
          {formatDate(label)}
        </p>
        {payload.map((entry: any, index: number) => (
          <div key={index} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.75rem', marginBottom: '0.25rem' }}>
            <div
              style={{
                width: '8px',
                height: '8px',
                borderRadius: '50%',
                background: entry.color,
                flexShrink: 0,
              }}
            />
            <span style={{ color: 'var(--ink-2)' }}>{entry.name}:</span>
            <span style={{ color: 'var(--ink)', fontWeight: 600 }}>
              {entry.dataKey === 'workedMinutes' || entry.dataKey === 'totalBreakMinutes'
                ? formatMinutes(entry.value)
                : entry.dataKey === 'lateMinutes' || entry.dataKey === 'overtimeMinutes'
                ? `${entry.value}m`
                : entry.value}
            </span>
          </div>
        ))}
      </div>
    );
  }
  return null;
}

export function AttendanceTrendChart({ data }: { data: AttendanceTrend[] }) {
  if (data.length === 0) return null;

  return (
    <div style={{ width: '100%', height: 280 }}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart
          data={data}
          margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
        >
          <defs>
            <linearGradient id="colorWorked" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={COLORS.worked} stopOpacity={0.3} />
              <stop offset="95%" stopColor={COLORS.worked} stopOpacity={0} />
            </linearGradient>
            <linearGradient id="colorLate" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={COLORS.late} stopOpacity={0.3} />
              <stop offset="95%" stopColor={COLORS.late} stopOpacity={0} />
            </linearGradient>
            <linearGradient id="colorOvertime" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={COLORS.overtime} stopOpacity={0.3} />
              <stop offset="95%" stopColor={COLORS.overtime} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke={COLORS.grid} vertical={false} />
          <XAxis
            dataKey="date"
            stroke={COLORS.text}
            tick={{ fontSize: 11, fill: COLORS.text }}
            tickLine={false}
            axisLine={{ stroke: COLORS.grid }}
            tickFormatter={formatDate}
          />
          <YAxis
            stroke={COLORS.text}
            tick={{ fontSize: 11, fill: COLORS.text }}
            tickLine={false}
            axisLine={{ stroke: COLORS.grid }}
            tickFormatter={(value: number) => `${value}m`}
          />
          <Tooltip content={<CustomTooltip />} />
          <Legend
            wrapperStyle={{ fontSize: '12px', paddingTop: '12px' }}
            formatter={(value: string) => {
              const labels: Record<string, string> = {
                workedMinutes: 'Worked',
                lateMinutes: 'Late',
                overtimeMinutes: 'Overtime',
              };
              return labels[value] || value;
            }}
          />
          <Area
            type="monotone"
            dataKey="workedMinutes"
            name="Worked"
            stroke={COLORS.worked}
            fillOpacity={1}
            fill="url(#colorWorked)"
            strokeWidth={2}
          />
          <Area
            type="monotone"
            dataKey="lateMinutes"
            name="Late"
            stroke={COLORS.late}
            fillOpacity={1}
            fill="url(#colorLate)"
            strokeWidth={2}
          />
          <Area
            type="monotone"
            dataKey="overtimeMinutes"
            name="Overtime"
            stroke={COLORS.overtime}
            fillOpacity={1}
            fill="url(#colorOvertime)"
            strokeWidth={2}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

export function BreakTrendChart({ data }: { data: BreakTrend[] }) {
  if (data.length === 0) return null;

  return (
    <div style={{ width: '100%', height: 240 }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={data}
          margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke={COLORS.grid} vertical={false} />
          <XAxis
            dataKey="date"
            stroke={COLORS.text}
            tick={{ fontSize: 11, fill: COLORS.text }}
            tickLine={false}
            axisLine={{ stroke: COLORS.grid }}
            tickFormatter={formatDate}
          />
          <YAxis
            stroke={COLORS.text}
            tick={{ fontSize: 11, fill: COLORS.text }}
            tickLine={false}
            axisLine={{ stroke: COLORS.grid }}
          />
          <Tooltip content={<CustomTooltip />} />
          <Legend
            wrapperStyle={{ fontSize: '12px', paddingTop: '12px' }}
            formatter={(value: string) => {
              const labels: Record<string, string> = {
                breakCount: 'Breaks',
                totalBreakMinutes: 'Break Time',
              };
              return labels[value] || value;
            }}
          />
          <Bar
            dataKey="breakCount"
            name="Breaks"
            fill={COLORS.breakCount}
            radius={[4, 4, 0, 0]}
          />
          <Bar
            dataKey="totalBreakMinutes"
            name="Break Time"
            fill={COLORS.breakMinutes}
            radius={[4, 4, 0, 0]}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function WeeklyHoursChart({ data }: { data: Array<{ week: string; hours: number }> }) {
  if (data.length === 0) return null;

  return (
    <div style={{ width: '100%', height: 220 }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={data}
          margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke={COLORS.grid} vertical={false} />
          <XAxis
            dataKey="week"
            stroke={COLORS.text}
            tick={{ fontSize: 11, fill: COLORS.text }}
            tickLine={false}
            axisLine={{ stroke: COLORS.grid }}
          />
          <YAxis
            stroke={COLORS.text}
            tick={{ fontSize: 11, fill: COLORS.text }}
            tickLine={false}
            axisLine={{ stroke: COLORS.grid }}
            tickFormatter={(value: number) => `${value}h`}
          />
          <Tooltip
            contentStyle={{
              background: 'var(--card-elevated)',
              border: '1px solid var(--line-hover)',
              borderRadius: 'var(--radius)',
              boxShadow: 'var(--shadow-lg)',
            }}
            labelStyle={{ color: 'var(--ink)', fontWeight: 600, marginBottom: '0.25rem' }}
            itemStyle={{ color: 'var(--ink-2)' }}
            formatter={(value: any) => [`${value}h`, 'Hours']}
          />
          <Bar
            dataKey="hours"
            name="Hours"
            fill="url(#colorWorked)"
            radius={[6, 6, 0, 0]}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
