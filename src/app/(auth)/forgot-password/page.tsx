import Link from "next/link";

import { requestPasswordReset } from "@/app/(auth)/recovery-actions";

type ForgotPasswordPageProps = {
  searchParams: Promise<{ message?: string }>;
};

export default async function ForgotPasswordPage({
  searchParams,
}: ForgotPasswordPageProps) {
  const { message } = await searchParams;

  return (
    <section className="auth-card">
      <div className="auth-heading">
        <p className="eyebrow">Account recovery</p>
        <h1>Reset password</h1>
        <p>Enter your email and we will send the next step.</p>
      </div>

      {message ? <p role="status">{message}</p> : null}

      <form action={requestPasswordReset} className="auth-form">
        <label>
          <span>Email</span>
          <input autoComplete="email" name="email" required type="email" />
        </label>
        <button className="primary-button" type="submit">
          Send reset link
        </button>
      </form>

      <div className="auth-footer">
        <Link href="/login">Back to sign in</Link>
      </div>
    </section>
  );
}
