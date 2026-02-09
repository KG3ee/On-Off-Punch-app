import Link from 'next/link';

export default function HomePage() {
  return (
    <main className="landing">
      <section className="landing-card">
        <p className="eyebrow">Prototype</p>
        <h1>Modern Punch Dashboard</h1>
        <p>
          Web-only prototype with username/password login, split-shift duty tracking, break policies,
          salary calculation, and monthly snapshots.
        </p>
        <div className="landing-actions">
          <Link href="/login" className="button button-primary">
            Login
          </Link>
          <Link href="/employee/dashboard" className="button button-ghost">
            Employee View
          </Link>
          <Link href="/admin/live" className="button button-ghost">
            Admin Live Board
          </Link>
        </div>
      </section>
    </main>
  );
}
