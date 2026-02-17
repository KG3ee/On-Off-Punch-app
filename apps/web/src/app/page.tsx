import Link from 'next/link';

export default function HomePage() {
  return (
    <main className="landing">
      <section className="landing-card">
        <p className="eyebrow">Prototype</p>
        <h1>Modern Punch Dashboard</h1>
        <p>
          Web-only prototype with username/password login, duty tracking, and break policies.
        </p>
        <div className="landing-actions">
          <Link href="/login" className="button button-primary">
            Login
          </Link>
        </div>
      </section>
    </main>
  );
}
