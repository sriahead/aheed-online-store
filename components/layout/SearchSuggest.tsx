"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";

/** Matches the shape `app/api/search/suggest/route.ts` returns. */
type Suggestions = {
  products: { slug: string; name: string; inStock: boolean }[];
  categories: { slug: string; name: string }[];
  terms: string[];
};

const EMPTY: Suggestions = { products: [], categories: [], terms: [] };

/**
 * Debounce before asking the server. Also the second of the route's cost bounds (the first being
 * its minimum term length): without it, one request per keystroke reaches the origin.
 */
const DEBOUNCE_MS = 220;

/** Mirrors `parseSearchQuery`'s floor (#572) — below this the route returns empty anyway. */
const MIN_QUERY_LENGTH = 2;

type Option = {
  kind: "product" | "category" | "term";
  label: string;
  href: string;
  /** Secondary text on the right of a row — only products carry one today. */
  note?: string;
};

/**
 * Coerce the route's reply into the shape this component renders.
 *
 * Defensive rather than cast, for the same reason `lib/list-normalisation.ts` parses its model
 * reply defensively: this is a network boundary, and a malformed or half-deployed response should
 * render no suggestions rather than throw inside a keystroke handler.
 */
function toSuggestions(value: unknown): Suggestions {
  if (typeof value !== "object" || value === null) return EMPTY;
  const raw = value as Partial<Suggestions>;
  return {
    products: Array.isArray(raw.products) ? raw.products : [],
    categories: Array.isArray(raw.categories) ? raw.categories : [],
    terms: Array.isArray(raw.terms) ? raw.terms : [],
  };
}

function toOptions(data: Suggestions): Option[] {
  return [
    ...data.products.map((p) => ({
      kind: "product" as const,
      label: p.name,
      href: `/products/${p.slug}`,
      note: p.inStock ? undefined : "Out of stock",
    })),
    ...data.categories.map((c) => ({
      kind: "category" as const,
      label: c.name,
      href: `/search?category=${encodeURIComponent(c.slug)}`,
    })),
    ...data.terms.map((t) => ({
      kind: "term" as const,
      label: t,
      href: `/search?q=${encodeURIComponent(t)}`,
    })),
  ];
}

/**
 * Search autocomplete (#568) — a client island inside the header's existing
 * `form method="GET" action="/search"`.
 *
 * PROGRESSIVE ENHANCEMENT IS THE CONSTRAINT, not a nice-to-have. The surrounding form is untouched
 * and still submits normally: with JavaScript off this renders as a plain text input and pressing
 * Enter navigates to `/search?q=…` exactly as before. Suggestions are strictly additive.
 *
 * Implements the ARIA combobox pattern rather than a div that looks like one — arrow keys traverse,
 * Enter chooses, Escape dismisses, and `aria-activedescendant` tells a screen reader which option is
 * current without moving DOM focus off the input. A suggestion list only a mouse can reach is not
 * finished work.
 */
export function SearchSuggest({
  placeholder,
  className = "",
}: {
  placeholder: string;
  className?: string;
}) {
  const router = useRouter();
  const [value, setValue] = useState("");
  const [data, setData] = useState<Suggestions>(EMPTY);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const listId = useId();
  const optionIdPrefix = useId();
  const abortRef = useRef<AbortController | null>(null);

  const trimmed = value.trim();
  const tooShort = trimmed.length < MIN_QUERY_LENGTH;

  /*
   * DERIVED, not stored. An earlier version cleared `data` from inside the effect when the query
   * got too short, which `react-hooks/set-state-in-effect` correctly rejects: a setState in an
   * effect body causes a cascading render, and CLAUDE.md records what happens when that rule is
   * worked around by fiddling with dependencies instead of removing the state (the cart drawer that
   * closed itself the instant it opened). There is no state to clear here — whether suggestions
   * apply is a function of what is currently in the box.
   */
  const options = tooShort ? [] : toOptions(data);

  useEffect(() => {
    if (trimmed.length < MIN_QUERY_LENGTH) return;

    const timer = setTimeout(() => {
      // Abort whatever is still in flight: on a fast typist every superseded response is both
      // wasted bandwidth and a chance to render suggestions for a query that is no longer in the
      // box, if responses arrive out of order.
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      fetch(`/api/search/suggest?q=${encodeURIComponent(trimmed)}`, {
        signal: controller.signal,
      })
        .then((res) => (res.ok ? res.json() : EMPTY))
        .then((json) => {
          setData(toSuggestions(json));
          setActiveIndex(-1);
        })
        .catch(() => {
          // An abort is the normal path here, and a genuine failure is not worth interrupting a
          // shopper mid-word for: the form still submits, which is the whole fallback.
        });
    }, DEBOUNCE_MS);

    return () => clearTimeout(timer);
    // Keyed on the TRIMMED query, so leading/trailing whitespace never costs a request.
  }, [trimmed]);

  const showList = open && options.length > 0;

  function choose(option: Option) {
    setOpen(false);
    router.push(option.href);
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape") {
      setOpen(false);
      setActiveIndex(-1);
      return;
    }
    if (!showList) return;

    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((i) => (i + 1) % options.length);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((i) => (i <= 0 ? options.length - 1 : i - 1));
    } else if (event.key === "Enter" && activeIndex >= 0) {
      // Only intercept Enter when an option is actually highlighted — otherwise the form submits,
      // which is the no-JS behaviour and the right default.
      event.preventDefault();
      choose(options[activeIndex]);
    }
  }

  return (
    <div className={`relative ${className}`}>
      <Search
        className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-black/40"
        aria-hidden
      />
      <input
        type="text"
        name="q"
        role="combobox"
        aria-expanded={showList}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={
          showList && activeIndex >= 0 ? `${optionIdPrefix}-${activeIndex}` : undefined
        }
        autoComplete="off"
        value={value}
        onChange={(e) => {
          setValue(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        // A click on a suggestion has to land before the list unmounts, and blur fires first.
        onBlur={() => setTimeout(() => setOpen(false), 120)}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        aria-label="Search products"
        className="w-full bg-surface-muted hover:bg-black/5 focus:bg-white pl-10 pr-4 py-2 rounded-xl text-sm border border-black/10 focus:border-primary focus:ring-2 focus:ring-primary/20 focus:outline-none transition"
      />

      <ul
        id={listId}
        role="listbox"
        aria-label="Search suggestions"
        hidden={!showList}
        className="absolute left-0 right-0 top-full z-50 mt-1 overflow-hidden rounded-xl border border-black/10 bg-white shadow-lg"
      >
        {options.map((option, index) => (
          <li
            key={`${option.kind}-${option.href}`}
            id={`${optionIdPrefix}-${index}`}
            role="option"
            aria-selected={index === activeIndex}
            onMouseDown={() => choose(option)}
            onMouseEnter={() => setActiveIndex(index)}
            className={`flex cursor-pointer items-center justify-between gap-3 px-4 py-2 text-sm ${
              index === activeIndex ? "bg-surface-muted" : "bg-white"
            }`}
          >
            <span className="truncate text-primary">{option.label}</span>
            <span className="shrink-0 text-xs text-primary/50">
              {option.note ?? (option.kind === "category" ? "Department" : undefined)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
