import Link from "next/link";

export default function CheckEmailPage() {
  return (
    <section className="auth-card">
      <div className="auth-heading">
        <p className="eyebrow">Check your inbox</p>
        <h1>Confirm your account</h1>
        <p>
          Open the confirmation link we sent you, then return here to sign in.
        </p>
      </div>
      <div className="auth-footer">
        <Link href="/login">Back to sign in</Link>
      </div>
    </section>
  );
}
