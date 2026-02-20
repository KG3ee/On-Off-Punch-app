'use client';

import Link from 'next/link';
import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch } from '@/lib/api';
import { setAccessToken } from '@/lib/auth';
import { MobileBlockedNotice, useIsMobileClient } from '@/components/mobile-block';
import { MeUser } from '@/types/auth';

type LoginResult = {
  accessToken?: string;
  user: MeUser;
};

export default function LoginPage() {
  const router = useRouter();
  const isMobile = useIsMobileClient();

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setLoading(true);
    setError('');

    try {
      const result = await apiFetch<LoginResult>('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ username, password }),
        skipAuth: true
      });
      if (result.accessToken) {
        setAccessToken(result.accessToken);
      }

      if (result.user.role === 'ADMIN') {
        router.push('/admin/live');
      } else {
        router.push('/employee/dashboard');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setLoading(false);
    }
  }

  if (isMobile) {
    return <MobileBlockedNotice title="Office desktop required" />;
  }

  return (
    <main className="login-wrap">
      <div className="login-card">
        <div className="login-header">
          <img src="/icon.png" className="login-logo" alt="Punch" />
          <h1>Welcome back</h1>
          <p>Sign in with your username and password.</p>
        </div>

        <form className="form-grid" onSubmit={(event) => void handleSubmit(event)}>
          <div className="form-field">
            <label htmlFor="username">Username</label>
            <input
              id="username"
              className="input"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              placeholder="Enter your username"
              autoComplete="username"
              autoFocus
              required
            />
          </div>

          <div className="form-field">
            <label htmlFor="password">Password</label>
            <input
              id="password"
              className="input"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Enter your password"
              autoComplete="current-password"
              required
            />
          </div>

          {error ? (
            <div className="alert alert-error">{error}</div>
          ) : null}

          <button
            type="submit"
            className="button button-primary"
            disabled={loading}
            style={{ width: '100%', justifyContent: 'center', padding: '0.625rem' }}
          >
            {loading ? 'Signing in…' : 'Sign in'}
          </button>
        </form>

        <p style={{ fontSize: '0.8125rem', textAlign: 'center' }}>
          New employee?{' '}
          <Link href="/register" className="tag brand" style={{ textDecoration: 'none' }}>
            Request an account
          </Link>
        </p>
      </div>
    </main>
  );
}
