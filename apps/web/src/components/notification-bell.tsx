'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  fetchNotifications,
  fetchNotificationUnreadCount,
  markAllNotificationsRead,
  markNotificationRead,
  UserNotification,
} from '@/lib/notifications';

function toneFromPriority(priority: UserNotification['priority']): 'warning' | 'error' | 'success' {
  if (priority === 'URGENT') return 'error';
  if (priority === 'HIGH') return 'warning';
  return 'success';
}

function formatWhen(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [items, setItems] = useState<UserNotification[]>([]);
  const ref = useRef<HTMLDivElement>(null);
  const openRef = useRef(false);
  const router = useRouter();

  const refreshUnread = async () => {
    try {
      const count = await fetchNotificationUnreadCount();
      setUnreadCount(count);
    } catch {
      // silent; bell should not break page flow
    }
  };

  const refreshList = async () => {
    setLoading(true);
    try {
      const result = await fetchNotifications(25, false);
      setItems(result.items);
    } catch {
      // silent; bell should still render
    } finally {
      setLoading(false);
    }
  };

  // Keep openRef in sync so the polling interval can check it without
  // being re-registered every time `open` changes.
  useEffect(() => {
    openRef.current = open;
  }, [open]);

  // Single stable interval — does not re-run when `open` changes,
  // preventing refreshUnread() from racing with openBell().
  useEffect(() => {
    void refreshUnread();
    const timer = window.setInterval(() => {
      if (!document.hidden) {
        void refreshUnread();
        if (openRef.current) {
          void refreshList();
        }
      }
    }, 15_000);

    return () => {
      window.clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  const openBell = async () => {
    // Optimistically zero the badge before any async work so the
    // polling interval cannot race and restore the old count.
    setOpen(true);
    setUnreadCount(0);
    await markAllNotificationsRead().catch(() => undefined);
    await refreshList();
  };

  const toggleBell = () => {
    if (open) {
      setOpen(false);
      return;
    }
    void openBell();
  };

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

    setOpen(false);
    if (item.link) {
      router.push(item.link);
    }
  };

  return (
    <div className="action-menu-wrap" ref={ref}>
      <button
        type="button"
        className="noti-bell"
        onClick={toggleBell}
        title="Notifications"
        aria-label="Notifications"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
        {unreadCount > 0 ? (
          <span className="noti-badge">{unreadCount > 99 ? '99+' : unreadCount}</span>
        ) : null}
      </button>

      {open ? (
        <div className="noti-dropdown" role="menu" aria-label="Notifications">
          <div className="noti-dropdown-header">
            <span style={{ fontWeight: 600, fontSize: '0.8125rem' }}>Notifications</span>
            <span style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>{items.length} total</span>
          </div>

          {loading ? (
            <div className="noti-empty">Loading notifications…</div>
          ) : items.length === 0 ? (
            <div className="noti-empty">All clear — no notifications</div>
          ) : (
            <div className="noti-list">
              {items.map((item) => {
                const tone = toneFromPriority(item.priority);
                const className = `noti-item noti-item-${tone}`;
                const clickable = Boolean(item.link);

                return (
                  <button
                    type="button"
                    key={item.id}
                    className={className}
                    style={{
                      width: '100%',
                      border: 'none',
                      background: 'none',
                      textAlign: 'left',
                      cursor: clickable ? 'pointer' : 'default',
                      opacity: item.isRead ? 0.78 : 1,
                    }}
                    onClick={() => void handleItemClick(item)}
                  >
                    <span className="noti-dot" />
                    <div style={{ display: 'grid', gap: '0.15rem', minWidth: 0 }}>
                      <span className="noti-text" style={{ fontWeight: item.isRead ? 500 : 700 }}>
                        {item.title}
                      </span>
                      <span className="noti-text" style={{ color: 'var(--muted)', fontSize: '0.765rem' }}>
                        {item.body}
                      </span>
                      <span style={{ color: 'var(--muted)', fontSize: '0.7rem' }}>{formatWhen(item.createdAt)}</span>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}
