"use client";

import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";
import { HelpAssistant } from "@/components/assistant/HelpAssistant";

/**
 * The help assistant's open/closed state, shared by every control that can open it (#1060).
 *
 * Two controls open the same assistant: the one in `FloatingContact`'s disclosure and the one in
 * the storefront footer's channel row. The panel is mounted HERE, once, so opening it from either
 * place can never stack two dialogs. Each caller passes the element that opened it, and focus
 * returns to that element on close — the floating control or the footer button, whichever it was.
 *
 * `StorefrontChrome` wraps the storefront in this provider. `FloatingContact` supplies its own when
 * rendered outside one (its tests render it alone), so it never depends on being wrapped.
 */

interface AssistantLauncher {
  open: (trigger: HTMLElement | null) => void;
}

const AssistantLauncherContext = createContext<AssistantLauncher | null>(null);

/** The surrounding launcher, or `null` outside a provider. */
export function useAssistantLauncher(): AssistantLauncher | null {
  return useContext(AssistantLauncherContext);
}

export function AssistantLauncherProvider({
  vendorName,
  children,
}: {
  vendorName: string;
  children: ReactNode;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const trigger = useRef<HTMLElement | null>(null);

  const open = useCallback((element: HTMLElement | null) => {
    trigger.current = element;
    setIsOpen(true);
  }, []);

  function close() {
    setIsOpen(false);
    // Back to the control that opened it.
    trigger.current?.focus();
  }

  return (
    <AssistantLauncherContext.Provider value={{ open }}>
      {children}
      {/* Mounted only while open: each open is a fresh conversation (#1014). */}
      {isOpen && <HelpAssistant vendorName={vendorName} onClose={close} />}
    </AssistantLauncherContext.Provider>
  );
}
