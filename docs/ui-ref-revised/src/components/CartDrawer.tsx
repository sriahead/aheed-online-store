import React from 'react';
import { CartItem, Product } from '../types';
import {
  X,
  ShoppingBag,
  Plus,
  Minus,
  Trash2,
  ArrowRight,
  Truck,
  Sparkles,
  Scale,
  ShieldCheck,
  AlertTriangle,
  Heart
} from 'lucide-react';

interface CartDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  cartItems: CartItem[];
  onUpdateQuantity: (productId: string, delta: number) => void;
  onRemoveItem: (productId: string) => void;
  onProceedToCheckout: () => void;
  postcode: string;
  onOpenProductModal?: (product: Product) => void;
}

export const CartDrawer: React.FC<CartDrawerProps> = ({
  isOpen,
  onClose,
  cartItems,
  onUpdateQuantity,
  onRemoveItem,
  onProceedToCheckout,
  postcode,
  onOpenProductModal,
}) => {
  if (!isOpen) return null;

  const subtotal = cartItems.reduce((acc, item) => {
    const itemPrice = item.selectedVariant ? item.selectedVariant.price : item.product.price;
    return acc + itemPrice * item.quantity;
  }, 0);

  const freeDeliveryThreshold = 35.0;
  const minimumOrderThreshold = 15.0;
  const deliveryFee = subtotal >= freeDeliveryThreshold || subtotal === 0 ? 0 : 2.49;
  const amountToFreeDelivery = Math.max(0, freeDeliveryThreshold - subtotal);
  const total = subtotal + (subtotal > 0 ? deliveryFee : 0);
  const isBelowMinimum = subtotal > 0 && subtotal < minimumOrderThreshold;
  const hasApproximateWeightItem = cartItems.some((item) => item.product.isApproximateWeight);

  return (
    <div className="fixed inset-0 z-50 overflow-hidden bg-slate-950/70 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="absolute inset-0" onClick={onClose} />

      <div className="fixed inset-y-0 right-0 max-w-full flex pl-10">
        <div className="w-screen max-w-md bg-white shadow-2xl flex flex-col border-l border-slate-200">
          {/* Drawer Header */}
          <div className="p-4 bg-[#1B5E20] text-white flex items-center justify-between shadow-xs">
            <div className="flex items-center gap-2">
              <ShoppingBag className="w-5 h-5 text-emerald-300" />
              <div>
                <h2 className="font-bold text-base">Your Grocery Basket</h2>
                <p className="text-[11px] text-emerald-200">
                  {cartItems.reduce((a, b) => a + b.quantity, 0)} items • Delivering to {postcode}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-full hover:bg-emerald-800 text-white transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Delivery Incentive Banner */}
          <div className="bg-emerald-50 border-b border-emerald-100 p-3 text-xs text-emerald-950">
            {amountToFreeDelivery > 0 ? (
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-1.5 font-bold text-emerald-900">
                    <Truck className="w-4 h-4 text-[#1B5E20]" />
                    Add £{amountToFreeDelivery.toFixed(2)} for FREE Milton Keynes Delivery
                  </span>
                  <span className="text-[11px] font-extrabold text-[#1B5E20]">
                    {Math.round((subtotal / freeDeliveryThreshold) * 100)}%
                  </span>
                </div>
                <div className="w-full h-2 bg-emerald-200/80 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-linear-to-r from-emerald-600 to-[#1B5E20] transition-all duration-300 rounded-full"
                    style={{ width: `${Math.min(100, (subtotal / freeDeliveryThreshold) * 100)}%` }}
                  />
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-1.5 font-bold text-[#1B5E20]">
                <Sparkles className="w-4 h-4 text-amber-500 shrink-0" />
                <span>You unlocked FREE Local Delivery to {postcode}!</span>
              </div>
            )}
          </div>

          {/* Minimum Order Warning if applicable */}
          {isBelowMinimum && (
            <div className="bg-amber-50 border-b border-amber-200 px-3 py-2 text-xs text-amber-900 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
              <span>
                Minimum order is <strong>£{minimumOrderThreshold.toFixed(2)}</strong>. Add £
                {(minimumOrderThreshold - subtotal).toFixed(2)} more to checkout.
              </span>
            </div>
          )}

          {/* Cart Items List */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {cartItems.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center p-6 text-slate-500">
                <div className="w-16 h-16 rounded-full bg-slate-100 flex items-center justify-center mb-3">
                  <ShoppingBag className="w-8 h-8 text-slate-400" />
                </div>
                <h3 className="font-bold text-slate-800 text-sm">Your basket is empty</h3>
                <p className="text-xs text-slate-500 max-w-xs mt-1">
                  Discover fresh HMC halal meat, crisp produce, and authentic cultural groceries from Aheed Food Centre.
                </p>
                <button
                  type="button"
                  onClick={onClose}
                  className="mt-4 bg-[#1B5E20] hover:bg-emerald-800 text-white font-bold text-xs px-5 py-2.5 rounded-xl shadow-xs"
                >
                  Start Shopping
                </button>
              </div>
            ) : (
              cartItems.map((item) => {
                const { product, quantity, selectedVariant, selectedCut, selectedPrep, customButcherNotes } = item;
                const unitPrice = selectedVariant ? selectedVariant.price : product.price;
                const lineTotal = unitPrice * quantity;

                return (
                  <div
                    key={`${product.id}-${selectedVariant?.id || 'default'}-${selectedCut || 'default'}`}
                    className="bg-white p-3 rounded-2xl border border-slate-200/90 shadow-2xs space-y-2 hover:border-slate-300 transition-colors"
                  >
                    <div className="flex items-start gap-3">
                      <img
                        src={product.image}
                        alt={product.name}
                        className="w-16 h-16 rounded-xl object-cover border border-slate-200 shrink-0"
                      />

                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-1">
                          <h4 className="text-xs font-bold text-slate-900 leading-snug line-clamp-1">
                            {product.name}
                          </h4>
                          <button
                            type="button"
                            onClick={() => onRemoveItem(product.id)}
                            className="text-slate-400 hover:text-rose-500 p-0.5 transition-colors"
                            title="Remove item"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>

                        {/* Selected Variant / Pack */}
                        <div className="text-[11px] text-slate-500 mt-0.5 font-medium">
                          {selectedVariant ? selectedVariant.name : product.unit}
                        </div>

                        {/* Meat Cut & Preparation Details */}
                        {selectedCut && (
                          <div className="flex flex-wrap gap-1 mt-1">
                            <span className="bg-red-50 text-red-800 text-[10px] font-semibold px-1.5 py-0.2 rounded border border-red-200">
                              Cut: {selectedCut}
                            </span>
                            {selectedPrep && (
                              <span className="bg-emerald-50 text-emerald-800 text-[10px] font-medium px-1.5 py-0.2 rounded border border-emerald-200">
                                {selectedPrep}
                              </span>
                            )}
                          </div>
                        )}

                        {/* Custom Butcher Notes */}
                        {customButcherNotes && (
                          <p className="text-[10px] text-slate-500 italic mt-0.5 line-clamp-1">
                            Note: "{customButcherNotes}"
                          </p>
                        )}
                      </div>
                    </div>

                    {/* Quantity Stepper & Line Price */}
                    <div className="flex items-center justify-between pt-2 border-t border-slate-100">
                      <div className="flex items-center gap-1.5 bg-slate-100 rounded-xl p-0.5">
                        <button
                          type="button"
                          onClick={() => onUpdateQuantity(product.id, -1)}
                          className="w-6 h-6 rounded-lg bg-white text-slate-700 font-bold flex items-center justify-center hover:bg-slate-200 transition-colors shadow-2xs"
                        >
                          <Minus className="w-3.5 h-3.5" />
                        </button>
                        <span className="text-xs font-bold text-slate-900 px-1.5 min-w-[20px] text-center">
                          {quantity}
                        </span>
                        <button
                          type="button"
                          onClick={() => onUpdateQuantity(product.id, 1)}
                          className="w-6 h-6 rounded-lg bg-[#1B5E20] text-white font-bold flex items-center justify-center hover:bg-emerald-800 transition-colors shadow-2xs"
                        >
                          <Plus className="w-3.5 h-3.5" />
                        </button>
                      </div>

                      <div className="text-right">
                        <span className="text-sm font-extrabold text-[#1B5E20]">
                          £{lineTotal.toFixed(2)}
                        </span>
                        <span className="text-[10px] text-slate-400 block">
                          £{unitPrice.toFixed(2)} each
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Drawer Footer Calculations */}
          {cartItems.length > 0 && (
            <div className="p-4 bg-slate-50 border-t border-slate-200 space-y-3">
              {/* Approximate Weight Notice if meat present */}
              {hasApproximateWeightItem && (
                <div className="flex items-center gap-1.5 text-[11px] text-slate-600 bg-white p-2 rounded-xl border border-slate-200">
                  <Scale className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                  <span>Fresh meat weighed on master scale before delivery.</span>
                </div>
              )}

              <div className="space-y-1.5 text-xs">
                <div className="flex justify-between text-slate-600">
                  <span>Subtotal</span>
                  <span className="font-semibold text-slate-900">£{subtotal.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-slate-600">
                  <span>Delivery ({postcode})</span>
                  <span className="font-semibold text-slate-900">
                    {deliveryFee === 0 ? (
                      <span className="text-[#1B5E20] font-bold">FREE</span>
                    ) : (
                      `£${deliveryFee.toFixed(2)}`
                    )}
                  </span>
                </div>
                <div className="flex justify-between text-sm font-extrabold text-slate-900 pt-1.5 border-t border-slate-200">
                  <span>Estimated Total</span>
                  <span className="text-lg text-[#1B5E20]">£{total.toFixed(2)}</span>
                </div>
              </div>

              {/* Checkout Button */}
              <button
                type="button"
                onClick={onProceedToCheckout}
                disabled={isBelowMinimum}
                className={`w-full py-3.5 px-4 rounded-2xl font-bold text-sm shadow-md flex items-center justify-center gap-2 transition-all ${
                  isBelowMinimum
                    ? 'bg-slate-300 text-slate-500 cursor-not-allowed'
                    : 'bg-[#1B5E20] hover:bg-emerald-800 text-white hover:shadow-lg active:scale-98'
                }`}
              >
                <span>Proceed to Delivery & Payment</span>
                <ArrowRight className="w-4 h-4" />
              </button>

              <div className="flex items-center justify-center gap-2 text-[11px] text-slate-500 pt-1">
                <ShieldCheck className="w-3.5 h-3.5 text-[#1B5E20]" />
                <span>100% Halal Certified Cold-Chain Guarantee</span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
