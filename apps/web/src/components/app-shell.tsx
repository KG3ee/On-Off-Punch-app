'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
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

type Theme = 'light' | 'dark';
const themeStorageKey = 'modern-punch-theme';

function applyTheme(theme: Theme): void {
  document.documentElement.setAttribute('data-theme', theme);
}

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
  const [theme, setTheme] = useState<Theme>('light');

  useEffect(() => {
    const storedTheme = window.localStorage.getItem(themeStorageKey);
    const resolvedTheme: Theme =
      storedTheme === 'dark' || storedTheme === 'light'
        ? storedTheme
        : window.matchMedia('(prefers-color-scheme: dark)').matches
          ? 'dark'
          : 'light';
    setTheme(resolvedTheme);
    applyTheme(resolvedTheme);
  }, []);

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

  function toggleTheme(): void {
    const nextTheme: Theme = theme === 'dark' ? 'light' : 'dark';
    setTheme(nextTheme);
    applyTheme(nextTheme);
    window.localStorage.setItem(themeStorageKey, nextTheme);
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
          <div className="shell-header-right">
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
            <div className="header-actions">
              <button type="button" className="button button-ghost" onClick={toggleTheme}>
                {theme === 'dark' ? 'Light mode' : 'Dark mode'}
              </button>
              <button type="button" className="button button-ghost" onClick={() => void logout()}>
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
