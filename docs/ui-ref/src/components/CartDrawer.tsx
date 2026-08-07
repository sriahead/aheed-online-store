import React from 'react';
import { CartItem } from '../types';
import { X, ShoppingBag, Plus, Minus, Trash2, ArrowRight, Truck, Sparkles } from 'lucide-react';

interface CartDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  cartItems: CartItem[];
  onUpdateQuantity: (productId: string, delta: number) => void;
  onRemoveItem: (productId: string) => void;
  onProceedToCheckout: () => void;
  postcode: string;
}

export const CartDrawer: React.FC<CartDrawerProps> = ({
  isOpen,
  onClose,
  cartItems,
  onUpdateQuantity,
  onRemoveItem,
  onProceedToCheckout,
  postcode,
}) => {
  if (!isOpen) return null;

  const subtotal = cartItems.reduce(
    (acc, item) => acc + item.product.price * item.quantity,
    0
  );
  const deliveryFee = subtotal >= 30 || subtotal === 0 ? 0 : 2.0;
  const freeDeliveryThreshold = 30;
  const amountToFreeDelivery = Math.max(0, freeDeliveryThreshold - subtotal);
  const total = subtotal + (subtotal > 0 ? deliveryFee : 0);

  return (
    <div className="fixed inset-0 z-50 overflow-hidden bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="absolute inset-0" onClick={onClose} />

      <div className="fixed inset-y-0 right-0 max-w-full flex pl-10">
        <div className="w-screen max-w-md bg-white shadow-2xl flex flex-col border-l border-slate-200">
          {/* Drawer Header */}
          <div className="p-4 bg-[#1B5E20] text-white flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ShoppingBag className="w-5 h-5 text-emerald-300" />
              <h2 className="font-bold text-base">My Cart ({cartItems.reduce((a, b) => a + b.quantity, 0)})</h2>
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
          <div className="bg-emerald-50 border-b border-emerald-100 p-3 text-xs text-emerald-900">
            {amountToFreeDelivery > 0 ? (
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1 font-medium">
                  <Truck className="w-4 h-4 text-[#1B5E20]" /> Add £{amountToFreeDelivery.toFixed(2)} for FREE Local Delivery
                </span>
                <div className="w-16 h-1.5 bg-emerald-200 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-[#1B5E20] transition-all duration-300"
                    style={{ width: `${Math.min(100, (subtotal / 30) * 100)}%` }}
                  />
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-1 font-bold text-[#1B5E20]">
                <Sparkles className="w-4 h-4 text-amber-500" /> You unlocked FREE Local Delivery to {postcode}!
              </div>
            )}
          </div>

          {/* Cart Items List */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {cartItems.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center p-6 text-slate-500">
                <ShoppingBag className="w-16 h-16 text-slate-300 mb-3" />
                <h3 className="font-bold text-slate-800 text-sm">Your cart is empty</h3>
                <p className="text-xs text-slate-500 max-w-xs mt-1">
                  Explore fresh produce, halal meats, and cultural groceries from Aheed Food Centre.
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
              cartItems.map(({ product, quantity }) => (
                <div
                  key={product.id}
                  className="bg-white p-3 rounded-2xl border border-slate-200 shadow-2xs flex items-center gap-3"
                >
                  <img
                    src={product.image}
                    alt={product.name}
                    className="w-16 h-16 rounded-xl object-cover bg-slate-50 shrink-0 border"
                  />

                  <div className="flex-1 min-w-0">
                    <h4 className="font-semibold text-xs text-slate-900 truncate">
                      {product.name}
                    </h4>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      £{product.price.toFixed(2)} / {product.unit}
                    </p>

                    {/* Quantity Selector */}
                    <div className="flex items-center gap-2 mt-2">
                      <div className="flex items-center border border-slate-200 rounded-lg bg-slate-50">
                        <button
                          type="button"
                          onClick={() => onUpdateQuantity(product.id, -1)}
                          className="p-1 text-slate-600 hover:text-slate-900"
                        >
                          <Minus className="w-3 h-3" />
                        </button>
                        <span className="px-2 text-xs font-bold text-slate-900">{quantity}</span>
                        <button
                          type="button"
                          onClick={() => onUpdateQuantity(product.id, 1)}
                          className="p-1 text-slate-600 hover:text-slate-900"
                        >
                          <Plus className="w-3 h-3" />
                        </button>
                      </div>

                      <button
                        type="button"
                        onClick={() => onRemoveItem(product.id)}
                        className="text-slate-400 hover:text-red-600 p-1 transition-colors"
                        title="Remove item"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  <div className="text-right">
                    <span className="font-extrabold text-sm text-[#1B5E20]">
                      £{(product.price * quantity).toFixed(2)}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Drawer Footer Summary */}
          {cartItems.length > 0 && (
            <div className="p-4 bg-slate-50 border-t border-slate-200 space-y-3">
              <div className="space-y-1.5 text-xs text-slate-600">
                <div className="flex justify-between">
                  <span>Subtotal:</span>
                  <span className="font-medium text-slate-900">£{subtotal.toFixed(2)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Aheed Local Delivery ({postcode}):</span>
                  <span className="font-medium text-slate-900">
                    {deliveryFee === 0 ? (
                      <span className="text-[#1B5E20] font-bold">FREE</span>
                    ) : (
                      `£${deliveryFee.toFixed(2)}`
                    )}
                  </span>
                </div>
                <div className="flex justify-between pt-2 border-t font-bold text-base text-slate-900">
                  <span>Total Amount:</span>
                  <span className="text-[#1B5E20]">£{total.toFixed(2)}</span>
                </div>
              </div>

              <button
                type="button"
                id="proceed-to-checkout-btn"
                onClick={() => {
                  onClose();
                  onProceedToCheckout();
                }}
                className="w-full bg-[#1B5E20] hover:bg-emerald-800 text-white font-bold py-3.5 px-4 rounded-2xl text-sm shadow-md flex items-center justify-center gap-2 transition-all active:scale-95"
              >
                <span>Proceed to Checkout</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
