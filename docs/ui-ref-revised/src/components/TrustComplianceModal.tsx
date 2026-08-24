import React, { useState } from 'react';
import {
  X,
  ShieldCheck,
  FileText,
  Truck,
  RotateCcw,
  AlertTriangle,
  MapPin,
  Clock,
  Phone,
  Mail,
  Cookie,
  CheckCircle2
} from 'lucide-react';

interface TrustComplianceModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialTab?: string;
}

export const TrustComplianceModal: React.FC<TrustComplianceModalProps> = ({
  isOpen,
  onClose,
  initialTab = 'halal',
}) => {
  const [activeTab, setActiveTab] = useState<string>(initialTab);

  if (!isOpen) return null;

  const tabs = [
    { id: 'halal', label: '100% HMC Halal Guarantee', icon: ShieldCheck },
    { id: 'delivery', label: 'Delivery & Cold-Chain', icon: Truck },
    { id: 'allergens', label: 'Allergen Safety Matrix', icon: AlertTriangle },
    { id: 'returns', label: 'Refunds & Perishables', icon: RotateCcw },
    { id: 'store', label: 'Store Info & Hours', icon: MapPin },
    { id: 'legal', label: 'Terms & Privacy', icon: FileText },
  ];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/75 backdrop-blur-xs animate-in fade-in duration-200 overflow-y-auto"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-3xl bg-white rounded-3xl shadow-2xl overflow-hidden border border-slate-200 my-6 max-h-[92vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-4 sm:p-5 bg-[#1B5E20] text-white flex items-center justify-between shadow-xs shrink-0">
          <div className="flex items-center gap-2.5">
            <ShieldCheck className="w-6 h-6 text-emerald-300" />
            <div>
              <h2 className="font-extrabold text-base sm:text-lg">Trust, Compliance & Information Hub</h2>
              <p className="text-xs text-emerald-200">
                Aheed Food Centre — Operating with full UK Food Standards & HMC Certification
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-emerald-800/80 hover:bg-emerald-800 text-white flex items-center justify-center transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex overflow-x-auto border-b border-slate-200 bg-slate-50 px-4 py-2 gap-2 text-xs font-bold shrink-0 no-scrollbar">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isSelected = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-xl whitespace-nowrap transition-all ${
                  isSelected
                    ? 'bg-[#1B5E20] text-white shadow-xs'
                    : 'bg-white text-slate-600 hover:text-slate-900 border border-slate-200'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        {/* Content Body */}
        <div className="p-5 sm:p-6 overflow-y-auto space-y-4 flex-1 text-xs text-slate-700 leading-relaxed">
          {activeTab === 'halal' && (
            <div className="space-y-4">
              <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4 space-y-2">
                <div className="flex items-center gap-2 font-extrabold text-emerald-950 text-sm">
                  <ShieldCheck className="w-5 h-5 text-[#1B5E20]" />
                  <span>100% Certified HMC Halal Meat Standards</span>
                </div>
                <p className="text-emerald-900">
                  Every single cut of poultry, lamb, mutton, and beef sold at Aheed Food Centre is 100% certified by the Halal Monitoring Committee (HMC UK).
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="p-3.5 bg-slate-50 rounded-2xl border border-slate-200 space-y-1">
                  <h4 className="font-bold text-slate-900 flex items-center gap-1.5">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" /> Stun-Free Slaughter
                  </h4>
                  <p className="text-slate-600 text-[11px]">
                    All livestock is slaughtered by hand by trained Muslim slaughtermen invoking the Tasmiyah (Bismillah Allahu Akbar) without pre-stunning.
                  </p>
                </div>

                <div className="p-3.5 bg-slate-50 rounded-2xl border border-slate-200 space-y-1">
                  <h4 className="font-bold text-slate-900 flex items-center gap-1.5">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" /> Daily Fresh Abattoir Deliveries
                  </h4>
                  <p className="text-slate-600 text-[11px]">
                    Delivered in temperature-controlled refrigerated logistics directly from Red Tractor certified British farms.
                  </p>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'delivery' && (
            <div className="space-y-4">
              <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 space-y-2">
                <h3 className="font-extrabold text-slate-900 text-sm">Cold-Chain Delivery & Packaging Protocol</h3>
                <p className="text-slate-600">
                  We use insulated thermal foil packaging and gel ice packs to ensure fresh meat and dairy stay safely chilled below 4°C for up to 6 hours during delivery.
                </p>
              </div>

              <div className="space-y-2">
                <h4 className="font-bold text-slate-900">Delivery Zones & Pricing:</h4>
                <div className="space-y-1.5">
                  <div className="flex justify-between p-2.5 bg-slate-50 rounded-xl border border-slate-200">
                    <div>
                      <span className="font-bold text-slate-900">Zone 1: Milton Keynes Central (MK9, MK10, MK14)</span>
                      <p className="text-[11px] text-slate-500">Same-day delivery • Free over £35 (£2.49 under)</p>
                    </div>
                    <span className="font-bold text-[#1B5E20]">FREE &gt; £35</span>
                  </div>
                  <div className="flex justify-between p-2.5 bg-slate-50 rounded-xl border border-slate-200">
                    <div>
                      <span className="font-bold text-slate-900">Zone 2: Bletchley, Wolverton & Shenley (MK1-MK8, MK11-MK15)</span>
                      <p className="text-[11px] text-slate-500">Standard delivery • £2.49 standard</p>
                    </div>
                    <span className="font-bold text-[#1B5E20]">£2.49</span>
                  </div>
                  <div className="flex justify-between p-2.5 bg-slate-50 rounded-xl border border-slate-200">
                    <div>
                      <span className="font-bold text-slate-900">Zone 3: Outer Buckinghamshire & Newport Pagnell (MK16+)</span>
                      <p className="text-[11px] text-slate-500">Scheduled runs • £3.99 standard</p>
                    </div>
                    <span className="font-bold text-[#1B5E20]">£3.99</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'allergens' && (
            <div className="space-y-3">
              <h3 className="font-extrabold text-slate-900 text-sm">UK Food Standards Agency — 14 Major Allergens Matrix</h3>
              <p className="text-slate-600 text-[11px]">
                In compliance with UK Food Information Regulations, we clearly identify allergen declarations on all packaged items and fresh butchery counter goods:
              </p>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {[
                  'Gluten / Cereals',
                  'Crustaceans',
                  'Eggs',
                  'Fish',
                  'Peanuts',
                  'Soybeans',
                  'Milk / Dairy',
                  'Tree Nuts',
                  'Celery',
                  'Mustard',
                  'Sesame Seeds',
                  'Sulphites (>10mg/kg)',
                  'Lupin',
                  'Molluscs',
                ].map((item) => (
                  <div key={item} className="p-2 rounded-xl bg-slate-50 border border-slate-200 font-medium text-[11px] text-slate-800 flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                    <span>{item}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeTab === 'returns' && (
            <div className="space-y-3">
              <h3 className="font-extrabold text-slate-900 text-sm">Fresh Guarantee & Refund Policy</h3>
              <p className="text-slate-600 text-xs">
                We take immense pride in the freshness of our meat and produce. If any item does not meet your high standards upon delivery, notify us within 24 hours:
              </p>
              <div className="space-y-2">
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                  <span className="font-bold text-slate-900">Perishables (Meat, Dairy & Produce):</span>
                  <p className="text-[11px] text-slate-500 mt-0.5">Instant refund or replacement if quality or cut instructions are unsatisfactory.</p>
                </div>
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                  <span className="font-bold text-slate-900">Packaged Groceries:</span>
                  <p className="text-[11px] text-slate-500 mt-0.5">14-day return policy for unopened, undamaged items with seals intact.</p>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'store' && (
            <div className="space-y-4">
              <div className="bg-slate-50 rounded-2xl p-4 border border-slate-200 space-y-3">
                <h3 className="font-extrabold text-slate-900 text-sm">Store Location & Operating Hours</h3>
                
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                  <div className="flex items-start gap-2.5">
                    <MapPin className="w-4 h-4 text-[#1B5E20] shrink-0 mt-0.5" />
                    <div>
                      <strong className="block text-slate-900">Aheed Food Centre Store & Butcher:</strong>
                      <span className="text-slate-600">42 Midsummer Boulevard, Central Milton Keynes, MK9 3BP</span>
                    </div>
                  </div>

                  <div className="flex items-start gap-2.5">
                    <Clock className="w-4 h-4 text-[#1B5E20] shrink-0 mt-0.5" />
                    <div>
                      <strong className="block text-slate-900">Opening Hours (7 Days/Week):</strong>
                      <span className="text-slate-600">Monday – Saturday: 8:00 AM – 9:00 PM<br/>Sunday: 9:00 AM – 7:00 PM</span>
                    </div>
                  </div>

                  <div className="flex items-start gap-2.5">
                    <Phone className="w-4 h-4 text-[#1B5E20] shrink-0 mt-0.5" />
                    <div>
                      <strong className="block text-slate-900">Direct Customer Desk:</strong>
                      <span className="text-slate-600">01908 600 100 / 07700 900 123</span>
                    </div>
                  </div>

                  <div className="flex items-start gap-2.5">
                    <Mail className="w-4 h-4 text-[#1B5E20] shrink-0 mt-0.5" />
                    <div>
                      <strong className="block text-slate-900">Customer Support:</strong>
                      <span className="text-slate-600">help@aheedfood.co.uk</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'legal' && (
            <div className="space-y-3">
              <h3 className="font-extrabold text-slate-900 text-sm">Terms of Sale & GDPR Privacy Policy</h3>
              <p className="text-slate-600 text-xs leading-relaxed">
                Aheed Food Centre adheres strictly to UK Data Protection Act 2018 and UK GDPR. We only collect customer data necessary to fulfill delivery orders and manage your account. Card details are processed securely through PCI-DSS Level 1 compliant gateways (Stripe) and are never stored on our servers.
              </p>
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-[11px] text-slate-500">
                Registered in England & Wales • Company No. 12994012 • VAT Reg No. GB 384 1920 44
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 bg-slate-50 border-t border-slate-200 flex justify-end shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="bg-[#1B5E20] hover:bg-emerald-800 text-white font-bold text-xs px-5 py-2.5 rounded-xl shadow-xs"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
