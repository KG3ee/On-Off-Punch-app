import Link from 'next/link';

export default function HomePage() {
  return (
    <main className="landing">
      <div className="landing-card">
        <img src="/icon.svg" className="landing-logo" alt="Punch" />
        <div style={{ display: 'grid', gap: '0.5rem' }}>
          <h1>Punch Dashboard</h1>
          <p>
            Track duty sessions, manage breaks, and monitor your team — all in one place.
          </p>
        </div>
        <div className="landing-actions">
          <Link href="/login" className="button button-primary" style={{ padding: '0.5625rem 1.25rem' }}>
            Sign in
          </Link>
        </div>
      </div>
    </main>
  );
}
