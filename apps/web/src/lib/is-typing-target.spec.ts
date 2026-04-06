import { isTypingTarget, shouldBlockEnterConfirm } from './is-typing-target';

function el(tag: string, extra: Partial<HTMLElement> = {}): EventTarget {
  const node = {
    tagName: tag.toUpperCase(),
    isContentEditable: false,
    ...extra,
  } as unknown as HTMLElement;
  return node;
}

describe('isTypingTarget', () => {
  it('returns false for null', () => {
    expect(isTypingTarget(null)).toBe(false);
  });

  it('returns true for INPUT, TEXTAREA, SELECT', () => {
    expect(isTypingTarget(el('input'))).toBe(true);
    expect(isTypingTarget(el('textarea'))).toBe(true);
    expect(isTypingTarget(el('select'))).toBe(true);
  });

  it('returns true when contenteditable', () => {
    expect(isTypingTarget(el('div', { isContentEditable: true }))).toBe(true);
  });

  it('returns false for other elements', () => {
    expect(isTypingTarget(el('button'))).toBe(false);
    expect(isTypingTarget(el('div'))).toBe(false);
  });
});

describe('shouldBlockEnterConfirm', () => {
  it('never mode matches isTypingTarget', () => {
    expect(shouldBlockEnterConfirm(null, 'never')).toBe(false);
    expect(shouldBlockEnterConfirm(el('input'), 'never')).toBe(true);
    expect(shouldBlockEnterConfirm(el('select'), 'never')).toBe(true);
    expect(shouldBlockEnterConfirm(el('button'), 'never')).toBe(false);
  });

  it('input-only blocks textarea and contenteditable only', () => {
    expect(shouldBlockEnterConfirm(el('input'), 'input-only')).toBe(false);
    expect(shouldBlockEnterConfirm(el('select'), 'input-only')).toBe(false);
    expect(shouldBlockEnterConfirm(el('textarea'), 'input-only')).toBe(true);
    expect(shouldBlockEnterConfirm(el('div', { isContentEditable: true }), 'input-only')).toBe(
      true,
    );
    expect(shouldBlockEnterConfirm(el('div'), 'input-only')).toBe(false);
    expect(shouldBlockEnterConfirm(null, 'input-only')).toBe(false);
  });
});
