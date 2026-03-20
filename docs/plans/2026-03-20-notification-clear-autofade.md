# Notification Clear Button + Auto-Fade Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a "Clear all" button to the notification popup header and auto-fade the popup after 4 seconds of inactivity, with a smooth 300ms fade-out animation.

**Architecture:** Two-state close model — `open` controls mount, `closing` controls the fade CSS class. A single `timerRef` drives auto-dismiss; mouse enter/leave pause and resume it. The "Clear all" button marks all read, dims items optimistically, then triggers the fade after a 1s grace period so the user sees confirmation.

**Tech Stack:** React (useState, useRef, useEffect), CSS transitions (opacity), existing NestJS notification API.

---

### Task 1: Add CSS — fade transition + closing state + clear button

**Files:**
- Modify: `apps/web/src/app/globals.css` — around line 1728 (`.noti-dropdown`)

**Step 1: Add transition to base `.noti-dropdown` and add `.noti-closing` modifier**

Find the existing `.noti-dropdown` rule and add `transition: opacity 0.3s ease;` to it.
Then add the closing modifier directly after:

```css
.noti-dropdown {
  /* existing rules unchanged — add this one line: */
  transition: opacity 0.3s ease;
}

.noti-dropdown.noti-closing {
  opacity: 0;
  pointer-events: none;
}
```

**Step 2: Add clear-all button style after `.noti-dropdown-header`**

```css
.noti-clear-btn {
  background: none;
  border: none;
  cursor: pointer;
  font-size: 0.72rem;
  color: var(--muted);
  padding: 0.15rem 0.35rem;
  border-radius: var(--radius-sm);
  transition: color var(--transition), background var(--transition);
  white-space: nowrap;
}

.noti-clear-btn:hover {
  color: var(--ink);
  background: var(--surface);
}

.noti-clear-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
```

**Step 3: Verify CSS is valid**

Open browser devtools on any page and confirm no CSS parse errors in console.

**Step 4: Commit**

```bash
git add apps/web/src/app/globals.css
git commit -m "style: add noti-closing fade + clear-all button styles"
```

---

### Task 2: Update NotificationBell component

**Files:**
- Modify: `apps/web/src/components/notification-bell.tsx`

**Step 1: Add `closing` state and `timerRef`**

Add two new refs/state after the existing ones:

```typescript
const [closing, setClosing] = useState(false);
const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
```

**Step 2: Add `startFade` helper**

Add this function after `openBell`. It sets the closing CSS state, waits 300ms for the animation, then unmounts:

```typescript
const startFade = () => {
  if (timerRef.current) {
    clearTimeout(timerRef.current);
    timerRef.current = null;
  }
  setClosing(true);
  setTimeout(() => {
    setOpen(false);
    setClosing(false);
  }, 300);
};
```

**Step 3: Update `openBell` to start 4s auto-close timer**

Replace the existing `openBell`:

```typescript
const openBell = async () => {
  setOpen(true);
  setClosing(false);
  setUnreadCount(0);

  // Start 4s auto-dismiss timer
  if (timerRef.current) clearTimeout(timerRef.current);
  timerRef.current = setTimeout(() => startFade(), 4000);

  await markAllNotificationsRead().catch(() => undefined);
  await refreshList();
};
```

**Step 4: Update `toggleBell` to clear timer on manual close**

```typescript
const toggleBell = () => {
  if (open) {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    setOpen(false);
    setClosing(false);
    return;
  }
  void openBell();
};
```

**Step 5: Update `handleItemClick` to fade on item click**

Replace `setOpen(false)` at the end of `handleItemClick` with `startFade()`:

```typescript
const handleItemClick = async (item: UserNotification) => {
  if (!item.isRead) {
    try {
      await markNotificationRead(item.id);
    } catch {
      // ignore and continue navigation
    }
    setItems((prev) => prev.map((entry) => (entry.id === item.id ? { ...entry, isRead: true } : entry)));
    setUnreadCount((prev) => Math.max(0, prev - 1));
  }

  startFade();  // ← replaces setOpen(false)
  if (item.link) {
    router.push(item.link);
  }
};
```

**Step 6: Add `handleClearAll` function**

Add after `handleItemClick`:

```typescript
const [clearing, setClearing] = useState(false);

const handleClearAll = async () => {
  setClearing(true);
  setUnreadCount(0);
  setItems((prev) => prev.map((item) => ({ ...item, isRead: true })));
  try {
    await markAllNotificationsRead();
  } catch {
    // optimistic update already applied; silent fail
  } finally {
    setClearing(false);
  }
  // 1s grace so user sees items dim, then fade out
  if (timerRef.current) clearTimeout(timerRef.current);
  timerRef.current = setTimeout(() => startFade(), 1000);
};
```

**Step 7: Add mouse pause/resume on the dropdown div**

Add `onMouseEnter` and `onMouseLeave` to the dropdown wrapper div:

```typescript
const pauseTimer = () => {
  if (timerRef.current) {
    clearTimeout(timerRef.current);
    timerRef.current = null;
  }
};

const resumeTimer = () => {
  if (timerRef.current) clearTimeout(timerRef.current);
  timerRef.current = setTimeout(() => startFade(), 4000);
};
```

On the `<div className="noti-dropdown" ...>`:
```tsx
<div
  className={`noti-dropdown${closing ? ' noti-closing' : ''}`}
  role="menu"
  aria-label="Notifications"
  onMouseEnter={pauseTimer}
  onMouseLeave={resumeTimer}
>
```

**Step 8: Add "Clear all" button to dropdown header**

Replace the existing header:

```tsx
<div className="noti-dropdown-header">
  <span style={{ fontWeight: 600, fontSize: '0.8125rem' }}>Notifications</span>
  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
    {items.length > 0 && (
      <button
        type="button"
        className="noti-clear-btn"
        onClick={() => void handleClearAll()}
        disabled={clearing}
      >
        {clearing ? 'Clearing…' : 'Clear all'}
      </button>
    )}
    <span style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>{items.length} total</span>
  </div>
</div>
```

**Step 9: Clean up timer on unmount**

Add a cleanup effect after the existing useEffects:

```typescript
useEffect(() => {
  return () => {
    if (timerRef.current) clearTimeout(timerRef.current);
  };
}, []);
```

**Step 10: Commit**

```bash
git add apps/web/src/components/notification-bell.tsx
git commit -m "feat: add Clear all button + 4s auto-fade to notification popup"
```

---

### Task 3: Push and verify on VPS

**Step 1: Push to both branches**

```bash
git push origin main && git push origin main:codex/staging
```

**Step 2: Wait for Dokploy web rebuild, then verify:**

- Open hmpunch.com → log in → bell shows badge
- Click bell → popup opens → "Clear all" visible top-right
- Wait 4 seconds without hovering → popup fades out ✅
- Re-open → hover over popup → timer pauses → move away → fades after 4s ✅
- Click a notification → fades immediately ✅
- Click "Clear all" → items dim → popup fades after 1s → badge gone ✅
- Refresh page → badge stays at 0 ✅ (DB was updated)
