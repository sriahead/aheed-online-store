import React, { useState, useEffect } from 'react';
import { Cookie, ShieldCheck, Check, X } from 'lucide-react';

interface CookieBannerProps {
  onOpenTrustModal: (tab: string) => void;
}

export const CookieBanner: React.FC<CookieBannerProps> = ({ onOpenTrustModal }) => {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const consent = localStorage.getItem('aheed_cookie_consent');
    if (!consent) {
      const timer = setTimeout(() => setIsVisible(true), 800);
      return () => clearTimeout(timer);
    }
  }, []);

  const handleAccept = () => {
    localStorage.setItem('aheed_cookie_consent', 'all');
    setIsVisible(false);
  };

  const handleEssentialOnly = () => {
    localStorage.setItem('aheed_cookie_consent', 'essential');
    setIsVisible(false);
  };

  if (!isVisible) return null;

  return (
    <div className="fixed bottom-4 left-4 right-4 md:left-auto md:right-4 md:max-w-md z-40 bg-slate-900/95 text-white p-4 rounded-3xl shadow-2xl border border-slate-700 backdrop-blur-md animate-in slide-in-from-bottom duration-300">
      <div className="flex items-start gap-3">
        <div className="p-2 rounded-2xl bg-emerald-800 text-emerald-300 shrink-0">
          <Cookie className="w-5 h-5" />
        </div>
        <div className="space-y-2 flex-1 text-xs">
          <h4 className="font-bold text-white text-sm">We value your privacy</h4>
          <p className="text-slate-300 text-[11px] leading-relaxed">
            We use cookies to maintain your shopping basket, remember your delivery postcode in Milton Keynes, and improve your halal grocery experience.
          </p>
          <div className="flex items-center gap-2 pt-1">
            <button
              type="button"
              onClick={handleAccept}
              className="bg-[#1B5E20] hover:bg-emerald-700 text-white font-bold text-xs px-3.5 py-1.5 rounded-xl shadow-xs transition-colors"
            >
              Accept All
            </button>
            <button
              type="button"
              onClick={handleEssentialOnly}
              className="bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium text-xs px-3 py-1.5 rounded-xl transition-colors"
            >
              Essential Only
            </button>
            <button
              type="button"
              onClick={() => onOpenTrustModal('legal')}
              className="text-[11px] text-emerald-400 hover:underline ml-auto"
            >
              Learn More
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
