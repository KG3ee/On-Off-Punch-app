# Notification Read Race Fix Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix the race condition in `openBell()` so notifications are marked as read in the DB before the list is fetched, eliminating bold/unread items after opening the bell and the badge reappearing after navigation.

**Architecture:** Sequential execution — `markAllNotificationsRead()` writes to DB first, then `refreshList()` fetches the updated list. The `.map()` patch that compensated for the race is removed since it's no longer needed.

**Tech Stack:** React (client component), Next.js 14 App Router, TypeScript

---

### Task 1: Fix the race condition in `openBell()`

**Files:**
- Modify: `apps/web/src/components/notification-bell.tsx:86-91`

**Step 1: Open the file and locate `openBell`**

The function is at line 86. Current code:

```typescript
const openBell = async () => {
  setOpen(true);
  await Promise.all([refreshList(), markAllNotificationsRead().catch(() => undefined)]);
  setUnreadCount(0);
  setItems((prev) => prev.map((item) => ({ ...item, isRead: true, readAt: item.readAt || new Date().toISOString() })));
};
```

**Step 2: Replace with sequential execution**

```typescript
const openBell = async () => {
  setOpen(true);
  await markAllNotificationsRead().catch(() => undefined);
  await refreshList();
  setUnreadCount(0);
};
```

Key changes:
- `markAllNotificationsRead()` runs first (DB write completes)
- `refreshList()` runs after (fetches rows already marked `isRead: true`)
- Remove the `.map()` patch — list from API is already correct
- Keep `setUnreadCount(0)` to clear badge immediately after fetch

**Step 3: Verify the build compiles**

```bash
cd apps/web && npx tsc --noEmit
```

Expected: no errors

**Step 4: Manual verification**

1. Open hmpunch.com (or localhost)
2. Trigger a notification (or use an existing unread one)
3. Confirm unread badge shows a number
4. Click the bell
5. ✅ Notifications should appear dimmed/normal weight immediately (not bold)
6. Close the bell
7. Navigate to another page
8. ✅ Badge should remain 0 — not reappear

**Step 5: Commit**

```bash
git add apps/web/src/components/notification-bell.tsx
git commit -m "fix: mark notifications read before fetching list to eliminate race condition"
```

**Step 6: Push to both branches**

```bash
git push origin main
git push origin main:codex/staging
```
