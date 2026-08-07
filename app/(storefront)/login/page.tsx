import { LoginForm } from "@/features/auth/components/LoginForm";

export const metadata = { title: "Sign in — Aheed Food Centre" };

export default function LoginPage() {
  return (
    <main className="mx-auto max-w-sm">
      <h1 className="mb-6 text-2xl font-semibold text-primary">Sign in</h1>
      <LoginForm />
    </main>
  );
}
