import React, { useState, useEffect, useRef } from 'react';
import { CategoryId, Product } from '../types';
import {
  Beef,
  Apple,
  Wheat,
  Globe,
  Milk,
  CheckCircle2,
  Flame,
  Sparkles
} from 'lucide-react';

interface BookPage {
  id: CategoryId;
  pageNumber: number;
  badge: string;
  badgeBg: string;
  badgeText: string;
  title: string;
  subtitle: string;
  ctaText: string;
  overlayColor: string;
  image: string;
  icon: React.ElementType;
  storyHeading: string;
  storyText: string;
  highlights: string[];
  featuredProduct: {
    name: string;
    dealPrice: string;
    origPrice?: string;
    unit: string;
    badge: string;
  };
  trustBadge: string;
}

interface FlipBookHeroProps {
  onSelectCategory: (categoryId: CategoryId) => void;
  onOpenTrustModal?: (tab: string) => void;
  onOpenWhatsApp?: () => void;
  onProductClick?: (product: Product) => void;
  products?: Product[];
}

const BOOK_PAGES: BookPage[] = [
  {
    id: 'halal-meat',
    pageNumber: 1,
    badge: '100% Certified HMC Halal',
    badgeBg: 'bg-red-500/30 border-red-400/50 text-red-200',
    badgeText: 'HMC Halal Butchery',
    title: 'HMC Halal Meat & Poultry',
    subtitle: 'English Baby Lamb, Grade-A Chicken & Custom Cuts',
    ctaText: 'Shop Butchery Counter →',
    overlayColor: 'rgba(185, 28, 28, 0.85)',
    image: 'https://images.unsplash.com/photo-1607623814075-e51df1bdc82f?auto=format&fit=crop&w=1200&q=85',
    icon: Beef,
    storyHeading: 'Craft Halal Butchery Cut Fresh Daily in Milton Keynes',
    storyText: 'Every cut of lamb, mutton, and chicken is 100% Certified HMC Halal. Custom cut to your exact order — bone-in curry cuts, tender fillets, hand-ground keema, or steaks.',
    highlights: ['100% Certified HMC Halal Guarantee', 'Custom Bone-in, Boneless & Keema Cuts', 'Pre-Authorised Scaled Weight Guarantee'],
    featuredProduct: {
      name: 'Fresh Halal Baby Lamb Curry Cut',
      dealPrice: '£10.99',
      origPrice: '£12.49',
      unit: 'per kg',
      badge: 'Today’s Meat Special',
    },
    trustBadge: 'Calibrated Butcher Scales Guarantee',
  },
  {
    id: 'fresh-produce',
    pageNumber: 2,
    badge: 'Farm Fresh Harvest',
    badgeBg: 'bg-emerald-500/30 border-emerald-400/50 text-emerald-200',
    badgeText: 'Daily Desi Produce',
    title: 'Desi Produce & Fresh Herbs',
    subtitle: 'Crisp Okra (Bhindi), Karela, Fresh Mint & Chaunsa Mangoes',
    ctaText: 'Shop Fresh Greens →',
    overlayColor: 'rgba(27, 94, 32, 0.85)',
    image: 'https://images.unsplash.com/photo-1610832958506-aa56368176cf?auto=format&fit=crop&w=1200&q=85',
    icon: Apple,
    storyHeading: 'Crisp Cultural Greens & Exotic Produce Arriving Every Morning',
    storyText: 'From crisp desi okra (bhindi) and bitter gourd (karela) to bunches of fresh coriander, fiery green chillies, and seasonal Asian mangoes, our produce counter guarantees vibrant freshness.',
    highlights: ['Direct Morning Farm Deliveries', 'Zero Long-Storage Preservatives', 'Traditional Subcontinent Vegetables'],
    featuredProduct: {
      name: 'Fresh Desi Okra (Bhindi)',
      dealPrice: '£2.49',
      origPrice: '£2.99',
      unit: 'per 500g',
      badge: 'Morning Farm Harvest',
    },
    trustBadge: 'Hand-inspected for Crispness & Quality',
  },
  {
    id: 'groceries',
    pageNumber: 3,
    badge: 'Pantry Bulk Value',
    badgeBg: 'bg-amber-500/30 border-amber-400/50 text-amber-200',
    badgeText: 'Basmati & Chakki Atta',
    title: 'Aged Basmati & Atta Sacks',
    subtitle: 'Extra-Long Grain Rice, Elephant Atta Sacks & Heritage Pulses',
    ctaText: 'Stock Your Pantry →',
    overlayColor: 'rgba(180, 83, 9, 0.85)',
    image: 'https://images.unsplash.com/photo-1586201375761-83865001e31c?auto=format&fit=crop&w=1200&q=85',
    icon: Wheat,
    storyHeading: 'Authentic Bulk Sacks for True Family Cooking',
    storyText: 'Stock up on aromatic 2-year aged Laila and Tilda Basmati rice, 10kg Elephant Gold Chakki Atta sacks, pure mustard oils, and washed lentils with free delivery in Milton Keynes.',
    highlights: ['Multi-Buy Sacks & Family Packs', 'Authentic 2-Year Aged Grains', 'Free MK Delivery Over £35'],
    featuredProduct: {
      name: 'Laila Super Basmati Rice 5kg',
      dealPrice: '£8.99',
      origPrice: '£10.99',
      unit: '5kg bag',
      badge: 'Family Saver Deal',
    },
    trustBadge: 'Heavy Item Free Delivery Over £35 in MK',
  },
  {
    id: 'international',
    pageNumber: 4,
    badge: 'Desi Spices & Masalas',
    badgeBg: 'bg-orange-500/30 border-orange-400/50 text-orange-200',
    badgeText: 'Authentic World Foods',
    title: 'Desi Spice Vault & Masalas',
    subtitle: 'Shan, TRS, Laziza, MDH & Authentic Whole Spices',
    ctaText: 'Discover Spice Vault →',
    overlayColor: 'rgba(194, 65, 12, 0.85)',
    image: 'https://images.unsplash.com/photo-1596040033229-a9821ebd058d?auto=format&fit=crop&w=1200&q=85',
    icon: Globe,
    storyHeading: 'Over 250 Aromatic Spices, Seeds & Recipe Blends',
    storyText: 'Elevate your biryanis, curries, and roasts with fresh whole cumin, green cardamom pods, Kashmiri deggi mirch, and Shan special masala recipe kits sourced directly from traditional spice producers.',
    highlights: ['Whole, Crushed & Ground Spices', 'Shan & Laziza Authentic Mixes', 'Sealed for Potent Aroma & Flavor'],
    featuredProduct: {
      name: 'Shan Bombay Biryani Recipe Mix',
      dealPrice: '£1.29',
      origPrice: '£1.59',
      unit: '50g pack',
      badge: 'Heritage Recipe Kit',
    },
    trustBadge: '100% Pure & Potent Aromatic Spices',
  },
  {
    id: 'dairy-eggs',
    pageNumber: 5,
    badge: 'Pure Traditional Dairy',
    badgeBg: 'bg-blue-500/30 border-blue-400/50 text-blue-200',
    badgeText: 'Chilled Dairy & Frozen',
    title: 'Fresh Paneer & Pure Ghee',
    subtitle: 'Soft Malai Paneer, Khanum Butter Ghee & Halal Frozen Delights',
    ctaText: 'Browse Dairy & Cold →',
    overlayColor: 'rgba(29, 78, 216, 0.85)',
    image: 'https://images.unsplash.com/photo-1628088062854-d1870b4553da?auto=format&fit=crop&w=1200&q=85',
    icon: Milk,
    storyHeading: 'Creamy Desi Dahi, Fresh Paneer & Golden Butter Ghee',
    storyText: 'Discover rich Khanum pure butter ghee, velvety blocks of fresh malai paneer, thick desi curd, and freezer staples including frozen Shana parathas and handmade samosas.',
    highlights: ['Insulated Cold-Chain MK Delivery', 'Pure Traditional Butter Ghee', 'Ready-to-Fry Frozen Delights'],
    featuredProduct: {
      name: 'Khanum Pure Butter Ghee 500g',
      dealPrice: '£4.49',
      origPrice: '£5.29',
      unit: '500g tin',
      badge: 'Pure Grass-Fed Dairy',
    },
    trustBadge: 'Chilled Temperature Guarantee on Delivery',
  },
];

export const FlipBookHero: React.FC<FlipBookHeroProps> = ({
  onSelectCategory,
}) => {
  const [currentPageIndex, setCurrentPageIndex] = useState<number>(0);
  const [flipDirection, setFlipDirection] = useState<'right' | 'left'>('right');
  const [isHovered, setIsHovered] = useState<boolean>(false);

  const timerRef = useRef<NodeJS.Timeout | null>(null);

  const totalPages = BOOK_PAGES.length;
  const currentPage = BOOK_PAGES[currentPageIndex];

  // Auto-flip by default every 5.5 seconds (pauses smoothly when hovered)
  useEffect(() => {
    if (isHovered) {
      if (timerRef.current) clearInterval(timerRef.current);
      return;
    }

    timerRef.current = setInterval(() => {
      setFlipDirection('right');
      setCurrentPageIndex((prev) => (prev + 1) % totalPages);
    }, 5500);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isHovered, totalPages]);

  const handleHeroClick = () => {
    onSelectCategory(currentPage.id);
  };

  const Icon = currentPage.icon;

  return (
    <div
      onClick={handleHeroClick}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className="relative rounded-3xl overflow-hidden min-h-[440px] md:min-h-[480px] flex flex-col justify-between select-none shadow-2xl border border-slate-800 bg-slate-950 cursor-pointer group/hero transition-all duration-300 hover:border-emerald-500/60"
    >
      {/* 1. AMBIENT BACKGROUND GLOW & GRADIENTS */}
      <div className="absolute inset-0 z-0 bg-slate-950 pointer-events-none">
        <div className="absolute inset-0 bg-gradient-to-r from-slate-950 via-slate-950/90 to-slate-900/60 z-10" />
        <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/80 to-transparent z-10" />
      </div>

      {/* 2. DYNAMIC ARROW / CHEVRON SHAPED IMAGE BACKGROUND */}
      <div className="absolute inset-0 z-0 flex items-center justify-end overflow-hidden pointer-events-none">
        <div
          key={`arrow-bg-${currentPageIndex}`}
          className={`relative w-full md:w-[65%] lg:w-[60%] h-full arrow-clip-shape opacity-80 md:opacity-95 transition-all duration-700 ${
            flipDirection === 'right' ? 'animate-page-flip-right' : 'animate-page-flip-left'
          }`}
        >
          <img
            src={currentPage.image}
            alt={currentPage.title}
            className="w-full h-full object-cover object-center"
          />
          {/* Multiply Overlay Tint */}
          <div
            className="absolute inset-0 mix-blend-multiply opacity-50 transition-colors duration-500"
            style={{ backgroundColor: currentPage.overlayColor }}
          />
          <div className="absolute inset-0 bg-gradient-to-l from-transparent via-slate-950/40 to-slate-950/90" />
          <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-transparent to-slate-950/40" />
        </div>
      </div>

      {/* 3. TOP HEADER STRIP: Clean Badge & Slide Page Indicator */}
      <div className="relative z-20 p-5 md:p-8 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span
            className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-black border backdrop-blur-md shadow-md ${currentPage.badgeBg}`}
          >
            <Icon className="w-3.5 h-3.5" />
            <span>{currentPage.badge}</span>
          </span>
          <span className="bg-black/50 backdrop-blur-md px-2.5 py-1 rounded-full text-white/90 text-xs font-mono border border-white/10">
            0{currentPage.pageNumber} / 0{totalPages}
          </span>
        </div>
      </div>

      {/* 4. HERO BODY CONTENT (Clutter-Free, Pure Essentials) */}
      <div className="relative z-20 px-5 md:px-10 pb-6 md:pb-8 flex flex-col justify-end space-y-4 max-w-2xl text-white">
        <div
          key={`content-${currentPageIndex}`}
          className={`flex flex-col justify-end space-y-4 text-white ${
            flipDirection === 'right' ? 'animate-page-flip-left' : 'animate-page-flip-right'
          }`}
        >
          {/* Main Headline & Subtitle */}
          <div className="space-y-1.5">
            <div className="text-amber-400 font-extrabold text-xs md:text-sm tracking-wide uppercase flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5" />
              <span>{currentPage.subtitle}</span>
            </div>
            <h1 className="text-2xl sm:text-3xl md:text-5xl font-black text-white leading-tight tracking-tight drop-shadow-lg">
              {currentPage.storyHeading}
            </h1>
            <p className="text-xs sm:text-sm text-slate-200 leading-relaxed font-normal line-clamp-2 md:line-clamp-none max-w-xl drop-shadow-sm">
              {currentPage.storyText}
            </p>
          </div>

          {/* Value Bullet Highlights */}
          <div className="hidden sm:flex flex-wrap gap-2 pt-1">
            {currentPage.highlights.map((bullet, idx) => (
              <span
                key={idx}
                className="inline-flex items-center gap-1.5 text-xs text-emerald-200 bg-emerald-950/80 backdrop-blur-md border border-emerald-500/40 px-2.5 py-1 rounded-xl shadow-xs"
              >
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                <span>{bullet}</span>
              </span>
            ))}
          </div>

          {/* Clean Price Deal Pill */}
          <div className="pt-1">
            <div className="inline-flex bg-black/70 backdrop-blur-md border border-white/20 px-4 py-2.5 rounded-2xl items-center gap-3.5 shadow-lg group-hover/hero:border-emerald-400/50 transition-colors">
              <div className="w-8 h-8 rounded-xl bg-amber-500/25 border border-amber-400/40 flex items-center justify-center text-amber-300 shrink-0">
                <Flame className="w-4 h-4" />
              </div>
              <div>
                <span className="text-[10px] font-bold text-amber-400 uppercase tracking-wider block leading-none">
                  {currentPage.featuredProduct.badge}
                </span>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-xs sm:text-sm font-extrabold text-white">
                    {currentPage.featuredProduct.name}
                  </span>
                  <span className="font-black text-emerald-400 text-sm">
                    {currentPage.featuredProduct.dealPrice}
                  </span>
                  {currentPage.featuredProduct.origPrice && (
                    <span className="line-through text-slate-400 text-[10px]">
                      {currentPage.featuredProduct.origPrice}
                    </span>
                  )}
                  <span className="text-slate-300 text-[10px]">
                    {currentPage.featuredProduct.unit}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 5. BOTTOM DOT NAVIGATION INDICATORS (Auto-flip by default, jump on click) */}
      <div
        className="relative z-20 pb-4 flex items-center justify-center gap-2"
        onClick={(e) => e.stopPropagation()}
      >
        {BOOK_PAGES.map((page, idx) => {
          const isSelected = currentPageIndex === idx;
          return (
            <button
              key={page.id}
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setFlipDirection(idx > currentPageIndex ? 'right' : 'left');
                setCurrentPageIndex(idx);
              }}
              aria-label={`Go to slide ${idx + 1}`}
              className={`h-2 rounded-full transition-all duration-300 cursor-pointer ${
                isSelected
                  ? 'w-8 bg-emerald-400 shadow-sm shadow-emerald-400/60'
                  : 'w-2 bg-white/40 hover:bg-white/80'
              }`}
            />
          );
        })}
      </div>
    </div>
  );
};
