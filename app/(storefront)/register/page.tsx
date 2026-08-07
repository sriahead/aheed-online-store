import { RegisterForm } from "@/features/auth/components/RegisterForm";

export const metadata = { title: "Create account — Aheed Food Centre" };

export default function RegisterPage() {
  return (
    <main className="mx-auto max-w-sm">
      <h1 className="mb-6 text-2xl font-semibold text-primary">Create account</h1>
      <RegisterForm />
    </main>
  );
}
