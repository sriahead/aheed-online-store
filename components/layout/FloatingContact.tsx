"use client";

import { useState } from "react";
import { contactChannels } from "@/lib/contact-channels";
import { ContactChannelIcon } from "@/components/layout/contact-channel-icons";
import {
  AssistantLauncherProvider,
  useAssistantLauncher,
} from "@/components/assistant/AssistantLauncher";
import { Icon } from "@/components/icons/Icon";
import { Icon3D } from "@/components/icons/Icon3D";

/**
 * Floating per-vendor contact cluster (P9.2, #407 / #405).
 *
 * One always-visible trigger that expands to reveal whichever of WhatsApp, Instagram and Facebook
 * that vendor has configured. Each link renders only when its value is non-null; a `null` HIDES it
 * rather than falling back to a platform account (#239). A vendor with nothing configured renders
 * no trigger at all — an empty disclosure would advertise links that do not exist.
 *
 * When the help assistant is available (#1015), the direct WhatsApp link is NOT rendered (#1051):
 * shoppers reach WhatsApp through the assistant's handoff, after it has had the chance to answer.
 * With the assistant off, the direct link stays — it is then the only route to the store's WhatsApp.
 *
 * ## Why a disclosure rather than three floating buttons
 *
 * Three permanently-visible controls stacked above the cart button occupied a real share of a phone
 * viewport, and grew taller with every link a vendor added. Collapsing them behind one trigger keeps
 * the footprint fixed at a single button no matter how many links exist.
 *
 * **The links are closed by default and open ONLY on click.** Nothing about scrolling, hovering or
 * focusing opens them: a control that expands because the reader happened to scroll past is exactly
 * the pattern this replaced. The earlier revision hid and revealed the whole cluster on scroll
 * direction, and that behaviour is deliberately gone rather than layered underneath this one.
 *
 * ## Layout
 *
 * The trigger is the fixed anchor and the links are absolutely positioned ABOVE it, so a collapsed
 * panel occupies no layout space and the trigger never moves as it opens. The anchor sits above
 * `components/cart/CartDrawerShell.tsx`'s floating cart button, which occupies `bottom-6 right-6`
 * (`sm:bottom-8 sm:right-8`) and is unconditional — only its item-count badge is conditional, so it
 * is present on every storefront page including an empty cart.
 *
 * ## Accessibility
 *
 * A standard disclosure: `aria-expanded` on the trigger, `aria-controls` naming the panel, and an
 * accessible name that changes with state. The panel is not removed from the DOM while collapsed —
 * `pointer-events-none` plus `opacity-0` keeps it inert without the layout thrash of unmounting,
 * and `aria-hidden` keeps it out of the accessibility tree so a screen reader does not announce
 * links the sighted reader cannot see.
 *
 * ## One source for the channels (#1060)
 *
 * Which channels exist, their order, links and labels come from `contactChannels()` in
 * `lib/contact-channels.ts` — the same list the storefront footer's channel row renders — and the
 * icons from `components/layout/contact-channel-icons.tsx`. The panel reads that list top to bottom.
 * The help assistant itself is mounted once by `AssistantLauncherProvider`, shared with the footer.
 */

const LINK_CLASS =
  "flex h-11 w-11 items-center justify-center rounded-full bg-action text-white shadow-[0_8px_30px_rgb(0,0,0,0.2)] transition-transform hover:scale-105 motion-reduce:hover:scale-100 hover:bg-action-hover";

const PANEL_ID = "vendor-social-links";

interface FloatingContactProps {
  vendorName: string;
  facebookUrl: string | null;
  instagramUrl: string | null;
  whatsappNumber: string | null;
  whatsappCommunityUrl?: string | null;
  /**
   * #1015 — `assistantEnabled` and a WhatsApp number, computed by `StorefrontChrome` from the
   * profile it already loaded. When true, the disclosure gains a help-assistant control.
   */
  assistantAvailable: boolean;
}

export function FloatingContact(props: FloatingContactProps) {
  // Inside the storefront the chrome's provider is shared with the footer; rendered alone (tests,
  // any future surface) it brings its own, so the assistant still opens.
  if (useAssistantLauncher()) return <FloatingContactPanel {...props} />;
  return (
    <AssistantLauncherProvider vendorName={props.vendorName}>
      <FloatingContactPanel {...props} />
    </AssistantLauncherProvider>
  );
}

function FloatingContactPanel(props: FloatingContactProps) {
  const [open, setOpen] = useState(false);
  const launcher = useAssistantLauncher();
  const { vendorName } = props;

  const channels = contactChannels(props);
  if (channels.length === 0) return null;

  return (
    <div className="fixed bottom-24 right-6 z-50 sm:bottom-28 sm:right-8">
      <div className="relative">
        {/* Absolutely positioned so a collapsed panel takes no layout space and the
            trigger below never shifts as it opens. */}
        <div
          id={PANEL_ID}
          aria-hidden={!open}
          className={`absolute bottom-full right-0 mb-3 flex flex-col items-end gap-3 transition-all duration-200 ease-out motion-reduce:transition-none ${
            open
              ? "pointer-events-auto translate-y-0 opacity-100"
              : "pointer-events-none translate-y-2 opacity-0"
          }`}
        >
          {channels.map((channel) =>
            channel.href === null ? (
              <button
                key={channel.kind}
                type="button"
                // The disclosure stays open while the assistant is up, so this control is still
                // there for focus to return to on close.
                onClick={(event) => launcher?.open(event.currentTarget)}
                aria-label={channel.label}
                aria-haspopup="dialog"
                tabIndex={open ? undefined : -1}
                className={LINK_CLASS}
              >
                <ContactChannelIcon kind={channel.kind} />
              </button>
            ) : (
              <a
                key={channel.kind}
                href={channel.href}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={channel.label}
                tabIndex={open ? undefined : -1}
                className={LINK_CLASS}
              >
                <ContactChannelIcon kind={channel.kind} />
              </a>
            ),
          )}
        </div>

        <button
          type="button"
          onClick={() => setOpen((wasOpen) => !wasOpen)}
          aria-expanded={open}
          aria-controls={PANEL_ID}
          aria-label={open ? "Hide contact links" : `Contact and follow ${vendorName}`}
          title={open ? "Close contact options" : "Contact & Follow Hub"}
          className="flex h-12 w-12 items-center justify-center rounded-full bg-action text-white shadow-[0_8px_30px_rgb(0,0,0,0.2)] transition-transform hover:scale-105 motion-reduce:hover:scale-100 hover:bg-action-hover"
        >
          {open ? (
            <Icon name="x" className="h-5 w-5" />
          ) : (
            <Icon3D name="contact-follow" dataIcon="users" size={38} className="-my-0.5" />
          )}
        </button>
      </div>
    </div>
  );
}
