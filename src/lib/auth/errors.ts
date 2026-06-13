type AuthErrorLike = {
  readonly code?: string;
};

export function signUpErrorMessage(error: AuthErrorLike) {
  if (error.code === "over_email_send_rate_limit") {
    return "The email service has reached its temporary limit. Wait a few minutes and try again.";
  }

  return "Unable to create the account. Check your details and try again.";
}
