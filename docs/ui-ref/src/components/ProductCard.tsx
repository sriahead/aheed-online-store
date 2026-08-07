import React from 'react';
import { Product } from '../types';
import { Star, Plus, Check } from 'lucide-react';

interface ProductCardProps {
  product: Product;
  onSelect: (product: Product) => void;
  onAddToCart: (product: Product, e: React.MouseEvent) => void;
  isInCart?: boolean;
}

export const ProductCard: React.FC<ProductCardProps> = ({
  product,
  onSelect,
  onAddToCart,
  isInCart = false,
}) => {
  return (
    <div
      id={`product-card-${product.id}`}
      onClick={() => onSelect(product)}
      className="group relative bg-white rounded-2xl border border-slate-200/80 hover:border-emerald-500/50 hover:shadow-xl transition-all duration-300 flex flex-col overflow-hidden cursor-pointer h-full"
    >
      {/* Top badges */}
      <div className="absolute top-2.5 left-2.5 z-10 flex flex-wrap gap-1">
        {product.isHalal && (
          <span className="bg-[#1B5E20] text-white text-[10px] font-semibold px-2 py-0.5 rounded-full shadow-sm flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-300"></span>
            Halal
          </span>
        )}
        {product.isFresh && (
          <span className="bg-emerald-500 text-white text-[10px] font-semibold px-2 py-0.5 rounded-full shadow-sm">
            Fresh
          </span>
        )}
        {product.isOffer && (
          <span className="bg-[#F57C00] text-white text-[10px] font-semibold px-2 py-0.5 rounded-full shadow-sm">
            Offer
          </span>
        )}
      </div>

      {/* Image container */}
      <div className="relative aspect-4/3 w-full bg-slate-50 overflow-hidden">
        <img
          src={product.image}
          alt={product.name}
          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
          loading="lazy"
        />
        {product.originalPrice && (
          <div className="absolute bottom-2 right-2 bg-red-600 text-white text-[11px] font-bold px-1.5 py-0.5 rounded">
            Save £{(product.originalPrice - product.price).toFixed(2)}
          </div>
        )}
      </div>

      {/* Content */}
      <div className="p-3.5 flex flex-col flex-1 justify-between">
        <div>
          {/* Rating & Origin */}
          <div className="flex items-center justify-between text-xs text-slate-500 mb-1">
            <div className="flex items-center gap-1">
              <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
              <span className="font-medium text-slate-700">{product.rating.toFixed(1)}</span>
              <span className="text-slate-400">({product.reviewCount})</span>
            </div>
            {product.origin && (
              <span className="text-[11px] text-slate-400 truncate max-w-[100px]" title={product.origin}>
                {product.origin}
              </span>
            )}
          </div>

          {/* Title */}
          <h3 className="font-semibold text-slate-900 text-sm group-hover:text-[#1B5E20] transition-colors line-clamp-2 leading-tight">
            {product.name}
          </h3>

          <p className="text-xs text-slate-500 mt-0.5">{product.unit}</p>
        </div>

        {/* Price & Add Button */}
        <div className="mt-3 flex items-center justify-between pt-2 border-t border-slate-100">
          <div>
            <div className="flex items-baseline gap-1.5">
              <span className="text-base font-bold text-[#1B5E20]">
                £{product.price.toFixed(2)}
              </span>
              {product.originalPrice && (
                <span className="text-xs text-slate-400 line-through">
                  £{product.originalPrice.toFixed(2)}
                </span>
              )}
            </div>
          </div>

          <button
            id={`add-to-cart-btn-${product.id}`}
            type="button"
            onClick={(e) => onAddToCart(product, e)}
            className={`flex items-center justify-center p-2 rounded-xl transition-all duration-200 active:scale-95 ${
              isInCart
                ? 'bg-emerald-600 text-white shadow-md'
                : 'bg-[#1B5E20] hover:bg-emerald-800 text-white shadow-sm hover:shadow'
            }`}
            title={isInCart ? 'Added to Cart' : 'Add to Cart'}
          >
            {isInCart ? <Check className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
          </button>
        </div>
      </div>
    </div>
  );
};
