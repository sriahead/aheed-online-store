import React from 'react';
import { Product, CategoryId, CartItem, BundleItem } from '../types';
import { CATEGORIES, BUNDLES } from '../data/products';
import { FlipBookHero } from './FlipBookHero';
import {
  Sparkles,
  ShieldCheck,
  Truck,
  Scale,
  ArrowRight,
  ShoppingBag,
  Flame,
  Clock,
  CheckCircle2,
  Plus,
  Beef,
  Apple,
  Wheat,
  Globe,
  Milk
} from 'lucide-react';

interface DesktopStorefrontProps {
  products: Product[];
  selectedCategory: CategoryId;
  setSelectedCategory: (cat: CategoryId) => void;
  cartItems: CartItem[];
  onAddToCart: (product: Product, e: React.MouseEvent) => void;
  onProductClick: (product: Product) => void;
  wishlistIds: string[];
  onToggleWishlist: (productId: string, e: React.MouseEvent) => void;
  onOpenTrustModal: (tab?: string) => void;
  onOpenWhatsApp: () => void;
  onAddBundleToCart: (bundle: BundleItem) => void;
  onNavigateToProducts: (categoryId?: CategoryId) => void;
}

const CATEGORY_ICONS: Record<string, React.ElementType> = {
  'halal-meat': Beef,
  'fresh-produce': Apple,
  'groceries': Wheat,
  'international': Globe,
  'dairy-eggs': Milk,
};

export const DesktopStorefront: React.FC<DesktopStorefrontProps> = ({
  products,
  setSelectedCategory,
  onProductClick,
  onOpenTrustModal,
  onOpenWhatsApp,
  onAddBundleToCart,
  onNavigateToProducts,
}) => {
  const handleHeroCategorySelect = (categoryId: CategoryId) => {
    setSelectedCategory(categoryId);
    onNavigateToProducts(categoryId);
  };

  return (
    <div className="max-w-7xl mx-auto px-4 py-6 space-y-8">
      {/* 1. ESSENTIAL HERO LOOKBOOK (Clicking image or button opens Products Page) */}
      <div className="space-y-2">
        <FlipBookHero
          onSelectCategory={handleHeroCategorySelect}
          onOpenTrustModal={onOpenTrustModal}
          onOpenWhatsApp={onOpenWhatsApp}
          onProductClick={onProductClick}
          products={products}
        />
      </div>

      {/* 2. ESSENTIAL 4 TRUST PILLARS */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div
          onClick={() => onOpenTrustModal('halal')}
          className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs hover:border-emerald-500 transition-all cursor-pointer group flex items-center gap-3.5"
        >
          <div className="w-10 h-10 rounded-xl bg-emerald-50 text-[#1B5E20] flex items-center justify-center shrink-0 group-hover:bg-[#1B5E20] group-hover:text-white transition-colors">
            <ShieldCheck className="w-5 h-5" />
          </div>
          <div>
            <div className="text-xs font-black text-slate-900 leading-tight">100% HMC Halal</div>
            <p className="text-[11px] text-slate-500">In-house master butchery</p>
          </div>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex items-center gap-3.5">
          <div className="w-10 h-10 rounded-xl bg-emerald-50 text-[#1B5E20] flex items-center justify-center shrink-0">
            <Truck className="w-5 h-5" />
          </div>
          <div>
            <div className="text-xs font-black text-slate-900 leading-tight">Same-Day MK Delivery</div>
            <p className="text-[11px] text-slate-500">Free on orders over £35</p>
          </div>
        </div>

        <div
          onClick={() => onOpenTrustModal('scale')}
          className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs hover:border-emerald-500 transition-all cursor-pointer group flex items-center gap-3.5"
        >
          <div className="w-10 h-10 rounded-xl bg-emerald-50 text-[#1B5E20] flex items-center justify-center shrink-0 group-hover:bg-[#1B5E20] group-hover:text-white transition-colors">
            <Scale className="w-5 h-5" />
          </div>
          <div>
            <div className="text-xs font-black text-slate-900 leading-tight">Calibrated Scales</div>
            <p className="text-[11px] text-slate-500">Pay only for exact cut weight</p>
          </div>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex items-center gap-3.5">
          <div className="w-10 h-10 rounded-xl bg-emerald-50 text-[#1B5E20] flex items-center justify-center shrink-0">
            <Clock className="w-5 h-5" />
          </div>
          <div>
            <div className="text-xs font-black text-slate-900 leading-tight">Open 7 Days a Week</div>
            <p className="text-[11px] text-slate-500">8:00 AM – 8:30 PM daily</p>
          </div>
        </div>
      </div>

      {/* 3. ESSENTIAL CATEGORIES QUICK NAVIGATION (1-click to Products Page) */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-[#1B5E20]" />
            <h2 className="text-base sm:text-lg font-black text-slate-900 tracking-tight">
              Shop by Department
            </h2>
          </div>
          <button
            type="button"
            onClick={() => onNavigateToProducts('all')}
            className="text-xs font-bold text-[#1B5E20] hover:text-emerald-800 flex items-center gap-1 cursor-pointer"
          >
            <span>View All Products</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          {CATEGORIES.filter((c) => c.id !== 'all').slice(0, 5).map((cat) => {
            const IconComponent = CATEGORY_ICONS[cat.id] || ShoppingBag;
            const categoryProductCount = products.filter((p) => p.category === cat.id).length;

            return (
              <button
                key={cat.id}
                type="button"
                onClick={() => handleHeroCategorySelect(cat.id)}
                className="bg-white hover:bg-emerald-50/50 p-4 rounded-2xl border border-slate-200 hover:border-emerald-500/80 shadow-xs text-left transition-all cursor-pointer group flex flex-col justify-between h-32"
              >
                <div className="flex items-center justify-between">
                  <div className="w-9 h-9 rounded-xl bg-emerald-50 group-hover:bg-[#1B5E20] text-[#1B5E20] group-hover:text-white flex items-center justify-center transition-colors">
                    <IconComponent className="w-5 h-5" />
                  </div>
                  <span className="text-[10px] font-bold bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full group-hover:bg-emerald-100 group-hover:text-emerald-900 transition-colors">
                    {categoryProductCount} items
                  </span>
                </div>
                <div>
                  <div className="font-extrabold text-sm text-slate-900 group-hover:text-[#1B5E20] transition-colors">
                    {cat.name}
                  </div>
                  <div className="text-[11px] text-slate-400 truncate">
                    {cat.subcategories.slice(0, 2).join(', ')}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* 4. ESSENTIAL MULTI-BUY BUNDLES */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Flame className="w-5 h-5 text-amber-500" />
            <h2 className="text-base sm:text-lg font-black text-slate-900 tracking-tight">
              Curated Value Bundles & Family Sacks
            </h2>
          </div>
          <span className="text-xs text-amber-700 font-bold bg-amber-50 px-2.5 py-1 rounded-lg border border-amber-200">
            Save up to 20%
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {BUNDLES.map((bundle) => (
            <div
              key={bundle.id}
              className="bg-white p-5 rounded-3xl border border-slate-200 shadow-xs hover:shadow-md transition-all flex flex-col justify-between space-y-4"
            >
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-emerald-800 bg-emerald-50 border border-emerald-200 px-2.5 py-0.5 rounded-full">
                    {bundle.badge}
                  </span>
                  <div className="text-right">
                    <span className="text-lg font-black text-[#1B5E20]">
                      £{bundle.price.toFixed(2)}
                    </span>
                    <span className="text-xs text-slate-400 line-through ml-1.5 font-normal">
                      £{bundle.originalPrice.toFixed(2)}
                    </span>
                  </div>
                </div>

                <h3 className="font-extrabold text-base text-slate-900">
                  {bundle.title}
                </h3>
                <p className="text-xs text-slate-500 leading-relaxed">
                  {bundle.tagline}
                </p>

                <div className="space-y-1.5 pt-2 border-t border-slate-100">
                  {bundle.items.map((item, idx) => (
                    <div key={idx} className="flex items-center justify-between text-xs text-slate-600">
                      <span className="flex items-center gap-1.5">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                        <span>{item.name}</span>
                      </span>
                      <span className="text-slate-400 font-mono text-[11px]">{item.quantity}</span>
                    </div>
                  ))}
                </div>
              </div>

              <button
                type="button"
                onClick={() => onAddBundleToCart(bundle)}
                className="w-full bg-[#1B5E20] hover:bg-emerald-800 active:scale-98 text-white text-xs font-bold py-2.5 rounded-xl shadow-xs flex items-center justify-center gap-2 transition-all cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>Add Bundle to Basket (£{bundle.price.toFixed(2)})</span>
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* 5. BIG EXPLORE CATALOG CALLOUT BANNER */}
      <div className="bg-gradient-to-r from-slate-900 via-emerald-950 to-slate-900 rounded-3xl p-6 md:p-8 text-white flex flex-col sm:flex-row items-center justify-between gap-6 shadow-xl border border-slate-800">
        <div className="space-y-1.5 text-center sm:text-left">
          <div className="inline-flex items-center gap-1.5 text-xs font-extrabold text-emerald-300 bg-emerald-900/60 px-3 py-1 rounded-full border border-emerald-700/50">
            <ShoppingBag className="w-3.5 h-3.5" />
            <span>Over 350+ Cultural & Halal Supermarket Items</span>
          </div>
          <h2 className="text-xl md:text-2xl font-black tracking-tight">
            Looking for something specific?
          </h2>
          <p className="text-xs sm:text-sm text-slate-300 max-w-lg">
            Search our full stock of Certified HMC Halal butchery cuts, farm-fresh Asian greens, rice sacks, and authentic Shan masalas.
          </p>
        </div>

        <button
          type="button"
          onClick={() => onNavigateToProducts('all')}
          className="bg-white hover:bg-emerald-50 active:scale-95 text-slate-900 hover:text-[#1B5E20] text-sm font-black px-6 py-3.5 rounded-2xl shadow-xl transition-all flex items-center gap-2 shrink-0 cursor-pointer"
        >
          <span>Browse All Products & Search</span>
          <ArrowRight className="w-4 h-4 text-[#1B5E20]" />
        </button>
      </div>
    </div>
  );
};
