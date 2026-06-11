import Link from "next/link";

import { signIn } from "@/app/(auth)/actions";
import { AuthForm } from "@/components/auth-form";
import { safeNextPath } from "@/lib/auth/redirect";

type LoginPageProps = {
  searchParams: Promise<{ message?: string; next?: string }>;
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const params = await searchParams;
  const nextPath = safeNextPath(params.next ?? null);

  return (
    <AuthForm
      action={signIn}
      description="Sign in to play locally or with friends."
      footer={
        <>
          <Link href="/forgot-password">Forgot password?</Link>
          <span>
            New player? <Link href="/signup">Create an account</Link>
          </span>
        </>
      }
      message={params.message}
      nextPath={nextPath}
      submitLabel="Sign in"
      title="Welcome back"
    />
  );
}
