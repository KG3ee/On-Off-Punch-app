# Break Card Redesign + Mobile Experience

**Date:** 2026-03-17
**Branch:** codex/staging → merge to main after staging validation
**Scope:** Break card UI grouping (all roles) + full mobile experience for Driver / Maid / Chef

---

## Background

The break card currently renders 6 identical chips in a 3×2 grid with no visual labelling between break types. All buttons sit in the same undifferentiated space, making it easy to accidentally tap the wrong one. Separately, Driver / Maid / Chef use the system exclusively on phones but the current layout is a desktop page squeezed onto a small screen — and they are actively blocked by `MobileBlockedNotice`.

---

## Roles & Device Matrix

| Role | Has Break Card | Primary Device |
|---|---|---|
| Member (employee) | ✅ | Desktop / Tablet |
| Leader | ✅ | Phone |
| Admin | ✅ (to be unblocked) | Phone |
| Driver | ❌ | Phone |
| Maid | ❌ | Phone |
| Chef | ❌ | Phone |

---

## Part 1 — Break Card: Section Headers + Subtle Band (Option A)

### Visual Design

Each break group gets a labelled band with a faint background tint and 1px border.

```
┌─ card ──────────────────────────────────────┐
│  Breaks                                      │
│                                              │
│ ┌─ 🚻 Short Breaks ──────────────────────┐  │
│ │  [ 💩 BWC ]  [ 🚽 WC ]  [ 🚬 Smoking ] │  │
│ └────────────────────────────────────────┘  │
│                                              │
│ ┌─ 🍴 Meals ─────────────────────────────┐  │
│ │  [ 🥐 Breakfast ] [ 🍛 Lunch ] [ 🍽️ Dinner ] │
│ └────────────────────────────────────────┘  │
│                                              │
│  [break history table]                       │
└──────────────────────────────────────────────┘
```

### Style Tokens

- **Short Breaks band:** `background: rgba(var(--line-rgb), 0.04)`, `border: 1px solid var(--line)`
- **Meals band:** `background: rgba(251, 191, 36, 0.04)`, `border: 1px solid rgba(251, 191, 36, 0.15)`
- **Section label:** 11px, bold, muted colour, emoji prefix
- **Gap between bands:** `0.75rem`
- **Buttons:** unchanged `.button-chip` style — no button redesign

### Component Architecture

Extract a shared `<BreakChips>` component to avoid duplicate HTML across dashboards:

```
src/components/break-chips.tsx        ← NEW
  props: { topPolicies, bottomPolicies, extraPolicies, canStart, onStart }
  renders: two labelled bands + extra policies grid

employee/dashboard/page.tsx           ← replace inline chips with <BreakChips>
leader-dashboard.tsx                  ← replace inline chips with <BreakChips>
```

### Admin Break Card

Admin currently has the break data logic wired in `employee/dashboard/page.tsx` but is excluded at the render level. Change:

```ts
// Before
{me?.role !== 'MAID' && me?.role !== 'CHEF' ? <BreakCard /> : null}

// After
{me?.role !== 'MAID' && me?.role !== 'CHEF' && me?.role !== 'DRIVER' ? <BreakCard /> : null}
// Note: ADMIN is no longer excluded — break card now renders for Admin too
```

The action-level guard (`if (!me || me.role === 'ADMIN' || me.role === 'DRIVER') return`) stays untouched — that controls the API call safety, not the UI.

---

## Part 2 — Mobile Experience: Driver, Maid, Chef

### Fix 1 — Role-Aware Mobile Block

`MobileBlockedNotice` currently blocks every mobile/touch device. Make it role-aware:

```ts
// mobile-block.tsx  (or where the block check is called)
// Before: show block for any mobile
// After:  show block only for MEMBER role on mobile
const shouldBlock = isMobile && me?.role === 'MEMBER';
```

Roles that pass through on mobile: Driver, Maid, Chef, Leader, Admin.

### Fix 2 — Full-Width Punch Card at Top of Dashboard

For Driver / Maid / Chef on mobile, the primary action is punch in/out. Add a prominent action card at the very top of their dashboard view (below 640px only):

```
┌─────────────────────────────────────┐
│  🟢 On Duty · 1h 23m               │
│  ┌─────────────────────────────┐    │
│  │       ⏹  Punch OFF          │    │  ← full-width, min-height 56px
│  └─────────────────────────────┘    │
└─────────────────────────────────────┘

or when off duty:
┌─────────────────────────────────────┐
│  ⚫ Off Duty                         │
│  ┌─────────────────────────────┐    │
│  │       ▶  Punch ON           │    │
│  └─────────────────────────────┘    │
└─────────────────────────────────────┘
```

CSS class: `.punch-card-mobile` — shown only on `@media (max-width: 640px)` for these roles.

### Fix 3 — Session Table → Card Rows on Mobile

Below 640px, the session table switches from a horizontal table layout to stacked card rows:

```
Mobile card row:
┌──────────────────────────────────────┐
│ 17 Mar 2026          ✅ Closed        │
│ ON  07:00 AM  →  OFF 03:00 PM        │
└──────────────────────────────────────┘
```

Implementation: CSS-only using `display: block` on `<tr>` and `<td>` at mobile breakpoint, with `data-label` attributes for context. No JS change needed.

### Fix 4 — KPI Card Sizing on Mobile

For mobile-first roles, increase comfort on small screens:

```css
@media (max-width: 640px) {
  .kpi-mobile-first .kpi {
    padding: 0.75rem;
  }
  .kpi-mobile-first .kpi-value {
    font-size: 1.5rem;
  }
}
```

Add class `kpi-mobile-first` to the KPI section when role is Driver / Maid / Chef.

### Fix 5 — Chef Slide Widget Minimum Touch Size

The slide-to-report widget uses an inline `MEAL_THUMB_SIZE` constant. Enforce minimum safe touch targets:

- Track: `min-height: 56px`
- Thumb: `min-width: 48px`, `min-height: 48px`
- Matches Apple HIG (44pt) and Material Design (48dp) minimum tap target guidelines

---

## Acceptance Criteria

### Break Card
- [ ] Short Breaks section has a visible `🚻 Short Breaks` label and band
- [ ] Meals section has a visible `🍴 Meals` label and band
- [ ] Visual separation between the two sections is obvious without reading button labels
- [ ] Keyboard shortcuts (B, W, C, 1, 2, 3) still visible on desktop
- [ ] Admin can see and use the break card (no longer blocked)
- [ ] `<BreakChips>` component is shared between employee dashboard and leader dashboard

### Mobile (Driver / Maid / Chef)
- [ ] These roles are no longer blocked by `MobileBlockedNotice` on phone
- [ ] Member role IS still blocked on mobile
- [ ] Full-width punch card appears at top on screens ≤ 640px
- [ ] Session table renders as card rows on screens ≤ 640px (no horizontal scroll)
- [ ] KPI cards have larger padding and font on mobile
- [ ] Chef slide widget thumb is at least 48px and track at least 56px tall
- [ ] All interactive elements have min tap target of 44px

---

## Files to Change

| File | Change |
|---|---|
| `src/components/break-chips.tsx` | **CREATE** — shared break chip bands component |
| `src/app/employee/dashboard/page.tsx` | Use `<BreakChips>`, unblock Admin break card, add mobile punch card, KPI class, mobile session table |
| `src/components/leader-dashboard.tsx` | Use `<BreakChips>` |
| `src/components/mobile-block.tsx` | Make role-aware, accept `role` prop |
| `src/app/globals.css` | Add `.break-section-band`, `.punch-card-mobile`, mobile card-row table, `kpi-mobile-first` |

---

## Branch Strategy

All changes committed to `codex/staging`. Validated on staging before merge to `main`.
