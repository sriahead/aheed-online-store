"use client";

import { ShoppingBag, X, Plus, Minus, Trash2, ArrowRight, Truck, Sparkles } from "lucide-react";
import Link from "next/link";
import { formatPence } from "@/lib/order-totals";

export interface CartDrawerItem {
  productId: string;
  name: string;
  unitLabel: string;
  unitPricePence: number;
  quantity: number;
  imageUrl: string | null;
  inStock: boolean;
}

export interface CartDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  items: CartDrawerItem[];
  subtotalPence: number;
  deliveryFeePence: number;
  freeDeliveryThresholdPence: number | null;
  postcode?: string;
  onUpdateQuantity: (productId: string, quantity: number) => Promise<void>;
  onRemoveItem: (productId: string) => Promise<void>;
  isUpdating?: boolean;
}

export function CartDrawer({
  isOpen,
  onClose,
  items,
  subtotalPence,
  deliveryFeePence,
  freeDeliveryThresholdPence,
  postcode = "MK",
  onUpdateQuantity,
  onRemoveItem,
  isUpdating = false,
}: CartDrawerProps) {
  if (!isOpen) return null;

  const totalQuantity = items.reduce((sum, item) => sum + item.quantity, 0);
  const amountToFreeDeliveryPence = freeDeliveryThresholdPence
    ? Math.max(0, freeDeliveryThresholdPence - subtotalPence)
    : 0;
  const qualifiesForFreeDelivery =
    freeDeliveryThresholdPence !== null && subtotalPence >= freeDeliveryThresholdPence;

  const effectiveDeliveryFeePence = qualifiesForFreeDelivery || subtotalPence === 0 ? 0 : deliveryFeePence;
  const totalPence = subtotalPence + effectiveDeliveryFeePence;

  return (
    <div className="fixed inset-0 z-50 overflow-hidden bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="absolute inset-0" onClick={onClose} />

      <div className="fixed inset-y-0 right-0 max-w-full flex pl-10">
        <div className="w-screen max-w-md bg-white shadow-2xl flex flex-col border-l border-slate-200">
          {/* Drawer Header */}
          <div className="p-4 bg-primary text-white flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ShoppingBag className="w-5 h-5 text-emerald-300" />
              <h2 className="font-bold text-base">My Cart ({totalQuantity})</h2>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-full hover:bg-black/20 text-white transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Delivery Incentive Banner */}
          {freeDeliveryThresholdPence !== null && (
            <div className="bg-emerald-50 border-b border-emerald-100 p-3 text-xs text-emerald-900">
              {!qualifiesForFreeDelivery ? (
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-1 font-medium">
                    <Truck className="w-4 h-4 text-primary" /> Add {formatPence(amountToFreeDeliveryPence)} for FREE Delivery
                  </span>
                  <div className="w-16 h-1.5 bg-emerald-200 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-primary transition-all duration-300"
                      style={{
                        width: `${Math.min(100, (subtotalPence / freeDeliveryThresholdPence) * 100)}%`,
                      }}
                    />
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-1 font-bold text-primary">
                  <Sparkles className="w-4 h-4 text-amber-500" /> You unlocked FREE Delivery to {postcode}!
                </div>
              )}
            </div>
          )}

          {/* Cart Items List */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {items.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center p-6 text-slate-500">
                <ShoppingBag className="w-16 h-16 text-slate-300 mb-3" />
                <h3 className="font-bold text-slate-800 text-sm">Your cart is empty</h3>
                <p className="text-xs text-slate-500 max-w-xs mt-1">
                  Explore fresh produce, halal meats, and cultural groceries.
                </p>
                <button
                  type="button"
                  onClick={onClose}
                  className="mt-4 bg-primary hover:bg-primary/90 text-white font-bold text-xs px-5 py-2.5 rounded-xl shadow-xs"
                >
                  Start Shopping
                </button>
              </div>
            ) : (
              items.map((item) => (
                <div
                  key={item.productId}
                  className="bg-white p-3 rounded-2xl border border-slate-200 shadow-2xs flex items-center gap-3"
                >
                  <div className="w-16 h-16 rounded-xl overflow-hidden bg-slate-50 shrink-0 border border-slate-100 flex items-center justify-center">
                    {item.imageUrl ? (
                      <img src={item.imageUrl} alt={item.name} className="w-full h-full object-cover" />
                    ) : (
                      <ShoppingBag className="w-6 h-6 text-slate-300" />
                    )}
                  </div>

                  <div className="flex-1 min-w-0">
                    <h4 className="font-semibold text-xs text-slate-900 truncate">{item.name}</h4>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      {formatPence(item.unitPricePence)} / {item.unitLabel}
                    </p>

                    {/* Quantity Selector */}
                    <div className="flex items-center gap-2 mt-2">
                      <div className="flex items-center border border-slate-200 rounded-lg bg-slate-50">
                        <button
                          type="button"
                          disabled={isUpdating || item.quantity <= 1}
                          onClick={() => onUpdateQuantity(item.productId, item.quantity - 1)}
                          className="p-1 text-slate-600 hover:text-slate-900 disabled:opacity-40"
                        >
                          <Minus className="w-3 h-3" />
                        </button>
                        <span className="px-2 text-xs font-bold text-slate-900">{item.quantity}</span>
                        <button
                          type="button"
                          disabled={isUpdating}
                          onClick={() => onUpdateQuantity(item.productId, item.quantity + 1)}
                          className="p-1 text-slate-600 hover:text-slate-900 disabled:opacity-40"
                        >
                          <Plus className="w-3 h-3" />
                        </button>
                      </div>

                      <button
                        type="button"
                        disabled={isUpdating}
                        onClick={() => onRemoveItem(item.productId)}
                        className="text-slate-400 hover:text-red-600 p-1 transition-colors disabled:opacity-40"
                        title="Remove item"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  <div className="text-right">
                    <span className="font-extrabold text-sm text-primary">
                      {formatPence(item.unitPricePence * item.quantity)}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Drawer Footer Summary */}
          {items.length > 0 && (
            <div className="p-4 bg-slate-50 border-t border-slate-200 space-y-3">
              <div className="space-y-1.5 text-xs text-slate-600">
                <div className="flex justify-between">
                  <span>Subtotal:</span>
                  <span className="font-medium text-slate-900">{formatPence(subtotalPence)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Delivery ({postcode}):</span>
                  <span className="font-medium text-slate-900">
                    {effectiveDeliveryFeePence === 0 ? (
                      <span className="text-primary font-bold">FREE</span>
                    ) : (
                      formatPence(effectiveDeliveryFeePence)
                    )}
                  </span>
                </div>
                <div className="flex justify-between pt-2 border-t font-bold text-base text-slate-900">
                  <span>Total Amount:</span>
                  <span className="text-primary">{formatPence(totalPence)}</span>
                </div>
              </div>

              <Link
                href="/checkout"
                onClick={onClose}
                className="w-full bg-primary hover:bg-primary/90 text-white font-bold py-3.5 px-4 rounded-2xl text-sm shadow-md flex items-center justify-center gap-2 transition-all active:scale-95"
              >
                <span>Proceed to Checkout</span>
                <ArrowRight className="w-4 h-4" />
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
