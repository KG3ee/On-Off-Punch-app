'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { apiFetch } from '@/lib/api';
import { clearAuth } from '@/lib/auth';
import { UserRole } from '@/types/auth';

type NavItem = {
  href: string;
  label: string;
};

const adminNav: NavItem[] = [
  { href: '/admin/live', label: 'Live' },
  { href: '/admin/users', label: 'Users' },
  { href: '/admin/shifts', label: 'Shifts' },
  { href: '/admin/payroll', label: 'Payroll' },
  { href: '/admin/reports', label: 'Reports' }
];

export function AppShell({
  title,
  subtitle,
  children,
  admin = false,
  userRole
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  admin?: boolean;
  userRole?: UserRole;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const isAdminView = pathname?.startsWith('/admin');
  const isEmployeeView = pathname?.startsWith('/employee');

  async function logout(): Promise<void> {
    try {
      await apiFetch('/auth/logout', { method: 'POST' });
    } catch {
      // Ignore logout API errors
    }
    clearAuth();
    router.push('/login');
  }

  function switchView(): void {
    if (isAdminView) {
      router.push('/employee/dashboard');
    } else {
      router.push('/admin/live');
    }
  }

  return (
    <main>
      <div className="shell">
        <header className="shell-header">
          <div>
            <p className="eyebrow">Modern Punch</p>
            <h2>{title}</h2>
            {subtitle ? <p style={{ fontSize: '0.75rem' }}>{subtitle}</p> : null}
          </div>
          <div className="shell-header-right">
            <nav className="nav">
              {isEmployeeView ? (
                <Link href="/employee/dashboard" className={pathname?.startsWith('/employee') ? 'active' : ''}>
                  Dashboard
                </Link>
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
            <div className="header-actions">
              {userRole === 'ADMIN' ? (
                <button
                  type="button"
                  className="button button-ghost button-sm"
                  onClick={switchView}
                  title={isAdminView ? 'Switch to Employee view' : 'Switch to Admin view'}
                >
                  {isAdminView ? '👤 Employee View' : '🛡️ Admin View'}
                </button>
              ) : null}
              <button type="button" className="button button-ghost button-sm" onClick={() => void logout()}>
                Logout
              </button>
            </div>
          </div>
        </header>
        {children}
      </div>
    </main>
  );
}
