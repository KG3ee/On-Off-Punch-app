'use client';

export type BreakPolicy = {
  id: string;
  code: string;
  name: string;
  expectedDurationMinutes: number;
  dailyLimit: number;
};

const BREAK_EMOJI_MAP: Record<string, string> = {
  wc: '🚽',
  bwc: '💩',
  cy: '🚬',
  'cf+1': '🥐',
  'cf+2': '🍛',
  'cf+3': '🍽️',
};

const BREAK_SHORTCUT_CODE_TO_LABEL: Record<string, string> = {
  bwc: 'B',
  wc: 'W',
  cy: 'C',
  'cf+1': '1',
  'cf+2': '2',
  'cf+3': '3',
};

interface BreakChipsProps {
  topPolicies: BreakPolicy[];
  bottomPolicies: BreakPolicy[];
  extraPolicies: BreakPolicy[];
  /** True when the buttons should be disabled */
  disabled: boolean;
  blockReason: string;
  onStart: (policy: BreakPolicy) => void;
}

export function BreakChips({
  topPolicies,
  bottomPolicies,
  extraPolicies,
  disabled,
  blockReason,
  onStart,
}: BreakChipsProps) {
  function renderPolicyButton(policy: BreakPolicy) {
    const normalizedCode = policy.code.toLowerCase();
    const emoji = BREAK_EMOJI_MAP[normalizedCode] ?? '☕';
    const shortcutLabel = BREAK_SHORTCUT_CODE_TO_LABEL[normalizedCode];
    return (
      <button
        key={policy.id}
        type="button"
        className="button-chip"
        disabled={disabled}
        onClick={() => onStart(policy)}
        title={`${policy.name} — ${policy.expectedDurationMinutes}m, limit ${policy.dailyLimit}/session${shortcutLabel ? ` · Shortcut ${shortcutLabel}` : ''}`}
      >
        {shortcutLabel ? (
          <span className="chip-shortcut" aria-hidden="true">{shortcutLabel}</span>
        ) : null}
        <span className="chip-emoji">{emoji}</span>
        <span className="chip-code">{policy.code.toUpperCase()} · {policy.expectedDurationMinutes}m</span>
        <span className="chip-name">{policy.name}</span>
      </button>
    );
  }

  const noBreaks = topPolicies.length === 0 && bottomPolicies.length === 0 && extraPolicies.length === 0;

  return (
    <>
      {blockReason ? (
        <div className="alert alert-warning">{blockReason}</div>
      ) : null}

      <div className="break-chips-layout">
        {topPolicies.length > 0 ? (
          <div className="break-section break-section-short">
            <p className="break-section-header">
              <span aria-hidden="true">🚻</span> Short Breaks
            </p>
            <div className="chips-row">
              {topPolicies.map(renderPolicyButton)}
            </div>
          </div>
        ) : null}

        {bottomPolicies.length > 0 ? (
          <div className="break-section break-section-meals">
            <p className="break-section-header">
              <span aria-hidden="true">🍴</span> Meals
            </p>
            <div className="chips-row">
              {bottomPolicies.map(renderPolicyButton)}
            </div>
          </div>
        ) : null}

        {extraPolicies.length > 0 ? (
          <div className="chips-grid">
            {extraPolicies.map(renderPolicyButton)}
          </div>
        ) : null}

        {noBreaks ? (
          <p style={{ fontSize: '0.72rem', color: 'var(--muted)' }}>
            No break policies available
          </p>
        ) : null}
      </div>
    </>
  );
}
