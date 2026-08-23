import Link from "next/link";
import { AuthForm } from "@/components/auth/AuthForm";
import { GoogleSignInButton } from "@/components/auth/GoogleSignInButton";
import { AuthPageShell } from "@/components/auth/AuthPageShell";
import { signUpWithPassword } from "@/lib/actions/auth";

export default function SignupPage() {
  return (
    <AuthPageShell title="Sign up">
      <AuthForm action={signUpWithPassword} submitLabel="Sign up" />
      <div className="flex items-center gap-3 text-xs text-muted-foreground">
        <span className="h-px flex-1 bg-border" />
        or
        <span className="h-px flex-1 bg-border" />
      </div>
      <GoogleSignInButton />
      <p className="text-center text-sm text-muted-foreground">
        Already have an account?{" "}
        <Link href="/login" className="text-primary underline-offset-4 hover:underline">
          Log in
        </Link>
      </p>
    </AuthPageShell>
  );
}
