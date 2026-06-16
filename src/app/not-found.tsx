import Link from "next/link";

export default function NotFound() {
  return (
    <main className="app-shell">
      <section className="status-card">
        <p className="eyebrow">404</p>
        <h1>Page not found</h1>
        <p>That page doesn’t exist or has moved.</p>
        <Link className="primary-button" href="/">
          Back to home
        </Link>
      </section>
    </main>
  );
}
