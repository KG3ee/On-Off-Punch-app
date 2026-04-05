'use client';

import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import type { PunchOffSummary } from '@/lib/attendance-events';

function formatMinutes(totalMinutes: number): string {
  const safeMinutes = Math.max(0, totalMinutes);
  const hours = Math.floor(safeMinutes / 60);
  const minutes = safeMinutes % 60;

  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }

  return `${minutes}m`;
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function PunchOffSummaryModal({
  summary,
  onClose,
}: {
  summary: PunchOffSummary | null;
  onClose: () => void;
}) {
  useEffect(() => {
    if (!summary) return;

    function handleKeyDown(event: KeyboardEvent): void {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose, summary]);

  if (!summary || typeof document === 'undefined') return null;

  const note =
    summary.autoClosedBreakCount > 0
      ? `${summary.autoClosedBreakCount} break${summary.autoClosedBreakCount === 1 ? '' : 's'} auto-closed on punch off.`
      : null;

  return createPortal(
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal punch-off-summary-modal"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="punch-off-summary-title"
      >
        <div className="punch-off-summary-head">
          <div className="punch-off-summary-badge" aria-hidden="true">
            ✓
          </div>
          <div>
            <p className="punch-off-summary-kicker">Shift Complete</p>
            <h3 id="punch-off-summary-title">Punch off recorded</h3>
            <p className="punch-off-summary-subtitle">
              Off at {formatTime(summary.punchedOffAt)}
            </p>
          </div>
        </div>

        <section className="punch-off-summary-hero">
          <p className="punch-off-summary-hero-label">Worked time</p>
          <div className="punch-off-summary-hero-value">{formatMinutes(summary.workedMinutes)}</div>
          <p className="punch-off-summary-hero-note">
            Shift span {formatMinutes(summary.shiftMinutes)}
          </p>
        </section>

        <section className="punch-off-summary-grid" aria-label="Shift summary metrics">
          <div className="punch-off-summary-stat">
            <span className="punch-off-summary-stat-label">Breaks</span>
            <strong>{formatMinutes(summary.breakMinutes)}</strong>
          </div>
          <div className="punch-off-summary-stat">
            <span className="punch-off-summary-stat-label">Overtime</span>
            <strong>{formatMinutes(summary.overtimeMinutes)}</strong>
          </div>
          <div className="punch-off-summary-stat">
            <span className="punch-off-summary-stat-label">Late</span>
            <strong>{formatMinutes(summary.lateMinutes)}</strong>
          </div>
        </section>

        <section className="punch-off-summary-timeline" aria-label="Shift timeline">
          <div className="punch-off-summary-timeline-item">
            <span className="punch-off-summary-timeline-label">Punch on</span>
            <strong>{formatTime(summary.punchedOnAt)}</strong>
          </div>
          <div className="punch-off-summary-timeline-divider" aria-hidden="true" />
          <div className="punch-off-summary-timeline-item">
            <span className="punch-off-summary-timeline-label">Punch off</span>
            <strong>{formatTime(summary.punchedOffAt)}</strong>
          </div>
        </section>

        {note ? <p className="punch-off-summary-note">{note}</p> : null}

        <div className="modal-footer">
          <button type="button" className="button button-ok" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
