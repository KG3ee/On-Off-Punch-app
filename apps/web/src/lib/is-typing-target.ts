/** True when the event target is a control where Enter/Escape should not drive global modal shortcuts. */
export function isTypingTarget(target: EventTarget | null): boolean {
  const element = target as HTMLElement | null;
  if (!element) return false;
  const tag = element.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || element.isContentEditable;
}

export type ModalKeyboardSubmitWhenTyping = 'never' | 'input-only';

/**
 * When `never`, block Enter-to-confirm while focus is in any field-like control.
 * When `input-only`, only block in textarea / contenteditable (matches admin user modals: Enter in input still submits).
 */
export function shouldBlockEnterConfirm(
  target: EventTarget | null,
  mode: ModalKeyboardSubmitWhenTyping,
): boolean {
  if (mode === 'never') {
    return isTypingTarget(target);
  }
  const el = target as HTMLElement | null;
  if (!el) return false;
  return el.tagName === 'TEXTAREA' || el.isContentEditable;
}
