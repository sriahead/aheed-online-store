import Link from "next/link";
import { getCategoryRepository } from "@/lib/repositories/categories";

// Without this, Next's build-time static optimization tries to prerender this
// page in plain Node — but lib/db.ts loads Prisma via @prisma/client/wasm,
// which only works in the Workers runtime, so `next build` hard-fails trying
// to run it. Same root cause as P1b's /login and /register fix.
export const dynamic = "force-dynamic";

export const metadata = { title: "Categories — Aheed Food Centre" };

export default async function CategoriesPage() {
  try {
    const categories = await getCategoryRepository().listTopLevel();

    return (
      <main className="mx-auto max-w-3xl">
        <h1 className="mb-6 text-2xl font-semibold text-primary">Categories</h1>
        <ul className="flex flex-col gap-2">
          {categories.map((category) => (
            <li key={category.id}>
              <Link
                href={`/categories/${category.slug}`}
                className="flex items-center justify-between rounded-xl bg-surface p-4 shadow-sm transition hover:scale-[1.01] hover:shadow-md"
              >
                <span className="font-semibold text-primary">{category.name}</span>
                <span className="text-primary/50 text-sm">View products →</span>
              </Link>
            </li>
          ))}
        </ul>
      </main>
    );
  } catch (error: any) {
    return (
      <main className="mx-auto max-w-3xl">
        <h1 className="mb-6 text-2xl font-semibold text-danger">Server Error on Categories</h1>
        <pre className="rounded-xl bg-surface-muted p-4 text-xs overflow-auto text-primary">
          {error?.stack || error?.message || String(error)}
        </pre>
      </main>
    );
  }
}
