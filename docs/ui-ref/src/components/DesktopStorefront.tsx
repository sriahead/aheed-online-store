import React, { useState } from 'react';
import { Product, CategoryId, CartItem } from '../types';
import { CATEGORIES } from '../data/products';
import { ProductCard } from './ProductCard';
import {
  Sparkles,
  ShieldCheck,
  Truck,
  HeartHandshake,
  CheckCircle2,
  Filter,
  ArrowUpDown,
  Tag
} from 'lucide-react';

interface DesktopStorefrontProps {
  products: Product[];
  selectedCategory: CategoryId;
  setSelectedCategory: (cat: CategoryId) => void;
  searchQuery: string;
  setSearchQuery: (q: string) => void;
  cartItems: CartItem[];
  onAddToCart: (product: Product, e: React.MouseEvent) => void;
  onProductClick: (product: Product) => void;
}

export const DesktopStorefront: React.FC<DesktopStorefrontProps> = ({
  products,
  selectedCategory,
  setSelectedCategory,
  searchQuery,
  setSearchQuery,
  cartItems,
  onAddToCart,
  onProductClick,
}) => {
  const [filterHalal, setFilterHalal] = useState(false);
  const [filterFresh, setFilterFresh] = useState(false);
  const [filterOffer, setFilterOffer] = useState(false);
  const [sortBy, setSortBy] = useState<'featured' | 'price-low' | 'price-high' | 'rating'>('featured');

  // Filter & Sort Logic
  const filteredProducts = products
    .filter((p) => {
      const matchesCategory = selectedCategory === 'all' || p.category === selectedCategory;
      const matchesSearch =
        p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (p.origin && p.origin.toLowerCase().includes(searchQuery.toLowerCase()));

      const matchesHalal = !filterHalal || p.isHalal;
      const matchesFresh = !filterFresh || p.isFresh;
      const matchesOffer = !filterOffer || p.isOffer;

      return matchesCategory && matchesSearch && matchesHalal && matchesFresh && matchesOffer;
    })
    .sort((a, b) => {
      if (sortBy === 'price-low') return a.price - b.price;
      if (sortBy === 'price-high') return b.price - a.price;
      if (sortBy === 'rating') return b.rating - a.rating;
      return 0; // featured default order
    });

  return (
    <div className="max-w-7xl mx-auto px-4 py-6 space-y-8">
      {/* Hero Brand & Banner */}
      <div className="relative rounded-3xl bg-gradient-to-br from-[#1B5E20] via-emerald-800 to-emerald-950 text-white p-6 md:p-10 overflow-hidden shadow-xl border border-emerald-700/40">
        {/* Background glow & leafy pattern */}
        <div className="absolute top-0 right-0 w-96 h-96 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />
        
        <div className="relative z-10 max-w-2xl space-y-3">
          <div className="inline-flex items-center gap-1.5 bg-emerald-900/80 border border-emerald-600/60 text-emerald-200 text-xs font-semibold px-3 py-1 rounded-full shadow-sm">
            <Sparkles className="w-3.5 h-3.5 text-amber-300" />
            Cultural Grocery Breadth & Local UK Self-Delivery
          </div>

          <h1 className="text-2xl md:text-4xl font-extrabold tracking-tight text-white leading-tight">
            Fresh Produce, Halal Meat & Cultural Staples in One Basket.
          </h1>

          <p className="text-slate-200 text-sm md:text-base font-normal leading-relaxed">
            Delivering Asian, Afro-Caribbean, Middle-Eastern & everyday groceries straight to your door with Aheed’s own dedicated delivery team.
          </p>

          <div className="pt-2 flex flex-wrap gap-3 text-xs font-medium text-emerald-100">
            <span className="flex items-center gap-1 bg-emerald-900/60 px-2.5 py-1 rounded-lg">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-300" /> 100% Certified HMC Halal Meat
            </span>
            <span className="flex items-center gap-1 bg-emerald-900/60 px-2.5 py-1 rounded-lg">
              <Truck className="w-3.5 h-3.5 text-amber-300" /> Free Delivery Over £30
            </span>
            <span className="flex items-center gap-1 bg-emerald-900/60 px-2.5 py-1 rounded-lg">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-300" /> Same-Day Local Dispatch
            </span>
          </div>
        </div>

        {/* Hero Banner Accent Image */}
        <div className="hidden lg:block absolute right-8 top-1/2 -translate-y-1/2 w-80 h-64 rounded-2xl overflow-hidden shadow-2xl border-2 border-emerald-400/30 rotate-2 hover:rotate-0 transition-transform duration-500">
          <img
            src="https://images.unsplash.com/photo-1542838132-92c53300491e?auto=format&fit=crop&w=800&q=80"
            alt="Aheed Grocery Store Fresh Produce"
            className="w-full h-full object-cover"
          />
        </div>
      </div>

      {/* Trust Values Strip (As defined in Brand Sheet Section 08) */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-2xl border border-slate-200/80 flex items-center gap-3 shadow-xs">
          <div className="w-10 h-10 rounded-xl bg-emerald-50 text-[#1B5E20] flex items-center justify-center font-bold">
            <Sparkles className="w-5 h-5 text-[#1B5E20]" />
          </div>
          <div>
            <h4 className="font-bold text-xs text-slate-900 uppercase">Freshness</h4>
            <p className="text-xs text-slate-500">Every day, always fresh produce</p>
          </div>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200/80 flex items-center gap-3 shadow-xs">
          <div className="w-10 h-10 rounded-xl bg-red-50 text-[#D32F2F] flex items-center justify-center font-bold">
            <ShieldCheck className="w-5 h-5 text-[#D32F2F]" />
          </div>
          <div>
            <h4 className="font-bold text-xs text-slate-900 uppercase">HMC Halal Quality</h4>
            <p className="text-xs text-slate-500">Certified local fresh meats</p>
          </div>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200/80 flex items-center gap-3 shadow-xs">
          <div className="w-10 h-10 rounded-xl bg-orange-50 text-[#F57C00] flex items-center justify-center font-bold">
            <HeartHandshake className="w-5 h-5 text-[#F57C00]" />
          </div>
          <div>
            <h4 className="font-bold text-xs text-slate-900 uppercase">Community Trust</h4>
            <p className="text-xs text-slate-500">Proudly serving local families</p>
          </div>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200/80 flex items-center gap-3 shadow-xs">
          <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-700 flex items-center justify-center font-bold">
            <Truck className="w-5 h-5 text-blue-700" />
          </div>
          <div>
            <h4 className="font-bold text-xs text-slate-900 uppercase">Aheed Local Delivery</h4>
            <p className="text-xs text-slate-500">Self-delivered with care</p>
          </div>
        </div>
      </div>

      {/* Main Catalog View: Sidebar Categories + Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
        {/* Categories Sidebar */}
        <aside className="lg:col-span-1 space-y-6">
          <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-xs sticky top-20">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-3">
              <h3 className="font-bold text-slate-900 text-sm uppercase tracking-wide flex items-center gap-2">
                <Filter className="w-4 h-4 text-[#1B5E20]" />
                Store Categories
              </h3>
              <span className="text-xs text-slate-400 font-medium">
                {CATEGORIES.length - 1} Departments
              </span>
            </div>

            <nav className="space-y-1">
              {CATEGORIES.map((cat) => (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => setSelectedCategory(cat.id)}
                  className={`w-full flex items-center justify-between p-2.5 rounded-xl text-xs font-semibold transition-all text-left ${
                    selectedCategory === cat.id
                      ? 'bg-[#1B5E20] text-white shadow-sm'
                      : 'text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  <span>{cat.name}</span>
                  {selectedCategory === cat.id && (
                    <span className="w-2 h-2 rounded-full bg-amber-400" />
                  )}
                </button>
              ))}
            </nav>

            {/* Quick Dietary Filters */}
            <div className="mt-6 pt-4 border-t border-slate-100 space-y-3">
              <h4 className="font-bold text-xs text-slate-900 uppercase tracking-wide">
                Speciality Filters
              </h4>
              <div className="space-y-2">
                <label className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={filterHalal}
                    onChange={(e) => setFilterHalal(e.target.checked)}
                    className="rounded text-[#1B5E20] focus:ring-[#1B5E20]"
                  />
                  <span>100% Halal Certified</span>
                </label>

                <label className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={filterFresh}
                    onChange={(e) => setFilterFresh(e.target.checked)}
                    className="rounded text-[#1B5E20] focus:ring-[#1B5E20]"
                  />
                  <span>Fresh Daily Items</span>
                </label>

                <label className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={filterOffer}
                    onChange={(e) => setFilterOffer(e.target.checked)}
                    className="rounded text-[#F57C00] focus:ring-[#F57C00]"
                  />
                  <span>On Special Offer</span>
                </label>
              </div>
            </div>
          </div>
        </aside>

        {/* Product Grid Area */}
        <main className="lg:col-span-3 space-y-4">
          {/* Top Control Strip */}
          <div className="bg-white p-4 rounded-2xl border border-slate-200 flex flex-wrap items-center justify-between gap-4 shadow-xs">
            <div>
              <h2 className="font-bold text-slate-900 text-lg">
                {selectedCategory === 'all'
                  ? 'All Cultural Groceries'
                  : CATEGORIES.find((c) => c.id === selectedCategory)?.name}
              </h2>
              <p className="text-xs text-slate-500">
                Showing {filteredProducts.length} items in stock
              </p>
            </div>

            {/* Sort options */}
            <div className="flex items-center gap-2 text-xs">
              <ArrowUpDown className="w-3.5 h-3.5 text-slate-400" />
              <span className="text-slate-500">Sort by:</span>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as any)}
                className="bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 font-medium text-slate-800 focus:outline-none focus:border-[#1B5E20]"
              >
                <option value="featured">Featured / Popular</option>
                <option value="price-low">Price: Low to High</option>
                <option value="price-high">Price: High to Low</option>
                <option value="rating">Customer Rating</option>
              </select>
            </div>
          </div>

          {/* Product Cards Grid */}
          {filteredProducts.length === 0 ? (
            <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center text-slate-500 space-y-3">
              <Tag className="w-12 h-12 mx-auto text-slate-300" />
              <h3 className="font-bold text-slate-800 text-base">No items match your filter</h3>
              <p className="text-xs max-w-sm mx-auto">
                Try resetting your search query or clearing dietary filter checkboxes.
              </p>
              <button
                type="button"
                onClick={() => {
                  setSearchQuery('');
                  setSelectedCategory('all');
                  setFilterHalal(false);
                  setFilterFresh(false);
                  setFilterOffer(false);
                }}
                className="inline-block bg-[#1B5E20] text-white text-xs font-bold px-4 py-2 rounded-xl"
              >
                Reset All Filters
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
              {filteredProducts.map((product) => {
                const cartItem = cartItems.find((ci) => ci.product.id === product.id);
                return (
                  <ProductCard
                    key={product.id}
                    product={product}
                    onSelect={onProductClick}
                    onAddToCart={onAddToCart}
                    isInCart={Boolean(cartItem)}
                  />
                );
              })}
            </div>
          )}
        </main>
      </div>
    </div>
  );
};
