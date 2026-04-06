'use client';

import { useEffect } from 'react';
import {
  shouldBlockEnterConfirm,
  type ModalKeyboardSubmitWhenTyping,
} from '@/lib/is-typing-target';

export type UseModalKeyboardOptions = {
  open: boolean;
  onCancel: () => void;
  onConfirm?: () => void;
  confirmDisabled?: boolean;
  submitWhenTyping?: ModalKeyboardSubmitWhenTyping;
};

/** Enter confirms (optional), Escape cancels; respects focus inside fields per `submitWhenTyping`. */
export function useModalKeyboard(options: UseModalKeyboardOptions): void {
  const {
    open,
    onCancel,
    onConfirm,
    confirmDisabled = false,
    submitWhenTyping = 'never',
  } = options;

  useEffect(() => {
    if (!open) return;

    function handle(e: KeyboardEvent) {
      if (e.altKey || e.ctrlKey || e.metaKey) return;

      if (e.key === 'Escape') {
        e.preventDefault();
        onCancel();
        return;
      }

      if (!onConfirm || e.key !== 'Enter' || e.repeat) return;
      if (confirmDisabled) return;
      if (shouldBlockEnterConfirm(e.target, submitWhenTyping)) return;

      e.preventDefault();
      onConfirm();
    }

    window.addEventListener('keydown', handle);
    return () => window.removeEventListener('keydown', handle);
  }, [open, onCancel, onConfirm, confirmDisabled, submitWhenTyping]);
}
