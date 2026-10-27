"use client";

import { createContext, useContext, type ReactNode } from "react";

const ActiveSlotIconsContext = createContext<Record<string, string>>({});

export function ActiveSlotIconsProvider({
  initialIcons = {},
  children,
}: {
  initialIcons?: Record<string, string>;
  children: ReactNode;
}) {
  return (
    <ActiveSlotIconsContext.Provider value={initialIcons}>
      {children}
    </ActiveSlotIconsContext.Provider>
  );
}

export function useActiveSlotIcons(): Record<string, string> {
  return useContext(ActiveSlotIconsContext);
}
