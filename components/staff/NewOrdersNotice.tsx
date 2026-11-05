"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";

/**
 * "N new orders since you opened this page" on the staff Orders page (#1435 R23).
 *
 * The page refreshes itself every 30 seconds (`LiveRefresh`) and passes the order numbers currently
 * awaiting dispatch (`CONFIRMED`); this keeps the set it first saw and counts what is new since.
 * Client state survives `router.refresh()`, so the baseline holds until staff press Dismiss.
 *
 * The sound is off unless someone turns it on: an unexpected noise in a shop is worse than a missed
 * cue. The preference is a per-browser convenience in localStorage, every access guarded, so a
 * private window or blocked storage still renders the page.
 */

const SOUND_KEY = "staff-orders-sound";

function readSoundPreference(): boolean {
  try {
    return window.localStorage.getItem(SOUND_KEY) === "on";
  } catch {
    return false;
  }
}

/** Another tab changing the preference updates this one; the server render always says off. */
function subscribeSound(onChange: () => void): () => void {
  window.addEventListener("storage", onChange);
  return () => window.removeEventListener("storage", onChange);
}

function writeSoundPreference(on: boolean): void {
  try {
    window.localStorage.setItem(SOUND_KEY, on ? "on" : "off");
  } catch {
    // Storage unavailable: the toggle still works for this visit.
  }
}

/** A short, soft two-note tone through Web Audio — no audio file shipped. */
function playTone(): void {
  try {
    const Ctx =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const notes = [660, 880];
    notes.forEach((frequency, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.value = frequency;
      gain.gain.value = 0.08;
      osc.connect(gain).connect(ctx.destination);
      const start = ctx.currentTime + i * 0.18;
      osc.start(start);
      osc.stop(start + 0.15);
    });
    window.setTimeout(() => void ctx.close(), 800);
  } catch {
    // No audio available: the visible notice is the cue.
  }
}

export function NewOrdersNotice({ confirmedOrderNumbers }: { confirmedOrderNumbers: string[] }) {
  const [baseline, setBaseline] = useState(() => new Set(confirmedOrderNumbers));
  const stored = useSyncExternalStore(subscribeSound, readSoundPreference, () => false);
  const [chosen, setChosen] = useState<boolean | null>(null);
  const sound = chosen ?? stored;
  const previousCount = useRef(0);

  const count = confirmedOrderNumbers.filter((n) => !baseline.has(n)).length;

  useEffect(() => {
    if (count > previousCount.current && sound) playTone();
    previousCount.current = count;
  }, [count, sound]);

  function dismiss() {
    previousCount.current = 0;
    setBaseline(new Set(confirmedOrderNumbers));
  }

  function toggleSound(on: boolean) {
    setChosen(on);
    writeSoundPreference(on);
  }

  return (
    <div className="mb-4 flex flex-wrap items-center gap-3">
      {count > 0 && (
        <div
          role="status"
          className="flex items-center gap-3 rounded-2xl bg-accent-tint px-4 py-2 text-sm font-bold text-primary"
        >
          <span>
            {count} new {count === 1 ? "order" : "orders"} since you opened this page
          </span>
          <button
            type="button"
            onClick={dismiss}
            className="rounded-xl border border-black/10 bg-white px-3 py-1 text-xs font-bold text-primary"
          >
            Dismiss
          </button>
        </div>
      )}
      <label className="flex items-center gap-2 text-xs text-primary-muted">
        <input type="checkbox" checked={sound} onChange={(e) => toggleSound(e.target.checked)} />
        Sound for new orders
      </label>
    </div>
  );
}
