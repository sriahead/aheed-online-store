import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { ChevronLeft, ChevronRight, ListChecks, Trash2 } from "lucide-react";
import { getAuth } from "@/lib/auth";
import { getShoppingListService } from "@/lib/shopping-lists-service";
import { deleteList } from "@/features/lists/delete-list";
import { renameList } from "@/features/lists/rename-list";
import { MAX_LIST_NAME_LENGTH, MAX_SAVED_LISTS } from "@/lib/saved-list";

/**
 * Saved shopping lists (P10, #116).
 *
 * Reads the session and the shopper's own rows — must render per-request, same as
 * /account/orders.
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Your lists" };

export default async function AccountListsPage() {
  const session = await (await getAuth()).api.getSession({ headers: await headers() });
  if (!session?.user) {
    redirect("/login");
  }

  const lists = await getShoppingListService().list();

  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-8">
      <Link
        href="/account"
        className="mb-4 inline-flex items-center gap-1 text-sm text-primary-muted hover:text-primary"
      >
        <ChevronLeft className="h-4 w-4" aria-hidden />
        Your account
      </Link>

      <h1 className="text-xl font-bold text-primary">Your lists</h1>
      <p className="mt-1 mb-6 text-sm text-primary-muted">
        A saved list keeps your words, not the products — so it matches whatever we have in on the
        day you open it.
      </p>

      {lists.length === 0 ? (
        <div className="rounded-2xl border border-black/10 bg-surface-muted p-5">
          <p className="text-sm font-semibold text-primary">You have no saved lists yet.</p>
          <p className="mt-1 text-sm text-primary-muted">
            Paste a list on{" "}
            <Link href="/shop-your-list" className="font-semibold text-primary underline">
              Shop your list
            </Link>
            , or save your cart or a past order as a list.
          </p>
        </div>
      ) : (
        <ul className="space-y-3">
          {lists.map((list) => (
            <li key={list.id} className="rounded-2xl border border-black/10 bg-surface-muted p-4">
              <Link
                href={`/account/lists/${list.id}`}
                className="flex items-center justify-between gap-3"
              >
                <span className="flex min-w-0 items-center gap-2">
                  <ListChecks className="h-5 w-5 shrink-0 text-primary" aria-hidden />
                  <span className="min-w-0">
                    <span className="block truncate font-semibold text-primary">{list.name}</span>
                    <span className="block text-xs text-primary-muted">
                      {list.itemCount} item{list.itemCount === 1 ? "" : "s"}
                    </span>
                  </span>
                </span>
                <ChevronRight className="h-5 w-5 shrink-0 text-primary-subtle" aria-hidden />
              </Link>

              {/*
                Two sibling forms, never nested — HTML forbids nesting and the second would not
                submit. Both are server actions, so both work without client JS.
              */}
              <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-black/10 pt-3">
                <form action={renameList} className="flex min-w-0 flex-1 gap-2">
                  <input type="hidden" name="listId" value={list.id} />
                  <input
                    name="name"
                    type="text"
                    defaultValue={list.name}
                    maxLength={MAX_LIST_NAME_LENGTH}
                    aria-label={`Rename "${list.name}"`}
                    className="min-w-0 flex-1 rounded-xl border border-black/10 bg-white p-2 text-xs font-semibold text-primary focus-visible:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-action focus-visible:ring-offset-2"
                  />
                  <button
                    type="submit"
                    className="shrink-0 rounded-xl bg-primary px-3 py-2 text-xs font-bold text-white"
                  >
                    Rename
                  </button>
                </form>

                <form action={deleteList}>
                  <input type="hidden" name="listId" value={list.id} />
                  <button
                    type="submit"
                    aria-label={`Delete "${list.name}"`}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-black/10 bg-white px-3 py-2 text-xs font-bold text-danger"
                  >
                    <Trash2 className="h-3.5 w-3.5" aria-hidden />
                    Delete
                  </button>
                </form>
              </div>
            </li>
          ))}
        </ul>
      )}

      {lists.length >= MAX_SAVED_LISTS && (
        <p className="mt-4 text-xs font-semibold text-danger">
          You have reached the limit of {MAX_SAVED_LISTS} saved lists. Delete one to save another.
        </p>
      )}
    </main>
  );
}
