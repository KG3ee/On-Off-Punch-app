import type { ComponentPropsWithoutRef } from 'react';

/**
 * Vertical stack inside a `.split` section (two main columns).
 * Prefer this over a raw `div` with `className="grid"` — global `.grid` is a real CSS Grid
 * (e.g. admin deductions), and using it for column stacks was easy to break when CSS was missing.
 */
export function SplitColumnStack({
  className = '',
  ...props
}: ComponentPropsWithoutRef<'div'>) {
  return (
    <div
      className={className.trim() ? `split-col-stack ${className}` : 'split-col-stack'}
      {...props}
    />
  );
}
