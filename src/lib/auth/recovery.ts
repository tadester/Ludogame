export function confirmationRedirect(requestUrl: string, success: boolean) {
  const url = new URL(requestUrl);

  if (success) {
    return new URL("/", url.origin).toString();
  }

  const destination = new URL("/login", url.origin);
  destination.searchParams.set("message", "invalid-confirmation");
  return destination.toString();
}

export function passwordRecoveryRedirect(siteUrl: string) {
  const destination = new URL("/auth/confirm", siteUrl);
  destination.searchParams.set("next", "/update-password");
  return destination.toString();
}
