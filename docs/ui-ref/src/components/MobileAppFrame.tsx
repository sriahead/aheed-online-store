import React, { useState } from 'react';
import { Product, CategoryId, CartItem, Order } from '../types';
import { CATEGORIES, PRODUCTS } from '../data/products';
import {
  Search,
  ShoppingBag,
  Home,
  Grid,
  ClipboardList,
  User,
  Star,
  Plus,
  Minus,
  Check,
  ChevronLeft,
  Sparkles,
  ArrowRight,
  ShieldCheck,
  Clock,
  Truck
} from 'lucide-react';

interface MobileAppFrameProps {
  products: Product[];
  selectedCategory: CategoryId;
  setSelectedCategory: (cat: CategoryId) => void;
  searchQuery: string;
  setSearchQuery: (q: string) => void;
  cartItems: CartItem[];
  onAddToCart: (product: Product, e: React.MouseEvent) => void;
  onUpdateCartQuantity: (productId: string, delta: number) => void;
  onProductClick: (product: Product) => void;
  onProceedToCheckout: () => void;
  activeOrder: Order | null;
  onTrackOrder: () => void;
}

export const MobileAppFrame: React.FC<MobileAppFrameProps> = ({
  products,
  selectedCategory,
  setSelectedCategory,
  searchQuery,
  setSearchQuery,
  cartItems,
  onAddToCart,
  onUpdateCartQuantity,
  onProductClick,
  onProceedToCheckout,
  activeOrder,
  onTrackOrder,
}) => {
  const [mobileTab, setMobileTab] = useState<'home' | 'categories' | 'cart' | 'orders'>('home');
  const [showDeviceFrame, setShowDeviceFrame] = useState(true);

  const totalCartItems = cartItems.reduce((acc, item) => acc + item.quantity, 0);
  const cartSubtotal = cartItems.reduce(
    (acc, item) => acc + item.product.price * item.quantity,
    0
  );
  const deliveryFee = cartSubtotal > 30 || cartSubtotal === 0 ? 0 : 2.0;
  const cartTotal = cartSubtotal + (cartSubtotal > 0 ? deliveryFee : 0);

  // Filter products for category or search
  const filteredProducts = products.filter((p) => {
    const matchesCategory = selectedCategory === 'all' || p.category === selectedCategory;
    const matchesSearch =
      p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.description.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  return (
    <div className="py-6 px-2 flex flex-col items-center justify-center min-h-[calc(100vh-120px)] bg-slate-100/70">
      {/* Device Frame Toggle Bar */}
      <div className="mb-4 flex items-center gap-3 bg-white px-4 py-2 rounded-full shadow-sm border border-slate-200 text-xs font-semibold text-slate-700">
        <span>App Screen Frame:</span>
        <button
          type="button"
          onClick={() => setShowDeviceFrame(true)}
          className={`px-3 py-1 rounded-full transition-colors ${
            showDeviceFrame ? 'bg-[#1B5E20] text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
          }`}
        >
          iPhone Frame Mockup
        </button>
        <button
          type="button"
          onClick={() => setShowDeviceFrame(false)}
          className={`px-3 py-1 rounded-full transition-colors ${
            !showDeviceFrame ? 'bg-[#1B5E20] text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
          }`}
        >
          Fluid Mobile Width
        </button>
      </div>

      {/* Device Wrapper */}
      <div
        className={`bg-white transition-all duration-300 relative overflow-hidden ${
          showDeviceFrame
            ? 'w-[390px] h-[780px] rounded-[48px] border-[10px] border-slate-900 shadow-2xl ring-1 ring-slate-900/10'
            : 'w-full max-w-md min-h-[700px] rounded-3xl border border-slate-200 shadow-xl'
        }`}
      >
        {/* iPhone Notch/Island if frame active */}
        {showDeviceFrame && (
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-36 h-5 bg-slate-900 rounded-b-xl z-50 flex items-center justify-center">
            <div className="w-12 h-1 bg-slate-800 rounded-full"></div>
          </div>
        )}

        {/* Mobile Screen Container */}
        <div className="w-full h-full flex flex-col bg-[#FAFAFA] overflow-y-auto pb-16 pt-3">
          {/* Header area in Mobile App */}
          <div className="bg-[#1B5E20] text-white px-4 pt-6 pb-4 rounded-b-3xl shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <div>
                <p className="text-xs text-emerald-200 font-medium">Hello, Welcome Back!</p>
                <h1 className="text-lg font-bold text-white flex items-center gap-1.5">
                  Aheed Food Centre
                </h1>
              </div>
              <div className="w-9 h-9 rounded-full bg-emerald-700 border border-emerald-500 flex items-center justify-center font-bold text-sm text-white shadow-xs">
                A
              </div>
            </div>

            {/* Mobile Search Input */}
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Search fresh veggies, halal meat..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-white text-slate-900 placeholder:text-slate-400 pl-9 pr-3 py-2 rounded-xl text-xs font-medium focus:outline-none shadow-inner"
              />
            </div>
          </div>

          {/* Active Order Alert Bar inside app if order placed */}
          {activeOrder && (
            <div className="mx-3 mt-3 bg-amber-50 border border-amber-300 rounded-2xl p-3 shadow-xs">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Clock className="w-4 h-4 text-amber-600 animate-pulse" />
                  <div>
                    <p className="text-xs font-bold text-amber-900">Order #{activeOrder.id}</p>
                    <p className="text-[10px] text-amber-700">Status: {activeOrder.status}</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={onTrackOrder}
                  className="bg-amber-600 hover:bg-amber-700 text-white text-[11px] font-bold px-2.5 py-1 rounded-lg"
                >
                  Track
                </button>
              </div>
            </div>
          )}

          {/* Mobile Screen Views */}
          {mobileTab === 'home' && (
            <div className="p-3 space-y-4">
              {/* Fresh Produce Banner - Styled like Panel 09 image */}
              <div className="relative rounded-2xl bg-gradient-to-r from-emerald-800 to-emerald-600 text-white p-4 overflow-hidden shadow-md">
                <div className="relative z-10 max-w-[200px]">
                  <span className="bg-emerald-900/60 text-emerald-200 text-[10px] uppercase font-bold px-2 py-0.5 rounded-full inline-block mb-1">
                    Special Offer
                  </span>
                  <h2 className="text-base font-bold leading-tight">Fresh Produce Delivered to you</h2>
                  <p className="text-[11px] text-emerald-100 mt-1">Direct from local farms to your kitchen</p>
                  <button
                    type="button"
                    onClick={() => setSelectedCategory('fresh-produce')}
                    className="mt-3 inline-flex items-center gap-1 bg-[#F57C00] hover:bg-orange-600 text-white text-xs font-bold px-3 py-1.5 rounded-xl shadow-xs"
                  >
                    Shop Now <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
                <img
                  src="https://images.unsplash.com/photo-1610348725531-843dff563e2c?auto=format&fit=crop&w=400&q=80"
                  alt="Fresh produce"
                  className="absolute right-[-10px] bottom-[-10px] w-32 h-32 object-cover rounded-full opacity-90 border-2 border-emerald-400"
                />
              </div>

              {/* Categories Scroll Pills */}
              <div>
                <div className="flex items-center justify-between mb-2 px-1">
                  <h3 className="font-bold text-slate-900 text-xs uppercase tracking-wide">Categories</h3>
                  <button
                    type="button"
                    onClick={() => setMobileTab('categories')}
                    className="text-[11px] text-[#1B5E20] font-semibold hover:underline"
                  >
                    See All
                  </button>
                </div>
                <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar">
                  {CATEGORIES.map((cat) => (
                    <button
                      key={cat.id}
                      type="button"
                      onClick={() => setSelectedCategory(cat.id)}
                      className={`px-3 py-1.5 rounded-xl text-xs font-medium whitespace-nowrap transition-all flex items-center gap-1.5 shrink-0 ${
                        selectedCategory === cat.id
                          ? 'bg-[#1B5E20] text-white font-bold shadow-xs'
                          : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-50'
                      }`}
                    >
                      <span>{cat.name}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Product Grid (2 Column) */}
              <div>
                <div className="flex items-center justify-between mb-2 px-1">
                  <h3 className="font-bold text-slate-900 text-xs uppercase tracking-wide">
                    {selectedCategory === 'all' ? 'Featured Items' : CATEGORIES.find(c => c.id === selectedCategory)?.name}
                  </h3>
                  <span className="text-[11px] text-slate-500">{filteredProducts.length} items</span>
                </div>

                <div className="grid grid-cols-2 gap-2.5">
                  {filteredProducts.map((product) => {
                    const cartItem = cartItems.find((ci) => ci.product.id === product.id);
                    return (
                      <div
                        key={product.id}
                        onClick={() => onProductClick(product)}
                        className="bg-white rounded-xl border border-slate-200 p-2.5 flex flex-col justify-between shadow-2xs hover:shadow-sm cursor-pointer relative"
                      >
                        {/* Badges */}
                        <div className="absolute top-2 left-2 z-10 flex flex-col gap-1">
                          {product.isHalal && (
                            <span className="bg-[#1B5E20] text-white text-[9px] font-bold px-1.5 py-0.2 rounded-md">
                              Halal
                            </span>
                          )}
                          {product.isOffer && (
                            <span className="bg-[#F57C00] text-white text-[9px] font-bold px-1.5 py-0.2 rounded-md">
                              Offer
                            </span>
                          )}
                        </div>

                        {/* Image */}
                        <div className="w-full aspect-square bg-slate-50 rounded-lg overflow-hidden mb-2">
                          <img
                            src={product.image}
                            alt={product.name}
                            className="w-full h-full object-cover"
                          />
                        </div>

                        {/* Info */}
                        <div>
                          <p className="text-[10px] text-slate-400 font-medium truncate">{product.unit}</p>
                          <h4 className="font-semibold text-xs text-slate-900 line-clamp-2 leading-snug">
                            {product.name}
                          </h4>
                          <div className="flex items-center gap-1 mt-1 text-[10px] text-amber-600 font-bold">
                            <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
                            <span>{product.rating.toFixed(1)}</span>
                          </div>
                        </div>

                        {/* Price & Add */}
                        <div className="mt-2 pt-1.5 border-t border-slate-100 flex items-center justify-between">
                          <span className="font-bold text-xs text-[#1B5E20]">
                            £{product.price.toFixed(2)}
                          </span>
                          <button
                            type="button"
                            onClick={(e) => onAddToCart(product, e)}
                            className={`p-1.5 rounded-lg transition-colors ${
                              cartItem
                                ? 'bg-emerald-600 text-white'
                                : 'bg-[#1B5E20] text-white hover:bg-emerald-800'
                            }`}
                          >
                            {cartItem ? <Check className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* Categories Tab View */}
          {mobileTab === 'categories' && (
            <div className="p-3 space-y-3">
              <h2 className="font-bold text-slate-900 text-sm">All Categories</h2>
              <div className="grid grid-cols-2 gap-2.5">
                {CATEGORIES.filter((c) => c.id !== 'all').map((cat) => (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => {
                      setSelectedCategory(cat.id);
                      setMobileTab('home');
                    }}
                    className="p-3 bg-white border border-slate-200 rounded-2xl flex flex-col items-center text-center shadow-2xs hover:border-emerald-500 transition-all"
                  >
                    <div className="w-10 h-10 rounded-full bg-emerald-50 text-[#1B5E20] flex items-center justify-center font-bold mb-2">
                      {cat.name[0]}
                    </div>
                    <span className="font-semibold text-xs text-slate-900">{cat.name}</span>
                    <span className="text-[10px] text-slate-400 mt-0.5">{cat.description}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Cart Tab View inside Mobile App */}
          {mobileTab === 'cart' && (
            <div className="p-3 space-y-3 flex-1 flex flex-col">
              <h2 className="font-bold text-slate-900 text-sm flex items-center justify-between">
                <span>My Basket</span>
                <span className="text-xs font-normal text-slate-500">{totalCartItems} items</span>
              </h2>

              {cartItems.length === 0 ? (
                <div className="flex-1 flex flex-col items-center justify-center p-6 text-center text-slate-500">
                  <ShoppingBag className="w-12 h-12 text-slate-300 mb-2" />
                  <p className="font-medium text-xs">Your basket is empty</p>
                  <button
                    type="button"
                    onClick={() => setMobileTab('home')}
                    className="mt-3 bg-[#1B5E20] text-white text-xs font-bold px-4 py-2 rounded-xl"
                  >
                    Browse Grocery Items
                  </button>
                </div>
              ) : (
                <div className="space-y-2 flex-1 overflow-y-auto">
                  {cartItems.map(({ product, quantity }) => (
                    <div
                      key={product.id}
                      className="bg-white p-2.5 rounded-xl border border-slate-200 flex items-center justify-between gap-2"
                    >
                      <img
                        src={product.image}
                        alt={product.name}
                        className="w-12 h-12 rounded-lg object-cover bg-slate-50"
                      />
                      <div className="flex-1 min-w-0">
                        <h4 className="text-xs font-semibold text-slate-900 truncate">
                          {product.name}
                        </h4>
                        <p className="text-[10px] text-slate-500">
                          £{product.price.toFixed(2)} / {product.unit}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="flex items-center border border-slate-200 rounded-lg bg-slate-50">
                          <button
                            type="button"
                            onClick={() => onUpdateCartQuantity(product.id, -1)}
                            className="p-1 text-slate-600 hover:text-slate-900"
                          >
                            <Minus className="w-3 h-3" />
                          </button>
                          <span className="px-2 text-xs font-bold">{quantity}</span>
                          <button
                            type="button"
                            onClick={() => onUpdateCartQuantity(product.id, 1)}
                            className="p-1 text-slate-600 hover:text-slate-900"
                          >
                            <Plus className="w-3 h-3" />
                          </button>
                        </div>
                        <span className="font-bold text-xs text-[#1B5E20] w-12 text-right">
                          £{(product.price * quantity).toFixed(2)}
                        </span>
                      </div>
                    </div>
                  ))}

                  {/* Summary */}
                  <div className="mt-4 p-3 bg-white rounded-xl border border-slate-200 text-xs space-y-1.5">
                    <div className="flex justify-between text-slate-600">
                      <span>Subtotal:</span>
                      <span className="font-medium">£{cartSubtotal.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between text-slate-600">
                      <span>Local Delivery:</span>
                      <span className="font-medium">
                        {deliveryFee === 0 ? 'FREE' : `£${deliveryFee.toFixed(2)}`}
                      </span>
                    </div>
                    <div className="flex justify-between font-bold text-sm text-slate-900 pt-2 border-t">
                      <span>Total:</span>
                      <span className="text-[#1B5E20]">£{cartTotal.toFixed(2)}</span>
                    </div>
                    <button
                      type="button"
                      onClick={onProceedToCheckout}
                      className="mt-3 w-full bg-[#1B5E20] hover:bg-emerald-800 text-white font-bold py-2.5 rounded-xl text-xs shadow-sm"
                    >
                      Proceed to Checkout
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Orders Tab View */}
          {mobileTab === 'orders' && (
            <div className="p-3 space-y-3">
              <h2 className="font-bold text-slate-900 text-sm">Active & Past Orders</h2>
              {activeOrder ? (
                <div className="bg-white rounded-2xl border border-slate-200 p-3 space-y-2">
                  <div className="flex items-center justify-between text-xs border-b pb-2">
                    <span className="font-bold text-slate-900">Order #{activeOrder.id}</span>
                    <span className="bg-emerald-100 text-emerald-800 text-[10px] font-bold px-2 py-0.5 rounded-full">
                      {activeOrder.status}
                    </span>
                  </div>
                  <div className="text-xs text-slate-600 space-y-1">
                    <p>Total Paid: £{activeOrder.total.toFixed(2)}</p>
                    <p>Est. Delivery: {activeOrder.estimatedDeliveryTime}</p>
                  </div>
                  <button
                    type="button"
                    onClick={onTrackOrder}
                    className="w-full bg-amber-500 text-slate-950 font-bold py-2 rounded-xl text-xs mt-2"
                  >
                    View Live Driver Status
                  </button>
                </div>
              ) : (
                <p className="text-xs text-slate-500">No active orders yet.</p>
              )}
            </div>
          )}
        </div>

        {/* Bottom App Navigation Bar (as seen in Panel 09) */}
        <div className="absolute bottom-0 left-0 right-0 h-14 bg-white border-t border-slate-200 flex items-center justify-around z-40 px-2 shadow-lg">
          <button
            type="button"
            onClick={() => setMobileTab('home')}
            className={`flex flex-col items-center gap-0.5 transition-colors ${
              mobileTab === 'home' ? 'text-[#1B5E20] font-bold' : 'text-slate-400 hover:text-slate-600'
            }`}
          >
            <Home className="w-4 h-4" />
            <span className="text-[10px]">Home</span>
          </button>

          <button
            type="button"
            onClick={() => setMobileTab('categories')}
            className={`flex flex-col items-center gap-0.5 transition-colors ${
              mobileTab === 'categories' ? 'text-[#1B5E20] font-bold' : 'text-slate-400 hover:text-slate-600'
            }`}
          >
            <Grid className="w-4 h-4" />
            <span className="text-[10px]">Categories</span>
          </button>

          <button
            type="button"
            onClick={() => setMobileTab('cart')}
            className={`relative flex flex-col items-center gap-0.5 transition-colors ${
              mobileTab === 'cart' ? 'text-[#1B5E20] font-bold' : 'text-slate-400 hover:text-slate-600'
            }`}
          >
            <ShoppingBag className="w-4 h-4" />
            <span className="text-[10px]">Cart</span>
            {totalCartItems > 0 && (
              <span className="absolute -top-1 right-2 bg-[#F57C00] text-white text-[9px] font-extrabold w-4 h-4 rounded-full flex items-center justify-center">
                {totalCartItems}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setMobileTab('orders')}
            className={`flex flex-col items-center gap-0.5 transition-colors ${
              mobileTab === 'orders' ? 'text-[#1B5E20] font-bold' : 'text-slate-400 hover:text-slate-600'
            }`}
          >
            <ClipboardList className="w-4 h-4" />
            <span className="text-[10px]">Orders</span>
          </button>
        </div>
      </div>
    </div>
  );
};
