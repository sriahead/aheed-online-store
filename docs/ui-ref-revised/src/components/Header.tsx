import React, { useState } from 'react';
import { ViewMode, UserRole, CartItem, Order, UserAccount } from '../types';
import {
  ShoppingBag,
  Smartphone,
  Monitor,
  BookOpen,
  MapPin,
  Search,
  UserCheck,
  ShieldAlert,
  Clock,
  Sparkles,
  Store,
  User,
  HelpCircle,
  Terminal,
  LogOut,
  LogIn,
  Code2,
  Heart,
  MessageCircle,
  ShieldCheck,
  Truck,
  Scale
} from 'lucide-react';

interface HeaderProps {
  viewMode: ViewMode;
  setViewMode: (mode: ViewMode) => void;
  userRole: UserRole;
  setUserRole: (role: UserRole) => void;
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  cartItems: CartItem[];
  setIsCartOpen: (open: boolean) => void;
  activeOrder: Order | null;
  setIsOrderTrackingOpen: (open: boolean) => void;
  postcode: string;
  setPostcode: (code: string) => void;
  currentUser: UserAccount | null;
  onOpenAuthModal: () => void;
  onSignOut: () => void;
  isDevUser: boolean;
  setIsDevUser: (dev: boolean) => void;
  wishlistCount: number;
  onOpenWishlist: () => void;
  onOpenWhatsApp: () => void;
  onOpenTrustModal: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  viewMode,
  setViewMode,
  userRole,
  setUserRole,
  searchQuery,
  setSearchQuery,
  cartItems,
  setIsCartOpen,
  activeOrder,
  setIsOrderTrackingOpen,
  postcode,
  setPostcode,
  currentUser,
  onOpenAuthModal,
  onSignOut,
  isDevUser,
  setIsDevUser,
  wishlistCount,
  onOpenWishlist,
  onOpenWhatsApp,
  onOpenTrustModal,
}) => {
  const totalCartCount = cartItems.reduce((acc, item) => acc + item.quantity, 0);
  const cartSubtotal = cartItems.reduce((acc, item) => {
    const p = item.selectedVariant ? item.selectedVariant.price : item.product.price;
    return acc + p * item.quantity;
  }, 0);

  const isDevAllowed = isDevUser || currentUser?.role === 'admin' || currentUser?.role === 'staff';

  return (
    <header className="sticky top-0 z-40 bg-white border-b border-slate-200 shadow-xs">
      {/* Top Banner - Milton Keynes Delivery Promise & Trust Bar */}
      <div className="bg-[#1B5E20] text-white text-xs py-1.5 px-4">
        <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2.5 text-emerald-100 flex-wrap">
            <span className="flex items-center gap-1.5 font-bold text-white">
              <span className="w-2 h-2 rounded-full bg-emerald-300 animate-ping" />
              <Sparkles className="w-3.5 h-3.5 text-amber-300" />
              Aheed Food Centre — Milton Keynes Halal Supermarket & Butchery
            </span>
            <span className="hidden lg:inline text-emerald-300">|</span>
            <span className="hidden lg:inline-flex items-center gap-1 text-emerald-200">
              <Clock className="w-3.5 h-3.5 text-amber-300" />
              Store Open: 8:00 AM – 8:30 PM Today
            </span>
            <span className="hidden md:inline text-emerald-300">|</span>
            <span className="hidden md:inline-flex items-center gap-1 text-emerald-200">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-300" />
              100% Certified HMC Halal
            </span>
          </div>

          <div className="flex items-center gap-3 text-xs">
            {/* Postcode Input */}
            <div className="flex items-center gap-1 bg-emerald-900/80 px-2 py-0.5 rounded text-emerald-100 border border-emerald-700/50">
              <MapPin className="w-3 h-3 text-amber-300" />
              <span className="hidden sm:inline">MK Postcode:</span>
              <input
                type="text"
                value={postcode}
                onChange={(e) => setPostcode(e.target.value.toUpperCase())}
                className="w-16 bg-transparent border-b border-emerald-400 text-white font-bold px-1 py-0 text-center focus:outline-none"
                maxLength={8}
              />
            </div>

            {/* Trust Hub Shortcut */}
            <button
              type="button"
              onClick={onOpenTrustModal}
              className="text-emerald-200 hover:text-white flex items-center gap-1 font-medium transition-colors hidden sm:flex"
            >
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>Trust & Standards</span>
            </button>

            {/* WhatsApp Store Help */}
            <button
              type="button"
              onClick={onOpenWhatsApp}
              className="text-emerald-200 hover:text-white flex items-center gap-1 font-medium transition-colors bg-emerald-900/60 hover:bg-emerald-900 px-2 py-0.5 rounded border border-emerald-700/40"
            >
              <MessageCircle className="w-3.5 h-3.5 text-emerald-300" />
              <span>Store WhatsApp</span>
            </button>
          </div>
        </div>
      </div>

      {/* Main Navbar */}
      <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between gap-4">
        {/* Logo & Brand */}
        <div
          onClick={() => setViewMode('desktop')}
          className="flex items-center gap-2.5 cursor-pointer select-none group shrink-0"
        >
          <div className="w-10 h-10 rounded-2xl bg-[#1B5E20] group-hover:bg-emerald-800 transition-colors flex items-center justify-center text-white shadow-md font-black text-xl tracking-tighter">
            A
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <span className="font-black text-lg sm:text-xl tracking-tight text-slate-900 leading-none group-hover:text-[#1B5E20] transition-colors">
                Aheed Food Centre
              </span>
              <span className="bg-[#1B5E20] text-white text-[9px] font-extrabold px-1.5 py-0.2 rounded">
                HMC
              </span>
            </div>
            <p className="text-[10px] font-semibold text-emerald-800 tracking-wide uppercase">
              Halal Meat • Fresh Produce • Cultural Groceries
            </p>
          </div>
        </div>

        {/* Global Search Bar with Live Suggestions */}
        <div className="flex-1 max-w-xl relative hidden md:block">
          <div className="relative">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                if (viewMode === 'desktop') setViewMode('products');
              }}
              onFocus={() => {
                if (viewMode === 'desktop' && searchQuery) setViewMode('products');
              }}
              placeholder="Search chicken breast, baby lamb, basmati rice, atta, fresh coriander..."
              className="w-full bg-slate-100/90 focus:bg-white text-xs pl-10 pr-10 py-2.5 rounded-2xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-600 focus:border-transparent transition-all"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs font-bold"
              >
                ✕
              </button>
            )}
          </div>
        </div>

        {/* Right Header Controls */}
        <div className="flex items-center gap-2 sm:gap-3">
          {/* Active Order Live Tracker Shortcut */}
          {activeOrder && (
            <button
              type="button"
              onClick={() => setIsOrderTrackingOpen(true)}
              className="bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-300 font-bold text-xs px-2.5 sm:px-3 py-1.5 rounded-xl shadow-2xs flex items-center gap-1.5 animate-pulse transition-colors"
            >
              <Truck className="w-3.5 h-3.5 text-amber-600" />
              <span className="hidden sm:inline">Track Order:</span>
              <span className="font-mono text-[11px]">{activeOrder.status}</span>
            </button>
          )}

          {/* Wishlist Button */}
          <button
            type="button"
            onClick={onOpenWishlist}
            className="relative p-2 rounded-xl text-slate-600 hover:text-rose-600 hover:bg-rose-50 transition-colors"
            title="Saved Favourites"
          >
            <Heart className={`w-5 h-5 ${wishlistCount > 0 ? 'text-rose-500 fill-rose-500' : ''}`} />
            {wishlistCount > 0 && (
              <span className="absolute -top-1 -right-1 bg-rose-600 text-white text-[10px] font-bold w-4 h-4 rounded-full flex items-center justify-center shadow-xs">
                {wishlistCount}
              </span>
            )}
          </button>

          {/* User Account / Sign In */}
          {currentUser ? (
            <button
              type="button"
              onClick={() => setViewMode('user_account')}
              className="flex items-center gap-2 p-1.5 sm:px-3 sm:py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold transition-colors"
            >
              <div className="w-6 h-6 rounded-full bg-[#1B5E20] text-white flex items-center justify-center text-[10px]">
                {currentUser.name.charAt(0)}
              </div>
              <span className="hidden sm:inline max-w-[90px] truncate">{currentUser.name}</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={onOpenAuthModal}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold transition-colors"
            >
              <LogIn className="w-4 h-4" />
              <span className="hidden sm:inline">Sign In</span>
            </button>
          )}

          {/* Cart Drawer Trigger */}
          <button
            type="button"
            onClick={() => setIsCartOpen(true)}
            className="flex items-center gap-2 bg-[#1B5E20] hover:bg-emerald-800 text-white px-3 sm:px-4 py-2 rounded-2xl font-bold text-xs shadow-md transition-all active:scale-95"
          >
            <div className="relative">
              <ShoppingBag className="w-4 h-4" />
              {totalCartCount > 0 && (
                <span className="absolute -top-2 -right-2.5 bg-[#F57C00] text-white text-[9px] font-black w-4 h-4 rounded-full flex items-center justify-center shadow-xs">
                  {totalCartCount}
                </span>
              )}
            </div>
            <span className="hidden sm:inline">£{cartSubtotal.toFixed(2)}</span>
          </button>
        </div>
      </div>

      {/* Mobile Search Bar Row (visible on small screens) */}
      <div className="px-4 pb-2.5 md:hidden">
        <div className="relative">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search halal chicken, lamb, atta, rice, spices..."
            className="w-full bg-slate-100 focus:bg-white text-xs pl-10 pr-9 py-2 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-600 focus:border-transparent transition-all"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs font-bold"
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {/* Subnav & Prototype View Modes Bar */}
      <div className="bg-slate-50 border-t border-slate-200 px-4 py-1.5 text-xs">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-2 overflow-x-auto no-scrollbar">
          {/* View Modes */}
          <div className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              onClick={() => setViewMode('desktop')}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-lg font-bold text-[11px] transition-colors cursor-pointer ${
                viewMode === 'desktop'
                  ? 'bg-[#1B5E20] text-white shadow-xs'
                  : 'bg-white text-slate-700 hover:text-slate-900 border border-slate-200'
              }`}
            >
              <BookOpen className="w-3.5 h-3.5" />
              <span>Lookbook Home</span>
            </button>

            <button
              type="button"
              onClick={() => setViewMode('products')}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-lg font-bold text-[11px] transition-colors cursor-pointer ${
                viewMode === 'products'
                  ? 'bg-[#1B5E20] text-white shadow-xs'
                  : 'bg-white text-slate-700 hover:text-slate-900 border border-slate-200'
              }`}
            >
              <ShoppingBag className="w-3.5 h-3.5" />
              <span>All Products & Search</span>
            </button>

            <span className="w-px h-4 bg-slate-300 mx-1" />

            <button
              type="button"
              onClick={() => setViewMode('mobile')}
              className={`flex items-center gap-1 px-2.5 py-1 rounded-lg font-bold text-[11px] transition-colors cursor-pointer ${
                viewMode === 'mobile'
                  ? 'bg-white text-[#1B5E20] shadow-2xs border border-slate-200'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Smartphone className="w-3 h-3" />
              <span>Mobile View</span>
            </button>

            <button
              type="button"
              onClick={() => setViewMode('admin')}
              className={`flex items-center gap-1 px-2.5 py-1 rounded-lg font-bold text-[11px] transition-colors ${
                viewMode === 'admin'
                  ? 'bg-white text-red-700 shadow-2xs border border-slate-200'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Scale className="w-3 h-3 text-red-600" />
              <span>🔴 Butcher & Staff OPS</span>
            </button>

            <button
              type="button"
              onClick={() => setViewMode('user_account')}
              className={`flex items-center gap-1 px-2.5 py-1 rounded-lg font-bold text-[11px] transition-colors ${
                viewMode === 'user_account'
                  ? 'bg-white text-[#1B5E20] shadow-2xs border border-slate-200'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <User className="w-3 h-3" />
              <span>Customer Account</span>
            </button>
          </div>

          {/* Dev & Documentation Links */}
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => setViewMode('brand_guide')}
              className={`text-[11px] font-medium px-2 py-0.5 rounded transition-colors ${
                viewMode === 'brand_guide' ? 'text-[#1B5E20] font-bold underline' : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              Brand Guide
            </button>
            <button
              type="button"
              onClick={() => setViewMode('help_guides')}
              className={`text-[11px] font-medium px-2 py-0.5 rounded transition-colors ${
                viewMode === 'help_guides' ? 'text-[#1B5E20] font-bold underline' : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              Docs & Runbooks
            </button>
            {isDevAllowed && (
              <button
                type="button"
                onClick={() => setViewMode('dev_kms')}
                className={`text-[11px] font-mono font-bold px-2 py-0.5 rounded transition-colors ${
                  viewMode === 'dev_kms' ? 'bg-slate-900 text-emerald-400' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Dev KMS
              </button>
            )}
          </div>
        </div>
      </div>
    </header>
  );
};
