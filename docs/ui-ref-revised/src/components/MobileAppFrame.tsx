import React, { useState, useRef, useEffect } from 'react';
import { Product, CategoryId, CartItem, Order, UserAccount } from '../types';
import { CATEGORIES } from '../data/products';
import { ProductCard } from './ProductCard';
import {
  ShoppingBag,
  Search,
  MapPin,
  Sparkles,
  Heart,
  User,
  Home,
  Layers,
  Scale,
  ShieldCheck,
  Truck,
  Flame,
  ArrowRight,
  Plus,
  Minus,
  ChevronLeft,
  ChevronRight,
  Beef,
  Apple,
  Globe,
  Milk,
  Coffee,
  Cookie,
  Wheat,
  LayoutGrid
} from 'lucide-react';

interface MobileAppFrameProps {
  products: Product[];
  selectedCategory: CategoryId;
  setSelectedCategory: (cat: CategoryId) => void;
  searchQuery: string;
  setSearchQuery: (q: string) => void;
  cartItems: CartItem[];
  onAddToCart: (product: Product, e: React.MouseEvent) => void;
  onUpdateCartQuantity?: (productId: string, delta: number, e: React.MouseEvent) => void;
  onProductClick: (product: Product) => void;
  wishlistIds: string[];
  onToggleWishlist: (productId: string, e: React.MouseEvent) => void;
  onOpenCart: () => void;
  postcode: string;
  setPostcode: (code: string) => void;
  currentUser: UserAccount | null;
  onOpenAccount: () => void;
  onOpenWishlist: () => void;
  onOpenWhatsApp: () => void;
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
  wishlistIds,
  onToggleWishlist,
  onOpenCart,
  postcode,
  setPostcode,
  currentUser,
  onOpenAccount,
  onOpenWishlist,
  onOpenWhatsApp,
}) => {
  const [mobileTab, setMobileTab] = useState<'shop' | 'butcher' | 'wishlist' | 'cart'>('shop');
  const [selectedSubCategory, setSelectedSubCategory] = useState<string>('All');

  const mobileCategoryRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(true);

  const checkScroll = () => {
    const el = mobileCategoryRef.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 6);
    setCanScrollRight(el.scrollLeft < el.scrollWidth - el.clientWidth - 6);
  };

  useEffect(() => {
    checkScroll();
    const el = mobileCategoryRef.current;
    el?.addEventListener('scroll', checkScroll);
    return () => el?.removeEventListener('scroll', checkScroll);
  }, []);

  const handleScroll = (dir: 'left' | 'right') => {
    if (!mobileCategoryRef.current) return;
    mobileCategoryRef.current.scrollBy({
      left: dir === 'left' ? -180 : 180,
      behavior: 'smooth',
    });
  };

  const renderCategoryIcon = (id: CategoryId) => {
    switch (id) {
      case 'all':
        return <LayoutGrid className="w-3.5 h-3.5" />;
      case 'halal-meat':
        return <Beef className="w-3.5 h-3.5" />;
      case 'fresh-produce':
        return <Apple className="w-3.5 h-3.5" />;
      case 'groceries':
        return <Wheat className="w-3.5 h-3.5" />;
      case 'international':
        return <Globe className="w-3.5 h-3.5" />;
      case 'dairy-eggs':
        return <Milk className="w-3.5 h-3.5" />;
      case 'beverages':
        return <Coffee className="w-3.5 h-3.5" />;
      case 'snacks':
        return <Cookie className="w-3.5 h-3.5" />;
      case 'household':
        return <Home className="w-3.5 h-3.5" />;
      default:
        return <ShoppingBag className="w-3.5 h-3.5" />;
    }
  };

  const totalCartCount = cartItems.reduce((acc, item) => acc + item.quantity, 0);
  const cartSubtotal = cartItems.reduce((acc, item) => {
    const p = item.selectedVariant ? item.selectedVariant.price : item.product.price;
    return acc + p * item.quantity;
  }, 0);

  const filteredProducts = products.filter((p) => {
    if (mobileTab === 'butcher') {
      if (!p.isMeat && p.category !== 'halal-meat') return false;
    } else {
      if (selectedCategory !== 'all' && p.category !== selectedCategory) return false;
    }

    if (searchQuery) {
      const match =
        p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (p.brand && p.brand.toLowerCase().includes(searchQuery.toLowerCase()));
      if (!match) return false;
    }

    return true;
  });

  const currentCategoryInfo = CATEGORIES.find((c) => c.id === selectedCategory) || CATEGORIES[0];

  return (
    <div className="py-8 flex justify-center items-center bg-slate-900 min-h-screen px-2">
      {/* Mobile Device Frame Shell */}
      <div className="w-full max-w-[400px] h-[840px] bg-white rounded-[44px] shadow-2xl border-8 border-slate-800 overflow-hidden flex flex-col relative ring-1 ring-slate-700/50">
        {/* Mobile Notch / Speaker Bar */}
        <div className="bg-slate-900 h-6 flex justify-center items-center shrink-0">
          <div className="w-20 h-4 bg-black rounded-b-xl flex items-center justify-center">
            <div className="w-2 h-2 rounded-full bg-slate-800 mr-2" />
            <div className="w-8 h-1 rounded-full bg-slate-800" />
          </div>
        </div>

        {/* App Top Bar */}
        <div className="bg-[#1B5E20] text-white p-3.5 space-y-2.5 shrink-0 shadow-sm">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-xl bg-white text-[#1B5E20] font-black text-sm flex items-center justify-center shadow-xs">
                A
              </div>
              <div>
                <span className="font-extrabold text-sm leading-tight block">Aheed Food Centre</span>
                <span className="text-[10px] text-emerald-200 flex items-center gap-1">
                  <MapPin className="w-2.5 h-2.5 text-amber-300" /> MK Delivery: {postcode}
                </span>
              </div>
            </div>

            <button
              type="button"
              onClick={onOpenWhatsApp}
              className="bg-emerald-900/80 hover:bg-emerald-900 text-emerald-200 text-[10px] font-bold px-2 py-1 rounded-lg border border-emerald-600/50"
            >
              WhatsApp Desk
            </button>
          </div>

          {/* Search Box */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search halal chicken, lamb, atta, spices..."
              className="w-full bg-white text-slate-900 text-[11px] pl-8 pr-7 py-2 rounded-xl focus:outline-none shadow-xs"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 text-xs font-bold"
              >
                ✕
              </button>
            )}
          </div>
        </div>

        {/* Scrollable Mobile App Body */}
        <div className="flex-1 overflow-y-auto p-3 space-y-3 bg-slate-50">
          {/* Halal Badge Banner */}
          <div className="bg-emerald-50 border border-emerald-200 p-2.5 rounded-2xl flex items-center justify-between text-xs">
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-[#1B5E20] shrink-0" />
              <div>
                <span className="font-bold text-emerald-950 text-[11px] block">100% Certified HMC Halal</span>
                <span className="text-[10px] text-emerald-800">Master butcher custom cuts to order</span>
              </div>
            </div>
            <span className="bg-[#1B5E20] text-white text-[9px] font-bold px-1.5 py-0.5 rounded">HMC</span>
          </div>

          {/* Category Strip with Icons & Left/Right Arrows */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between px-0.5">
              <span className="text-[11px] font-bold text-slate-800">Shop Categories</span>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => handleScroll('left')}
                  disabled={!canScrollLeft}
                  className={`w-5 h-5 rounded-full flex items-center justify-center border text-[10px] ${
                    canScrollLeft
                      ? 'bg-white text-slate-700 border-slate-300 shadow-2xs'
                      : 'bg-slate-100 text-slate-300 border-slate-200 opacity-50'
                  }`}
                >
                  <ChevronLeft className="w-3 h-3" />
                </button>
                <button
                  type="button"
                  onClick={() => handleScroll('right')}
                  disabled={!canScrollRight}
                  className={`w-5 h-5 rounded-full flex items-center justify-center border text-[10px] ${
                    canScrollRight
                      ? 'bg-white text-slate-700 border-slate-300 shadow-2xs'
                      : 'bg-slate-100 text-slate-300 border-slate-200 opacity-50'
                  }`}
                >
                  <ChevronRight className="w-3 h-3" />
                </button>
              </div>
            </div>

            <div
              ref={mobileCategoryRef}
              className="flex overflow-x-auto gap-1.5 no-scrollbar py-0.5 scroll-smooth"
            >
              {CATEGORIES.map((cat) => {
                const isSelected = selectedCategory === cat.id && mobileTab !== 'butcher';
                return (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => {
                      setSelectedCategory(cat.id);
                      setMobileTab('shop');
                    }}
                    className={`flex items-center gap-1.5 px-3 py-2 rounded-xl whitespace-nowrap text-[11px] font-bold transition-all shrink-0 ${
                      isSelected
                        ? 'bg-[#1B5E20] text-white shadow-xs'
                        : 'bg-white text-slate-700 border border-slate-200/90 hover:bg-slate-50'
                    }`}
                  >
                    <span className={isSelected ? 'text-white' : 'text-emerald-700'}>
                      {renderCategoryIcon(cat.id)}
                    </span>
                    <span>{cat.name}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Subcategory strip */}
          {currentCategoryInfo.subcategories && (
            <div className="flex overflow-x-auto gap-1 no-scrollbar text-[10px]">
              {currentCategoryInfo.subcategories.slice(0, 5).map((sub) => (
                <button
                  key={sub}
                  type="button"
                  onClick={() => setSelectedSubCategory(sub)}
                  className={`px-2.5 py-1 rounded-lg whitespace-nowrap font-medium ${
                    selectedSubCategory === sub
                      ? 'bg-emerald-100 text-emerald-950 font-bold'
                      : 'bg-slate-200/70 text-slate-600'
                  }`}
                >
                  {sub}
                </button>
              ))}
            </div>
          )}

          {/* Mobile Featured Department Lookbook Promo with HexagonCircle Clip-Path Effect */}
          <div
            onClick={() => setSelectedCategory('halal-meat')}
            style={{ '--overlay-color': 'rgba(185, 28, 28, 0.85)' } as React.CSSProperties}
            className="promo-card w-full h-[150px] rounded-2xl relative overflow-hidden bg-slate-900 shadow-md border border-slate-800 cursor-pointer select-none group"
          >
            <div className="promo-image-wrapper rounded-2xl">
              <img
                src="https://images.unsplash.com/photo-1607623814075-e51df1bdc82f?auto=format&fit=crop&w=800&q=80"
                alt="Halal Meat Feature"
                className="w-full h-full object-cover"
              />
            </div>
            <div className="absolute top-2 left-2 z-20">
              <span className="bg-black/60 backdrop-blur-xs text-white text-[9px] font-bold px-2 py-0.5 rounded-lg border border-white/20">
                100% HMC Halal Meat
              </span>
            </div>
            <h2
              data-cta="Shop Butchery →"
              className="promo-title text-white text-sm font-black drop-shadow-md tracking-tight"
            >
              HMC Halal Master Butchery
            </h2>
          </div>

          {/* Product Grid (2 columns) */}
          <div className="grid grid-cols-2 gap-2.5 pt-1">
            {filteredProducts.map((p) => {
              const inCart = cartItems.find((c) => c.product.id === p.id);
              const isWishlisted = wishlistIds.includes(p.id);

              return (
                <ProductCard
                  key={p.id}
                  product={p}
                  cartItem={inCart}
                  onSelect={onProductClick}
                  onAddToCart={onAddToCart}
                  onUpdateCartQuantity={onUpdateCartQuantity}
                  isWishlisted={isWishlisted}
                  onToggleWishlist={onToggleWishlist}
                />
              );
            })}
          </div>
        </div>

        {/* Floating Quick Basket Bar if items in cart */}
        {totalCartCount > 0 && (
          <div className="px-3 py-2 bg-white border-t border-slate-200">
            <button
              type="button"
              onClick={onOpenCart}
              className="w-full bg-[#1B5E20] hover:bg-emerald-800 text-white p-2.5 rounded-2xl font-bold text-xs shadow-md flex items-center justify-between"
            >
              <div className="flex items-center gap-2">
                <span className="w-5 h-5 rounded-full bg-white text-[#1B5E20] flex items-center justify-center font-bold text-[11px]">
                  {totalCartCount}
                </span>
                <span>View Basket</span>
              </div>
              <span>£{cartSubtotal.toFixed(2)} →</span>
            </button>
          </div>
        )}

        {/* Mobile Sticky Bottom Navigation */}
        <div className="bg-white border-t border-slate-200 p-2 flex items-center justify-around text-[10px] font-bold text-slate-600 shrink-0">
          <button
            type="button"
            onClick={() => {
              setMobileTab('shop');
              setSelectedCategory('all');
            }}
            className={`flex flex-col items-center gap-0.5 ${
              mobileTab === 'shop' ? 'text-[#1B5E20]' : 'text-slate-500'
            }`}
          >
            <Home className="w-4 h-4" />
            <span>Store</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setMobileTab('butcher');
              setSelectedCategory('halal-meat');
            }}
            className={`flex flex-col items-center gap-0.5 ${
              mobileTab === 'butcher' ? 'text-red-700' : 'text-slate-500'
            }`}
          >
            <Scale className="w-4 h-4" />
            <span>Butchery</span>
          </button>

          <button
            type="button"
            onClick={onOpenWishlist}
            className="flex flex-col items-center gap-0.5 text-slate-500 hover:text-rose-600"
          >
            <Heart className="w-4 h-4" />
            <span>Saved</span>
          </button>

          <button
            type="button"
            onClick={onOpenAccount}
            className="flex flex-col items-center gap-0.5 text-slate-500 hover:text-emerald-700"
          >
            <User className="w-4 h-4" />
            <span>Account</span>
          </button>

          <button
            type="button"
            onClick={onOpenCart}
            className="flex flex-col items-center gap-0.5 text-[#1B5E20] relative"
          >
            <ShoppingBag className="w-4 h-4" />
            <span>Cart</span>
            {totalCartCount > 0 && (
              <span className="absolute -top-1 right-2 bg-amber-500 text-white text-[8px] font-bold w-3.5 h-3.5 rounded-full flex items-center justify-center">
                {totalCartCount}
              </span>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
