"use client";

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import type { ProductSummary } from "@/lib/repositories/products";

export interface QuickViewContextValue {
  isOpen: boolean;
  activeSlug: string | null;
  initialProduct: ProductSummary | null;
  openQuickView: (slug: string, initialProduct?: ProductSummary | null) => void;
  closeQuickView: () => void;
}

const defaultValue: QuickViewContextValue = {
  isOpen: false,
  activeSlug: null,
  initialProduct: null,
  openQuickView: () => {},
  closeQuickView: () => {},
};

export const QuickViewContext = createContext<QuickViewContextValue>(defaultValue);

export function QuickViewProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const [activeSlug, setActiveSlug] = useState<string | null>(null);
  const [initialProduct, setInitialProduct] = useState<ProductSummary | null>(null);

  const openQuickView = useCallback((slug: string, initial?: ProductSummary | null) => {
    setActiveSlug(slug);
    setInitialProduct(initial ?? null);
    setIsOpen(true);
  }, []);

  const closeQuickView = useCallback(() => {
    setIsOpen(false);
  }, []);

  const value = useMemo<QuickViewContextValue>(
    () => ({
      isOpen,
      activeSlug,
      initialProduct,
      openQuickView,
      closeQuickView,
    }),
    [isOpen, activeSlug, initialProduct, openQuickView, closeQuickView],
  );

  return <QuickViewContext.Provider value={value}>{children}</QuickViewContext.Provider>;
}

export function useQuickView(): QuickViewContextValue {
  return useContext(QuickViewContext);
}
