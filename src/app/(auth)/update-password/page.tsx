import Link from "next/link";

import { updatePassword } from "@/app/(auth)/recovery-actions";

type UpdatePasswordPageProps = {
  searchParams: Promise<{ message?: string }>;
};

export default async function UpdatePasswordPage({
  searchParams,
}: UpdatePasswordPageProps) {
  const { message } = await searchParams;

  return (
    <section className="auth-card">
      <div className="auth-heading">
        <p className="eyebrow">Account recovery</p>
        <h1>Choose a new password</h1>
        <p>Use at least eight characters.</p>
      </div>

      {message ? <p role="alert">{message}</p> : null}

      <form action={updatePassword} className="auth-form">
        <label>
          <span>New password</span>
          <input
            autoComplete="new-password"
            minLength={8}
            name="password"
            required
            type="password"
          />
        </label>
        <label>
          <span>Confirm new password</span>
          <input
            autoComplete="new-password"
            minLength={8}
            name="passwordConfirmation"
            required
            type="password"
          />
        </label>
        <button className="primary-button" type="submit">
          Update password
        </button>
      </form>

      <div className="auth-footer">
        <Link href="/forgot-password">Request another reset link</Link>
      </div>
    </section>
  );
}
