"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight, Tag, Percent, Sparkles } from "lucide-react";

const PROMOS = [
  {
    id: 1,
    title: "Special Weekend Offers",
    description: "Get up to 20% off on all fresh produce this weekend only.",
    color: "bg-gradient-to-r from-amber-500 to-orange-600",
    icon: <Percent className="w-6 h-6 text-white/90" />,
    link: "/search?isOffer=true",
    linkText: "Shop Offers",
  },
  {
    id: 2,
    title: "New Arrivals",
    description: "Fresh spices, lentils, and cultural staples just landed in store.",
    color: "bg-gradient-to-r from-emerald-600 to-teal-700",
    icon: <Sparkles className="w-6 h-6 text-white/90" />,
    link: "/search",
    linkText: "Explore New",
  },
  {
    id: 3,
    title: "Bulk Buy Discounts",
    description: "Stock up and save! Buy in bulk and get wholesale prices.",
    color: "bg-gradient-to-r from-blue-600 to-indigo-700",
    icon: <Tag className="w-6 h-6 text-white/90" />,
    link: "/search",
    linkText: "Shop Bulk",
  },
];

export function PromoSlider() {
  const [current, setCurrent] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrent((prev) => (prev + 1) % PROMOS.length);
    }, 5000);
    return () => clearInterval(timer);
  }, []);

  const nextSlide = () => setCurrent((prev) => (prev + 1) % PROMOS.length);
  const prevSlide = () => setCurrent((prev) => (prev - 1 + PROMOS.length) % PROMOS.length);

  return (
    <div className="relative overflow-hidden rounded-2xl shadow-lg border border-black/10 group">
      <div 
        className="flex transition-transform duration-700 ease-in-out" 
        style={{ transform: `translateX(-${current * 100}%)` }}
      >
        {PROMOS.map((promo) => (
          <div key={promo.id} className={`w-full shrink-0 ${promo.color} p-6 md:p-8 flex items-center justify-between`}>
            <div className="flex items-start gap-4">
              <div className="hidden sm:flex w-12 h-12 rounded-full bg-white/20 items-center justify-center shrink-0">
                {promo.icon}
              </div>
              <div className="text-white">
                <h3 className="text-xl md:text-2xl font-bold mb-2 flex items-center gap-2">
                  <span className="sm:hidden">{promo.icon}</span>
                  {promo.title}
                </h3>
                <p className="text-white/90 text-sm md:text-base max-w-lg mb-4">
                  {promo.description}
                </p>
                <Link 
                  href={promo.link}
                  className="inline-block bg-white text-black text-sm font-bold px-4 py-2 rounded-xl shadow-sm hover:bg-slate-50 transition-transform active:scale-95"
                >
                  {promo.linkText}
                </Link>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Navigation Buttons */}
      <button 
        onClick={prevSlide}
        className="absolute left-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-white/30 hover:bg-white/50 backdrop-blur text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
        aria-label="Previous promo"
      >
        <ChevronLeft className="w-5 h-5" />
      </button>
      <button 
        onClick={nextSlide}
        className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-white/30 hover:bg-white/50 backdrop-blur text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
        aria-label="Next promo"
      >
        <ChevronRight className="w-5 h-5" />
      </button>

      {/* Indicators */}
      <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-1.5">
        {PROMOS.map((_, idx) => (
          <button
            key={idx}
            onClick={() => setCurrent(idx)}
            className={`w-2 h-2 rounded-full transition-all duration-300 ${idx === current ? "bg-white w-4" : "bg-white/50 hover:bg-white/80"}`}
            aria-label={`Go to slide ${idx + 1}`}
          />
        ))}
      </div>
    </div>
  );
}
