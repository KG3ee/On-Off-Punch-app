'use client';

import Link from 'next/link';
import { FormEvent, useState } from 'react';
import { apiFetch } from '@/lib/api';
import { MobileBlockedNotice, useIsMobileClient } from '@/components/mobile-block';

type RegisterRequestResult = {
  id: string;
  status: 'PENDING' | 'READY_REVIEW' | 'APPROVED' | 'REJECTED';
  verificationScore: number;
  verificationNotes?: string | null;
};

export default function RegisterPage() {
  const isMobile = useIsMobileClient();
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [staffCode, setStaffCode] = useState('');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<RegisterRequestResult | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setLoading(true);
    setError('');

    try {
      const response = await apiFetch<RegisterRequestResult>('/auth/register-request', {
        method: 'POST',
        skipAuth: true,
        body: JSON.stringify({
          firstName,
          lastName: lastName || undefined,
          displayName,
          username,
          password,
          staffCode,
        })
      });
      setResult(response);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Registration request failed');
    } finally {
      setLoading(false);
    }
  }

  if (isMobile) {
    return <MobileBlockedNotice title="Office desktop required" />;
  }

  return (
    <main className="login-wrap">
      <div className="login-card" style={{ maxWidth: 460 }}>
        <div className="login-header">
          <img src="/icon.svg" className="login-logo" alt="Punch" />
          <h1>Request an account</h1>
          <p>Submit your details — an admin will review and approve your account.</p>
        </div>

        {!result ? (
          <form className="form-grid" onSubmit={(event) => void submit(event)}>
            <div className="register-name-row" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.625rem' }}>
              <div className="form-field">
                <label>First name</label>
                <input className="input" value={firstName} onChange={(e) => setFirstName(e.target.value)} placeholder="First name" required />
              </div>
              <div className="form-field">
                <label>Last name</label>
                <input className="input" value={lastName} onChange={(e) => setLastName(e.target.value)} placeholder="Optional" />
              </div>
            </div>

            <div className="form-field">
              <label>Display name</label>
              <input className="input" value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="How your name appears" required />
            </div>

            <div className="form-field">
              <label>Username</label>
              <input className="input" value={username} onChange={(e) => setUsername(e.target.value)} placeholder="Choose a username" required />
            </div>

            <div className="form-field">
              <label>Password</label>
              <input className="input" type="password" minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Min. 6 characters" required />
            </div>

            <div className="form-field">
              <label>Staff code</label>
              <input className="input" value={staffCode} onChange={(e) => setStaffCode(e.target.value.toUpperCase())} placeholder="Your staff code" required />
            </div>

            {error ? <div className="alert alert-error">{error}</div> : null}

            <button
              type="submit"
              className="button button-primary"
              disabled={loading}
              style={{ width: '100%', justifyContent: 'center', padding: '0.625rem' }}
            >
              {loading ? 'Submitting…' : 'Submit request'}
            </button>
          </form>
        ) : (
          <div className="form-grid">
            <div className="alert alert-success">Request submitted successfully.</div>
            <div className="card" style={{ display: 'grid', gap: '0.5rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '0.8125rem', color: 'var(--muted)' }}>Status</span>
                <span className="tag brand">{result.status}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '0.8125rem', color: 'var(--muted)' }}>Verification score</span>
                <strong style={{ fontSize: '0.8125rem' }}>{result.verificationScore}</strong>
              </div>
              {result.verificationNotes ? (
                <p style={{ fontSize: '0.8125rem', paddingTop: '0.25rem', borderTop: '1px solid var(--line)' }}>{result.verificationNotes}</p>
              ) : null}
            </div>
            <p style={{ fontSize: '0.8125rem', color: 'var(--muted)' }}>You can sign in once an admin approves your account.</p>
          </div>
        )}

        <p style={{ fontSize: '0.8125rem', textAlign: 'center' }}>
          Already have an account?{' '}
          <Link href="/login" className="tag brand">Sign in</Link>
        </p>
      </div>
    </main>
  );
}
