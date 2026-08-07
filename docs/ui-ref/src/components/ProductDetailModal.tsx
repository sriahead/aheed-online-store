import React, { useState } from 'react';
import { Product } from '../types';
import { X, Star, ShieldCheck, MapPin, Plus, Minus, Check, ShoppingBag } from 'lucide-react';

interface ProductDetailModalProps {
  product: Product | null;
  onClose: () => void;
  onAddToCart: (product: Product, quantity: number) => void;
  isInCart?: boolean;
}

export const ProductDetailModal: React.FC<ProductDetailModalProps> = ({
  product,
  onClose,
  onAddToCart,
  isInCart = false,
}) => {
  const [quantity, setQuantity] = useState(1);

  if (!product) return null;

  const totalPrice = product.price * quantity;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-lg bg-white rounded-3xl shadow-2xl overflow-hidden border border-slate-200 flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close Button */}
        <button
          type="button"
          onClick={onClose}
          className="absolute top-4 right-4 z-20 w-9 h-9 rounded-full bg-white/90 hover:bg-white text-slate-700 shadow-md flex items-center justify-center transition-transform hover:scale-110"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Modal Header & Image */}
        <div className="relative aspect-16/10 bg-slate-50 w-full overflow-hidden">
          <img
            src={product.image}
            alt={product.name}
            className="w-full h-full object-cover"
          />
          <div className="absolute top-4 left-4 flex flex-wrap gap-1.5">
            {product.isHalal && (
              <span className="bg-[#1B5E20] text-white text-xs font-bold px-2.5 py-1 rounded-full shadow-md flex items-center gap-1">
                <ShieldCheck className="w-3.5 h-3.5" /> 100% Halal
              </span>
            )}
            {product.isFresh && (
              <span className="bg-emerald-500 text-white text-xs font-bold px-2.5 py-1 rounded-full shadow-md">
                Fresh Farm
              </span>
            )}
            {product.isOffer && (
              <span className="bg-[#F57C00] text-white text-xs font-bold px-2.5 py-1 rounded-full shadow-md">
                Special Offer
              </span>
            )}
          </div>
        </div>

        {/* Body Content */}
        <div className="p-6 overflow-y-auto space-y-4 flex-1">
          <div>
            <div className="flex items-center justify-between text-xs text-slate-500 mb-1">
              <span className="font-semibold text-emerald-800 uppercase tracking-wider text-[11px]">
                {product.unit}
              </span>
              {product.origin && (
                <span className="flex items-center gap-1 text-slate-500">
                  <MapPin className="w-3.5 h-3.5 text-slate-400" />
                  Origin: {product.origin}
                </span>
              )}
            </div>

            <h2 className="text-xl font-bold text-slate-900 leading-snug">
              {product.name}
            </h2>

            {/* Ratings */}
            <div className="flex items-center gap-2 mt-2">
              <div className="flex items-center gap-1 text-amber-500 text-sm font-bold">
                <Star className="w-4 h-4 fill-amber-400 text-amber-400" />
                <span>{product.rating.toFixed(1)}</span>
              </div>
              <span className="text-xs text-slate-400">
                ({product.reviewCount} customer reviews)
              </span>
            </div>
          </div>

          {/* Description */}
          <div className="bg-slate-50 p-3.5 rounded-2xl border border-slate-200/80 text-xs text-slate-600 leading-relaxed">
            {product.description}
          </div>

          {/* Pricing & Stock */}
          <div className="flex items-baseline justify-between border-t border-slate-100 pt-3">
            <div>
              <span className="text-2xl font-extrabold text-[#1B5E20]">
                £{product.price.toFixed(2)}
              </span>
              <span className="text-xs text-slate-500 ml-1">/ {product.unit}</span>
              {product.originalPrice && (
                <span className="text-xs text-slate-400 line-through ml-2">
                  £{product.originalPrice.toFixed(2)}
                </span>
              )}
            </div>
            <span className="text-xs font-medium text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-full">
              In Stock ({product.stockCount} left)
            </span>
          </div>

          {/* Quantity Selector (As seen in Brand Sheet Panel 07) */}
          <div className="flex items-center justify-between bg-slate-100 p-3 rounded-2xl">
            <span className="text-xs font-bold text-slate-700">Select Quantity:</span>
            <div className="flex items-center bg-white border border-slate-200 rounded-xl overflow-hidden shadow-2xs">
              <button
                type="button"
                onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                className="p-2 text-slate-600 hover:text-slate-900 hover:bg-slate-50 transition-colors"
              >
                <Minus className="w-4 h-4" />
              </button>
              <span className="w-10 text-center font-bold text-sm text-slate-900">
                {quantity}
              </span>
              <button
                type="button"
                onClick={() => setQuantity((q) => q + 1)}
                className="p-2 text-slate-600 hover:text-slate-900 hover:bg-slate-50 transition-colors"
              >
                <Plus className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        {/* Footer Add to Cart Button */}
        <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between gap-4">
          <div>
            <span className="text-[11px] text-slate-400 font-medium block">Total Price</span>
            <span className="text-lg font-bold text-[#1B5E20]">
              £{totalPrice.toFixed(2)}
            </span>
          </div>

          <button
            type="button"
            onClick={() => {
              onAddToCart(product, quantity);
              onClose();
            }}
            className="flex-1 max-w-xs bg-[#1B5E20] hover:bg-emerald-800 text-white font-bold py-3 px-6 rounded-2xl text-sm shadow-md flex items-center justify-center gap-2 transition-all active:scale-95"
          >
            <ShoppingBag className="w-4 h-4" />
            <span>Add to Cart</span>
          </button>
        </div>
      </div>
    </div>
  );
};
