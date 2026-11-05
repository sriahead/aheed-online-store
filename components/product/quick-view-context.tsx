"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { ProductDetail, ProductSummary } from "@/lib/repositories/products";
import type { ReviewSummary, ReviewInput } from "@/lib/repositories/reviews";

export interface QuickViewApiResponse {
  product: ProductDetail;
  reviews: ReviewSummary[];
  existingReview: ReviewInput | null;
  currentUser: { id: string; name: string } | null;
  cdnBaseUrl: string;
}

export interface QuickViewContextValue {
  isOpen: boolean;
  activeSlug: string | null;
  initialProduct: ProductSummary | null;
  initialCdnBaseUrl: string;
  openQuickView: (
    slug: string,
    initialProduct?: ProductSummary | null,
    cdnBaseUrl?: string,
  ) => void;
  closeQuickView: () => void;
  prefetchQuickView: (slug: string) => void;
  getCached: (slug: string) => QuickViewApiResponse | null;
  setCached: (slug: string, data: QuickViewApiResponse) => void;
  getInFlight: (slug: string) => Promise<QuickViewApiResponse | null> | null;
}

const defaultValue: QuickViewContextValue = {
  isOpen: false,
  activeSlug: null,
  initialProduct: null,
  initialCdnBaseUrl: "",
  openQuickView: () => {},
  closeQuickView: () => {},
  prefetchQuickView: () => {},
  getCached: () => null,
  setCached: () => {},
  getInFlight: () => null,
};

export const QuickViewContext = createContext<QuickViewContextValue>(defaultValue);

export function QuickViewProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const [activeSlug, setActiveSlug] = useState<string | null>(null);
  const [initialProduct, setInitialProduct] = useState<ProductSummary | null>(null);
  const [initialCdnBaseUrl, setInitialCdnBaseUrl] = useState<string>("");
  const cacheRef = useRef<Map<string, QuickViewApiResponse>>(new Map());
  const inFlightRef = useRef<Map<string, Promise<QuickViewApiResponse | null>>>(new Map());

  const getCached = useCallback((slug: string): QuickViewApiResponse | null => {
    return cacheRef.current.get(slug) ?? null;
  }, []);

  const setCached = useCallback((slug: string, data: QuickViewApiResponse) => {
    cacheRef.current.set(slug, data);
  }, []);

  const getInFlight = useCallback((slug: string): Promise<QuickViewApiResponse | null> | null => {
    return inFlightRef.current.get(slug) ?? null;
  }, []);

  const prefetchQuickView = useCallback((slug: string) => {
    if (!slug || cacheRef.current.has(slug) || inFlightRef.current.has(slug)) return;
    const promise = fetch(`/api/products/quick-view?slug=${encodeURIComponent(slug)}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => {
        if (json && typeof json === "object" && "product" in json) {
          cacheRef.current.set(slug, json as QuickViewApiResponse);
        }
        inFlightRef.current.delete(slug);
        return json as QuickViewApiResponse | null;
      })
      .catch(() => {
        inFlightRef.current.delete(slug);
        return null;
      });
    inFlightRef.current.set(slug, promise);
  }, []);

  const openQuickView = useCallback(
    (slug: string, initial?: ProductSummary | null, cdnBaseUrl?: string) => {
      setActiveSlug(slug);
      setInitialProduct(initial ?? null);
      setInitialCdnBaseUrl(cdnBaseUrl ?? "");
      setIsOpen(true);
    },
    [],
  );

  const closeQuickView = useCallback(() => {
    setIsOpen(false);
  }, []);

  const value = useMemo<QuickViewContextValue>(
    () => ({
      isOpen,
      activeSlug,
      initialProduct,
      initialCdnBaseUrl,
      openQuickView,
      closeQuickView,
      prefetchQuickView,
      getCached,
      setCached,
      getInFlight,
    }),
    [
      isOpen,
      activeSlug,
      initialProduct,
      initialCdnBaseUrl,
      openQuickView,
      closeQuickView,
      prefetchQuickView,
      getCached,
      setCached,
      getInFlight,
    ],
  );

  return <QuickViewContext.Provider value={value}>{children}</QuickViewContext.Provider>;
}

export function useQuickView(): QuickViewContextValue {
  return useContext(QuickViewContext);
}
