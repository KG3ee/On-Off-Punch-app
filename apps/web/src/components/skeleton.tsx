'use client';

import { useMemo } from 'react';
import { SplitColumnStack } from '@/components/layout/split-column-stack';

export function SkeletonCard({ className = '' }: { className?: string }) {
  return (
    <div className={`card skeleton ${className}`}>
      <div className="skeleton skeleton-title" style={{ marginBottom: '0.75rem' }} />
      <div className="skeleton skeleton-text" style={{ marginBottom: '0.5rem' }} />
      <div className="skeleton skeleton-text" style={{ width: '80%' }} />
    </div>
  );
}

export function SkeletonKPI({ className = '' }: { className?: string }) {
  return (
    <div className={`kpi skeleton ${className}`}>
      <div className="skeleton skeleton-text" style={{ width: '40%', marginBottom: '0.5rem' }} />
      <div className="skeleton skeleton-title" style={{ width: '60%' }} />
    </div>
  );
}

export function SkeletonTableRow({ cols = 5 }: { cols?: number }) {
  return (
    <tr>
      {Array.from({ length: cols }).map((_, i) => (
        <td key={i}>
          <div className="skeleton skeleton-text" />
        </td>
      ))}
    </tr>
  );
}

export function SkeletonTable({ rows = 4, cols = 5 }: { rows?: number; cols?: number }) {
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            {Array.from({ length: cols }).map((_, i) => (
              <th key={i}>
                <div className="skeleton skeleton-text" style={{ width: '80px' }} />
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: rows }).map((_, i) => (
            <SkeletonTableRow key={i} cols={cols} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function DashboardSkeleton({
  kpiCount = 4,
  showBreaks = true,
  showSession = true,
}: {
  kpiCount?: number;
  showBreaks?: boolean;
  showSession?: boolean;
}) {
  const kpiCards = useMemo(() => Array.from({ length: kpiCount }), [kpiCount]);

  return (
    <>
      {/* KPI Skeleton Grid */}
      <div className="kpi-grid">
        {kpiCards.map((_, i) => (
          <SkeletonKPI key={i} className={`card-animate-delay-${Math.min(i + 1, 5)}`} />
        ))}
      </div>

      {/* Main Layout Skeleton */}
      <div className="split">
        {/* Left Column */}
        <SplitColumnStack>
          {showBreaks && (
            <SkeletonCard className="card-animate card-animate-delay-2" />
          )}
        </SplitColumnStack>

        {/* Right Column */}
        <SplitColumnStack>
          {showSession && (
            <SkeletonCard className="card-animate card-animate-delay-3" />
          )}
        </SplitColumnStack>
      </div>
    </>
  );
}
