# Break Card Redesign + Mobile Experience — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add visual section grouping to the break card (Short Breaks / Meals bands) and improve mobile layout for Driver, Maid, and Chef roles.

**Architecture:** Extract a shared `<BreakChips>` component with section bands used by both the employee dashboard and leader dashboard. Mobile improvements are CSS-first (card-row table layout, larger KPI, bigger punch card) with minimal JSX changes. All changes on `codex/staging` branch only.

**Tech Stack:** Next.js 14 App Router, React, TypeScript, CSS custom properties (no Tailwind), deployed via Vercel.

---

## Pre-flight

```bash
# Confirm you are on the right branch
cd /Users/kyawlaymyint/Desktop/ON:OFF/modern-punch
git branch   # should show * codex/staging

# Start dev server (keep running in a separate terminal)
cd apps/web
npm run dev
```

---

## Task 1: Add Break Section Band CSS

**Files:**
- Modify: `apps/web/src/app/globals.css`

The new `.break-section` wrapper and `.break-section-header` label live here. Also adds the mobile punch card and mobile KPI classes referenced in later tasks.

**Step 1: Find the insertion point**

Open `apps/web/src/app/globals.css`. Locate the `.break-chips-layout` block (around line 825). Insert the new rules **directly below** `.chips-grid { ... }`.

**Step 2: Add the CSS**

```css
/* ── Break section bands ── */
.break-section {
  border-radius: var(--radius-lg);
  border: 1px solid var(--line);
  padding: 0.5rem 0.625rem 0.625rem;
}

.break-section.break-section-short {
  background: rgba(255, 255, 255, 0.02);
}

.break-section.break-section-meals {
  background: rgba(251, 191, 36, 0.04);
  border-color: rgba(251, 191, 36, 0.18);
}

.break-section-header {
  font-size: 0.6875rem;
  font-weight: 700;
  color: var(--muted);
  text-transform: uppercase;
  letter-spacing: 0.07em;
  margin-bottom: 0.5rem;
  display: flex;
  align-items: center;
  gap: 0.3rem;
}

/* Gap between the two section bands */
.break-chips-layout {
  gap: 0.75rem;   /* override existing 0.5rem */
}

/* ── Mobile punch card (Driver / Maid / Chef, ≤640px) ── */
.punch-card-mobile {
  display: none;
}

@media (max-width: 640px) {
  .punch-card-mobile {
    display: block;
  }

  .punch-card-mobile .punch-mobile-status {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-size: 0.8125rem;
    font-weight: 600;
    color: var(--muted);
    margin-bottom: 0.625rem;
  }

  .punch-card-mobile .punch-mobile-status.on-duty {
    color: var(--ok);
  }

  .punch-card-mobile .button {
    width: 100%;
    min-height: 56px;
    font-size: 1rem;
    font-weight: 700;
    justify-content: center;
  }
}

/* ── KPI mobile-first sizing (Driver / Maid / Chef) ── */
@media (max-width: 640px) {
  .kpi-grid.kpi-mobile-first .kpi {
    padding: 0.75rem;
  }

  .kpi-grid.kpi-mobile-first .kpi-value {
    font-size: 1.5rem;
  }
}

/* ── Session table → card rows on mobile ── */
@media (max-width: 640px) {
  .table-card-mobile thead {
    display: none;
  }

  .table-card-mobile tbody tr {
    display: block;
    border: 1px solid var(--line);
    border-radius: var(--radius-lg);
    padding: 0.625rem 0.75rem;
    margin-bottom: 0.5rem;
    background: var(--card);
  }

  .table-card-mobile tbody tr:last-child {
    margin-bottom: 0;
  }

  .table-card-mobile td {
    display: flex;
    align-items: center;
    justify-content: space-between;
    border: none;
    padding: 0.2rem 0;
    font-size: 0.8125rem;
  }

  .table-card-mobile td::before {
    content: attr(data-label);
    font-size: 0.6875rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--muted);
    flex-shrink: 0;
    margin-right: 0.5rem;
  }

  .table-card-mobile td.table-empty {
    justify-content: center;
  }

  .table-card-mobile td.table-empty::before {
    display: none;
  }
}
```

**Step 3: Verify**

```bash
# In apps/web terminal — should still compile cleanly
npm run build 2>&1 | tail -5
```
Expected: no errors.

**Step 4: Commit**

```bash
git add apps/web/src/app/globals.css
git commit -m "style: add break section band, mobile punch card, and card-row table CSS"
```

---

## Task 2: Create Shared `<BreakChips>` Component

**Files:**
- Create: `apps/web/src/components/break-chips.tsx`

This component owns the section band JSX. Both dashboards will import it.

**Step 1: Create the file**

```tsx
// apps/web/src/components/break-chips.tsx
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
```

**Step 2: Verify TypeScript compiles**

```bash
cd apps/web && npx tsc --noEmit 2>&1 | grep -i error | head -10
```
Expected: no errors.

**Step 3: Commit**

```bash
git add apps/web/src/components/break-chips.tsx
git commit -m "feat: add shared BreakChips component with section band layout"
```

---

## Task 3: Update Employee Dashboard — Use `<BreakChips>` + Unblock Admin

**Files:**
- Modify: `apps/web/src/app/employee/dashboard/page.tsx`

Three sub-steps: (a) import BreakChips, (b) replace inline chips JSX, (c) remove Admin from break-data early-return guard.

### Step 3a: Add import

At the top of `page.tsx`, alongside the existing component imports (around line 26):

```tsx
// Add this line after the LeaderDashboard import:
import { BreakChips } from '@/components/break-chips';
```

### Step 3b: Replace the inline chips render block

Find this block (around line 1483–1498):

```tsx
// BEFORE — find and replace this entire block:
<div className="break-chips-layout">
  {topRowPolicies.length > 0 ? <div className="chips-row">{topRowPolicies.map(renderPolicyButton)}</div> : null}
  {bottomRowPolicies.length > 0 ? (
    <div className="chips-row chips-row-bottom">{bottomRowPolicies.map(renderPolicyButton)}</div>
  ) : null}
  {extraPolicies.length > 0 ? <div className="chips-grid">{extraPolicies.map(renderPolicyButton)}</div> : null}
  {policies.length === 0 ? (
    <p style={{ fontSize: '0.72rem', color: 'var(--muted)' }}>No break policies available</p>
  ) : null}
</div>
```

Replace with:

```tsx
// AFTER:
<BreakChips
  topPolicies={topRowPolicies}
  bottomPolicies={bottomRowPolicies}
  extraPolicies={extraPolicies}
  disabled={(loading && !isOffline) || !activeSession || !!activeBreak}
  blockReason={breakBlockedReason}
  onStart={openBreakStartConfirm}
/>
```

Also remove the `{breakBlockedReason ? <div className="alert alert-warning">...</div> : null}` block that was above the old chips layout — `BreakChips` now renders it internally.

### Step 3c: Unblock Admin from break-policy data loading

Find the early-return in the data-fetch `useEffect` (around line 524 in staging):

```ts
// BEFORE:
if (!me || me.role === 'ADMIN' || me.role === 'DRIVER') return;
```

```ts
// AFTER — keep DRIVER excluded (no break card), remove ADMIN:
if (!me || me.role === 'DRIVER') return;
```

> **Note:** There may be a second similar guard around line 1080. Apply the same change there too — remove `me.role === 'ADMIN'` but keep `me.role === 'DRIVER'`.

### Step 3d: Verify in browser

1. Run `npm run dev`
2. Log in as a **Member** — break card should show two labelled bands (Short Breaks / Meals) with subtle backgrounds
3. Log in as **Admin** — break card should now appear and show policies
4. Keyboard shortcuts (B, W, C, 1, 2, 3) should still trigger the shortcut modal on desktop

**Step 3e: Commit**

```bash
git add apps/web/src/app/employee/dashboard/page.tsx
git commit -m "feat: use BreakChips in employee dashboard; unblock Admin break card"
```

---

## Task 4: Update Leader Dashboard — Use `<BreakChips>`

**Files:**
- Modify: `apps/web/src/components/leader-dashboard.tsx`

### Step 4a: Add import

Find the import block at the top of `leader-dashboard.tsx` and add:

```tsx
import { BreakChips } from '@/components/break-chips';
```

### Step 4b: Replace inline chips block

Find (around line 651):

```tsx
// BEFORE:
<div className="break-chips-layout">
  {topRowPolicies.length > 0 ? <div className="chips-row">{topRowPolicies.map(renderPolicyButton)}</div> : null}
  {bottomRowPolicies.length > 0 ? <div className="chips-row chips-row-bottom">{bottomRowPolicies.map(renderPolicyButton)}</div> : null}
  {extraPolicies.length > 0 ? <div className="chips-grid">{extraPolicies.map(renderPolicyButton)}</div> : null}
```

Replace with:

```tsx
// AFTER:
<BreakChips
  topPolicies={topRowPolicies}
  bottomPolicies={bottomRowPolicies}
  extraPolicies={extraPolicies}
  disabled={(loading && !isOffline) || !activeSession || !!activeBreak}
  blockReason={breakBlockedReason}
  onStart={openBreakStartConfirm}
/>
```

Also remove the closing `</div>` of the old `break-chips-layout` and the `{policies.length === 0 ? ...}` fallback — `BreakChips` handles both.

Also remove the `{breakBlockedReason ? <div className="alert...">...</div> : null}` that was above the chips layout — it is now rendered inside `BreakChips`.

### Step 4c: Verify in browser

Log in as a **Leader** — break card should show the same two-band layout.

**Step 4d: Commit**

```bash
git add apps/web/src/components/leader-dashboard.tsx
git commit -m "feat: use BreakChips in leader dashboard"
```

---

## Task 5: Mobile Punch Card for Driver, Maid, Chef

**Files:**
- Modify: `apps/web/src/app/employee/dashboard/page.tsx`

On screens ≤ 640px these roles need a prominent full-width punch action at the top of the page — not just the tiny header button.

### Step 5a: Find the right location

In `page.tsx`, find the `<>` fragment that opens the non-Leader dashboard (directly after `{me?.role === 'LEADER' ? <LeaderDashboard .../> : (`). Insert the new card as the **first child**, before the Monthly KPI Row.

### Step 5b: Add the punch card JSX

```tsx
{/* ── Mobile punch card (Driver / Maid / Chef on phone) ── */}
{(me?.role === 'DRIVER' || me?.role === 'MAID' || me?.role === 'CHEF') ? (
  <article className="card punch-card-mobile">
    <div className={`punch-mobile-status${activeSession ? ' on-duty' : ''}`}>
      <span className={`status-dot ${activeSession ? 'active' : 'inactive'}`} />
      {activeSession
        ? `On Duty · ${fmtDuration(activeDutyMinutes)}`
        : 'Off Duty'}
    </div>
    {activeSession ? (
      <button
        type="button"
        className="button button-danger"
        disabled={loading}
        onClick={() => {
          const timeLabel = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
          if (window.confirm(`Punch OFF confirmation\n\nActual recorded time will be ${timeLabel}.\n\nDo you want to continue?`)) {
            void runAction('/attendance/off', {});
          }
        }}
      >
        ⏹ Punch OFF
      </button>
    ) : (
      <button
        type="button"
        className="button button-ok"
        disabled={loading}
        onClick={() => {
          const timeLabel = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
          if (window.confirm(`Punch ON confirmation\n\nActual recorded time will be ${timeLabel}.\n\nDo you want to continue?`)) {
            void runAction('/attendance/on', {});
          }
        }}
      >
        ▶ Punch ON
      </button>
    )}
  </article>
) : null}
```

> **Note:** Check what the existing punch action function is called in this dashboard (it may be `runAction('/attendance/on', ...)` or a dedicated `punch()` function). Match the pattern already used in this file.

### Step 5c: Verify in browser

Use browser DevTools to set viewport to 390px (iPhone 14). Log in as Driver/Maid/Chef — a large punch button card should appear at the top. On desktop (> 640px) the card should be hidden.

**Step 5d: Commit**

```bash
git add apps/web/src/app/employee/dashboard/page.tsx
git commit -m "feat: add full-width mobile punch card for Driver/Maid/Chef"
```

---

## Task 6: Session Table → Card Rows on Mobile

**Files:**
- Modify: `apps/web/src/app/employee/dashboard/page.tsx`

The CSS class `.table-card-mobile` was added in Task 1. Now wire it up to the table and add `data-label` attributes to `<td>` cells.

### Step 6a: Find the Current Session table

Locate the `<table>` inside the "Current Session" `<article>` (around line 1564 in staging). Add `className="table-card-mobile"` to the `<table>` element:

```tsx
// BEFORE:
<table>

// AFTER:
<table className="table-card-mobile">
```

### Step 6b: Add `data-label` attributes to each `<td>`

```tsx
// BEFORE (the active session row):
<tr>
  <td className="mono">{activeSession.shiftDate}</td>
  <td className="mono">{fmtTime(activeSession.punchedOnAt)}</td>
  <td className="mono">{activeSession.punchedOffAt ? fmtTime(activeSession.punchedOffAt) : '—'}</td>
  <td>
    <span className={`tag ${activeSession.status === 'ACTIVE' ? 'ok' : ''}`}>{activeSession.status}</span>
  </td>
  {me?.role !== 'MAID' && me?.role !== 'CHEF' ? (
    <td>{activeSession.lateMinutes > 0 ? <span className="tag danger">{activeSession.lateMinutes}m</span> : '—'}</td>
  ) : null}
</tr>

// AFTER — add data-label to each td:
<tr>
  <td className="mono" data-label="Date">{activeSession.shiftDate}</td>
  <td className="mono" data-label="On">{fmtTime(activeSession.punchedOnAt)}</td>
  <td className="mono" data-label="Off">{activeSession.punchedOffAt ? fmtTime(activeSession.punchedOffAt) : '—'}</td>
  <td data-label="Status">
    <span className={`tag ${activeSession.status === 'ACTIVE' ? 'ok' : ''}`}>{activeSession.status}</span>
  </td>
  {me?.role !== 'MAID' && me?.role !== 'CHEF' ? (
    <td data-label="Late">{activeSession.lateMinutes > 0 ? <span className="tag danger">{activeSession.lateMinutes}m</span> : '—'}</td>
  ) : null}
</tr>
```

Also add `className="table-empty"` to the empty-state `<td>` (it already has it, just confirm it's present so the `::before` suppression works).

### Step 6c: Verify in browser

At 390px viewport width (Driver/Maid/Chef logged in): the session table should render as stacked card rows, each row a rounded box with label–value pairs. On desktop: unchanged table layout.

**Step 6d: Commit**

```bash
git add apps/web/src/app/employee/dashboard/page.tsx
git commit -m "feat: session table renders as card rows on mobile for Driver/Maid/Chef"
```

---

## Task 7: Larger KPI Cards on Mobile for Driver, Maid, Chef

**Files:**
- Modify: `apps/web/src/app/employee/dashboard/page.tsx`

The CSS class `kpi-mobile-first` was added in Task 1. Apply it to the KPI section only when the role is Driver/Maid/Chef.

### Step 7a: Find the Today KPI section

Locate (around line 1339):

```tsx
<section className="kpi-grid">
```

### Step 7b: Add conditional class

```tsx
// BEFORE:
<section className="kpi-grid">

// AFTER:
<section className={`kpi-grid${me?.role === 'DRIVER' || me?.role === 'MAID' || me?.role === 'CHEF' ? ' kpi-mobile-first' : ''}`}>
```

### Step 7c: Verify in browser

At 390px viewport: Driver/Maid/Chef KPI values should be 1.5rem font and have more breathing room. Member KPIs should look unchanged.

**Step 7d: Commit**

```bash
git add apps/web/src/app/employee/dashboard/page.tsx
git commit -m "style: larger KPI card padding and font for Driver/Maid/Chef on mobile"
```

---

## Task 8: Chef Slide Widget Minimum Touch Targets

**Files:**
- Modify: `apps/web/src/app/employee/dashboard/page.tsx`

The Chef "Meal Ready" slide track uses inline styles. Enforce minimum touch targets.

### Step 8a: Find `MEAL_THUMB_SIZE` constant

Locate (around line 944):

```ts
const MEAL_THUMB_SIZE = 56;
```

This is already 56 — good, the track height is fine.

### Step 8b: Find the thumb `<div>` inside the slide track

The thumb is a draggable `<div>` rendered inside `<div ref={mealTrackRef} className="slide-track" ...>`. Add min-width and min-height to its inline styles:

```tsx
// Find the thumb div — it will have positioning styles and be draggable.
// Add to its style object:
minWidth: `${MEAL_THUMB_SIZE}px`,
minHeight: `${MEAL_THUMB_SIZE}px`,
```

### Step 8c: Verify the track min-height

The slide track `<div>` uses `height: ${MEAL_THUMB_SIZE}px` in its inline style. Change to use `minHeight` so it can flex taller if needed:

```tsx
// BEFORE (in the slide-track div style):
height: `${MEAL_THUMB_SIZE}px`,

// AFTER:
minHeight: `${MEAL_THUMB_SIZE}px`,
```

### Step 8d: Verify in browser

At 390px: the Chef slide widget should be at least 56px tall and the thumb at least 56px wide — easy to grab with a thumb.

**Step 8e: Commit**

```bash
git add apps/web/src/app/employee/dashboard/page.tsx
git commit -m "fix: enforce minimum 56px touch targets on Chef meal slide widget"
```

---

## Task 9: Final Check + Push to Staging

**Step 1: Full build**

```bash
cd /Users/kyawlaymyint/Desktop/ON:OFF/modern-punch/apps/web
npm run build
```
Expected: compiled successfully, zero TS errors.

**Step 2: Visual smoke test checklist**

| Role | Screen | Check |
|---|---|---|
| Member | Desktop | Two break bands visible with labels and tinted backgrounds |
| Member | Desktop | Keyboard shortcuts (B/W/C/1/2/3) still work |
| Leader | Phone (390px) | Two break bands visible |
| Admin | Desktop/Phone | Break card now shows policies |
| Driver | Phone (390px) | Large punch card at top, card-row session table, bigger KPIs |
| Maid | Phone (390px) | Large punch card at top, card-row session table, bigger KPIs |
| Chef | Phone (390px) | Large punch card at top, slide widget grabbable, bigger KPIs |
| Member | Phone | Still blocked by "Desktop only" wall |

**Step 3: Push to staging**

```bash
cd /Users/kyawlaymyint/Desktop/ON:OFF/modern-punch
git push origin codex/staging
```

**Step 4: Verify Vercel staging deployment**

Check the Vercel dashboard or run the `vercel:logs` skill to confirm the staging deployment succeeds before merging to `main`.
