import React from 'react';
import { Product, ProductVariant } from '../types';
import { X, Heart, ShoppingBag, Trash2, ArrowRight } from 'lucide-react';

interface WishlistModalProps {
  isOpen: boolean;
  onClose: () => void;
  wishlistedProducts: Product[];
  onRemoveFromWishlist: (productId: string) => void;
  onAddToCart: (product: Product) => void;
  onAddAllToCart: (products: Product[]) => void;
  onOpenProductDetail: (product: Product) => void;
}

export const WishlistModal: React.FC<WishlistModalProps> = ({
  isOpen,
  onClose,
  wishlistedProducts,
  onRemoveFromWishlist,
  onAddToCart,
  onAddAllToCart,
  onOpenProductDetail,
}) => {
  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/75 backdrop-blur-xs animate-in fade-in duration-200 overflow-y-auto"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-lg bg-white rounded-3xl shadow-2xl overflow-hidden border border-slate-200 my-6 max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-4 sm:p-5 bg-rose-900 text-white flex items-center justify-between shadow-xs shrink-0">
          <div className="flex items-center gap-2.5">
            <Heart className="w-6 h-6 text-rose-300 fill-rose-300" />
            <div>
              <h2 className="font-extrabold text-base sm:text-lg">Saved Favourites & Wishlist</h2>
              <p className="text-xs text-rose-200">
                {wishlistedProducts.length} items saved for your next grocery shop
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-rose-800/80 hover:bg-rose-800 text-white flex items-center justify-center transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 overflow-y-auto space-y-3 flex-1 text-xs">
          {wishlistedProducts.length === 0 ? (
            <div className="text-center py-10 space-y-3 text-slate-400">
              <Heart className="w-12 h-12 mx-auto text-slate-300 stroke-1" />
              <h3 className="font-bold text-slate-800 text-sm">Your wishlist is empty</h3>
              <p className="text-xs text-slate-500 max-w-xs mx-auto">
                Click the heart icon on fresh halal meat, produce, or spices to save them for easy re-ordering.
              </p>
            </div>
          ) : (
            wishlistedProducts.map((p) => (
              <div
                key={p.id}
                className="bg-white p-3 rounded-2xl border border-slate-200/90 shadow-2xs flex items-center justify-between gap-3 hover:border-slate-300 transition-colors"
              >
                <div
                  className="flex items-center gap-3 cursor-pointer flex-1 min-w-0"
                  onClick={() => {
                    onOpenProductDetail(p);
                    onClose();
                  }}
                >
                  <img
                    src={p.image}
                    alt={p.name}
                    className="w-14 h-14 rounded-xl object-cover border border-slate-200 shrink-0"
                  />
                  <div className="min-w-0">
                    <h4 className="font-bold text-slate-900 text-xs truncate">{p.name}</h4>
                    <p className="text-[11px] text-slate-500">{p.unit}</p>
                    <span className="font-extrabold text-[#1B5E20] text-xs mt-0.5 block">
                      £{p.price.toFixed(2)}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => {
                      onAddToCart(p);
                    }}
                    className="bg-[#1B5E20] hover:bg-emerald-800 text-white font-bold text-xs px-3 py-1.5 rounded-xl shadow-2xs flex items-center gap-1"
                  >
                    <ShoppingBag className="w-3.5 h-3.5" />
                    <span>Add</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => onRemoveFromWishlist(p.id)}
                    className="text-slate-400 hover:text-rose-500 p-1.5 transition-colors"
                    title="Remove from wishlist"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        {wishlistedProducts.length > 0 && (
          <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between shrink-0">
            <button
              type="button"
              onClick={() => {
                onAddAllToCart(wishlistedProducts);
                onClose();
              }}
              className="w-full bg-[#1B5E20] hover:bg-emerald-800 text-white font-bold text-xs py-3 rounded-xl shadow-md flex items-center justify-center gap-2"
            >
              <ShoppingBag className="w-4 h-4" />
              <span>Add All Wishlist Items to Cart ({wishlistedProducts.length})</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
