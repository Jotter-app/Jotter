import Link from "next/link";
import { AuthForm } from "@/components/auth/AuthForm";
import { GoogleSignInButton } from "@/components/auth/GoogleSignInButton";
import { AuthPageShell } from "@/components/auth/AuthPageShell";
import { signInWithPassword } from "@/lib/actions/auth";

export default function LoginPage() {
  return (
    <AuthPageShell title="Log in">
      <AuthForm action={signInWithPassword} submitLabel="Log in" />
      <div className="flex items-center gap-3 text-xs text-muted-foreground">
        <span className="h-px flex-1 bg-border" />
        or
        <span className="h-px flex-1 bg-border" />
      </div>
      <GoogleSignInButton />
      <p className="text-center text-sm text-muted-foreground">
        Don&apos;t have an account?{" "}
        <Link href="/signup" className="text-primary underline-offset-4 hover:underline">
          Sign up
        </Link>
      </p>
    </AuthPageShell>
  );
}
