import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

import { safeNextPath } from "@/lib/auth/redirect";
import { confirmationRedirect } from "@/lib/auth/recovery";
import { createClient } from "@/lib/supabase/server";

const emailOtpTypes = new Set<EmailOtpType>([
  "email",
  "email_change",
  "invite",
  "magiclink",
  "recovery",
  "signup",
]);

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const tokenHash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type") as EmailOtpType | null;
  const supabase = await createClient();

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (error) {
      return NextResponse.redirect(confirmationRedirect(request.url, false));
    }

    return NextResponse.redirect(
      new URL(safeNextPath(url.searchParams.get("next")), url.origin),
    );
  }

  if (!tokenHash || !type || !emailOtpTypes.has(type)) {
    return NextResponse.redirect(confirmationRedirect(request.url, false));
  }

  const { error } = await supabase.auth.verifyOtp({
    token_hash: tokenHash,
    type,
  });

  if (error) {
    return NextResponse.redirect(confirmationRedirect(request.url, false));
  }

  const destination =
    type === "recovery"
      ? new URL("/update-password", url.origin).toString()
      : confirmationRedirect(request.url, true);

  return NextResponse.redirect(destination);
}
