'use client';

import Link from 'next/link';
import { FormEvent, useState } from 'react';
import { apiFetch } from '@/lib/api';

type RegisterRequestResult = {
  id: string;
  status: 'PENDING' | 'READY_REVIEW' | 'APPROVED' | 'REJECTED';
  verificationScore: number;
  verificationNotes?: string | null;
};

export default function RegisterPage() {
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [staffCode, setStaffCode] = useState('');
  const [phoneLast4, setPhoneLast4] = useState('');
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
          phoneLast4
        })
      });
      setResult(response);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Registration request failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="login-wrap">
      <section className="login-card card">
        <div>
          <p className="eyebrow">Employee Self-Registration</p>
          <h1>Request Account</h1>
        </div>
        <p>Submit your details. Admin will review and approve your account.</p>

        {!result ? (
          <form className="card form-grid" onSubmit={(event) => void submit(event)}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
              <input className="input" value={firstName} onChange={(e) => setFirstName(e.target.value)} placeholder="First name" required />
              <input className="input" value={lastName} onChange={(e) => setLastName(e.target.value)} placeholder="Last name (optional)" />
            </div>
            <input className="input" value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="Display name" required />
            <input className="input" value={username} onChange={(e) => setUsername(e.target.value)} placeholder="Desired username" required />
            <input className="input" type="password" minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Password" required />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
              <input className="input" value={staffCode} onChange={(e) => setStaffCode(e.target.value.toUpperCase())} placeholder="Staff code" required />
              <input className="input" value={phoneLast4} onChange={(e) => setPhoneLast4(e.target.value.replace(/\D/g, '').slice(0, 4))} placeholder="Phone last 4 digits" required />
            </div>
            <button type="submit" className="button button-primary" disabled={loading}>
              {loading ? 'Submitting...' : 'Submit Request'}
            </button>
          </form>
        ) : (
          <div className="card form-grid">
            <div className="alert alert-success">Request submitted successfully.</div>
            <p>Status: <strong>{result.status}</strong></p>
            <p>Verification score: <strong>{result.verificationScore}</strong></p>
            {result.verificationNotes ? <p>{result.verificationNotes}</p> : null}
            <p>You can login after admin approval.</p>
          </div>
        )}

        {error ? <p style={{ color: 'var(--danger)' }}>{error}</p> : null}

        <p style={{ marginTop: '0.35rem' }}>
          Already have an account? <Link href="/login" className="tag brand">Back to Login</Link>
        </p>
      </section>
    </main>
  );
}
