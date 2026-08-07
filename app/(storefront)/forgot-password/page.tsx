import { ForgotPasswordForm } from "@/features/auth/components/ForgotPasswordForm";

export const metadata = { title: "Forgot password — Aheed Food Centre" };

export default function ForgotPasswordPage() {
  return (
    <main className="mx-auto max-w-sm">
      <h1 className="mb-6 text-2xl font-semibold text-primary">Forgot your password?</h1>
      <ForgotPasswordForm />
    </main>
  );
}
