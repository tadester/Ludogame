export default function Loading() {
  return (
    <section aria-busy="true" className="status-card">
      <span aria-hidden="true" className="spinner" />
      <h1>Loading…</h1>
      <p>One moment while we set things up.</p>
    </section>
  );
}
