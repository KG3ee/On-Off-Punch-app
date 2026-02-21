'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { apiFetch } from '@/lib/api';
import { clearAuth, getAccessToken } from '@/lib/auth';
import { MobileBlockedNotice, useIsMobileClient } from '@/components/mobile-block';
import { UserRole } from '@/types/auth';
import { AdminPunchWidget } from '@/components/admin-punch-banner';

type NavItem = {
  href: string;
  label: string;
};

const adminNav: NavItem[] = [
  { href: '/admin/live', label: 'Live' },
  { href: '/admin/history', label: 'History' },
  { href: '/admin/users', label: 'Users' },
  { href: '/admin/requests', label: 'Requests' },
  { href: '/admin/password', label: 'Password' }
];

type NotifCounts = { registrations: number; driverRequests: number };

function AdminNotificationBell() {
  const [counts, setCounts] = useState<NotifCounts>({ registrations: 0, driverRequests: 0 });
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const router = useRouter();

  useEffect(() => {
    const poll = async () => {
      try {
        const [regs, driverReqs] = await Promise.all([
          apiFetch<{ id: string; status: string }[]>('/admin/registration-requests?status=PENDING'),
          apiFetch<{ id: string; status: string }[]>('/admin/driver-requests'),
        ]);
        setCounts({
          registrations: regs.length,
          driverRequests: driverReqs.filter((r) => r.status === 'PENDING').length,
        });
      } catch { /* silent */ }
    };
    void poll();
    const id = setInterval(poll, 15_000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  const total = counts.registrations + counts.driverRequests;

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        type="button"
        className="button button-ghost button-sm"
        onClick={() => setOpen(!open)}
        style={{ position: 'relative', fontSize: '1.1rem', padding: '0.25rem 0.5rem' }}
        title="Notifications"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
        {total > 0 && (
          <span style={{
            position: 'absolute', top: -2, right: -2,
            background: 'var(--danger)', color: '#fff',
            fontSize: '0.6rem', fontWeight: 700,
            minWidth: '16px', height: '16px',
            borderRadius: '8px',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: '0 4px', lineHeight: 1,
          }}>
            {total > 99 ? '99+' : total}
          </span>
        )}
      </button>

      {open && (
        <div style={{
          position: 'absolute', top: '100%', right: 0, marginTop: '0.375rem',
          background: 'var(--surface)', border: '1px solid var(--border)',
          borderRadius: '0.5rem', minWidth: '220px', zIndex: 100,
          boxShadow: '0 4px 16px rgba(0,0,0,0.3)',
          overflow: 'hidden',
        }}>
          <div style={{ padding: '0.5rem 0.75rem', borderBottom: '1px solid var(--border)', fontSize: '0.75rem', fontWeight: 600, color: 'var(--muted)' }}>
            Notifications
          </div>
          {total === 0 ? (
            <div style={{ padding: '0.75rem', fontSize: '0.8rem', color: 'var(--muted)', textAlign: 'center' }}>
              All caught up
            </div>
          ) : (
            <>
              {counts.registrations > 0 && (
                <button
                  type="button"
                  onClick={() => { setOpen(false); router.push('/admin/users'); }}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '0.5rem', width: '100%',
                    padding: '0.625rem 0.75rem', background: 'none', border: 'none',
                    color: 'inherit', cursor: 'pointer', fontSize: '0.8rem', textAlign: 'left',
                  }}
                  className="notif-row"
                >
                  <span style={{ fontSize: '1rem' }}>👤</span>
                  <span style={{ flex: 1 }}><strong>{counts.registrations}</strong> registration request{counts.registrations !== 1 ? 's' : ''}</span>
                  <span className="tag warning" style={{ fontSize: '0.65rem' }}>Pending</span>
                </button>
              )}
              {counts.driverRequests > 0 && (
                <button
                  type="button"
                  onClick={() => { setOpen(false); router.push('/admin/requests'); }}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '0.5rem', width: '100%',
                    padding: '0.625rem 0.75rem', background: 'none', border: 'none',
                    color: 'inherit', cursor: 'pointer', fontSize: '0.8rem', textAlign: 'left',
                  }}
                  className="notif-row"
                >
                  <span style={{ fontSize: '1rem' }}>🚗</span>
                  <span style={{ flex: 1 }}><strong>{counts.driverRequests}</strong> driver request{counts.driverRequests !== 1 ? 's' : ''}</span>
                  <span className="tag warning" style={{ fontSize: '0.65rem' }}>Pending</span>
                </button>
              )}
            </>
          )}
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
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  admin?: boolean;
  userRole?: UserRole;
  headerAction?: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const isEmployeeView = pathname?.startsWith('/employee');
  const hasNav = isEmployeeView || admin;
  const isMobile = useIsMobileClient();
  const [authChecked, setAuthChecked] = useState(false);

  useEffect(() => {
    const token = getAccessToken();
    if (!token) {
      router.replace('/login');
      return;
    }
    apiFetch('/me').then(() => {
      setAuthChecked(true);
    }).catch(() => {
      clearAuth();
      router.replace('/login');
    });
  }, [router]);

  if (!authChecked) {
    return (
      <main style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100dvh' }}>
        <span style={{ color: 'var(--muted)', fontSize: '0.85rem' }}>Verifying session...</span>
      </main>
    );
  }

  async function logout(): Promise<void> {
    try {
      await apiFetch('/auth/logout', { method: 'POST' });
    } catch {
      // Ignore
    }
    clearAuth();
    router.push('/login');
  }

  if (isEmployeeView && isMobile && userRole !== 'DRIVER' && userRole !== 'LEADER' && userRole !== 'MAID' && userRole !== 'CHEF') {
    return <MobileBlockedNotice title="Office desktop required" />;
  }

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
            {admin ? <AdminNotificationBell /> : null}
            {admin ? <AdminPunchWidget /> : null}
            <button
              type="button"
              className="button button-ghost button-sm"
              onClick={() => void logout()}
            >
              Sign out
            </button>
          </div>
        </div>

        {/* Nav row — only when there are links */}
        {hasNav ? (
          <nav className="shell-nav">
            {isEmployeeView ? (
              userRole === 'DRIVER' ? (
                <>
                  <Link href="/employee/driver" className={pathname === '/employee/driver' ? 'active' : ''}>
                    Dashboard
                  </Link>
                  <Link href="/employee/change-password" className={pathname === '/employee/change-password' ? 'active' : ''}>
                    Password
                  </Link>
                </>
              ) : userRole === 'LEADER' ? (
                <>
                  <Link href="/employee/dashboard" className={pathname === '/employee/dashboard' ? 'active' : ''}>
                    Dashboard
                  </Link>
                  <Link href="/employee/team" className={pathname?.startsWith('/employee/team') ? 'active' : ''}>
                    Team
                  </Link>
                  <Link href="/employee/requests" className={pathname?.startsWith('/employee/requests') ? 'active' : ''}>
                    Requests
                  </Link>
                  <Link href="/employee/change-password" className={pathname === '/employee/change-password' ? 'active' : ''}>
                    Password
                  </Link>
                </>
              ) : (
                <>
                  <Link href="/employee/dashboard" className={pathname === '/employee/dashboard' ? 'active' : ''}>
                    Dashboard
                  </Link>
                  <Link href="/employee/requests" className={pathname?.startsWith('/employee/requests') ? 'active' : ''}>
                    Requests
                  </Link>
                  <Link href="/employee/change-password" className={pathname === '/employee/change-password' ? 'active' : ''}>
                    Password
                  </Link>
                </>
              )
            ) : null}
            {admin
              ? adminNav.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className={pathname === item.href ? 'active' : ''}
                >
                  {item.label}
                </Link>
              ))
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
