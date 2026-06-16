"use client";

export default function ProtectedError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <section className="status-card" role="alert">
      <p className="eyebrow">Something went wrong</p>
      <h1>We hit a snag</h1>
      <p>That didn’t load as expected. Please try again.</p>
      <button className="primary-button" onClick={reset} type="button">
        Try again
      </button>
    </section>
  );
}
