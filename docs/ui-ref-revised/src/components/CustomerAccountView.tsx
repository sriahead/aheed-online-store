import React, { useState } from 'react';
import { UserAccount, Order, SavedAddress, Product } from '../types';
import {
  User,
  MapPin,
  Clock,
  Sparkles,
  ShieldCheck,
  Plus,
  Trash2,
  Edit,
  Repeat,
  ShoppingBag,
  Heart,
  ChevronRight,
  Gift,
  Award,
  CheckCircle2,
  Scale
} from 'lucide-react';

interface CustomerAccountViewProps {
  currentUser: UserAccount | null;
  orders: Order[];
  onReorder: (order: Order) => void;
  onOpenOrderTracking: (order: Order) => void;
  onUpdateAddresses?: (addresses: SavedAddress[]) => void;
  wishlistedProducts: Product[];
  onAddToCart: (product: Product) => void;
  onOpenProductDetail: (product: Product) => void;
  onOpenWhatsApp: () => void;
}

export const CustomerAccountView: React.FC<CustomerAccountViewProps> = ({
  currentUser,
  orders,
  onReorder,
  onOpenOrderTracking,
  onUpdateAddresses,
  wishlistedProducts,
  onAddToCart,
  onOpenProductDetail,
  onOpenWhatsApp,
}) => {
  const [activeTab, setActiveTab] = useState<'orders' | 'addresses' | 'wishlist' | 'loyalty' | 'butcher_pref'>('orders');
  const [addresses, setAddresses] = useState<SavedAddress[]>(currentUser?.addresses || []);
  const [isAddingAddress, setIsAddingAddress] = useState(false);
  const [newLabel, setNewLabel] = useState('Home');
  const [newStreet, setNewStreet] = useState('');
  const [newPostcode, setNewPostcode] = useState('MK9 3BP');

  // Butcher Preferences
  const [defaultMeatPrep, setDefaultMeatPrep] = useState('Skinless & Fat Trimmed');
  const [defaultCutSize, setDefaultCutSize] = useState('Medium Diced (1.5 inch)');

  if (!currentUser) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-16 text-center space-y-4">
        <div className="w-16 h-16 rounded-full bg-slate-100 flex items-center justify-center mx-auto text-slate-400">
          <User className="w-8 h-8" />
        </div>
        <h2 className="text-xl font-bold text-slate-800">You are browsing as a Guest</h2>
        <p className="text-xs text-slate-500 max-w-sm mx-auto">
          Please sign in to access your order history, 1-click reordering, saved Milton Keynes delivery addresses, and Aheed Club loyalty points.
        </p>
      </div>
    );
  }

  const handleAddAddress = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newStreet || !newPostcode) return;

    const newAddr: SavedAddress = {
      id: `addr-${Date.now()}`,
      label: newLabel,
      street: newStreet,
      city: 'Milton Keynes',
      postcode: newPostcode.toUpperCase(),
      isDefault: addresses.length === 0,
    };

    const updated = [...addresses, newAddr];
    setAddresses(updated);
    if (onUpdateAddresses) onUpdateAddresses(updated);
    setIsAddingAddress(false);
    setNewStreet('');
  };

  const handleSetDefault = (id: string) => {
    const updated = addresses.map((a) => ({ ...a, isDefault: a.id === id }));
    setAddresses(updated);
    if (onUpdateAddresses) onUpdateAddresses(updated);
  };

  const handleDeleteAddress = (id: string) => {
    const updated = addresses.filter((a) => a.id !== id);
    setAddresses(updated);
    if (onUpdateAddresses) onUpdateAddresses(updated);
  };

  return (
    <div className="max-w-6xl mx-auto px-4 py-8 space-y-6">
      {/* Account Profile Banner */}
      <div className="bg-linear-to-r from-[#1B5E20] via-emerald-800 to-emerald-950 text-white p-6 rounded-3xl shadow-xl flex flex-wrap items-center justify-between gap-4 border border-emerald-700/50">
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 rounded-3xl bg-white text-[#1B5E20] font-black text-2xl flex items-center justify-center shadow-lg border-2 border-emerald-300">
            {currentUser.name.charAt(0)}
          </div>
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <h1 className="text-xl sm:text-2xl font-extrabold tracking-tight">{currentUser.name}</h1>
              <span className="bg-emerald-500/30 text-emerald-200 text-[10px] font-bold px-2.5 py-0.5 rounded-full border border-emerald-400/40 uppercase">
                {currentUser.role}
              </span>
            </div>
            <p className="text-xs text-emerald-100">
              {currentUser.email} • {currentUser.phone}
            </p>
            <p className="text-[11px] text-emerald-200/80">
              Member since {currentUser.joinedDate} • Milton Keynes Customer
            </p>
          </div>
        </div>

        {/* Loyalty Points Pill */}
        <div className="bg-emerald-900/80 border border-emerald-500/40 p-3.5 rounded-2xl flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-amber-400 text-amber-950 flex items-center justify-center font-bold">
            <Award className="w-6 h-6" />
          </div>
          <div>
            <span className="text-[11px] text-emerald-200 font-medium">Aheed Club Points</span>
            <div className="text-xl font-extrabold text-amber-300">
              {currentUser.loyaltyPoints} <span className="text-xs text-emerald-200 font-normal">pts</span>
            </div>
            <span className="text-[10px] text-emerald-300">Worth £{(currentUser.loyaltyPoints / 100).toFixed(2)} off next order</span>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-slate-200 gap-2 overflow-x-auto no-scrollbar">
        {[
          { id: 'orders', label: `Order History & Buy Again (${orders.length})`, icon: Clock },
          { id: 'addresses', label: `Saved Delivery Addresses (${addresses.length})`, icon: MapPin },
          { id: 'wishlist', label: `Saved Favourites (${wishlistedProducts.length})`, icon: Heart },
          { id: 'butcher_pref', label: 'My Meat & Butchery Preferences', icon: Scale },
          { id: 'loyalty', label: 'Loyalty Rewards & Vouchers', icon: Gift },
        ].map((t) => {
          const Icon = t.icon;
          const isSelected = activeTab === t.id;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setActiveTab(t.id as any)}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-t-2xl font-bold text-xs whitespace-nowrap transition-colors ${
                isSelected
                  ? 'bg-white border-t border-x border-slate-200 text-[#1B5E20] -mb-px'
                  : 'text-slate-500 hover:text-slate-900'
              }`}
            >
              <Icon className="w-4 h-4" />
              <span>{t.label}</span>
            </button>
          );
        })}
      </div>

      {/* TAB 1: ORDER HISTORY & BUY AGAIN (Pareto Group 6 Core) */}
      {activeTab === 'orders' && (
        <div className="space-y-4">
          {orders.length === 0 ? (
            <div className="bg-white p-12 rounded-3xl border border-slate-200 text-center space-y-2">
              <Clock className="w-10 h-10 text-slate-300 mx-auto" />
              <h3 className="font-bold text-slate-800 text-sm">No previous grocery orders found</h3>
              <p className="text-xs text-slate-500">Your completed deliveries will appear here with 1-click reordering.</p>
            </div>
          ) : (
            orders.map((ord) => (
              <div
                key={ord.id}
                className="bg-white p-5 rounded-3xl border border-slate-200 shadow-xs space-y-4 hover:border-slate-300 transition-colors"
              >
                <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-100">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-extrabold text-slate-900 text-sm">{ord.id}</span>
                      <span className="text-xs text-slate-400">• {ord.createdAt}</span>
                    </div>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      Delivered to {ord.deliveryAddress.street}, {ord.deliveryAddress.postcode}
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => onOpenOrderTracking(ord)}
                      className="bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-xs px-3.5 py-1.5 rounded-xl transition-colors"
                    >
                      Track Order ({ord.status})
                    </button>

                    <button
                      type="button"
                      onClick={() => onReorder(ord)}
                      className="bg-[#1B5E20] hover:bg-emerald-800 text-white font-bold text-xs px-4 py-1.5 rounded-xl shadow-xs flex items-center gap-1.5 transition-colors active:scale-95"
                    >
                      <Repeat className="w-3.5 h-3.5" />
                      <span>Buy Again (1-Click Reorder)</span>
                    </button>
                  </div>
                </div>

                {/* Items in this order */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {ord.items.map((item, i) => (
                    <div
                      key={i}
                      className="p-2.5 bg-slate-50 rounded-2xl border border-slate-200/80 flex items-center gap-2.5"
                    >
                      <img
                        src={item.product.image}
                        alt={item.product.name}
                        className="w-12 h-12 rounded-xl object-cover border border-slate-200 shrink-0"
                      />
                      <div className="min-w-0 flex-1 text-xs">
                        <div className="font-bold text-slate-900 truncate">{item.product.name}</div>
                        <div className="text-[11px] text-slate-500">
                          {item.quantity}x {item.selectedVariant?.name || item.product.unit}
                        </div>
                        {item.selectedCut && (
                          <div className="text-[10px] text-red-700 font-semibold truncate">
                            Cut: {item.selectedCut}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>

                <div className="flex justify-between items-center text-xs pt-2 text-slate-600">
                  <span>Payment: <strong>{ord.paymentMethod}</strong></span>
                  <span>Total: <strong className="text-sm text-[#1B5E20]">£{ord.total.toFixed(2)}</strong></span>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* TAB 2: SAVED ADDRESSES (Pareto Group 3 & 6) */}
      {activeTab === 'addresses' && (
        <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-xs space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-extrabold text-slate-900 text-base">Saved Milton Keynes Delivery Locations</h3>
              <p className="text-xs text-slate-500">Manage drop-off addresses for quick 1-touch checkout.</p>
            </div>

            <button
              type="button"
              onClick={() => setIsAddingAddress(!isAddingAddress)}
              className="bg-[#1B5E20] hover:bg-emerald-800 text-white font-bold text-xs px-4 py-2 rounded-xl shadow-xs flex items-center gap-1.5"
            >
              <Plus className="w-4 h-4" />
              <span>Add New Address</span>
            </button>
          </div>

          {isAddingAddress && (
            <form onSubmit={handleAddAddress} className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-3 text-xs">
              <h4 className="font-bold text-slate-900 text-sm">Add Address:</h4>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Label</label>
                  <input
                    type="text"
                    required
                    value={newLabel}
                    onChange={(e) => setNewLabel(e.target.value)}
                    placeholder="e.g. Home, Office, Parents"
                    className="w-full px-3 py-1.5 rounded-xl border border-slate-300 bg-white"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Street Address</label>
                  <input
                    type="text"
                    required
                    value={newStreet}
                    onChange={(e) => setNewStreet(e.target.value)}
                    placeholder="e.g. 42 Midsummer Blvd"
                    className="w-full px-3 py-1.5 rounded-xl border border-slate-300 bg-white"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Postcode</label>
                  <input
                    type="text"
                    required
                    value={newPostcode}
                    onChange={(e) => setNewPostcode(e.target.value.toUpperCase())}
                    className="w-full px-3 py-1.5 rounded-xl border border-slate-300 bg-white font-bold"
                  />
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsAddingAddress(false)}
                  className="px-3 py-1.5 rounded-xl bg-slate-200 text-slate-700 font-bold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 rounded-xl bg-[#1B5E20] text-white font-bold"
                >
                  Save Address
                </button>
              </div>
            </form>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {addresses.map((addr) => (
              <div
                key={addr.id}
                className="p-4 bg-slate-50 rounded-2xl border border-slate-200/90 space-y-3 flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between">
                    <span className="font-extrabold text-slate-900 text-sm">{addr.label}</span>
                    {addr.isDefault && (
                      <span className="bg-emerald-100 text-emerald-900 text-[10px] font-bold px-2 py-0.5 rounded-md border border-emerald-200">
                        Default Address
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-600 mt-1">
                    {addr.street}, {addr.city}
                  </p>
                  <p className="text-xs font-bold text-slate-900 mt-0.5">{addr.postcode}</p>
                </div>

                <div className="flex items-center justify-between pt-2 border-t border-slate-200/80 text-xs">
                  {!addr.isDefault ? (
                    <button
                      type="button"
                      onClick={() => handleSetDefault(addr.id)}
                      className="text-emerald-700 hover:underline font-bold"
                    >
                      Set as Default
                    </button>
                  ) : (
                    <span className="text-slate-400 text-[11px]">Primary delivery point</span>
                  )}

                  <button
                    type="button"
                    onClick={() => handleDeleteAddress(addr.id)}
                    className="text-rose-600 hover:text-rose-800 p-1"
                    title="Delete address"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB 3: WISHLIST (Pareto Group 6) */}
      {activeTab === 'wishlist' && (
        <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-xs space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-extrabold text-slate-900 text-base">Your Saved Grocery Favourites</h3>
            <span className="text-xs text-slate-500">{wishlistedProducts.length} items saved</span>
          </div>

          {wishlistedProducts.length === 0 ? (
            <div className="p-8 text-center text-slate-400 space-y-2">
              <Heart className="w-8 h-8 mx-auto text-slate-300" />
              <p className="text-xs">You have no wishlisted items yet. Click the heart icon on any product.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {wishlistedProducts.map((p) => (
                <div
                  key={p.id}
                  className="bg-slate-50 p-3 rounded-2xl border border-slate-200 flex items-center justify-between gap-3"
                >
                  <div
                    className="flex items-center gap-3 cursor-pointer flex-1 min-w-0"
                    onClick={() => onOpenProductDetail(p)}
                  >
                    <img
                      src={p.image}
                      alt={p.name}
                      className="w-12 h-12 rounded-xl object-cover border border-slate-200 shrink-0"
                    />
                    <div className="min-w-0">
                      <h4 className="font-bold text-slate-900 text-xs truncate">{p.name}</h4>
                      <span className="font-extrabold text-[#1B5E20] text-xs">£{p.price.toFixed(2)}</span>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => onAddToCart(p)}
                    className="bg-[#1B5E20] hover:bg-emerald-800 text-white font-bold text-xs px-3 py-1.5 rounded-xl shadow-2xs shrink-0"
                  >
                    Add
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* TAB 4: BUTCHERY PREFERENCES (Pareto Group 4) */}
      {activeTab === 'butcher_pref' && (
        <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-xs space-y-4">
          <div className="flex items-center gap-2">
            <Scale className="w-5 h-5 text-red-600" />
            <h3 className="font-extrabold text-slate-900 text-base">Default Master Butcher Cutting Preferences</h3>
          </div>
          <p className="text-xs text-slate-600">
            Save your family's preferred meat cut sizing and preparation style so our master butcher automatically applies them to your future orders.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs pt-2">
            <div className="space-y-1.5">
              <label className="block font-bold text-slate-800">Preferred Meat Preparation Style:</label>
              <select
                value={defaultMeatPrep}
                onChange={(e) => setDefaultMeatPrep(e.target.value)}
                className="w-full p-2.5 rounded-xl border border-slate-300 bg-slate-50"
              >
                <option value="Standard">Standard Clean</option>
                <option value="Skinless & Fat Trimmed">Skinless & Extra Fat Trimmed</option>
                <option value="Skin-on (For roasting)">Skin-on (For roasting)</option>
                <option value="Washed with salt and lemon">Washed with salt and lemon</option>
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="block font-bold text-slate-800">Default Curry Piece Sizing:</label>
              <select
                value={defaultCutSize}
                onChange={(e) => setDefaultCutSize(e.target.value)}
                className="w-full p-2.5 rounded-xl border border-slate-300 bg-slate-50"
              >
                <option value="Small Diced (1 inch)">Small Diced (1 inch - Handi style)</option>
                <option value="Medium Diced (1.5 inch)">Medium Diced (1.5 inch - Standard)</option>
                <option value="Large Biryani Cut (2 inch)">Large Biryani Cut (2 inch)</option>
              </select>
            </div>
          </div>

          <div className="p-3 bg-emerald-50 rounded-2xl border border-emerald-200 text-xs text-emerald-900 flex items-center justify-between">
            <span className="font-semibold">Need special whole lamb or catering slaughter cuts?</span>
            <button
              type="button"
              onClick={onOpenWhatsApp}
              className="bg-[#1B5E20] text-white font-bold px-3 py-1.5 rounded-xl shadow-2xs"
            >
              WhatsApp Master Butcher
            </button>
          </div>
        </div>
      )}

      {/* TAB 5: LOYALTY (Pareto Group 5) */}
      {activeTab === 'loyalty' && (
        <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-xs space-y-4">
          <div className="flex items-center gap-2">
            <Gift className="w-5 h-5 text-amber-600" />
            <h3 className="font-extrabold text-slate-900 text-base">Aheed Club Loyalty Rewards</h3>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
            <div className="p-4 rounded-2xl bg-amber-50 border border-amber-200 space-y-1">
              <span className="font-bold text-amber-950">£5.00 Off Voucher</span>
              <p className="text-[11px] text-amber-800">500 points required</p>
              <button
                type="button"
                disabled={currentUser.loyaltyPoints < 500}
                className="mt-2 w-full py-1.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-bold disabled:opacity-50"
              >
                Redeem Voucher
              </button>
            </div>

            <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-200 space-y-1">
              <span className="font-bold text-emerald-950">FREE Priority Delivery</span>
              <p className="text-[11px] text-emerald-800">250 points required</p>
              <button
                type="button"
                disabled={currentUser.loyaltyPoints < 250}
                className="mt-2 w-full py-1.5 rounded-xl bg-[#1B5E20] hover:bg-emerald-800 text-white font-bold disabled:opacity-50"
              >
                Redeem Free Delivery
              </button>
            </div>

            <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-1">
              <span className="font-bold text-slate-900">Complimentary Desi Ghee Tin</span>
              <p className="text-[11px] text-slate-500">600 points required</p>
              <button
                type="button"
                disabled={currentUser.loyaltyPoints < 600}
                className="mt-2 w-full py-1.5 rounded-xl bg-slate-800 text-white font-bold disabled:opacity-50"
              >
                Redeem Gift
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
