import React, { useState } from 'react';
import { Product, CategoryId, CartItem, ProductVariant, MeatCutType, MeatPrepType, SubstitutionPreference } from '../types';
import { CATEGORIES } from '../data/products';
import { ProductCard } from './ProductCard';
import {
  Search,
  ArrowLeft,
  ShoppingBag,
  Sparkles,
  ShieldCheck,
  Beef,
  Apple,
  Wheat,
  Globe,
  Milk,
  Coffee,
  Cookie,
  Home
} from 'lucide-react';

interface ProductsCatalogPageProps {
  products: Product[];
  selectedCategory: CategoryId;
  setSelectedCategory: (cat: CategoryId) => void;
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  cartItems: CartItem[];
  onAddToCart: (
    product: Product,
    e?: React.MouseEvent,
    variant?: ProductVariant,
    cut?: MeatCutType,
    prep?: MeatPrepType,
    notes?: string,
    subPref?: SubstitutionPreference
  ) => void;
  onUpdateCartQuantity: (productId: string, delta: number, e?: React.MouseEvent) => void;
  onProductClick: (product: Product) => void;
  wishlistIds: string[];
  onToggleWishlist: (productId: string, e?: React.MouseEvent) => void;
  onBackToHome: () => void;
}

const CATEGORY_ICONS: Record<string, React.ElementType> = {
  'halal-meat': Beef,
  'fresh-produce': Apple,
  'groceries': Wheat,
  'international': Globe,
  'dairy-eggs': Milk,
  'beverages': Coffee,
  'snacks': Cookie,
  'household': Home,
};

export const ProductsCatalogPage: React.FC<ProductsCatalogPageProps> = ({
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
  onBackToHome,
}) => {
  const [selectedSubCategory, setSelectedSubCategory] = useState<string>('All');
  const [filterHalal, setFilterHalal] = useState(false);
  const [filterFresh, setFilterFresh] = useState(false);
  const [filterOffer, setFilterOffer] = useState(false);
  const [sortBy, setSortBy] = useState<'featured' | 'price-low' | 'price-high' | 'best-sellers'>('featured');

  const currentCategoryObj = CATEGORIES.find((c) => c.id === selectedCategory);
  const subCategories = currentCategoryObj
    ? Array.from(new Set(currentCategoryObj.subcategories))
    : ['All'];

  const filteredProducts = products
    .filter((p) => {
      const matchCat = selectedCategory === 'all' || p.category === selectedCategory;
      const matchSub =
        selectedSubCategory === 'All' ||
        selectedSubCategory === 'All Meat' ||
        selectedSubCategory === 'All Produce' ||
        selectedSubCategory === 'All Groceries' ||
        selectedSubCategory === 'All International' ||
        selectedSubCategory === 'All Dairy' ||
        selectedSubCategory === 'All Beverages' ||
        selectedSubCategory === 'All Snacks' ||
        selectedSubCategory === 'All Household' ||
        p.subCategory === selectedSubCategory ||
        (selectedSubCategory === 'Best Sellers' && p.isBestSeller) ||
        (selectedSubCategory === 'Special Offers' && p.isOffer);

      const matchSearch =
        searchQuery.trim() === '' ||
        p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (p.brand && p.brand.toLowerCase().includes(searchQuery.toLowerCase())) ||
        (p.origin && p.origin.toLowerCase().includes(searchQuery.toLowerCase()));

      const matchHalal = !filterHalal || p.isHalal;
      const matchFresh = !filterFresh || p.isFresh;
      const matchOffer = !filterOffer || p.isOffer || (p.originalPrice && p.originalPrice > p.price);

      return matchCat && matchSub && matchSearch && matchHalal && matchFresh && matchOffer;
    })
    .sort((a, b) => {
      if (sortBy === 'price-low') return a.price - b.price;
      if (sortBy === 'price-high') return b.price - a.price;
      if (sortBy === 'best-sellers') return (b.isBestSeller ? 1 : 0) - (a.isBestSeller ? 1 : 0);
      return 0;
    });

  return (
    <div className="max-w-7xl mx-auto px-4 py-6 space-y-6">
      {/* Top Breadcrumb & Back to Home */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-4">
        <button
          type="button"
          onClick={onBackToHome}
          className="flex items-center gap-2 text-xs font-bold text-slate-700 hover:text-[#1B5E20] bg-slate-100 hover:bg-emerald-50 px-3.5 py-2 rounded-xl transition-all cursor-pointer shadow-2xs border border-slate-200"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>← Back to Lookbook Home</span>
        </button>

        <div className="flex items-center gap-2 text-xs text-slate-500 font-medium">
          <span>Home</span>
          <span>/</span>
          <span className="font-bold text-slate-900 capitalize">
            {currentCategoryObj ? currentCategoryObj.name : 'All Products'}
          </span>
          <span className="text-slate-400">({filteredProducts.length} items)</span>
        </div>
      </div>

      {/* Prominent Search Bar & Active Filters */}
      <div className="bg-white p-4 sm:p-6 rounded-3xl border border-slate-200 shadow-xs space-y-4">
        <div className="relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search Halal baby lamb, chicken breast, basmati rice, chakki atta, bhindi, Shan masalas..."
            className="w-full bg-slate-50 focus:bg-white text-sm pl-12 pr-10 py-3.5 rounded-2xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-600 focus:border-transparent transition-all shadow-inner"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 text-sm font-bold"
            >
              ✕
            </button>
          )}
        </div>

        {/* Category Filter Pills */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
          <button
            type="button"
            onClick={() => {
              setSelectedCategory('all');
              setSelectedSubCategory('All');
            }}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all cursor-pointer ${
              selectedCategory === 'all'
                ? 'bg-[#1B5E20] text-white shadow-xs'
                : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
            }`}
          >
            All Products ({products.length})
          </button>
          {CATEGORIES.filter((c) => c.id !== 'all').map((cat) => {
            const isSelected = selectedCategory === cat.id;
            const IconComponent = CATEGORY_ICONS[cat.id] || ShoppingBag;
            const catCount = products.filter((p) => p.category === cat.id).length;

            return (
              <button
                key={cat.id}
                type="button"
                onClick={() => {
                  setSelectedCategory(cat.id);
                  setSelectedSubCategory('All');
                }}
                className={`px-3.5 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all cursor-pointer flex items-center gap-1.5 ${
                  isSelected
                    ? 'bg-[#1B5E20] text-white shadow-xs ring-1 ring-emerald-400'
                    : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                }`}
              >
                <IconComponent className="w-3.5 h-3.5" />
                <span>{cat.name}</span>
                <span className="text-[10px] opacity-75">({catCount})</span>
              </button>
            );
          })}
        </div>

        {/* Subcategories & Quick Tag Filters */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-slate-100">
          {subCategories.length > 1 && (
            <div className="flex items-center gap-1.5 overflow-x-auto">
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mr-1">
                Sub-Type:
              </span>
              {subCategories.map((sub) => (
                <button
                  key={sub}
                  type="button"
                  onClick={() => setSelectedSubCategory(sub)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-medium cursor-pointer transition-colors ${
                    selectedSubCategory === sub
                      ? 'bg-emerald-100 text-emerald-900 font-bold border border-emerald-300'
                      : 'bg-slate-100 hover:bg-slate-200 text-slate-600'
                  }`}
                >
                  {sub}
                </button>
              ))}
            </div>
          )}

          {/* Quick Filters & Sorting */}
          <div className="flex items-center gap-2 flex-wrap ml-auto">
            <button
              type="button"
              onClick={() => setFilterHalal(!filterHalal)}
              className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1 ${
                filterHalal
                  ? 'bg-emerald-800 text-white'
                  : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
              }`}
            >
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>HMC Halal Only</span>
            </button>

            <button
              type="button"
              onClick={() => setFilterOffer(!filterOffer)}
              className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1 ${
                filterOffer
                  ? 'bg-amber-600 text-white'
                  : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
              }`}
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>Deals & Offers</span>
            </button>

            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
              className="bg-slate-100 text-slate-700 text-xs font-bold px-2.5 py-1 rounded-lg border border-slate-200 focus:outline-none"
            >
              <option value="featured">Featured Order</option>
              <option value="price-low">Price: Low to High</option>
              <option value="price-high">Price: High to Low</option>
              <option value="best-sellers">Bestsellers</option>
            </select>
          </div>
        </div>
      </div>

      {/* Product Results Grid */}
      {filteredProducts.length === 0 ? (
        <div className="bg-white rounded-3xl p-12 text-center border border-slate-200 space-y-4 shadow-xs">
          <div className="w-16 h-16 rounded-full bg-emerald-50 text-[#1B5E20] flex items-center justify-center mx-auto">
            <Search className="w-8 h-8" />
          </div>
          <h3 className="text-lg font-black text-slate-900">No products found</h3>
          <p className="text-xs text-slate-500 max-w-md mx-auto">
            We couldn’t find any matches for &quot;{searchQuery}&quot;. Try clearing filters or searching for Halal lamb, chicken, Basmati, or masalas.
          </p>
          <button
            type="button"
            onClick={() => {
              setSearchQuery('');
              setSelectedCategory('all');
              setSelectedSubCategory('All');
              setFilterHalal(false);
              setFilterFresh(false);
              setFilterOffer(false);
            }}
            className="px-4 py-2 bg-[#1B5E20] text-white text-xs font-bold rounded-xl hover:bg-emerald-800 transition-colors"
          >
            Reset All Filters
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 md:gap-4">
          {filteredProducts.map((product) => {
            const cartItem = cartItems.find((item) => item.product.id === product.id);
            const isWishlisted = wishlistIds.includes(product.id);

            return (
              <ProductCard
                key={product.id}
                product={product}
                cartItem={cartItem}
                onAddToCart={onAddToCart}
                onUpdateCartQuantity={onUpdateCartQuantity}
                onClick={onProductClick}
                isWishlisted={isWishlisted}
                onToggleWishlist={onToggleWishlist}
              />
            );
          })}
        </div>
      )}
    </div>
  );
};
