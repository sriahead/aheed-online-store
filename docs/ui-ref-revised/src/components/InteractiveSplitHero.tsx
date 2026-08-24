import React, { useState, useEffect } from 'react';
import { CategoryId, Product } from '../types';
import {
  Beef,
  Apple,
  Wheat,
  Globe,
  Milk,
  Sparkles,
  ArrowRight,
  ShieldCheck,
  Flame,
  CheckCircle2,
  Clock,
  Truck,
  Plus,
  Scale,
  Star,
  ChevronRight
} from 'lucide-react';

interface HighlightFeature {
  id: CategoryId;
  title: string;
  tagline: string;
  badge: string;
  badgeColor: string;
  image: string;
  icon: React.ElementType;
  highlights: string[];
  featuredItem: {
    name: string;
    price: string;
    unit: string;
    origPrice?: string;
  };
  trustPill: string;
  accentGradient: string;
  ctaText: string;
}

interface InteractiveSplitHeroProps {
  onSelectCategory: (categoryId: CategoryId) => void;
  onOpenTrustModal: (tab: string) => void;
  onOpenWhatsApp: () => void;
  onProductClick?: (product: Product) => void;
  products?: Product[];
}

const HERO_FEATURES: HighlightFeature[] = [
  {
    id: 'halal-meat',
    title: 'HMC Halal Master Butchery',
    tagline: 'Fresh English Baby Lamb & Grade-A Chicken prepared to your exact cut specifications.',
    badge: '100% Certified HMC',
    badgeColor: 'bg-red-600 text-white',
    image: 'https://images.unsplash.com/photo-1607623814075-e51df1bdc82f?auto=format&fit=crop&w=1200&q=85',
    icon: Beef,
    highlights: ['Curry Cut & Biryani Bones', 'Skinless & Extra Lean Trim', 'Hand-Cut Keema & Steaks'],
    featuredItem: {
      name: 'Baby Lamb Curry Cut (Fresh)',
      price: '£10.99',
      unit: 'per kg',
      origPrice: '£12.49',
    },
    trustPill: 'Calibrated Scales • Daily Fresh Cut',
    accentGradient: 'from-red-950/90 via-slate-900/70 to-transparent',
    ctaText: 'Explore Halal Butchery',
  },
  {
    id: 'fresh-produce',
    title: 'Daily Farm Produce & Herbs',
    tagline: 'Crisp South Asian, Mediterranean & Afro-Caribbean vegetables sourced every morning.',
    badge: 'Farm Fresh Daily',
    badgeColor: 'bg-emerald-600 text-white',
    image: 'https://images.unsplash.com/photo-1610832958506-aa56368176cf?auto=format&fit=crop&w=1200&q=85',
    icon: Apple,
    highlights: ['Fresh Okra (Bhindi) & Karela', 'Fresh Bunch Coriander & Mint', 'Alphonso & Chaunsa Mangoes'],
    featuredItem: {
      name: 'Fresh Desi Okra (Bhindi)',
      price: '£2.49',
      unit: 'per 500g',
    },
    trustPill: 'Picked Fresh • Zero Plastic Waste Options',
    accentGradient: 'from-emerald-950/90 via-slate-900/70 to-transparent',
    ctaText: 'Shop Fresh Produce',
  },
  {
    id: 'groceries',
    title: 'Aged Basmati Rice & Atta Flour',
    tagline: 'Bulk staples, pure pulses, and authentic kitchen essentials from trusted heritage brands.',
    badge: 'Best Value Sacks',
    badgeColor: 'bg-amber-600 text-white',
    image: 'https://images.unsplash.com/photo-1586201375761-83865001e31c?auto=format&fit=crop&w=1200&q=85',
    icon: Wheat,
    highlights: ['Laila & Tilda Extra Long Basmati', 'Elephant Gold Chakki Atta 10kg', 'TRS Washed Moong & Chana Daal'],
    featuredItem: {
      name: 'Laila Super Basmati 5kg',
      price: '£8.99',
      unit: '5kg bag',
      origPrice: '£10.99',
    },
    trustPill: 'Pantry Multi-Buys • Heritage Brands',
    accentGradient: 'from-amber-950/90 via-slate-900/70 to-transparent',
    ctaText: 'Stock Up Pantry',
  },
  {
    id: 'international',
    title: 'Desi Spice Vault & Masalas',
    tagline: 'Aromatic whole spices, recipe blends, pickles, and seasonings from Shan, TRS & Laziza.',
    badge: 'Flavour Paradise',
    badgeColor: 'bg-orange-600 text-white',
    image: 'https://images.unsplash.com/photo-1596040033229-a9821ebd058d?auto=format&fit=crop&w=1200&q=85',
    icon: Globe,
    highlights: ['Shan Biryani & Karahi Mixes', 'TRS Whole Garam Masala & Jeera', 'Kashmiri Deggi Chilli Powder'],
    featuredItem: {
      name: 'Shan Bombay Biryani Mix',
      price: '£1.29',
      unit: '50g box',
    },
    trustPill: '100+ Authentic Spice Blends in Stock',
    accentGradient: 'from-orange-950/90 via-slate-900/70 to-transparent',
    ctaText: 'Enter Spice Vault',
  },
  {
    id: 'dairy-eggs',
    title: 'Fresh Desi Dairy & Pure Ghee',
    tagline: 'Velvety Malai Paneer, Khanum Pure Butter Ghee, and fresh Halal frozen samosas & parathas.',
    badge: 'Pure & Traditional',
    badgeColor: 'bg-blue-600 text-white',
    image: 'https://images.unsplash.com/photo-1628088062854-d1870b4553da?auto=format&fit=crop&w=1200&q=85',
    icon: Milk,
    highlights: ['Fresh Blocks Malai Paneer', 'Khanum Pure Butter Ghee 500g', 'Desi Dahi & Halal Frozen Parathas'],
    featuredItem: {
      name: 'Khanum Pure Butter Ghee',
      price: '£4.49',
      unit: '500g tin',
      origPrice: '£5.29',
    },
    trustPill: 'Cold-Chain Chilled Delivery Guaranteed',
    accentGradient: 'from-blue-950/90 via-slate-900/70 to-transparent',
    ctaText: 'Browse Dairy Counter',
  },
];

export const InteractiveSplitHero: React.FC<InteractiveSplitHeroProps> = ({
  onSelectCategory,
  onOpenTrustModal,
  onOpenWhatsApp,
}) => {
  const [activeIndex, setActiveIndex] = useState<number>(0);
  const [isAutoPlaying, setIsAutoPlaying] = useState<boolean>(false);

  // Optional auto-rotation cycle if user hasn't interacted for a while
  useEffect(() => {
    if (!isAutoPlaying) return;
    const interval = setInterval(() => {
      setActiveIndex((prev) => (prev + 1) % HERO_FEATURES.length);
    }, 4500);
    return () => clearInterval(interval);
  }, [isAutoPlaying]);

  const handlePanelClick = (feature: HighlightFeature) => {
    onSelectCategory(feature.id);
    // Smooth scroll down to main catalog section
    const target = document.getElementById('catalog-products-section');
    if (target) {
      target.scrollIntoView({ behavior: 'smooth' });
    }
  };

  return (
    <div className="space-y-4">
      {/* Top Value Proposition Pill Bar */}
      <div className="flex flex-wrap items-center justify-between gap-2.5 bg-slate-900 text-white px-4 py-2 rounded-2xl border border-slate-800 shadow-md text-xs">
        <div className="flex items-center gap-2 font-bold text-emerald-400">
          <Sparkles className="w-4 h-4 text-amber-300 animate-pulse" />
          <span>Aheed Food Centre Today’s Fresh Highlights</span>
        </div>

        <div className="flex items-center gap-3 text-[11px] text-slate-300">
          <button
            type="button"
            onClick={() => onOpenTrustModal('halal')}
            className="hover:text-white flex items-center gap-1 transition-colors"
          >
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
            <span className="font-semibold">HMC Certified Halal</span>
          </button>
          <span className="text-slate-600 hidden sm:inline">•</span>
          <button
            type="button"
            onClick={() => onOpenTrustModal('delivery')}
            className="hover:text-white flex items-center gap-1 transition-colors"
          >
            <Truck className="w-3.5 h-3.5 text-amber-400" />
            <span className="font-semibold">Same-Day Milton Keynes Delivery</span>
          </button>
          <span className="text-slate-600 hidden md:inline">•</span>
          <button
            type="button"
            onClick={onOpenWhatsApp}
            className="hover:text-white flex items-center gap-1 transition-colors"
          >
            <Scale className="w-3.5 h-3.5 text-emerald-400" />
            <span className="font-semibold">WhatsApp Butcher Desk</span>
          </button>
        </div>
      </div>

      {/* 5-WAY INTERACTIVE SPLIT HERO ACCORDION (HexagonCircle Drill-Down Pattern) */}
      <div
        className="w-full min-h-[480px] lg:h-[500px] flex flex-col lg:flex-row gap-2.5 rounded-3xl overflow-hidden p-2 bg-slate-900/90 border border-slate-800 shadow-2xl transition-all select-none"
        onMouseEnter={() => setIsAutoPlaying(false)}
      >
        {HERO_FEATURES.map((feature, idx) => {
          const isActive = activeIndex === idx;
          const Icon = feature.icon;

          return (
            <div
              key={feature.id}
              onMouseEnter={() => setActiveIndex(idx)}
              onClick={() => handlePanelClick(feature)}
              className={`relative rounded-2xl overflow-hidden cursor-pointer group transition-all duration-500 ease-[cubic-bezier(0.25,1,0.5,1)] flex flex-col justify-end ${
                isActive
                  ? 'lg:flex-[3.8] h-[340px] lg:h-full ring-2 ring-emerald-500/80 shadow-2xl'
                  : 'lg:flex-[1] h-[75px] lg:h-full opacity-90 hover:opacity-100 hover:lg:flex-[1.4]'
              }`}
            >
              {/* Background Image with Zoom and Depth */}
              <div className="absolute inset-0 overflow-hidden">
                <img
                  src={feature.image}
                  alt={feature.title}
                  className={`w-full h-full object-cover transition-transform duration-700 ease-out ${
                    isActive ? 'scale-105 filter brightness-95' : 'scale-100 filter brightness-75 group-hover:scale-105'
                  }`}
                />
                {/* Multi-Layer Gradients for High Readability */}
                <div
                  className={`absolute inset-0 bg-linear-to-t ${feature.accentGradient} transition-opacity duration-300 ${
                    isActive ? 'opacity-95' : 'opacity-80 group-hover:opacity-90'
                  }`}
                />
                <div className="absolute inset-0 bg-linear-to-b from-black/40 via-transparent to-black/90" />
              </div>

              {/* Floating Top Pill on All Panels */}
              <div className="absolute top-3 left-3 right-3 flex items-center justify-between z-10 pointer-events-none">
                <div className="flex items-center gap-1.5 bg-black/60 backdrop-blur-md px-2.5 py-1 rounded-xl border border-white/20 text-white text-[11px] font-bold shadow-sm">
                  <Icon className="w-3.5 h-3.5 text-amber-300" />
                  <span className="truncate max-w-[120px]">{feature.id.replace('-', ' ').toUpperCase()}</span>
                </div>
                {isActive && (
                  <span
                    className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-lg shadow-sm ${feature.badgeColor} animate-fade-in`}
                  >
                    {feature.badge}
                  </span>
                )}
              </div>

              {/* COLLAPSED STATE (Visible on non-active panels in desktop mode) */}
              {!isActive && (
                <div className="relative z-10 p-4 flex lg:flex-col items-center justify-between lg:justify-end gap-2 text-white h-full">
                  <div className="lg:hidden flex items-center gap-2">
                    <div className="w-8 h-8 rounded-lg bg-white/15 backdrop-blur-md flex items-center justify-center">
                      <Icon className="w-4 h-4 text-emerald-300" />
                    </div>
                    <div>
                      <div className="font-extrabold text-sm text-white leading-tight">{feature.title}</div>
                      <div className="text-[10px] text-emerald-200">{feature.badge}</div>
                    </div>
                  </div>

                  <div className="hidden lg:flex flex-col items-center justify-end w-full space-y-3 pb-2">
                    <div className="w-10 h-10 rounded-2xl bg-white/20 backdrop-blur-md border border-white/30 flex items-center justify-center text-white shadow-lg group-hover:scale-110 transition-transform">
                      <Icon className="w-5 h-5" />
                    </div>
                    <div className="writing-vertical-lr rotate-180 font-black text-sm tracking-wider uppercase text-white/90 group-hover:text-white drop-shadow-md">
                      {feature.title.split(' ')[0]} {feature.title.split(' ')[1] || ''}
                    </div>
                    <div className="w-6 h-6 rounded-full bg-white/20 flex items-center justify-center text-white group-hover:bg-[#1B5E20] transition-colors">
                      <ChevronRight className="w-3.5 h-3.5" />
                    </div>
                  </div>

                  <ChevronRight className="w-4 h-4 text-slate-300 lg:hidden shrink-0" />
                </div>
              )}

              {/* EXPANDED DRILL-DOWN STATE (When hovered or active) */}
              {isActive && (
                <div className="relative z-10 p-5 md:p-7 text-white space-y-3.5 animate-fade-in">
                  {/* Category Title & Tagline */}
                  <div className="space-y-1 max-w-xl">
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                      <span className="text-xs font-bold uppercase tracking-wider text-emerald-300">
                        {feature.trustPill}
                      </span>
                    </div>
                    <h2 className="text-xl md:text-3xl font-black text-white leading-tight tracking-tight drop-shadow-md">
                      {feature.title}
                    </h2>
                    <p className="text-xs md:text-sm text-slate-200 line-clamp-2 leading-relaxed font-normal">
                      {feature.tagline}
                    </p>
                  </div>

                  {/* Highlights Bullet Tags */}
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {feature.highlights.map((h, i) => (
                      <span
                        key={i}
                        className="inline-flex items-center gap-1 text-[11px] font-medium bg-black/50 backdrop-blur-md px-2.5 py-1 rounded-lg border border-white/15 text-emerald-100"
                      >
                        <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                        {h}
                      </span>
                    ))}
                  </div>

                  {/* Featured Product Price Callout & Action Bar */}
                  <div className="pt-2 flex flex-wrap items-center justify-between gap-3 border-t border-white/15">
                    {/* Featured Price Tag */}
                    <div className="flex items-center gap-2.5 bg-white/10 backdrop-blur-md px-3 py-1.5 rounded-xl border border-white/20">
                      <div className="text-left">
                        <span className="text-[10px] text-slate-300 block font-medium">Today’s Top Pick:</span>
                        <span className="font-bold text-xs text-white truncate max-w-[150px] block">
                          {feature.featuredItem.name}
                        </span>
                      </div>
                      <div className="text-right border-l border-white/20 pl-2.5">
                        <span className="font-extrabold text-sm text-emerald-300">
                          {feature.featuredItem.price}
                        </span>
                        <span className="text-[10px] text-slate-300 block">
                          {feature.featuredItem.unit}
                        </span>
                      </div>
                    </div>

                    {/* Drill-Down Action Button */}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handlePanelClick(feature);
                      }}
                      className="bg-[#1B5E20] hover:bg-emerald-600 active:scale-95 text-white text-xs font-extrabold px-4 py-2.5 rounded-xl shadow-lg flex items-center gap-2 border border-emerald-400/40 transition-all cursor-pointer group/btn"
                    >
                      <span>{feature.ctaText}</span>
                      <ArrowRight className="w-4 h-4 group-hover/btn:translate-x-1 transition-transform" />
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Quick Category Indicator Dots on Mobile */}
      <div className="flex lg:hidden justify-center items-center gap-1.5 pt-1">
        {HERO_FEATURES.map((_, i) => (
          <button
            key={i}
            type="button"
            onClick={() => setActiveIndex(i)}
            aria-label={`Go to slide ${i + 1}`}
            className={`h-1.5 rounded-full transition-all duration-300 ${
              activeIndex === i ? 'w-6 bg-[#1B5E20]' : 'w-2 bg-slate-300'
            }`}
          />
        ))}
      </div>
    </div>
  );
};
