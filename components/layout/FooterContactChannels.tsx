"use client";

import type { ContactChannel } from "@/lib/contact-channels";
import { ContactChannelIcon } from "@/components/layout/contact-channel-icons";
import { useAssistantLauncher } from "@/components/assistant/AssistantLauncher";

/**
 * The storefront footer's row of contact-channel buttons (#1060).
 *
 * Renders exactly the list `contactChannels()` produced for `FloatingContact` — same channels, same
 * order, same links, labels and icons — as 44px circles. A client component only because the help
 * assistant's button opens the shared `AssistantLauncherProvider` panel; every other channel is a
 * plain link. An empty list renders nothing.
 */

const BUTTON =
  "flex size-tap items-center justify-center rounded-full border border-[var(--footer-text)] hover:bg-[var(--footer-text)] hover:text-[var(--footer-bg)]";

export function FooterContactChannels({ channels }: { channels: ContactChannel[] }) {
  const launcher = useAssistantLauncher();
  if (channels.length === 0) return null;

  return (
    <ul aria-label="Contact us" className="mt-4 flex flex-wrap gap-3">
      {channels.map((channel) => (
        <li key={channel.kind}>
          {channel.href === null ? (
            <button
              type="button"
              onClick={(event) => launcher?.open(event.currentTarget)}
              aria-label={channel.label}
              aria-haspopup="dialog"
              className={BUTTON}
            >
              <ContactChannelIcon kind={channel.kind} />
            </button>
          ) : (
            <a
              href={channel.href}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={channel.label}
              className={BUTTON}
            >
              <ContactChannelIcon kind={channel.kind} />
            </a>
          )}
        </li>
      ))}
    </ul>
  );
}
