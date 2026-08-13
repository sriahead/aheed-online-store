import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { ProductCard } from "./ProductCard";
import type { ProductSummary } from "@/lib/repositories/products";

interface ProductRowProps {
  title: string;
  products: ProductSummary[];
  cdnBaseUrl: string;
  viewAllLink?: string;
}

export function ProductRow({ title, products, cdnBaseUrl, viewAllLink }: ProductRowProps) {
  if (products.length === 0) return null;

  return (
    <section className="bg-white rounded-2xl border border-black/10 p-5 shadow-sm space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-primary">{title}</h2>
        {viewAllLink && (
          <Link
            href={viewAllLink}
            className="flex items-center gap-1 text-sm font-semibold text-accent hover:text-accent-hover transition-colors"
          >
            View all
            <ArrowRight className="w-4 h-4" />
          </Link>
        )}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
        {products.map((product) => (
          <ProductCard key={product.id} product={product} cdnBaseUrl={cdnBaseUrl} />
        ))}
      </div>
    </section>
  );
}
