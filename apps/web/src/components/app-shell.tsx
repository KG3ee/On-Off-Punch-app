'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { apiFetch } from '@/lib/api';
import { clearAuth } from '@/lib/auth';

type NavItem = {
  href: string;
  label: string;
};

const adminNav: NavItem[] = [
  { href: '/admin/live', label: 'Live Board' },
  { href: '/admin/users', label: 'Users' },
  { href: '/admin/shifts', label: 'Shifts' },
  { href: '/admin/payroll', label: 'Payroll' },
  { href: '/admin/reports', label: 'Reports' }
];

export function AppShell({
  title,
  subtitle,
  children,
  admin = false
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  admin?: boolean;
}) {
  const pathname = usePathname();
  const router = useRouter();

  async function logout(): Promise<void> {
    try {
      await apiFetch('/auth/logout', {
        method: 'POST'
      });
    } catch {
      // Ignore logout API errors and clear local token anyway.
    }
    clearAuth();
    router.push('/login');
  }

  return (
    <main>
      <div className="shell">
        <header className="shell-header">
          <div>
            <p className="eyebrow">Modern Punch</p>
            <h2>{title}</h2>
            {subtitle ? <p>{subtitle}</p> : null}
          </div>
          <div style={{ display: 'grid', gap: '0.5rem', justifyItems: 'end' }}>
            <nav className="nav">
              <Link href="/employee/dashboard" className={pathname?.startsWith('/employee') ? 'active' : ''}>
                Employee
              </Link>
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
            <button type="button" className="button button-ghost" onClick={() => void logout()}>
              Logout
            </button>
          </div>
        </header>
        {children}
      </div>
    </main>
  );
}
