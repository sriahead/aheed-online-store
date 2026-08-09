import { resolveMergeAction } from "@/features/cart/actions";

/**
 * Shown when signing in brings a guest cart and a saved cart together and BOTH
 * hold items (P3a, #93). Two carts are never silently combined — the shopper
 * chooses, and nothing is destroyed until they do.
 *
 * This is also what makes the shared-device case safe: someone signing in on a
 * borrowed browser is asked about the stranger's basket instead of inheriting it.
 *
 * No option is pre-selected or auto-applied.
 */
export function MergePrompt({
  savedItemCount,
  guestItemCount,
}: {
  savedItemCount: number;
  guestItemCount: number;
}) {
  const options = [
    {
      value: "COMBINE",
      title: "Combine them",
      detail: `Keep everything — quantities are added up (capped at what's in stock).`,
      primary: true,
    },
    {
      value: "KEEP_SAVED",
      title: "Keep my saved cart",
      detail: `Keep the ${savedItemCount} item${savedItemCount === 1 ? "" : "s"} saved to your account; discard the newer ones.`,
      primary: false,
    },
    {
      value: "KEEP_NEW",
      title: "Keep only the new items",
      detail: `Keep the ${guestItemCount} item${guestItemCount === 1 ? "" : "s"} added while signed out; discard the saved cart.`,
      primary: false,
    },
  ];

  return (
    <section
      aria-labelledby="merge-prompt-heading"
      className="mb-6 rounded-2xl border border-accent/40 bg-accent-tint p-4"
    >
      <h2 id="merge-prompt-heading" className="text-sm font-bold text-primary">
        You have two carts
      </h2>
      <p className="mt-1 text-xs text-primary/70">
        Your account has a saved cart with{" "}
        <strong className="font-semibold">
          {savedItemCount} item{savedItemCount === 1 ? "" : "s"}
        </strong>
        , and{" "}
        <strong className="font-semibold">
          {guestItemCount} item{guestItemCount === 1 ? "" : "s"}
        </strong>{" "}
        were added before you signed in. What would you like to do?
      </p>

      <div className="mt-3 grid gap-2 sm:grid-cols-3">
        {options.map((option) => (
          <form
            key={option.value}
            action={async () => {
              "use server";
              await resolveMergeAction(option.value);
            }}
          >
            <button
              type="submit"
              className={`flex h-full w-full flex-col gap-1 rounded-xl border p-3 text-left transition ${
                option.primary
                  ? "border-primary bg-primary text-white"
                  : "border-black/10 bg-white text-primary hover:border-primary/40"
              }`}
            >
              <span className="text-xs font-bold">{option.title}</span>
              <span
                className={`text-[11px] ${option.primary ? "text-white/80" : "text-primary/60"}`}
              >
                {option.detail}
              </span>
            </button>
          </form>
        ))}
      </div>
    </section>
  );
}
