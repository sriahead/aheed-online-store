import React, { useState } from 'react';
import { UserAccount, Order, Product, CartItem, SavedAddress } from '../types';
import {
  User,
  MapPin,
  Clock,
  Award,
  RotateCcw,
  Plus,
  CheckCircle2,
  Truck,
  ShieldCheck,
  ChevronRight,
  Sparkles,
  KeyRound,
  LogOut,
  ShoppingBag
} from 'lucide-react';

interface CustomerAccountViewProps {
  currentUser: UserAccount | null;
  orders: Order[];
  onAddToCart: (product: Product, quantity: number) => void;
  onTrackOrder: (order: Order) => void;
  onLogout: () => void;
  onSwitchToHelp: () => void;
}

export const CustomerAccountView: React.FC<CustomerAccountViewProps> = ({
  currentUser,
  orders,
  onAddToCart,
  onTrackOrder,
  onLogout,
  onSwitchToHelp,
}) => {
  const [activeTab, setActiveTab] = useState<'orders' | 'loyalty' | 'addresses' | 'auth_session'>('orders');
  const [addresses, setAddresses] = useState<SavedAddress[]>(currentUser?.addresses || []);
  const [isAddingAddress, setIsAddingAddress] = useState(false);
  const [newLabel, setNewLabel] = useState('');
  const [newStreet, setNewStreet] = useState('');
  const [newPostcode, setNewPostcode] = useState('LE2 ');

  if (!currentUser) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-16 text-center">
        <div className="w-16 h-16 rounded-full bg-emerald-100 text-[#1B5E20] flex items-center justify-center mx-auto mb-4">
          <User className="w-8 h-8" />
        </div>
        <h2 className="text-2xl font-bold text-slate-900">Sign In to Your Aheed Account</h2>
        <p className="text-sm text-slate-600 mt-2 max-w-md mx-auto">
          Access your Leicester grocery order history, live HMC halal meat delivery tracking, and earn 100+ loyalty points on fresh produce.
        </p>
        <button
          type="button"
          onClick={onLogout}
          className="mt-6 bg-[#1B5E20] hover:bg-emerald-800 text-white font-bold px-6 py-3 rounded-2xl shadow-md transition-all inline-flex items-center gap-2 text-sm"
        >
          <User className="w-4 h-4 text-amber-300" />
          <span>Sign In / Switch User Account</span>
        </button>
      </div>
    );
  }

  const handleAddAddress = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newStreet || !newPostcode) return;

    const newAddr: SavedAddress = {
      id: `addr-${Date.now()}`,
      label: newLabel || 'Home',
      street: newStreet,
      city: 'Leicester',
      postcode: newPostcode.toUpperCase(),
      isDefault: addresses.length === 0,
    };

    setAddresses((prev) => [...prev, newAddr]);
    setNewLabel('');
    setNewStreet('');
    setNewPostcode('LE2 ');
    setIsAddingAddress(false);
  };

  const handleReorder = (order: Order) => {
    order.items.forEach((item) => {
      onAddToCart(item.product, item.quantity);
    });
  };

  const userOrders = orders.filter((o) => o.customerEmail === currentUser.email || !o.isGuestOrder);

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      {/* User Header Profile Banner */}
      <div className="bg-gradient-to-r from-[#1B5E20] via-emerald-800 to-[#1B5E20] rounded-2xl p-6 text-white shadow-lg mb-8 flex flex-wrap items-center justify-between gap-6">
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 rounded-2xl bg-white/10 backdrop-blur-xs flex items-center justify-center text-white text-2xl font-bold border border-white/20">
            {currentUser.name.charAt(0)}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold">{currentUser.name}</h1>
              <span className="bg-amber-400 text-slate-900 text-xs font-extrabold px-2.5 py-0.5 rounded-full flex items-center gap-1 shadow-xs">
                <ShieldCheck className="w-3.5 h-3.5" />
                Better Auth Verified
              </span>
            </div>
            <p className="text-emerald-100 text-sm">{currentUser.email} • {currentUser.phone}</p>
            <p className="text-xs text-emerald-200/80 mt-1">Member since {currentUser.joinedDate}</p>
          </div>
        </div>

        {/* Loyalty Quick Pill & Logout */}
        <div className="flex items-center gap-4">
          <div className="bg-white/15 backdrop-blur-md rounded-xl p-3 text-right border border-white/20">
            <div className="text-xs text-emerald-100 font-medium flex items-center justify-end gap-1">
              <Award className="w-4 h-4 text-amber-300" />
              Aheed Loyalty Points
            </div>
            <div className="text-2xl font-extrabold text-amber-300">
              {currentUser.loyaltyPoints} <span className="text-xs text-white font-medium">pts</span>
            </div>
            <div className="text-[11px] text-emerald-200">
              Worth £{(currentUser.loyaltyPoints / 100).toFixed(2)} off next order
            </div>
          </div>

          <button
            type="button"
            onClick={onLogout}
            className="flex items-center gap-1.5 bg-white/10 hover:bg-white/20 text-white px-3.5 py-2 rounded-xl text-xs font-semibold border border-white/20 transition-all"
          >
            <LogOut className="w-4 h-4" />
            Sign Out
          </button>
        </div>
      </div>

      {/* Tabs Navigation */}
      <div className="flex border-b border-slate-200 mb-8 overflow-x-auto">
        <button
          type="button"
          onClick={() => setActiveTab('orders')}
          className={`flex items-center gap-2 px-5 py-3 text-sm font-semibold border-b-2 transition-all whitespace-nowrap ${
            activeTab === 'orders'
              ? 'border-[#1B5E20] text-[#1B5E20]'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <Clock className="w-4 h-4" />
          Order History & Live Status
          {userOrders.length > 0 && (
            <span className="bg-emerald-100 text-[#1B5E20] text-xs font-bold px-2 py-0.5 rounded-full">
              {userOrders.length}
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('loyalty')}
          className={`flex items-center gap-2 px-5 py-3 text-sm font-semibold border-b-2 transition-all whitespace-nowrap ${
            activeTab === 'loyalty'
              ? 'border-[#1B5E20] text-[#1B5E20]'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <Award className="w-4 h-4" />
          Loyalty Rewards
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('addresses')}
          className={`flex items-center gap-2 px-5 py-3 text-sm font-semibold border-b-2 transition-all whitespace-nowrap ${
            activeTab === 'addresses'
              ? 'border-[#1B5E20] text-[#1B5E20]'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <MapPin className="w-4 h-4" />
          Saved Addresses ({addresses.length})
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('auth_session')}
          className={`flex items-center gap-2 px-5 py-3 text-sm font-semibold border-b-2 transition-all whitespace-nowrap ${
            activeTab === 'auth_session'
              ? 'border-[#1B5E20] text-[#1B5E20]'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <KeyRound className="w-4 h-4" />
          Better Auth Session
        </button>
      </div>

      {/* Tab 1: Orders */}
      {activeTab === 'orders' && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-slate-900">Your Recent Grocery Orders</h2>
            <button
              type="button"
              onClick={onSwitchToHelp}
              className="text-xs text-[#1B5E20] font-semibold hover:underline flex items-center gap-1"
            >
              How delivery tracking works →
            </button>
          </div>

          {userOrders.length === 0 ? (
            <div className="bg-white rounded-2xl p-12 text-center border border-slate-200">
              <ShoppingBag className="w-12 h-12 text-slate-300 mx-auto mb-3" />
              <h3 className="font-bold text-slate-800 text-base">No orders yet</h3>
              <p className="text-slate-500 text-sm max-w-sm mx-auto mt-1 mb-4">
                Place your first order as a logged-in customer to earn points and track live Leicester delivery!
              </p>
            </div>
          ) : (
            userOrders.map((order) => (
              <div
                key={order.id}
                className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs hover:border-emerald-300 transition-all"
              >
                <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-slate-100">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-extrabold text-slate-900">Order #{order.id}</span>
                      <span
                        className={`text-xs font-bold px-2.5 py-0.5 rounded-full flex items-center gap-1 ${
                          order.status === 'Confirmed'
                            ? 'bg-blue-100 text-blue-800'
                            : order.status === 'Out for delivery'
                            ? 'bg-amber-100 text-amber-800'
                            : 'bg-emerald-100 text-emerald-800'
                        }`}
                      >
                        {order.status === 'Delivered' ? (
                          <CheckCircle2 className="w-3.5 h-3.5" />
                        ) : (
                          <Truck className="w-3.5 h-3.5 animate-bounce" />
                        )}
                        {order.status}
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 mt-1">
                      Placed on {order.createdAt} • Delivery to {order.deliveryAddress.street}, {order.deliveryAddress.postcode}
                    </p>
                  </div>

                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => onTrackOrder(order)}
                      className="px-3.5 py-2 bg-emerald-50 hover:bg-emerald-100 text-[#1B5E20] rounded-xl text-xs font-bold border border-emerald-200 transition-colors"
                    >
                      Track Delivery Status
                    </button>
                    <button
                      type="button"
                      onClick={() => handleReorder(order)}
                      className="px-3.5 py-2 bg-[#1B5E20] hover:bg-emerald-800 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      Reorder Basket
                    </button>
                  </div>
                </div>

                {/* Items preview */}
                <div className="py-4 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                  {order.items.map((item) => (
                    <div key={item.product.id} className="flex items-center gap-3 bg-slate-50 p-2.5 rounded-xl border border-slate-100">
                      <img
                        src={item.product.image}
                        alt={item.product.name}
                        className="w-12 h-12 object-cover rounded-lg"
                      />
                      <div className="text-xs">
                        <p className="font-semibold text-slate-800 line-clamp-1">{item.product.name}</p>
                        <p className="text-slate-500">
                          Qty: {item.quantity} × £{item.product.price.toFixed(2)}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="flex items-center justify-between pt-3 border-t border-slate-100 text-xs text-slate-600">
                  <span>Earned: <strong className="text-amber-600">+{order.pointsEarned || Math.floor(order.total)} Points</strong></span>
                  <span className="text-sm font-extrabold text-slate-900">Total Paid: £{order.total.toFixed(2)}</span>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* Tab 2: Loyalty */}
      {activeTab === 'loyalty' && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="md:col-span-2 bg-white rounded-2xl border border-slate-200 p-6 shadow-xs">
            <h3 className="font-bold text-slate-900 text-base mb-2 flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-amber-500" />
              How Aheed Loyalty Points Work
            </h3>
            <p className="text-sm text-slate-600 leading-relaxed mb-6">
              Every time you shop at Aheed Food Centre online, you earn points automatically on your account. Points can be redeemed for instant discounts at checkout!
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
              <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4">
                <span className="text-xs font-bold text-emerald-800 uppercase tracking-wider">Earn Rate</span>
                <p className="text-2xl font-black text-[#1B5E20] mt-1">1 Point = £1 Spent</p>
                <p className="text-xs text-emerald-700 mt-1">Points credited automatically upon order delivery.</p>
              </div>

              <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
                <span className="text-xs font-bold text-amber-800 uppercase tracking-wider">Redeem Rate</span>
                <p className="text-2xl font-black text-amber-700 mt-1">100 Pts = £1 Off</p>
                <p className="text-xs text-amber-800 mt-1">Select point discount during Stripe checkout.</p>
              </div>
            </div>

            <h4 className="font-bold text-slate-800 text-sm mb-3">Your Points Breakdown</h4>
            <div className="bg-slate-50 rounded-xl p-4 border border-slate-200 space-y-2 text-xs">
              <div className="flex justify-between py-1 border-b border-slate-200">
                <span className="text-slate-600">Current Balance</span>
                <span className="font-bold text-slate-900">{currentUser.loyaltyPoints} Points</span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-200">
                <span className="text-slate-600">Equivalent Discount Value</span>
                <span className="font-bold text-[#1B5E20]">£{(currentUser.loyaltyPoints / 100).toFixed(2)} GBP</span>
              </div>
              <div className="flex justify-between py-1">
                <span className="text-slate-600">Lifetime Points Earned</span>
                <span className="font-bold text-slate-900">{currentUser.loyaltyPoints + 180} Points</span>
              </div>
            </div>
          </div>

          <div className="bg-gradient-to-br from-amber-500 to-amber-600 text-slate-950 rounded-2xl p-6 shadow-md flex flex-col justify-between">
            <div>
              <Award className="w-10 h-10 mb-4 text-slate-950" />
              <h3 className="text-xl font-extrabold mb-1">Loyalty Tier: Silver</h3>
              <p className="text-xs font-medium text-amber-950 mb-4">
                Shop £80 more this month to unlock Gold Member benefits (1.5x points multiplier).
              </p>
            </div>

            <div className="bg-amber-950/10 p-4 rounded-xl border border-amber-950/20 text-xs">
              <p className="font-bold mb-1">Aheed Creed Guarantee:</p>
              <p className="text-[11px] leading-snug">
                No expiry on points as long as you place 1 order per 12 months.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Tab 3: Addresses */}
      {activeTab === 'addresses' && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-slate-900 text-base">Saved Leicester Delivery Addresses</h3>
            <button
              type="button"
              onClick={() => setIsAddingAddress(!isAddingAddress)}
              className="flex items-center gap-1.5 bg-[#1B5E20] hover:bg-emerald-800 text-white px-3.5 py-2 rounded-xl text-xs font-bold transition-colors"
            >
              <Plus className="w-4 h-4" />
              Add New Address
            </button>
          </div>

          {isAddingAddress && (
            <form onSubmit={handleAddAddress} className="bg-emerald-50 border border-emerald-200 p-5 rounded-2xl space-y-3">
              <h4 className="font-bold text-slate-900 text-sm">Add New Leicester Delivery Address</h4>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <input
                  type="text"
                  placeholder="Label (e.g. Home, Parents, Work)"
                  value={newLabel}
                  onChange={(e) => setNewLabel(e.target.value)}
                  className="bg-white p-2.5 rounded-xl border border-slate-300 text-xs focus:outline-none focus:border-[#1B5E20]"
                />
                <input
                  type="text"
                  placeholder="Street Address (e.g. 42 Evington Valley Rd)"
                  value={newStreet}
                  onChange={(e) => setNewStreet(e.target.value)}
                  required
                  className="bg-white p-2.5 rounded-xl border border-slate-300 text-xs sm:col-span-2 focus:outline-none focus:border-[#1B5E20]"
                />
              </div>
              <div className="flex items-center gap-3">
                <input
                  type="text"
                  placeholder="Leicester Postcode (e.g. LE2 2BD)"
                  value={newPostcode}
                  onChange={(e) => setNewPostcode(e.target.value)}
                  required
                  className="bg-white p-2.5 rounded-xl border border-slate-300 text-xs w-48 focus:outline-none focus:border-[#1B5E20]"
                />
                <button
                  type="submit"
                  className="bg-[#1B5E20] hover:bg-emerald-800 text-white text-xs font-bold px-4 py-2.5 rounded-xl"
                >
                  Save Address
                </button>
              </div>
            </form>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {addresses.map((addr) => (
              <div key={addr.id} className="bg-white rounded-2xl border border-slate-200 p-5 relative shadow-xs">
                {addr.isDefault && (
                  <span className="absolute top-4 right-4 bg-emerald-100 text-[#1B5E20] text-[10px] font-extrabold px-2 py-0.5 rounded-full">
                    Default
                  </span>
                )}
                <div className="flex items-center gap-2 mb-2">
                  <MapPin className="w-4 h-4 text-[#1B5E20]" />
                  <span className="font-bold text-slate-900 text-sm">{addr.label}</span>
                </div>
                <p className="text-xs text-slate-600">{addr.street}</p>
                <p className="text-xs text-slate-600">{addr.city}, {addr.postcode}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tab 4: Better Auth Session Details */}
      {activeTab === 'auth_session' && (
        <div className="bg-slate-900 text-slate-100 rounded-2xl p-6 border border-slate-800 font-mono text-xs space-y-4">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <span className="text-emerald-400 font-bold flex items-center gap-2">
              <ShieldCheck className="w-4 h-4" />
              Better Auth Session Inspection (ADR-002)
            </span>
            <span className="bg-emerald-900/50 text-emerald-300 px-2 py-0.5 rounded text-[10px]">
              Active Session
            </span>
          </div>

          <div className="space-y-2">
            <p><span className="text-slate-500">Session ID:</span> {currentUser.betterAuthToken || 'ba_sess_live_99201'}</p>
            <p><span className="text-slate-500">User ID:</span> {currentUser.id}</p>
            <p><span className="text-slate-500">Role Claim:</span> <span className="text-amber-400 font-bold">{currentUser.role}</span></p>
            <p><span className="text-slate-500">Auth Method:</span> Passwordless / Email Verification</p>
            <p><span className="text-slate-500">Issuer:</span> Better Auth (Cloudflare Worker Origin)</p>
          </div>

          <div className="bg-slate-950 p-3 rounded-xl border border-slate-800 text-[11px] text-slate-400 overflow-x-auto">
            <p className="text-slate-500 mb-1">// Session JWT Token Snippet</p>
            <code>
              eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ1c3ItMSIsIm5hbWUiOiJTYXJhaCBBaG1lZCIsInJvbGUiOiJjdXN0b21lciIsImlhdCI6MTcyMzE5OTkwMH0
            </code>
          </div>
        </div>
      )}
    </div>
  );
};
