import type { ReactNode } from "react";

type AuthFormProps = {
  action: (formData: FormData) => void | Promise<void>;
  description: string;
  footer?: ReactNode;
  message?: string;
  mode?: "signin" | "signup";
  nextPath?: string;
  submitLabel: string;
  title: string;
};

export function AuthForm({
  action,
  description,
  footer,
  message,
  mode = "signin",
  nextPath,
  submitLabel,
  title,
}: AuthFormProps) {
  const isSignUp = mode === "signup";

  return (
    <section className="auth-card">
      <div className="auth-heading">
        <p className="eyebrow">Ludo account</p>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>

      {message ? <p role="alert">{message}</p> : null}

      <form action={action} className="auth-form">
        {nextPath ? <input name="next" type="hidden" value={nextPath} /> : null}

        {isSignUp ? (
          <>
            <label>
              <span>Display name</span>
              <input
                autoComplete="name"
                maxLength={40}
                name="displayName"
                required
              />
            </label>
            <label>
              <span>Username (optional)</span>
              <input
                autoCapitalize="none"
                autoComplete="username"
                maxLength={24}
                minLength={3}
                name="username"
                pattern="[A-Za-z0-9_]+"
              />
            </label>
          </>
        ) : null}

        <label>
          <span>Email</span>
          <input autoComplete="email" name="email" required type="email" />
        </label>
        <label>
          <span>Password</span>
          <input
            autoComplete={isSignUp ? "new-password" : "current-password"}
            minLength={8}
            name="password"
            required
            type="password"
          />
        </label>

        {isSignUp ? (
          <label>
            <span>Confirm password</span>
            <input
              autoComplete="new-password"
              minLength={8}
              name="passwordConfirmation"
              required
              type="password"
            />
          </label>
        ) : null}

        <button className="primary-button" type="submit">
          {submitLabel}
        </button>
      </form>

      {footer ? <div className="auth-footer">{footer}</div> : null}
    </section>
  );
}
