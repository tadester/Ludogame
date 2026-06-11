import Link from "next/link";

import { signUp } from "@/app/(auth)/actions";
import { AuthForm } from "@/components/auth-form";

type SignUpPageProps = {
  searchParams: Promise<{ message?: string }>;
};

export default async function SignUpPage({ searchParams }: SignUpPageProps) {
  const params = await searchParams;

  return (
    <AuthForm
      action={signUp}
      description="Create the account that owns your games and preferences."
      footer={
        <span>
          Already registered? <Link href="/login">Sign in</Link>
        </span>
      }
      message={params.message}
      mode="signup"
      submitLabel="Create account"
      title="Create your player"
    />
  );
}
