'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { apiFetch } from '@/lib/api';
import { clearAuth } from '@/lib/auth';
import { MobileBlockedNotice, useIsMobileClient } from '@/components/mobile-block';
import { UserRole } from '@/types/auth';

type NavItem = {
  href: string;
  label: string;
};

const adminNav: NavItem[] = [
  { href: '/admin/live', label: 'Live' },
  { href: '/admin/history', label: 'History' },
  { href: '/admin/users', label: 'Users' },
  { href: '/admin/requests', label: 'Requests' }
];

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
  const isAdminView = pathname?.startsWith('/admin');
  const isEmployeeView = pathname?.startsWith('/employee');
  const hasNav = isEmployeeView || admin;
  const isMobile = useIsMobileClient();

  async function logout(): Promise<void> {
    try {
      await apiFetch('/auth/logout', { method: 'POST' });
    } catch {
      // Ignore
    }
    clearAuth();
    router.push('/login');
  }

  function switchView(): void {
    router.push(isAdminView ? '/employee/dashboard' : '/admin/live');
  }

  if (isEmployeeView && isMobile) {
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
            {userRole === 'ADMIN' ? (
              <button
                type="button"
                className="button button-ghost button-sm"
                onClick={switchView}
              >
                {isAdminView ? 'Employee' : 'Admin'}
              </button>
            ) : null}
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
