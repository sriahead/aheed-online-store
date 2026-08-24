import React from 'react';
import { Product, CartItem } from '../types';
import { Star, Plus, Minus, Heart, Scale, Sparkles, AlertTriangle, ArrowUpRight } from 'lucide-react';

interface ProductCardProps {
  product: Product;
  onSelect: (product: Product) => void;
  onAddToCart: (product: Product, e: React.MouseEvent) => void;
  onUpdateCartQuantity?: (productId: string, delta: number, e: React.MouseEvent) => void;
  cartItem?: CartItem;
  isWishlisted?: boolean;
  onToggleWishlist?: (productId: string, e: React.MouseEvent) => void;
}

export const ProductCard: React.FC<ProductCardProps> = ({
  product,
  onSelect,
  onAddToCart,
  onUpdateCartQuantity,
  cartItem,
  isWishlisted = false,
  onToggleWishlist,
}) => {
  const isOutOfStock = !product.isAvailable || product.stockCount <= 0;
  const isLowStock = product.isAvailable && product.stockCount > 0 && product.stockCount <= 5;
  const inCartQty = cartItem?.quantity || 0;

  return (
    <div className="skew-product-card-wrap h-full">
      <div
        id={`product-card-${product.id}`}
        onClick={() => onSelect(product)}
        className="skew-product-card group bg-white rounded-2xl border border-slate-200/90 hover:border-emerald-500 flex flex-col overflow-hidden cursor-pointer h-full shadow-xs"
      >
        {/* Top Badges & Wishlist */}
        <div className="absolute top-2.5 left-2.5 right-2.5 z-10 flex items-start justify-between pointer-events-none">
          <div className="flex flex-col gap-1 items-start max-w-[80%]">
            {product.isHalal && (
              <span className="skew-badge bg-[#1B5E20] text-white text-[10px] font-bold px-2 py-0.5 rounded-md shadow-xs flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-300"></span>
                100% Halal
              </span>
            )}
            {product.isFresh && (
              <span className="skew-badge bg-emerald-600 text-white text-[10px] font-semibold px-2 py-0.5 rounded-md shadow-xs">
                Daily Fresh
              </span>
            )}
            {product.isOffer && (
              <span className="skew-badge bg-[#F57C00] text-white text-[10px] font-bold px-2 py-0.5 rounded-md shadow-xs">
                Special Offer
              </span>
            )}
            {product.multiBuyPromo && (
              <span className="skew-badge bg-purple-700 text-white text-[10px] font-bold px-2 py-0.5 rounded-md shadow-xs flex items-center gap-0.5">
                <Sparkles className="w-2.5 h-2.5" />
                {product.multiBuyPromo.promoLabel}
              </span>
            )}
          </div>

          {/* Wishlist Button */}
          {onToggleWishlist && (
            <button
              type="button"
              onClick={(e) => onToggleWishlist(product.id, e)}
              className={`pointer-events-auto p-1.5 rounded-full backdrop-blur-md transition-transform active:scale-90 shadow-sm ${
                isWishlisted
                  ? 'bg-rose-50 text-rose-500 hover:bg-rose-100'
                  : 'bg-white/90 text-slate-400 hover:text-rose-500 hover:bg-white'
              }`}
              title={isWishlisted ? 'Remove from wishlist' : 'Save to wishlist'}
            >
              <Heart className={`w-4 h-4 ${isWishlisted ? 'fill-rose-500' : ''}`} />
            </button>
          )}
        </div>

        {/* Image container with Counter-Skew Content */}
        <div className="relative aspect-4/3 w-full bg-slate-100 overflow-hidden">
          <div className="skew-inner-content w-full h-full">
            <img
              src={product.image}
              alt={product.name}
              className={`w-full h-full object-cover group-hover:scale-108 transition-transform duration-500 ${
                isOutOfStock ? 'opacity-50 grayscale' : ''
              }`}
              loading="lazy"
            />
          </div>

          {/* Hover Glance Icon */}
          <div className="absolute top-2.5 right-2.5 opacity-0 group-hover:opacity-100 transition-opacity bg-black/50 text-white p-1 rounded-full backdrop-blur-xs">
            <ArrowUpRight className="w-3.5 h-3.5" />
          </div>

          {/* Approximate Weight Badge */}
          {product.isApproximateWeight && (
            <div className="absolute bottom-2 left-2 bg-slate-900/85 backdrop-blur-xs text-white text-[10px] font-medium px-2 py-0.5 rounded-md flex items-center gap-1 shadow-xs">
              <Scale className="w-3 h-3 text-amber-300" />
              <span>Approx Weight</span>
            </div>
          )}

          {/* Savings Badge */}
          {product.originalPrice && (
            <div className="skew-badge absolute bottom-2 right-2 bg-red-600 text-white text-[10px] font-extrabold px-1.5 py-0.5 rounded shadow-xs">
              Save £{(product.originalPrice - product.price).toFixed(2)}
            </div>
          )}

          {/* Out of stock overlay banner */}
          {isOutOfStock && (
            <div className="absolute inset-0 bg-slate-900/40 flex items-center justify-center">
              <span className="bg-red-600 text-white text-xs font-bold px-3 py-1 rounded-full shadow-lg">
                Out of Stock
              </span>
            </div>
          )}
        </div>

        {/* Card Body & Details */}
        <div className="skew-inner-content p-3.5 flex flex-col flex-1 justify-between bg-white">
          <div>
            {/* Brand & Rating & Origin */}
            <div className="flex items-center justify-between text-xs text-slate-500 mb-1">
              <span className="text-[11px] font-semibold text-emerald-800 truncate max-w-[120px]">
                {product.brand || product.unit}
              </span>
              <div className="flex items-center gap-1 text-amber-500">
                <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
                <span className="font-semibold text-slate-700 text-xs">{product.rating.toFixed(1)}</span>
                <span className="text-slate-400 text-[10px]">({product.reviewCount})</span>
              </div>
            </div>

            {/* Title */}
            <h3 className="font-bold text-slate-900 text-sm group-hover:text-[#1B5E20] transition-colors line-clamp-2 leading-snug">
              {product.name}
            </h3>

            {/* Unit & Variant indication */}
            <div className="flex items-center gap-1.5 mt-1 text-xs text-slate-500">
              <span>{product.unit}</span>
              {product.variants && product.variants.length > 1 && (
                <span className="text-[10px] font-medium text-emerald-700 bg-emerald-50 px-1.5 py-0.2 rounded border border-emerald-200">
                  {product.variants.length} sizes
                </span>
              )}
              {product.availableCuts && (
                <span className="text-[10px] font-medium text-red-700 bg-red-50 px-1.5 py-0.2 rounded border border-red-200">
                  Butcher Cuts
                </span>
              )}
            </div>

            {/* Low Stock Warning */}
            {isLowStock && (
              <div className="mt-1.5 flex items-center gap-1 text-[11px] font-semibold text-amber-700">
                <AlertTriangle className="w-3 h-3 text-amber-500" />
                <span>Only {product.stockCount} left in store!</span>
              </div>
            )}
          </div>

          {/* Price & Add Controls */}
          <div className="mt-3 flex items-center justify-between pt-2 border-t border-slate-100">
            <div className="skew-price-tag">
              <div className="flex items-baseline gap-1.5">
                <span className="text-base font-extrabold text-[#1B5E20]">
                  £{product.price.toFixed(2)}
                </span>
                {product.originalPrice && (
                  <span className="text-xs text-slate-400 line-through">
                    £{product.originalPrice.toFixed(2)}
                  </span>
                )}
              </div>
              {product.variants && product.variants[0]?.weightGrams && (
                <p className="text-[10px] text-slate-400">
                  £{((product.price / (product.variants[0].weightGrams || 1000)) * 1000).toFixed(2)}/kg
                </p>
              )}
            </div>

            {/* Controls */}
            {isOutOfStock ? (
              <button
                type="button"
                disabled
                className="text-[11px] font-medium text-slate-400 bg-slate-100 px-3 py-1.5 rounded-xl cursor-not-allowed"
              >
                Unavailable
              </button>
            ) : inCartQty > 0 ? (
              <div
                className="flex items-center gap-1.5 bg-emerald-50 border border-emerald-300 rounded-xl p-1 shadow-2xs"
                onClick={(e) => e.stopPropagation()}
              >
                <button
                  type="button"
                  onClick={(e) => onUpdateCartQuantity && onUpdateCartQuantity(product.id, -1, e)}
                  className="w-6 h-6 rounded-lg bg-white text-emerald-800 font-bold flex items-center justify-center hover:bg-emerald-100 transition-colors shadow-2xs"
                >
                  <Minus className="w-3.5 h-3.5" />
                </button>
                <span className="text-xs font-bold text-[#1B5E20] px-1 min-w-[16px] text-center">
                  {inCartQty}
                </span>
                <button
                  type="button"
                  onClick={(e) => onUpdateCartQuantity && onUpdateCartQuantity(product.id, 1, e)}
                  className="w-6 h-6 rounded-lg bg-[#1B5E20] text-white font-bold flex items-center justify-center hover:bg-emerald-800 transition-colors shadow-2xs"
                >
                  <Plus className="w-3.5 h-3.5" />
                </button>
              </div>
            ) : (
              <button
                id={`add-to-cart-btn-${product.id}`}
                type="button"
                onClick={(e) => onAddToCart(product, e)}
                className="flex items-center gap-1 text-xs font-bold text-white bg-[#1B5E20] hover:bg-emerald-800 px-3 py-2 rounded-xl transition-all shadow-xs hover:shadow-md active:scale-95 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
