import Link from "next/link";
import { getCategoryRepository } from "@/lib/categories-service";

// Without this, Next's build-time static optimization tries to prerender this
// page in plain Node — but lib/db.ts loads Prisma via @prisma/client/wasm,
// which only works in the Workers runtime, so `next build` hard-fails trying
// to run it. Same root cause as P1b's /login and /register fix.
export const dynamic = "force-dynamic";

export const metadata = { title: "Categories — Aheed Food Centre" };

export default async function CategoriesPage() {
  const categories = await getCategoryRepository().listTopLevel();

  return (
    <main className="mx-auto max-w-3xl">
      <h1 className="mb-6 text-2xl font-semibold text-primary">Categories</h1>
      <ul className="flex flex-col gap-2">
        {categories.map((category) => (
          <li key={category.id}>
            <Link
              href={`/categories/${category.slug}`}
              className="block rounded-md border border-black/10 p-4 font-semibold text-primary hover:border-black/20"
            >
              {category.name}
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
