import { Suspense } from "react";
import { ResetPasswordForm } from "@/features/auth/components/ResetPasswordForm";

export const metadata = { title: "Reset password — Aheed Food Centre" };

export default function ResetPasswordPage() {
  return (
    <main className="mx-auto max-w-sm">
      <h1 className="mb-6 text-2xl font-semibold text-primary">Reset your password</h1>
      <Suspense>
        <ResetPasswordForm />
      </Suspense>
    </main>
  );
}
