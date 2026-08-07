import React, { useState } from 'react';
import { CartItem, Order, OrderStatus } from '../types';
import { X, ShieldCheck, CreditCard, Truck, Check, Lock, User, MapPin } from 'lucide-react';

interface CheckoutModalProps {
  isOpen: boolean;
  onClose: () => void;
  cartItems: CartItem[];
  postcode: string;
  onOrderPlaced: (order: Order) => void;
  onClearCart: () => void;
}

export const CheckoutModal: React.FC<CheckoutModalProps> = ({
  isOpen,
  onClose,
  cartItems,
  postcode,
  onOrderPlaced,
  onClearCart,
}) => {
  const [checkoutType, setCheckoutType] = useState<'guest' | 'account'>('guest');
  const [name, setName] = useState('Sarah Ahmed');
  const [email, setEmail] = useState('sarah.ahmed@example.co.uk');
  const [phone, setPhone] = useState('07700 900123');
  const [street, setStreet] = useState('142 London Road');
  const [city, setCity] = useState('Leicester');
  const [userPostcode, setUserPostcode] = useState(postcode || 'LE2 7TR');
  const [instructions, setInstructions] = useState('Please leave with neighbor at #140 if out');
  const [deliverySlot, setDeliverySlot] = useState('Today (5:00 PM - 7:00 PM)');
  const [paymentMethod, setPaymentMethod] = useState<'card' | 'cod'>('card');
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen) return null;

  const subtotal = cartItems.reduce(
    (acc, item) => acc + item.product.price * item.quantity,
    0
  );
  const deliveryFee = subtotal >= 30 || subtotal === 0 ? 0 : 2.0;
  const total = subtotal + deliveryFee;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    setTimeout(() => {
      const newOrder: Order = {
        id: `AHEED-${Math.floor(100000 + Math.random() * 900000)}`,
        createdAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        customerName: name,
        customerEmail: email,
        customerPhone: phone,
        isGuestOrder: checkoutType === 'guest',
        deliveryAddress: {
          street,
          city,
          postcode: userPostcode,
          instructions,
        },
        items: [...cartItems],
        subtotalPence: Math.round(subtotal * 100),
        deliveryFeePence: Math.round(deliveryFee * 100),
        discountPence: 0,
        totalPence: Math.round(total * 100),
        subtotal,
        deliveryFee,
        discount: 0,
        total,
        status: 'Confirmed' as OrderStatus,
        paymentMethod: paymentMethod === 'card' ? 'Stripe Card Payment' : 'Cash on Delivery',
        estimatedDeliveryTime: deliverySlot,
        driverName: 'Mohammed K.',
        driverPhone: '07123 456789',
        pointsEarned: Math.floor(total),
        pointsRedeemed: 0,
      };

      onOrderPlaced(newOrder);
      onClearCart();
      setIsSubmitting(false);
      onClose();
    }, 1000);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200 overflow-y-auto"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-2xl bg-white rounded-3xl shadow-2xl overflow-hidden border border-slate-200 my-8"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-5 bg-[#1B5E20] text-white flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-6 h-6 text-emerald-300" />
            <div>
              <h2 className="font-bold text-lg">Checkout & Delivery Details</h2>
              <p className="text-xs text-emerald-200">UK Local Store Self-Delivery</p>
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

        {/* Checkout Type Selector */}
        <div className="bg-slate-50 border-b border-slate-200 p-3 flex justify-center gap-4 text-xs font-semibold">
          <button
            type="button"
            onClick={() => setCheckoutType('guest')}
            className={`px-4 py-1.5 rounded-xl transition-all ${
              checkoutType === 'guest'
                ? 'bg-white text-[#1B5E20] shadow-xs border border-slate-200'
                : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            Guest Checkout (Fastest)
          </button>
          <button
            type="button"
            onClick={() => setCheckoutType('account')}
            className={`px-4 py-1.5 rounded-xl transition-all ${
              checkoutType === 'account'
                ? 'bg-white text-[#1B5E20] shadow-xs border border-slate-200'
                : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            Aheed Member Checkout
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5 max-h-[75vh] overflow-y-auto">
          {/* Section 1: Customer Contact Info */}
          <div className="space-y-3">
            <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wide flex items-center gap-2">
              <User className="w-4 h-4 text-[#1B5E20]" />
              1. Contact Information
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div>
                <label className="block text-slate-600 font-medium mb-1">Full Name</label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 focus:border-[#1B5E20] focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-slate-600 font-medium mb-1">Email (Order Confirmation)</label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 focus:border-[#1B5E20] focus:outline-none"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="block text-slate-600 font-medium mb-1">Phone Number (Driver Updates)</label>
                <input
                  type="tel"
                  required
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 focus:border-[#1B5E20] focus:outline-none"
                />
              </div>
            </div>
          </div>

          {/* Section 2: Delivery Address */}
          <div className="space-y-3 pt-3 border-t border-slate-100">
            <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wide flex items-center gap-2">
              <MapPin className="w-4 h-4 text-[#1B5E20]" />
              2. UK Delivery Address & Instructions
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div className="sm:col-span-2">
                <label className="block text-slate-600 font-medium mb-1">Street Address</label>
                <input
                  type="text"
                  required
                  value={street}
                  onChange={(e) => setStreet(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 focus:border-[#1B5E20] focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-slate-600 font-medium mb-1">Town / City</label>
                <input
                  type="text"
                  required
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 focus:border-[#1B5E20] focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-slate-600 font-medium mb-1">Postcode</label>
                <input
                  type="text"
                  required
                  value={userPostcode}
                  onChange={(e) => setUserPostcode(e.target.value.toUpperCase())}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 focus:border-[#1B5E20] focus:outline-none uppercase font-bold"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="block text-slate-600 font-medium mb-1">Delivery Notes / Gate Code</label>
                <input
                  type="text"
                  value={instructions}
                  onChange={(e) => setInstructions(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 focus:border-[#1B5E20] focus:outline-none"
                />
              </div>
            </div>
          </div>

          {/* Section 3: Delivery Slot */}
          <div className="space-y-2 pt-3 border-t border-slate-100">
            <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wide flex items-center gap-2">
              <Truck className="w-4 h-4 text-[#1B5E20]" />
              3. Choose Delivery Window
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
              {[
                'Today (5:00 PM - 7:00 PM)',
                'Today (7:00 PM - 9:00 PM)',
                'Tomorrow (10:00 AM - 12:00 PM)',
                'Tomorrow (2:00 PM - 4:00 PM)',
              ].map((slot) => (
                <button
                  key={slot}
                  type="button"
                  onClick={() => setDeliverySlot(slot)}
                  className={`p-2.5 rounded-xl border text-left font-medium transition-all ${
                    deliverySlot === slot
                      ? 'border-[#1B5E20] bg-emerald-50 text-[#1B5E20] font-bold shadow-2xs'
                      : 'border-slate-200 hover:bg-slate-50 text-slate-700'
                  }`}
                >
                  {slot}
                </button>
              ))}
            </div>
          </div>

          {/* Section 4: Payment Method */}
          <div className="space-y-2 pt-3 border-t border-slate-100">
            <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wide flex items-center gap-2">
              <CreditCard className="w-4 h-4 text-[#1B5E20]" />
              4. Payment Method
            </h3>

            <div className="grid grid-cols-2 gap-3 text-xs">
              <button
                type="button"
                onClick={() => setPaymentMethod('card')}
                className={`p-3 rounded-2xl border text-left flex items-center gap-2 font-semibold ${
                  paymentMethod === 'card'
                    ? 'border-[#1B5E20] bg-emerald-50 text-[#1B5E20]'
                    : 'border-slate-200 hover:bg-slate-50 text-slate-700'
                }`}
              >
                <CreditCard className="w-4 h-4" />
                <span>Credit / Debit Card (Stripe)</span>
              </button>

              <button
                type="button"
                onClick={() => setPaymentMethod('cod')}
                className={`p-3 rounded-2xl border text-left flex items-center gap-2 font-semibold ${
                  paymentMethod === 'cod'
                    ? 'border-[#1B5E20] bg-emerald-50 text-[#1B5E20]'
                    : 'border-slate-200 hover:bg-slate-50 text-slate-700'
                }`}
              >
                <ShieldCheck className="w-4 h-4" />
                <span>Cash on Delivery</span>
              </button>
            </div>
          </div>

          {/* Order Summary Box */}
          <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 text-xs space-y-2">
            <div className="flex justify-between font-bold text-slate-900 border-b pb-2">
              <span>Order Total ({cartItems.length} items):</span>
              <span className="text-base text-[#1B5E20]">£{total.toFixed(2)}</span>
            </div>
            <p className="text-[11px] text-slate-500">
              Includes UK VAT and £{deliveryFee.toFixed(2)} Aheed local driver delivery fee.
            </p>
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full bg-[#1B5E20] hover:bg-emerald-800 text-white font-bold py-3.5 px-6 rounded-2xl text-sm shadow-lg flex items-center justify-center gap-2 transition-all active:scale-95 disabled:opacity-50"
          >
            {isSubmitting ? (
              <span>Processing Secure Order...</span>
            ) : (
              <>
                <Lock className="w-4 h-4 text-emerald-300" />
                <span>Place Order (£{total.toFixed(2)})</span>
              </>
            )}
          </button>
        </form>
      </div>
    </div>
  );
};
