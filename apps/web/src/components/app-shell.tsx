'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { apiFetch } from '@/lib/api';
import { clearAuth } from '@/lib/auth';
import { MobileBlockedNotice, useIsMobileClient } from '@/components/mobile-block';
import { NotificationBell } from '@/components/notification-bell';
import { ensurePushSubscription, markNotificationRead, unsubscribePushSubscription } from '@/lib/notifications';
import { MeUser, UserRole } from '@/types/auth';
import { PunchWidget } from '@/components/punch-widget';

type NavItem = {
  href: string;
  label: string;
};

const adminNav: NavItem[] = [
  { href: '/admin/live', label: 'Live' },
  { href: '/admin/history', label: 'History' },
  { href: '/admin/users', label: 'Users' },
  { href: '/admin/shifts', label: 'Shifts' },
  { href: '/admin/requests', label: 'Requests' },
  { href: '/admin/deductions', label: 'Deductions' },
  { href: '/admin/workflow', label: 'Guide' },
];

type PendingSummary = { pending: number };
type RegistrationSummary = { actionable: number };
type ViolationSummary = { actionable: number };
type LeaderRequestsSummary = {
  pendingShift: number;
  pendingViolation: number;
  actionable: number;
};

function ProfileAvatar({ me, admin, currentPath }: { me: MeUser | null; admin: boolean; currentPath: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const router = useRouter();

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  async function logout() {
    try {
      await unsubscribePushSubscription();
    } catch {
      // ignore push unsubscribe errors during logout
    }
    try {
      await apiFetch('/auth/logout', { method: 'POST' });
    } catch { /* ignore */ }
    clearAuth();
    router.push('/login');
  }

  const initial = me?.displayName?.[0]?.toUpperCase() || '?';
  const fallbackReturnTo = admin ? '/admin/live' : '/employee/dashboard';
  const effectiveReturnTo =
    currentPath && !currentPath.startsWith('/employee/profile') ? currentPath : fallbackReturnTo;
  const profileHref = `/employee/profile?returnTo=${encodeURIComponent(effectiveReturnTo)}`;

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        style={{
          width: '34px', height: '34px', borderRadius: '50%',
          border: '2px solid var(--line)', background: 'var(--surface)',
          cursor: 'pointer', padding: 0, overflow: 'hidden',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          transition: 'border-color 0.15s',
        }}
        onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--brand)'; }}
        onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--line)'; }}
        title="Account"
      >
        {me?.profilePhotoUrl ? (
          <img src={me.profilePhotoUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        ) : (
          <span style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--brand)', lineHeight: 1 }}>
            {initial}
          </span>
        )}
      </button>

      {open && (
        <div style={{
          position: 'absolute', top: '100%', right: 0, marginTop: '0.375rem',
          background: 'var(--surface)', border: '1px solid var(--border)',
          borderRadius: '0.5rem', minWidth: '200px', zIndex: 100,
          boxShadow: '0 4px 16px rgba(0,0,0,0.3)',
          overflow: 'hidden',
        }}>
          {/* User info header */}
          <div style={{ padding: '0.75rem', borderBottom: '1px solid var(--border)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem' }}>
              <div style={{
                width: '36px', height: '36px', borderRadius: '50%', flexShrink: 0,
                background: 'var(--surface-alt, rgba(99,102,241,0.1))',
                border: '1px solid var(--line)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                overflow: 'hidden',
              }}>
                {me?.profilePhotoUrl ? (
                  <img src={me.profilePhotoUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                ) : (
                  <span style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--brand)' }}>{initial}</span>
                )}
              </div>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--ink)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {me?.displayName || 'User'}
                </div>
                <div style={{ fontSize: '0.72rem', color: 'var(--muted)' }}>
                  @{me?.username || ''}
                </div>
              </div>
            </div>
            {me?.role ? (
              <div style={{ marginTop: '0.375rem' }}>
                <span className={`tag role-${me.role.toLowerCase()}`} style={{ fontSize: '0.65rem' }}>{me.role}</span>
                {me.team ? <span className="tag brand" style={{ fontSize: '0.65rem', marginLeft: '0.25rem' }}>{me.team.name}</span> : null}
              </div>
            ) : null}
          </div>

          {/* Menu items */}
          <div style={{ padding: '0.25rem 0' }}>
            <button
              type="button"
              onClick={() => { setOpen(false); router.push(profileHref); }}
              className="notif-row"
              style={{
                display: 'flex', alignItems: 'center', gap: '0.5rem', width: '100%',
                padding: '0.5rem 0.75rem', background: 'none', border: 'none',
                color: 'inherit', cursor: 'pointer', fontSize: '0.8rem', textAlign: 'left',
              }}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                <circle cx="12" cy="7" r="4" />
              </svg>
              <span>Profile</span>
            </button>
            <button
              type="button"
              onClick={() => { setOpen(false); router.push(profileHref); }}
              className="notif-row"
              style={{
                display: 'flex', alignItems: 'center', gap: '0.5rem', width: '100%',
                padding: '0.5rem 0.75rem', background: 'none', border: 'none',
                color: 'inherit', cursor: 'pointer', fontSize: '0.8rem', textAlign: 'left',
              }}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                <path d="M7 11V7a5 5 0 0 1 10 0v4" />
              </svg>
              <span>Change Password</span>
            </button>
          </div>

          {/* Divider + Sign out */}
          <div style={{ borderTop: '1px solid var(--border)', padding: '0.25rem 0' }}>
            <button
              type="button"
              onClick={() => { setOpen(false); void logout(); }}
              className="notif-row"
              style={{
                display: 'flex', alignItems: 'center', gap: '0.5rem', width: '100%',
                padding: '0.5rem 0.75rem', background: 'none', border: 'none',
                color: 'var(--danger)', cursor: 'pointer', fontSize: '0.8rem', textAlign: 'left',
              }}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                <polyline points="16 17 21 12 16 7" />
                <line x1="21" y1="12" x2="9" y2="12" />
              </svg>
              <span>Sign Out</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export function AppShell({
  title,
  subtitle,
  children,
  admin = false,
  userRole,
  headerAction,
  showNotificationBell = true,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  admin?: boolean;
  userRole?: UserRole;
  headerAction?: React.ReactNode;
  showNotificationBell?: boolean;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const isEmployeeView = pathname?.startsWith('/employee');
  const hasNav = isEmployeeView || admin;
  const isMobile = useIsMobileClient();
  const [authChecked, setAuthChecked] = useState(false);
  const [me, setMe] = useState<MeUser | null>(null);
  const [adminUsersBadge, setAdminUsersBadge] = useState(0);
  const [adminRequestsBadge, setAdminRequestsBadge] = useState(0);
  const [leaderRequestsBadge, setLeaderRequestsBadge] = useState(0);
  const [employeeRequestsBadge, setEmployeeRequestsBadge] = useState(0);
  const currentPath = pathname || '/';
  const currentRole = (me?.role || userRole || '') as UserRole | '';

  useEffect(() => {
    apiFetch<MeUser>('/me')
      .then((data) => {
        setMe(data);
        setAuthChecked(true);
      })
      .catch(() => {
        clearAuth();
        router.replace('/login');
      });
  }, [router]);

  useEffect(() => {
    if (!me) return;
    void ensurePushSubscription(me.role).catch(() => undefined);
  }, [me]);

  const resetPendingBadges = useCallback(() => {
    setAdminUsersBadge(0);
    setAdminRequestsBadge(0);
    setLeaderRequestsBadge(0);
    setEmployeeRequestsBadge(0);
  }, []);

  const refreshPendingBadges = useCallback(async () => {
    if (!currentRole) {
      resetPendingBadges();
      return;
    }

    try {
      if (currentRole === 'ADMIN') {
        const [registration, shift, driver, violation] = await Promise.all([
          apiFetch<RegistrationSummary>('/admin/registration-requests/summary'),
          apiFetch<PendingSummary>('/admin/requests/summary'),
          apiFetch<PendingSummary>('/admin/driver-requests/summary'),
          apiFetch<ViolationSummary>('/admin/violations/summary'),
        ]);

        setAdminUsersBadge(Math.max(0, registration.actionable || 0));
        setAdminRequestsBadge(
          Math.max(0, shift.pending || 0) +
            Math.max(0, driver.pending || 0) +
            Math.max(0, violation.actionable || 0),
        );
        setLeaderRequestsBadge(0);
        setEmployeeRequestsBadge(0);
        return;
      }

      if (currentRole === 'LEADER') {
        const summary = await apiFetch<LeaderRequestsSummary>('/leader/requests/summary');
        setLeaderRequestsBadge(Math.max(0, summary.actionable || 0));
        setAdminUsersBadge(0);
        setAdminRequestsBadge(0);
        setEmployeeRequestsBadge(0);
        return;
      }

      if (currentRole === 'MEMBER' || currentRole === 'MAID' || currentRole === 'CHEF') {
        const [shift, driver] = await Promise.all([
          apiFetch<PendingSummary>('/shifts/requests/me/summary'),
          apiFetch<PendingSummary>('/driver-requests/me/summary'),
        ]);
        setEmployeeRequestsBadge(
          Math.max(0, shift.pending || 0) + Math.max(0, driver.pending || 0),
        );
        setAdminUsersBadge(0);
        setAdminRequestsBadge(0);
        setLeaderRequestsBadge(0);
        return;
      }

      resetPendingBadges();
    } catch {
      resetPendingBadges();
    }
  }, [currentRole, resetPendingBadges]);

  useEffect(() => {
    if (!authChecked || !me) return;

    const refreshNow = () => {
      void refreshPendingBadges();
    };

    refreshNow();

    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        refreshNow();
      }
    };

    const onFocus = () => {
      refreshNow();
    };

    const onRefreshEvent = () => {
      refreshNow();
    };

    const timer = window.setInterval(() => {
      if (!document.hidden) {
        refreshNow();
      }
    }, 15_000);

    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('focus', onFocus);
    window.addEventListener('pending-badges:refresh', onRefreshEvent as EventListener);

    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('pending-badges:refresh', onRefreshEvent as EventListener);
    };
  }, [authChecked, me, refreshPendingBadges]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const url = new URL(window.location.href);
    const notificationId = url.searchParams.get('notificationId');
    if (!notificationId) return;

    void markNotificationRead(notificationId)
      .catch(() => undefined)
      .finally(() => {
        url.searchParams.delete('notificationId');
        window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`);
      });
  }, [pathname]);

  if (!authChecked) {
    return (
      <main style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100dvh' }}>
        <span style={{ color: 'var(--muted)', fontSize: '0.85rem' }}>Verifying session...</span>
      </main>
    );
  }

  if (isEmployeeView && isMobile && currentRole === 'MEMBER') {
    return <MobileBlockedNotice title="Office desktop required" />;
  }

  const formatBadgeCount = (count: number): string => (count > 99 ? '99+' : String(count));

  const renderNavLink = (href: string, label: string, isActive: boolean, badgeCount = 0) => (
    <Link href={href} className={isActive ? 'active' : ''}>
      <span className="shell-nav-link-inner">
        <span>{label}</span>
        {badgeCount > 0 ? (
          <span className="shell-nav-badge">{formatBadgeCount(badgeCount)}</span>
        ) : null}
      </span>
    </Link>
  );

  return (
    <main>
      <header className={`shell-header${hasNav ? ' shell-header--with-nav' : ''}`}>
        {/* Top bar: brand + actions */}
        <div className="shell-header-top">
          <div className="shell-brand">
            <img src="/icon.png" className="shell-brand-logo" alt="Punch" />
            <div className="shell-brand-text">
              <div className="shell-title-group">
                <span className="shell-brand-name">Punch</span>
                <div className="shell-brand-divider" />
                <span className="shell-page-title">{title}</span>
              </div>
              {subtitle ? (
                <span className="shell-subtitle">{subtitle}</span>
              ) : null}
            </div>
          </div>

          <div className="shell-header-actions">
            {headerAction}
            {showNotificationBell ? <NotificationBell /> : null}
            {me ? <PunchWidget /> : null}
            <ProfileAvatar me={me} admin={admin} currentPath={currentPath} />
          </div>
        </div>

        {/* Nav row */}
        {hasNav ? (
          <nav className="shell-nav">
            {isEmployeeView ? (
              currentRole === 'DRIVER' ? (
                <>
                  {renderNavLink('/employee/driver', 'Dashboard', pathname === '/employee/driver')}
                  {renderNavLink('/employee/workflow', 'Guide', pathname === '/employee/workflow')}
                </>
              ) : currentRole === 'LEADER' ? (
                <>
                  {renderNavLink('/employee/dashboard', 'Dashboard', pathname === '/employee/dashboard')}
                  {renderNavLink(
                    '/employee/requests',
                    'Requests',
                    Boolean(pathname?.startsWith('/employee/requests')),
                    leaderRequestsBadge,
                  )}
                  {renderNavLink('/employee/workflow', 'Guide', pathname === '/employee/workflow')}
                </>
              ) : (
                <>
                  {renderNavLink('/employee/dashboard', 'Dashboard', pathname === '/employee/dashboard')}
                  {renderNavLink(
                    '/employee/requests',
                    'Requests',
                    Boolean(pathname?.startsWith('/employee/requests')),
                    employeeRequestsBadge,
                  )}
                  {renderNavLink('/employee/workflow', 'Guide', pathname === '/employee/workflow')}
                </>
              )
            ) : null}
            {admin
              ? adminNav.map((item) => {
                const badgeCount =
                  item.href === '/admin/users'
                    ? adminUsersBadge
                    : item.href === '/admin/requests'
                      ? adminRequestsBadge
                      : 0;

                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={pathname === item.href ? 'active' : ''}
                  >
                    <span className="shell-nav-link-inner">
                      <span>{item.label}</span>
                      {badgeCount > 0 ? (
                        <span className="shell-nav-badge">
                          {formatBadgeCount(badgeCount)}
                        </span>
                      ) : null}
                    </span>
                  </Link>
                );
              })
              : null}
          </nav>
        ) : null}
      </header>

      <div className="shell">
        {children}
      </div>
    </main>
  );
}
