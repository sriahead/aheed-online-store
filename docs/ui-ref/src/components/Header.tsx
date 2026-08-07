import React from 'react';
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
  Code2
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
}) => {
  const totalCartCount = cartItems.reduce((acc, item) => acc + item.quantity, 0);
  const cartSubtotal = cartItems.reduce(
    (acc, item) => acc + item.product.price * item.quantity,
    0
  );

  const isDevAllowed = isDevUser || currentUser?.role === 'admin' || currentUser?.role === 'staff';

  return (
    <header className="sticky top-0 z-40 bg-white border-b border-slate-200 shadow-xs">
      {/* Top Banner - Delivery Promise & Trust bar */}
      <div className="bg-[#1B5E20] text-white text-xs py-1.5 px-4">
        <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-4 text-emerald-100">
            <span className="flex items-center gap-1 font-medium text-white">
              <Sparkles className="w-3.5 h-3.5 text-amber-300" />
              Aheed Food Centre — Leicester Local Grocery & Self-Delivery
            </span>
            <span className="hidden md:inline text-emerald-200">|</span>
            <span className="hidden md:inline-flex items-center gap-1">
              <MapPin className="w-3.5 h-3.5 text-emerald-300" />
              100% Certified HMC Halal Fresh Meat Cut Daily
            </span>
          </div>

          <div className="flex items-center gap-3 text-xs">
            <div className="flex items-center gap-1 bg-emerald-900/60 px-2 py-0.5 rounded text-emerald-100">
              <MapPin className="w-3 h-3 text-amber-300" />
              <span>UK Postcode:</span>
              <input
                type="text"
                value={postcode}
                onChange={(e) => setPostcode(e.target.value.toUpperCase())}
                className="w-16 bg-transparent border-b border-emerald-400 text-white font-bold px-1 py-0 text-center focus:outline-none"
                maxLength={8}
              />
            </div>

            {/* Quick View Navigation & Sign In/Out shortcuts */}
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setViewMode('help_guides')}
                className="flex items-center gap-1 text-emerald-100 hover:text-white px-2 py-0.5 rounded font-medium text-[11px]"
              >
                <HelpCircle className="w-3 h-3 text-emerald-300" />
                <span>Help Guide</span>
              </button>

              {/* Dev Mode Badge Toggle */}
              <button
                type="button"
                onClick={() => setIsDevUser(!isDevUser)}
                className={`flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono font-bold transition-all ${
                  isDevAllowed
                    ? 'bg-amber-400 text-slate-950'
                    : 'bg-emerald-900/80 text-emerald-200 hover:text-white hover:bg-emerald-800'
                }`}
                title="Toggle Developer & Admin View Controls"
              >
                <Code2 className="w-3 h-3" />
                <span>{isDevAllowed ? 'Dev Mode ON' : 'Dev Mode'}</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Main Nav Header */}
      <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between gap-4">
        {/* Brand Logo */}
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setViewMode('desktop')}
            className="flex items-center gap-2.5 group text-left"
          >
            <div className="w-10 h-10 rounded-xl bg-[#1B5E20] flex items-center justify-center text-white font-extrabold text-xl shadow-md group-hover:bg-emerald-800 transition-colors">
              A
            </div>
            <div>
              <div className="flex items-baseline gap-1">
                <span className="font-bold text-xl text-[#1B5E20] tracking-tight group-hover:text-emerald-700 transition-colors">
                  Aheed
                </span>
                <span className="font-semibold text-xs text-[#F57C00] uppercase tracking-wider">
                  Food Centre
                </span>
              </div>
              <p className="text-[10px] text-slate-500 font-medium tracking-wide">
                LEICESTER CULTURAL GROCERIES
              </p>
            </div>
          </button>
        </div>

        {/* Global Search Bar */}
        {(viewMode === 'desktop' || viewMode === 'mobile') && (
          <div className="flex-1 max-w-md hidden sm:block">
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Search vine tomatoes, halal lamb chops, basmati, lentils..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-slate-100/80 hover:bg-slate-100 focus:bg-white pl-10 pr-4 py-2 rounded-xl text-sm border border-slate-200 focus:border-[#1B5E20] focus:ring-2 focus:ring-emerald-500/20 focus:outline-none transition-all"
              />
            </div>
          </div>
        )}

        {/* Action Controls & Navigation */}
        <div className="flex items-center gap-2">
          {/* Dev Mode Switcher Toolbar (ONLY VISIBLE TO DEV / ADMIN USERS) */}
          {isDevAllowed && (
            <div className="bg-slate-900 text-slate-100 p-1 rounded-xl border border-slate-800 flex items-center flex-wrap gap-0.5 animate-in fade-in">
              <button
                type="button"
                onClick={() => setViewMode('desktop')}
                className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all ${
                  viewMode === 'desktop'
                    ? 'bg-emerald-600 text-white shadow-2xs'
                    : 'text-slate-300 hover:text-white'
                }`}
                title="View 1: Guest / Desktop Storefront"
              >
                <Monitor className="w-3.5 h-3.5" />
                <span className="hidden lg:inline">Guest View</span>
              </button>

              <button
                type="button"
                onClick={() => setViewMode('mobile')}
                className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all ${
                  viewMode === 'mobile'
                    ? 'bg-emerald-600 text-white shadow-2xs'
                    : 'text-slate-300 hover:text-white'
                }`}
                title="Mobile Responsive Storefront"
              >
                <Smartphone className="w-3.5 h-3.5" />
                <span className="hidden lg:inline">Mobile View</span>
              </button>

              <button
                type="button"
                onClick={() => setViewMode('user_account')}
                className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all ${
                  viewMode === 'user_account'
                    ? 'bg-emerald-600 text-white shadow-2xs'
                    : 'text-slate-300 hover:text-white'
                }`}
                title="View 2: Customer Account & Loyalty"
              >
                <User className="w-3.5 h-3.5" />
                <span className="hidden lg:inline">User View</span>
              </button>

              <button
                type="button"
                onClick={() => setViewMode('admin')}
                className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all ${
                  viewMode === 'admin'
                    ? 'bg-amber-500 text-slate-950 shadow-2xs'
                    : 'text-amber-300 hover:text-amber-100'
                }`}
                title="View 3: Store Admin / Staff Panel"
              >
                <Store className="w-3.5 h-3.5" />
                <span className="hidden lg:inline">Staff / Admin</span>
              </button>

              <button
                type="button"
                onClick={() => setViewMode('dev_kms')}
                className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all ${
                  viewMode === 'dev_kms'
                    ? 'bg-purple-600 text-white shadow-2xs'
                    : 'text-slate-300 hover:text-white'
                }`}
                title="View 4: Dev KMS & Serverless Tooling"
              >
                <Terminal className="w-3.5 h-3.5" />
                <span className="hidden lg:inline">Dev KMS</span>
              </button>
            </div>
          )}

          {/* Account / Sign In & Sign Out Controls */}
          {currentUser ? (
            <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl border border-slate-200">
              <button
                type="button"
                onClick={() => setViewMode('user_account')}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-slate-800 hover:text-[#1B5E20] transition-colors"
              >
                <div className="w-6 h-6 rounded-full bg-[#1B5E20] text-white flex items-center justify-center text-[10px] font-bold">
                  {currentUser.name.charAt(0)}
                </div>
                <span className="hidden sm:inline">{currentUser.name.split(' ')[0]}</span>
              </button>

              <button
                type="button"
                onClick={onOpenAuthModal}
                className="p-1.5 text-slate-500 hover:text-slate-800 rounded-lg hover:bg-slate-200 transition-colors"
                title="Switch User Account"
              >
                <UserCheck className="w-4 h-4 text-[#1B5E20]" />
              </button>

              <button
                type="button"
                onClick={onSignOut}
                className="p-1.5 text-slate-500 hover:text-red-600 rounded-lg hover:bg-red-50 transition-colors"
                title="Sign Out"
              >
                <LogOut className="w-4 h-4 text-red-500" />
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={onOpenAuthModal}
              className="flex items-center gap-1.5 bg-slate-100 hover:bg-slate-200 text-slate-800 px-3 py-2 rounded-xl text-xs font-bold transition-all border border-slate-200"
            >
              <LogIn className="w-4 h-4 text-[#1B5E20]" />
              <span>Sign In / Switch User</span>
            </button>
          )}

          {/* Active Order Tracker Button */}
          {activeOrder && (
            <button
              type="button"
              onClick={() => setIsOrderTrackingOpen(true)}
              className="relative flex items-center gap-1.5 px-3 py-2 bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-300/80 rounded-xl text-xs font-semibold transition-colors"
            >
              <Clock className="w-4 h-4 text-amber-600 animate-pulse" />
              <span className="hidden sm:inline">Track Order</span>
              <span className="w-2 h-2 rounded-full bg-amber-500 animate-ping" />
            </button>
          )}

          {/* Cart Trigger Button */}
          <button
            type="button"
            id="open-cart-btn"
            onClick={() => setIsCartOpen(true)}
            className="relative flex items-center gap-2 bg-[#1B5E20] hover:bg-emerald-800 text-white px-3.5 py-2 rounded-xl text-xs font-bold transition-all shadow-sm active:scale-95 shrink-0"
          >
            <ShoppingBag className="w-4 h-4" />
            <span className="hidden sm:inline">Cart</span>
            {totalCartCount > 0 ? (
              <span className="bg-[#F57C00] text-white text-[11px] font-bold px-1.5 py-0.2 rounded-full min-w-[20px] text-center">
                {totalCartCount}
              </span>
            ) : null}
            {cartSubtotal > 0 && (
              <span className="hidden md:inline font-bold border-l border-emerald-600 pl-2">
                £{cartSubtotal.toFixed(2)}
              </span>
            )}
          </button>
        </div>
      </div>
    </header>
  );
};


