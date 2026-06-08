export type ValidationResult<T> =
  | { ok: true; value: T }
  | { ok: false; message: string };

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const usernamePattern = /^[a-z0-9_]{3,24}$/;

function text(data: FormData, key: string) {
  const value = data.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function validateEmailPassword(data: FormData): ValidationResult<{
  email: string;
  password: string;
}> {
  const email = text(data, "email").toLowerCase();
  const passwordValue = data.get("password");
  const password = typeof passwordValue === "string" ? passwordValue : "";

  if (!emailPattern.test(email)) {
    return { ok: false, message: "Enter a valid email address." };
  }

  if (password.length < 8) {
    return { ok: false, message: "Password must be at least 8 characters." };
  }

  return { ok: true, value: { email, password } };
}

export function validateProfile(data: FormData): ValidationResult<{
  displayName: string;
  username: string | null;
}> {
  const displayName = text(data, "displayName");
  const username = text(data, "username").toLowerCase() || null;

  if (displayName.length < 1 || displayName.length > 40) {
    return {
      ok: false,
      message: "Display name must be between 1 and 40 characters.",
    };
  }

  if (username && !usernamePattern.test(username)) {
    return {
      ok: false,
      message:
        "Username must be 3-24 characters using only letters, numbers, or underscores.",
    };
  }

  return { ok: true, value: { displayName, username } };
}

export function validateSignIn(data: FormData) {
  return validateEmailPassword(data);
}

export function validateSignUp(data: FormData): ValidationResult<{
  email: string;
  password: string;
  displayName: string;
  username: string | null;
}> {
  const credentials = validateEmailPassword(data);
  if (!credentials.ok) {
    return credentials;
  }

  const passwordConfirmationValue = data.get("passwordConfirmation");
  const passwordConfirmation =
    typeof passwordConfirmationValue === "string"
      ? passwordConfirmationValue
      : "";

  if (credentials.value.password !== passwordConfirmation) {
    return { ok: false, message: "Passwords do not match." };
  }

  const profile = validateProfile(data);
  if (!profile.ok) {
    return profile;
  }

  return {
    ok: true,
    value: {
      ...credentials.value,
      ...profile.value,
    },
  };
}

export function validatePasswordReset(
  data: FormData,
): ValidationResult<{ email: string }> {
  const email = text(data, "email").toLowerCase();

  if (!emailPattern.test(email)) {
    return { ok: false, message: "Enter a valid email address." };
  }

  return { ok: true, value: { email } };
}

export function validateNewPassword(
  data: FormData,
): ValidationResult<{ password: string }> {
  const passwordValue = data.get("password");
  const confirmationValue = data.get("passwordConfirmation");
  const password = typeof passwordValue === "string" ? passwordValue : "";
  const confirmation =
    typeof confirmationValue === "string" ? confirmationValue : "";

  if (password.length < 8) {
    return { ok: false, message: "Password must be at least 8 characters." };
  }

  if (password !== confirmation) {
    return { ok: false, message: "Passwords do not match." };
  }

  return { ok: true, value: { password } };
}
