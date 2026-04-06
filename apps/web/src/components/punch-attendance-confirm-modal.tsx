'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useModalKeyboard } from '@/hooks/use-modal-keyboard';

export type PunchAttendanceConfirmVariant = 'on' | 'off';

type PunchAttendanceConfirmModalProps = {
  open: boolean;
  variant: PunchAttendanceConfirmVariant;
  /** If omitted, time is captured once when the dialog opens */
  timeLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
};

export function PunchAttendanceConfirmModal({
  open,
  variant,
  timeLabel: timeLabelProp,
  onConfirm,
  onCancel,
}: PunchAttendanceConfirmModalProps) {
  const [capturedTime, setCapturedTime] = useState('');

  useEffect(() => {
    if (open && timeLabelProp === undefined) {
      setCapturedTime(
        new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      );
    }
  }, [open, timeLabelProp]);

  const timeLabel =
    timeLabelProp ??
    (capturedTime ||
      new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));

  const isOn = variant === 'on';
  const actionLabel = isOn ? 'Punch ON' : 'Punch OFF';

  useModalKeyboard({
    open,
    onCancel,
    onConfirm,
    submitWhenTyping: 'never',
  });

  if (!open || typeof document === 'undefined') return null;

  return createPortal(
    <div className="modal-overlay" onClick={onCancel}>
      <div
        className="modal punch-confirm-modal"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="punch-confirm-title"
      >
        <h3
          id="punch-confirm-title"
          style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}
        >
          <span style={{ fontSize: '1.5rem' }}>{isOn ? '▶️' : '⏹️'}</span>
          {actionLabel} Confirmation
        </h3>

        <div
          style={{
            padding: '1rem',
            background: 'var(--surface)',
            borderRadius: 'var(--radius)',
            marginBottom: '1rem',
            textAlign: 'center',
          }}
        >
          <div
            style={{
              fontSize: '2rem',
              fontWeight: 700,
              color: 'var(--ink)',
              fontFamily: 'monospace',
              marginBottom: '0.25rem',
            }}
          >
            {timeLabel}
          </div>
          <p style={{ fontSize: '0.8125rem', color: 'var(--muted)', margin: 0 }}>
            Actual recorded time
          </p>
        </div>

        <p style={{ fontSize: '0.875rem', color: 'var(--ink-2)', marginBottom: '1.5rem' }}>
          Do you want to continue?
        </p>

        <div className="modal-footer" style={{ marginTop: 0, paddingTop: 0, borderTop: 'none' }}>
          <button
            type="button"
            className="button button-ghost"
            onClick={onCancel}
            style={{ minWidth: '100px' }}
          >
            Cancel
          </button>
          <button
            type="button"
            className={`button ${isOn ? 'button-ok' : 'button-danger'}`}
            onClick={onConfirm}
            style={{ minWidth: '100px', fontWeight: 600 }}
          >
            Confirm
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
