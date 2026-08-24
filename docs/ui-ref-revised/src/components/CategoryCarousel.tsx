import React, { useRef, useState, useEffect } from 'react';
import { CategoryId, Product } from '../types';
import { CATEGORIES, CategoryInfo } from '../data/products';
import {
  LayoutGrid,
  Beef,
  Apple,
  ShoppingBag,
  Globe,
  Milk,
  Coffee,
  Cookie,
  Home,
  ChevronLeft,
  ChevronRight,
  Sparkles,
  Flame,
  ShieldCheck,
  Wheat,
  Leaf,
  Egg,
  Tag,
  Check
} from 'lucide-react';

interface CategoryCarouselProps {
  categories?: CategoryInfo[];
  selectedCategory: CategoryId;
  onSelectCategory: (categoryId: CategoryId) => void;
  selectedSubCategory: string;
  onSelectSubCategory: (subCategory: string) => void;
  products: Product[];
  className?: string;
}

export const CategoryCarousel: React.FC<CategoryCarouselProps> = ({
  categories = CATEGORIES,
  selectedCategory,
  onSelectCategory,
  selectedSubCategory,
  onSelectSubCategory,
  products,
  className = '',
}) => {
  const categoryScrollRef = useRef<HTMLDivElement>(null);
  const subCategoryScrollRef = useRef<HTMLDivElement>(null);

  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(true);

  const [subCanScrollLeft, setSubCanScrollLeft] = useState(false);
  const [subCanScrollRight, setSubCanScrollRight] = useState(false);

  // Check scroll positions for Category carousel
  const checkCategoryScroll = () => {
    const el = categoryScrollRef.current;
    if (!el) return;
    const { scrollLeft, scrollWidth, clientWidth } = el;
    setCanScrollLeft(scrollLeft > 6);
    setCanScrollRight(scrollLeft < scrollWidth - clientWidth - 6);
  };

  // Check scroll positions for SubCategory carousel
  const checkSubCategoryScroll = () => {
    const el = subCategoryScrollRef.current;
    if (!el) return;
    const { scrollLeft, scrollWidth, clientWidth } = el;
    setSubCanScrollLeft(scrollLeft > 6);
    setSubCanScrollRight(scrollLeft < scrollWidth - clientWidth - 6);
  };

  useEffect(() => {
    checkCategoryScroll();
    checkSubCategoryScroll();

    const catEl = categoryScrollRef.current;
    const subEl = subCategoryScrollRef.current;

    catEl?.addEventListener('scroll', checkCategoryScroll);
    subEl?.addEventListener('scroll', checkSubCategoryScroll);

    window.addEventListener('resize', checkCategoryScroll);
    window.addEventListener('resize', checkSubCategoryScroll);

    return () => {
      catEl?.removeEventListener('scroll', checkCategoryScroll);
      subEl?.removeEventListener('scroll', checkSubCategoryScroll);
      window.removeEventListener('resize', checkCategoryScroll);
      window.removeEventListener('resize', checkSubCategoryScroll);
    };
  }, [categories, selectedCategory]);

  const handleScrollCategories = (direction: 'left' | 'right') => {
    if (!categoryScrollRef.current) return;
    const scrollAmount = 300;
    categoryScrollRef.current.scrollBy({
      left: direction === 'left' ? -scrollAmount : scrollAmount,
      behavior: 'smooth',
    });
  };

  const handleScrollSubCategories = (direction: 'left' | 'right') => {
    if (!subCategoryScrollRef.current) return;
    const scrollAmount = 240;
    subCategoryScrollRef.current.scrollBy({
      left: direction === 'left' ? -scrollAmount : scrollAmount,
      behavior: 'smooth',
    });
  };

  // Render dedicated category icon
  const renderCategoryIcon = (id: CategoryId, isSelected: boolean) => {
    const iconClass = `w-5 h-5 transition-transform duration-300 ${isSelected ? 'scale-110' : 'group-hover:scale-110'}`;

    switch (id) {
      case 'all':
        return <LayoutGrid className={iconClass} />;
      case 'halal-meat':
        return <Beef className={iconClass} />;
      case 'fresh-produce':
        return <Apple className={iconClass} />;
      case 'groceries':
        return <Wheat className={iconClass} />;
      case 'international':
        return <Globe className={iconClass} />;
      case 'dairy-eggs':
        return <Milk className={iconClass} />;
      case 'beverages':
        return <Coffee className={iconClass} />;
      case 'snacks':
        return <Cookie className={iconClass} />;
      case 'household':
        return <Home className={iconClass} />;
      default:
        return <ShoppingBag className={iconClass} />;
    }
  };

  // Category Theme Accent Configuration
  const getCategoryTheme = (id: CategoryId, isSelected: boolean) => {
    if (isSelected) {
      return {
        card: 'bg-[#1B5E20] text-white shadow-lg ring-2 ring-emerald-600/50 shadow-emerald-950/20 translate-y-[-2px]',
        iconBg: 'bg-white/20 text-white',
        badge: 'bg-emerald-800 text-emerald-100',
      };
    }

    switch (id) {
      case 'halal-meat':
        return {
          card: 'bg-white text-slate-800 hover:border-red-400 hover:bg-red-50/30 shadow-2xs',
          iconBg: 'bg-red-100 text-red-700',
          badge: 'bg-red-100 text-red-800',
        };
      case 'fresh-produce':
        return {
          card: 'bg-white text-slate-800 hover:border-emerald-400 hover:bg-emerald-50/30 shadow-2xs',
          iconBg: 'bg-emerald-100 text-emerald-800',
          badge: 'bg-emerald-100 text-emerald-800',
        };
      case 'groceries':
        return {
          card: 'bg-white text-slate-800 hover:border-amber-400 hover:bg-amber-50/30 shadow-2xs',
          iconBg: 'bg-amber-100 text-amber-800',
          badge: 'bg-amber-100 text-amber-800',
        };
      case 'international':
        return {
          card: 'bg-white text-slate-800 hover:border-orange-400 hover:bg-orange-50/30 shadow-2xs',
          iconBg: 'bg-orange-100 text-orange-800',
          badge: 'bg-orange-100 text-orange-800',
        };
      case 'dairy-eggs':
        return {
          card: 'bg-white text-slate-800 hover:border-blue-400 hover:bg-blue-50/30 shadow-2xs',
          iconBg: 'bg-blue-100 text-blue-800',
          badge: 'bg-blue-100 text-blue-800',
        };
      case 'beverages':
        return {
          card: 'bg-white text-slate-800 hover:border-purple-400 hover:bg-purple-50/30 shadow-2xs',
          iconBg: 'bg-purple-100 text-purple-800',
          badge: 'bg-purple-100 text-purple-800',
        };
      case 'snacks':
        return {
          card: 'bg-white text-slate-800 hover:border-pink-400 hover:bg-pink-50/30 shadow-2xs',
          iconBg: 'bg-pink-100 text-pink-800',
          badge: 'bg-pink-100 text-pink-800',
        };
      default:
        return {
          card: 'bg-white text-slate-800 hover:border-slate-300 hover:bg-slate-50 shadow-2xs',
          iconBg: 'bg-slate-100 text-slate-700',
          badge: 'bg-slate-100 text-slate-700',
        };
    }
  };

  const currentCategoryInfo = categories.find((c) => c.id === selectedCategory) || categories[0];

  return (
    <div className={`space-y-4 ${className}`}>
      {/* Category Section Header with Left/Right Controls */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-[#1B5E20]" />
            <h2 className="text-base sm:text-lg font-black text-slate-900 tracking-tight">
              Shop by Department & Fresh Counter
            </h2>
          </div>
          <p className="text-xs text-slate-500 font-medium">
            100% Certified HMC Halal Butchery, Daily Desi Produce & International Staples
          </p>
        </div>

        {/* Scroll Left / Right Arrow Buttons */}
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={() => handleScrollCategories('left')}
            disabled={!canScrollLeft}
            aria-label="Scroll categories left"
            className={`w-9 h-9 rounded-full flex items-center justify-center border transition-all ${
              canScrollLeft
                ? 'bg-white hover:bg-slate-100 text-slate-800 border-slate-300 shadow-xs hover:scale-105 active:scale-95 cursor-pointer'
                : 'bg-slate-100 text-slate-300 border-slate-200 cursor-not-allowed opacity-60'
            }`}
          >
            <ChevronLeft className="w-5 h-5" />
          </button>

          <button
            type="button"
            onClick={() => handleScrollCategories('right')}
            disabled={!canScrollRight}
            aria-label="Scroll categories right"
            className={`w-9 h-9 rounded-full flex items-center justify-center border transition-all ${
              canScrollRight
                ? 'bg-white hover:bg-[#1B5E20] hover:text-white text-slate-800 border-slate-300 shadow-xs hover:scale-105 active:scale-95 cursor-pointer'
                : 'bg-slate-100 text-slate-300 border-slate-200 cursor-not-allowed opacity-60'
            }`}
          >
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Main Categories Carousel Container */}
      <div className="relative group">
        {/* Left Gradient Fade */}
        {canScrollLeft && (
          <div className="absolute left-0 top-0 bottom-0 w-10 bg-linear-to-r from-[#FAFAFA] to-transparent z-10 pointer-events-none rounded-l-2xl" />
        )}

        {/* Right Gradient Fade */}
        {canScrollRight && (
          <div className="absolute right-0 top-0 bottom-0 w-10 bg-linear-to-l from-[#FAFAFA] to-transparent z-10 pointer-events-none rounded-r-2xl" />
        )}

        {/* Horizontal Category Cards Strip (NO SCROLLBAR) */}
        <div
          ref={categoryScrollRef}
          className="flex gap-3 overflow-x-auto no-scrollbar scroll-smooth py-1 px-0.5"
          style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
        >
          {categories.map((cat) => {
            const isSelected = selectedCategory === cat.id;
            const theme = getCategoryTheme(cat.id, isSelected);

            const count =
              cat.id === 'all'
                ? products.length
                : products.filter((p) => p.category === cat.id).length;

            return (
              <button
                key={cat.id}
                type="button"
                onClick={() => {
                  onSelectCategory(cat.id);
                  onSelectSubCategory('All');
                }}
                className={`group flex items-center gap-3 px-4 py-3 rounded-2xl border border-slate-200/90 shrink-0 transition-all duration-200 cursor-pointer select-none min-w-[170px] ${theme.card}`}
              >
                {/* Category Icon Badge */}
                <div
                  className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 transition-transform ${theme.iconBg}`}
                >
                  {renderCategoryIcon(cat.id, isSelected)}
                </div>

                {/* Category Title & Count */}
                <div className="text-left min-w-0 flex-1">
                  <div className="font-extrabold text-xs sm:text-sm leading-tight truncate">
                    {cat.name}
                  </div>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <span
                      className={`text-[10px] font-bold px-1.5 py-0.2 rounded-md ${theme.badge}`}
                    >
                      {count} {count === 1 ? 'item' : 'items'}
                    </span>
                    {cat.id === 'halal-meat' && (
                      <span className="text-[9px] font-black bg-red-600 text-white px-1 py-0.2 rounded">
                        HMC
                      </span>
                    )}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Subcategory Pills Row with Smooth Scroll & Arrows */}
      {currentCategoryInfo.subcategories && currentCategoryInfo.subcategories.length > 0 && (
        <div className="bg-white/80 backdrop-blur-xs p-2.5 rounded-2xl border border-slate-200/80 shadow-2xs flex items-center gap-2">
          {/* Subcategory Left Arrow */}
          {subCanScrollLeft && (
            <button
              type="button"
              onClick={() => handleScrollSubCategories('left')}
              className="w-7 h-7 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 flex items-center justify-center shrink-0 transition-colors"
              aria-label="Scroll subcategories left"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
          )}

          <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider px-1.5 shrink-0 hidden sm:block">
            Filter:
          </div>

          {/* Subcategories Horizontal Strip */}
          <div
            ref={subCategoryScrollRef}
            className="flex-1 flex items-center gap-1.5 overflow-x-auto no-scrollbar scroll-smooth py-0.5"
            style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
          >
            {currentCategoryInfo.subcategories.map((sub) => {
              const isSelected = selectedSubCategory === sub;
              return (
                <button
                  key={sub}
                  type="button"
                  onClick={() => onSelectSubCategory(sub)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all duration-150 cursor-pointer ${
                    isSelected
                      ? 'bg-[#1B5E20] text-white shadow-xs scale-102'
                      : 'bg-slate-100/90 hover:bg-slate-200/80 text-slate-700'
                  }`}
                >
                  {sub}
                </button>
              );
            })}
          </div>

          {/* Subcategory Right Arrow */}
          {subCanScrollRight && (
            <button
              type="button"
              onClick={() => handleScrollSubCategories('right')}
              className="w-7 h-7 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 flex items-center justify-center shrink-0 transition-colors"
              aria-label="Scroll subcategories right"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          )}
        </div>
      )}
    </div>
  );
};
