'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch } from '@/lib/api';
import { setAccessToken } from '@/lib/auth';
import { MeUser } from '@/types/auth';
import { ThemeToggle } from '@/components/theme-toggle';

type LoginResult = {
  accessToken: string;
  user: MeUser;
};

export default function LoginPage() {
  const router = useRouter();

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

      setAccessToken(result.accessToken);

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

  return (
    <main className="login-wrap">
      <section className="login-card card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <p className="eyebrow">Authentication</p>
            <h1>Sign In</h1>
          </div>
          <ThemeToggle />
        </div>
        <p>Login with admin-created username and password.</p>

        <form className="card form-grid" onSubmit={(event) => void handleSubmit(event)}>
          <input
            className="input"
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            placeholder="Username"
            autoComplete="username"
            required
          />
          <input
            className="input"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="Password"
            autoComplete="current-password"
            required
          />
          <button type="submit" className="button button-primary" disabled={loading}>
            {loading ? 'Signing in...' : 'Sign in'}
          </button>
        </form>

        {error ? <p style={{ color: 'var(--danger)' }}>{error}</p> : null}
      </section>
    </main>
  );
}
