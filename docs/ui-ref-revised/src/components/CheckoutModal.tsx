import React, { useState } from 'react';
import { CartItem, Order, OrderStatus, UserAccount, SubstitutionPreference } from '../types';
import {
  X,
  ShieldCheck,
  CreditCard,
  Truck,
  Check,
  Lock,
  User,
  MapPin,
  Clock,
  Store,
  Sparkles,
  Phone,
  Mail,
  AlertCircle,
  Scale
} from 'lucide-react';

interface CheckoutModalProps {
  isOpen: boolean;
  onClose: () => void;
  cartItems: CartItem[];
  postcode: string;
  currentUser: UserAccount | null;
  onOrderPlaced: (order: Order) => void;
  onClearCart: () => void;
}

export const CheckoutModal: React.FC<CheckoutModalProps> = ({
  isOpen,
  onClose,
  cartItems,
  postcode,
  currentUser,
  onOrderPlaced,
  onClearCart,
}) => {
  // Fulfilment type
  const [fulfilmentType, setFulfilmentType] = useState<'delivery' | 'click_and_collect'>('delivery');
  const [deliveryZone, setDeliveryZone] = useState<string>('Zone 1 (MK Central & Surrounds)');
  const [checkoutType, setCheckoutType] = useState<'guest' | 'account'>(currentUser ? 'account' : 'guest');

  // Customer Contact & Delivery Info
  const [name, setName] = useState(currentUser?.name || 'Sarah Ahmed');
  const [email, setEmail] = useState(currentUser?.email || 'sarah.ahmed@example.co.uk');
  const [phone, setPhone] = useState(currentUser?.phone || '07700 900123');
  const [street, setStreet] = useState(currentUser?.addresses?.[0]?.street || '42 Midsummer Blvd');
  const [city, setCity] = useState(currentUser?.addresses?.[0]?.city || 'Milton Keynes');
  const [userPostcode, setUserPostcode] = useState(postcode || currentUser?.addresses?.[0]?.postcode || 'MK9 3BP');
  const [instructions, setInstructions] = useState('Ring doorbell twice please. Leave by door if out.');

  // Fulfilment Slots & Preferences
  const [deliverySlot, setDeliverySlot] = useState('Today (5:00 PM - 7:00 PM)');
  const [substitutionPreference, setSubstitutionPreference] = useState<SubstitutionPreference>('best_match');
  const [paymentMethod, setPaymentMethod] = useState<'card' | 'applepay' | 'cod'>('card');

  // Loyalty Points
  const [redeemPoints, setRedeemPoints] = useState(false);
  const availablePoints = currentUser?.loyaltyPoints || 0;
  const pointsDiscountPounds = redeemPoints ? Math.min(availablePoints / 100, 5.0) : 0;

  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen) return null;

  const subtotal = cartItems.reduce((acc, item) => {
    const itemPrice = item.selectedVariant ? item.selectedVariant.price : item.product.price;
    return acc + itemPrice * item.quantity;
  }, 0);

  // Delivery fee logic
  const freeDeliveryThreshold = 35.0;
  const standardFee = fulfilmentType === 'click_and_collect' ? 0 : subtotal >= freeDeliveryThreshold ? 0 : 2.49;
  const expressSurcharge = deliverySlot.includes('Express') ? 1.50 : 0;
  const deliveryFee = standardFee + expressSurcharge;

  const total = Math.max(0, subtotal + deliveryFee - pointsDiscountPounds);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    setTimeout(() => {
      const newOrder: Order = {
        id: `AHEED-${Math.floor(100000 + Math.random() * 900000)}`,
        createdAt: `Today, ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`,
        customerName: name,
        customerEmail: email,
        customerPhone: phone,
        isGuestOrder: checkoutType === 'guest',
        userId: currentUser?.id || 'guest',
        fulfilmentType,
        deliveryZone,
        deliverySlot,
        substitutionPreference,
        deliveryAddress: {
          street: fulfilmentType === 'click_and_collect' ? '42 Midsummer Blvd (Store Pickup)' : street,
          city: 'Milton Keynes',
          postcode: userPostcode,
          instructions,
        },
        items: [...cartItems],
        subtotalPence: Math.round(subtotal * 100),
        deliveryFeePence: Math.round(deliveryFee * 100),
        discountPence: Math.round(pointsDiscountPounds * 100),
        totalPence: Math.round(total * 100),
        subtotal,
        deliveryFee,
        discount: pointsDiscountPounds,
        total,
        status: 'Confirmed' as OrderStatus,
        paymentMethod:
          paymentMethod === 'card'
            ? 'Stripe Visa/Mastercard (3DS Secure)'
            : paymentMethod === 'applepay'
            ? 'Apple Pay / Google Pay'
            : 'Cash on Delivery (Driver POS)',
        estimatedDeliveryTime: deliverySlot,
        driverName: 'Mohammed K.',
        driverPhone: '07123 456789',
        pointsEarned: Math.floor(total),
        pointsRedeemed: redeemPoints ? Math.round(pointsDiscountPounds * 100) : 0,
        butcherFulfilmentStatus: 'Pending Scale & Cut',
        finalAdjustedTotal: total,
      };

      onOrderPlaced(newOrder);
      onClearCart();
      setIsSubmitting(false);
      onClose();
    }, 1000);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/75 backdrop-blur-xs animate-in fade-in duration-200 overflow-y-auto"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-2xl bg-white rounded-3xl shadow-2xl overflow-hidden border border-slate-200 my-6 max-h-[92vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-4 sm:p-5 bg-[#1B5E20] text-white flex items-center justify-between shadow-xs shrink-0">
          <div className="flex items-center gap-2.5">
            <ShieldCheck className="w-6 h-6 text-emerald-300" />
            <div>
              <h2 className="font-extrabold text-base sm:text-lg">Secure Grocery Checkout</h2>
              <p className="text-xs text-emerald-200">
                Milton Keynes Local Delivery & In-Store Click & Collect
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-emerald-800/80 hover:bg-emerald-800 text-white flex items-center justify-center transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Checkout Form Body */}
        <form onSubmit={handleSubmit} className="p-5 sm:p-6 overflow-y-auto space-y-6 flex-1 text-xs">
          {/* STEP 1: FULFILMENT TYPE & TIME SLOT */}
          <div className="space-y-3">
            <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <Truck className="w-4 h-4 text-[#1B5E20]" />
              1. Choose Fulfilment Method & Time Slot
            </h3>

            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setFulfilmentType('delivery')}
                className={`p-3 rounded-2xl border text-left flex items-start gap-3 transition-all ${
                  fulfilmentType === 'delivery'
                    ? 'border-[#1B5E20] bg-emerald-50 text-emerald-950 ring-2 ring-emerald-500/20'
                    : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'
                }`}
              >
                <Truck className="w-5 h-5 text-[#1B5E20] shrink-0 mt-0.5" />
                <div>
                  <div className="font-bold text-xs">Aheed Home Delivery</div>
                  <div className="text-[11px] text-slate-500 mt-0.5">
                    Same-day delivery to {userPostcode}
                  </div>
                </div>
              </button>

              <button
                type="button"
                onClick={() => setFulfilmentType('click_and_collect')}
                className={`p-3 rounded-2xl border text-left flex items-start gap-3 transition-all ${
                  fulfilmentType === 'click_and_collect'
                    ? 'border-[#1B5E20] bg-emerald-50 text-emerald-950 ring-2 ring-emerald-500/20'
                    : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'
                }`}
              >
                <Store className="w-5 h-5 text-[#1B5E20] shrink-0 mt-0.5" />
                <div>
                  <div className="font-bold text-xs">Click & Collect (FREE)</div>
                  <div className="text-[11px] text-slate-500 mt-0.5">
                    Ready in 1 hour at Central MK store
                  </div>
                </div>
              </button>
            </div>

            {/* Time Slot Selection */}
            <div className="space-y-1.5">
              <label className="block font-bold text-slate-800">
                Select {fulfilmentType === 'delivery' ? 'Delivery' : 'Collection'} Slot:
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {[
                  'Today (1:00 PM - 4:00 PM)',
                  'Today (5:00 PM - 7:00 PM)',
                  'Today (7:00 PM - 9:00 PM)',
                  'Tomorrow (10:00 AM - 1:00 PM)',
                  'Tomorrow (2:00 PM - 5:00 PM)',
                  '⚡ Priority 2-Hour Express (+£1.50)',
                ].map((slot) => {
                  const isSelected = deliverySlot === slot;
                  return (
                    <button
                      key={slot}
                      type="button"
                      onClick={() => setDeliverySlot(slot)}
                      className={`p-2 rounded-xl border text-left text-[11px] font-medium transition-all ${
                        isSelected
                          ? 'border-[#1B5E20] bg-emerald-50 text-emerald-950 font-bold ring-2 ring-emerald-500/20'
                          : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'
                      }`}
                    >
                      {slot}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* STEP 2: CUSTOMER CONTACT & ADDRESS */}
          <div className="space-y-3 pt-3 border-t border-slate-200">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <MapPin className="w-4 h-4 text-[#1B5E20]" />
                2. Contact & Delivery Details
              </h3>
              <div className="flex items-center gap-1 bg-slate-100 p-0.5 rounded-lg text-[11px]">
                <button
                  type="button"
                  onClick={() => setCheckoutType('account')}
                  className={`px-2 py-0.5 rounded-md font-bold transition-colors ${
                    checkoutType === 'account' ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-500'
                  }`}
                >
                  Account
                </button>
                <button
                  type="button"
                  onClick={() => setCheckoutType('guest')}
                  className={`px-2 py-0.5 rounded-md font-bold transition-colors ${
                    checkoutType === 'guest' ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-500'
                  }`}
                >
                  Guest Checkout
                </button>
              </div>
            </div>

            {/* Saved Addresses if logged in */}
            {currentUser && currentUser.addresses.length > 0 && (
              <div className="space-y-1.5">
                <label className="block font-bold text-slate-700">Choose from Saved Addresses:</label>
                <div className="grid grid-cols-2 gap-2">
                  {currentUser.addresses.map((addr) => (
                    <button
                      key={addr.id}
                      type="button"
                      onClick={() => {
                        setStreet(addr.street);
                        setCity(addr.city);
                        setUserPostcode(addr.postcode);
                      }}
                      className={`p-2 rounded-xl border text-left text-[11px] ${
                        street === addr.street
                          ? 'border-[#1B5E20] bg-emerald-50 text-emerald-950 font-bold'
                          : 'border-slate-200 bg-white text-slate-600'
                      }`}
                    >
                      <div className="font-bold text-slate-900">{addr.label}</div>
                      <div className="text-slate-500">{addr.street}, {addr.postcode}</div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block font-bold text-slate-700 mb-1">Full Name</label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:ring-2 focus:ring-emerald-500 outline-none"
                />
              </div>
              <div>
                <label className="block font-bold text-slate-700 mb-1">Email Address</label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:ring-2 focus:ring-emerald-500 outline-none"
                />
              </div>
              <div>
                <label className="block font-bold text-slate-700 mb-1">Mobile Phone (for Driver SMS)</label>
                <input
                  type="tel"
                  required
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:ring-2 focus:ring-emerald-500 outline-none"
                />
              </div>
            </div>

            {fulfilmentType === 'delivery' && (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="sm:col-span-2">
                  <label className="block font-bold text-slate-700 mb-1">Street Address</label>
                  <input
                    type="text"
                    required
                    value={street}
                    onChange={(e) => setStreet(e.target.value)}
                    placeholder="e.g. 42 Midsummer Boulevard"
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:ring-2 focus:ring-emerald-500 outline-none"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Postcode</label>
                  <input
                    type="text"
                    required
                    value={userPostcode}
                    onChange={(e) => setUserPostcode(e.target.value.toUpperCase())}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:ring-2 focus:ring-emerald-500 outline-none font-bold"
                  />
                </div>
              </div>
            )}

            <div>
              <label className="block font-bold text-slate-700 mb-1">
                Driver Instructions / Safe Place (Optional)
              </label>
              <input
                type="text"
                value={instructions}
                onChange={(e) => setInstructions(e.target.value)}
                placeholder="e.g. Ring doorbell twice, leave behind flower pot if not answered"
                className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:ring-2 focus:ring-emerald-500 outline-none"
              />
            </div>
          </div>

          {/* STEP 3: SUBSTITUTION PREFERENCE */}
          <div className="space-y-2 pt-3 border-t border-slate-200 bg-slate-50 p-3 rounded-2xl">
            <label className="block font-bold text-slate-900">
              Fresh Food Out-of-Stock Substitution Rule:
            </label>
            <div className="grid grid-cols-3 gap-2">
              {[
                { id: 'best_match', label: 'Best Halal Match', desc: 'Auto-replace with equal/higher quality' },
                { id: 'contact_me', label: 'Call / WhatsApp Me', desc: 'Our team will call before replacing' },
                { id: 'no_substitute', label: 'Do Not Replace', desc: 'Refund item immediately to payment card' },
              ].map((sub) => (
                <button
                  key={sub.id}
                  type="button"
                  onClick={() => setSubstitutionPreference(sub.id as SubstitutionPreference)}
                  className={`p-2 rounded-xl border text-left transition-all ${
                    substitutionPreference === sub.id
                      ? 'border-emerald-600 bg-emerald-100/70 text-emerald-950 font-bold ring-1 ring-emerald-500'
                      : 'border-slate-200 bg-white text-slate-700'
                  }`}
                >
                  <div className="font-bold text-[11px]">{sub.label}</div>
                  <div className="text-[10px] text-slate-500 mt-0.5 leading-tight">{sub.desc}</div>
                </button>
              ))}
            </div>
          </div>

          {/* STEP 4: PAYMENT METHOD & LOYALTY POINTS */}
          <div className="space-y-3 pt-3 border-t border-slate-200">
            <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <CreditCard className="w-4 h-4 text-[#1B5E20]" />
              3. Payment Method
            </h3>

            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => setPaymentMethod('card')}
                className={`p-3 rounded-2xl border text-left transition-all ${
                  paymentMethod === 'card'
                    ? 'border-[#1B5E20] bg-emerald-50 text-emerald-950 font-bold ring-2 ring-emerald-500/20'
                    : 'border-slate-200 bg-white text-slate-700'
                }`}
              >
                <CreditCard className="w-4 h-4 text-[#1B5E20] mb-1" />
                <div className="font-bold text-[11px]">Card Payment</div>
                <div className="text-[10px] text-slate-500">Stripe 3DS Secure</div>
              </button>

              <button
                type="button"
                onClick={() => setPaymentMethod('applepay')}
                className={`p-3 rounded-2xl border text-left transition-all ${
                  paymentMethod === 'applepay'
                    ? 'border-[#1B5E20] bg-emerald-50 text-emerald-950 font-bold ring-2 ring-emerald-500/20'
                    : 'border-slate-200 bg-white text-slate-700'
                }`}
              >
                <Lock className="w-4 h-4 text-slate-900 mb-1" />
                <div className="font-bold text-[11px]">Apple / Google Pay</div>
                <div className="text-[10px] text-slate-500">1-Touch Pay</div>
              </button>

              <button
                type="button"
                onClick={() => setPaymentMethod('cod')}
                className={`p-3 rounded-2xl border text-left transition-all ${
                  paymentMethod === 'cod'
                    ? 'border-[#1B5E20] bg-emerald-50 text-emerald-950 font-bold ring-2 ring-emerald-500/20'
                    : 'border-slate-200 bg-white text-slate-700'
                }`}
              >
                <Store className="w-4 h-4 text-amber-600 mb-1" />
                <div className="font-bold text-[11px]">Cash on Delivery</div>
                <div className="text-[10px] text-slate-500">Pay at Doorstep</div>
              </button>
            </div>

            {/* Loyalty Points Redemption Box */}
            {currentUser && availablePoints > 0 && (
              <div className="bg-amber-50 border border-amber-200 rounded-2xl p-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-amber-600" />
                  <div>
                    <span className="font-bold text-amber-950">Redeem Aheed Club Points</span>
                    <p className="text-[10px] text-amber-800">
                      You have {availablePoints} points (Worth £{(availablePoints / 100).toFixed(2)})
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setRedeemPoints(!redeemPoints)}
                  className={`px-3 py-1.5 rounded-xl font-bold text-xs transition-colors ${
                    redeemPoints
                      ? 'bg-amber-600 text-white'
                      : 'bg-white border border-amber-300 text-amber-900 hover:bg-amber-100'
                  }`}
                >
                  {redeemPoints ? '✓ Applied £' + pointsDiscountPounds.toFixed(2) : 'Apply Points'}
                </button>
              </div>
            )}
          </div>

          {/* Scale Guarantee Notice */}
          <div className="bg-slate-50 border border-slate-200 rounded-2xl p-3 text-[11px] text-slate-600 flex items-start gap-2">
            <Scale className="w-4 h-4 text-emerald-700 shrink-0 mt-0.5" />
            <span>
              <strong>Master Butcher Scale Notice:</strong> Variable-weight items are weighed on calibrated store scales. You will be notified with your final exact itemised receipt upon dispatch.
            </span>
          </div>

          {/* Total Breakdown & Place Order Button */}
          <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 space-y-2">
            <div className="flex justify-between text-slate-600">
              <span>Basket Subtotal</span>
              <span className="font-bold text-slate-900">£{subtotal.toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-slate-600">
              <span>Delivery Fee ({fulfilmentType === 'click_and_collect' ? 'Store Pickup' : userPostcode})</span>
              <span className="font-bold text-slate-900">
                {deliveryFee === 0 ? <span className="text-[#1B5E20]">FREE</span> : `£${deliveryFee.toFixed(2)}`}
              </span>
            </div>
            {pointsDiscountPounds > 0 && (
              <div className="flex justify-between text-amber-700 font-bold">
                <span>Loyalty Points Discount</span>
                <span>- £{pointsDiscountPounds.toFixed(2)}</span>
              </div>
            )}
            <div className="flex justify-between text-base font-extrabold text-slate-900 pt-2 border-t border-slate-200">
              <span>Final Total to Pay</span>
              <span className="text-xl text-[#1B5E20]">£{total.toFixed(2)}</span>
            </div>
          </div>

          {/* Submit Button */}
          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full py-4 rounded-2xl bg-[#1B5E20] hover:bg-emerald-800 text-white font-extrabold text-sm shadow-lg hover:shadow-xl transition-all active:scale-98 flex items-center justify-center gap-2"
          >
            {isSubmitting ? (
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                <span>Authorising Payment & Dispatching Order...</span>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <Lock className="w-4 h-4" />
                <span>Confirm & Place Order (£{total.toFixed(2)})</span>
              </div>
            )}
          </button>
        </form>
      </div>
    </div>
  );
};
