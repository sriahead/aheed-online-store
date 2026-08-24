import React from 'react';
import { Order, OrderStatus } from '../types';
import {
  X,
  CheckCircle2,
  Clock,
  Truck,
  MapPin,
  Phone,
  ShieldCheck,
  PackageCheck,
  Scale,
  Sparkles,
  Repeat,
  ExternalLink
} from 'lucide-react';

interface OrderTrackingModalProps {
  order: Order | null;
  isOpen: boolean;
  onClose: () => void;
  onReorder?: (order: Order) => void;
}

export const OrderTrackingModal: React.FC<OrderTrackingModalProps> = ({
  order,
  isOpen,
  onClose,
  onReorder,
}) => {
  if (!isOpen || !order) return null;

  // 4-step timeline stages
  const stages: { status: OrderStatus; label: string; desc: string; icon: any }[] = [
    {
      status: 'Confirmed',
      label: 'Order Confirmed',
      desc: 'Received by Aheed Food Centre store team',
      icon: CheckCircle2,
    },
    {
      status: 'Preparing & Weighing',
      label: 'Butcher Cutting & Weighing',
      desc: 'Master butcher cutting to order & weighing on calibrated scale',
      icon: Scale,
    },
    {
      status: 'Out for delivery',
      label: 'Out for Delivery / In Transit',
      desc: 'Van dispatched with cold-chain insulated storage',
      icon: Truck,
    },
    {
      status: 'Delivered',
      label: 'Fulfilled / Delivered',
      desc: 'Delivered to your doorstep in Milton Keynes',
      icon: PackageCheck,
    },
  ];

  const getStepIndex = (status: OrderStatus) => {
    switch (status) {
      case 'Confirmed':
        return 0;
      case 'Preparing & Weighing':
        return 1;
      case 'Out for delivery':
        return 2;
      case 'Delivered':
        return 3;
      default:
        return 1;
    }
  };

  const currentStep = getStepIndex(order.status);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/75 backdrop-blur-xs animate-in fade-in duration-200 overflow-y-auto"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-xl bg-white rounded-3xl shadow-2xl overflow-hidden border border-slate-200 my-6 max-h-[92vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-4 sm:p-5 bg-[#1B5E20] text-white flex items-center justify-between shadow-xs shrink-0">
          <div className="flex items-center gap-2.5">
            <Truck className="w-6 h-6 text-emerald-300" />
            <div>
              <div className="flex items-center gap-2">
                <h2 className="font-extrabold text-base sm:text-lg">Order Tracking</h2>
                <span className="bg-emerald-900/80 text-emerald-200 text-[10px] font-mono px-2 py-0.5 rounded">
                  {order.id}
                </span>
              </div>
              <p className="text-xs text-emerald-200">
                Estimated Slot: {order.estimatedDeliveryTime}
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

        {/* Scrollable Content */}
        <div className="p-5 sm:p-6 overflow-y-auto space-y-6 flex-1 text-xs">
          {/* Live 4-Step Tracker Progress */}
          <div className="space-y-4 bg-slate-50 p-4 rounded-2xl border border-slate-200">
            <h3 className="font-extrabold text-slate-900 text-sm flex items-center justify-between">
              <span>Live Fulfilment Progress</span>
              <span className="text-xs font-semibold text-[#1B5E20] bg-emerald-100/80 px-2.5 py-0.5 rounded-full">
                {order.status}
              </span>
            </h3>

            <div className="relative pl-6 space-y-6 before:absolute before:left-2.5 before:top-2 before:bottom-2 before:w-0.5 before:bg-slate-200">
              {stages.map((stage, idx) => {
                const isPast = idx < currentStep;
                const isCurrent = idx === currentStep;
                const IconComponent = stage.icon;

                return (
                  <div key={stage.label} className="relative flex items-start gap-3">
                    <div
                      className={`absolute -left-6 top-0 w-6 h-6 rounded-full flex items-center justify-center transition-all ${
                        isPast
                          ? 'bg-[#1B5E20] text-white ring-4 ring-emerald-100'
                          : isCurrent
                          ? 'bg-amber-500 text-white ring-4 ring-amber-100 animate-pulse'
                          : 'bg-slate-200 text-slate-400'
                      }`}
                    >
                      <IconComponent className="w-3.5 h-3.5" />
                    </div>

                    <div>
                      <h4
                        className={`font-bold text-xs ${
                          isPast || isCurrent ? 'text-slate-900' : 'text-slate-400'
                        }`}
                      >
                        {stage.label}
                      </h4>
                      <p className="text-[11px] text-slate-500 mt-0.5">{stage.desc}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Delivery Driver & Route Simulation */}
          <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-[#1B5E20] text-white font-bold flex items-center justify-center text-sm shadow-xs">
                  MK
                </div>
                <div>
                  <h4 className="font-bold text-slate-900 text-xs">
                    {order.driverName || 'Mohammed K. (Aheed Logistics)'}
                  </h4>
                  <p className="text-[11px] text-emerald-800">
                    Aheed Electric Van • Cold-Chain Insulated
                  </p>
                </div>
              </div>

              <a
                href={`tel:${order.driverPhone || '07123456789'}`}
                className="bg-white hover:bg-emerald-100 text-[#1B5E20] font-bold text-xs px-3 py-1.5 rounded-xl border border-emerald-300 flex items-center gap-1.5 shadow-2xs"
              >
                <Phone className="w-3.5 h-3.5" />
                <span>Call Driver</span>
              </a>
            </div>

            {/* Simulated Live Map Preview */}
            <div className="relative h-28 bg-slate-200 rounded-xl overflow-hidden border border-slate-300 flex items-center justify-center">
              <img
                src="https://images.unsplash.com/photo-1524661135-423995f22d0b?auto=format&fit=crop&w=600&q=80"
                alt="Milton Keynes Map"
                className="w-full h-full object-cover opacity-60"
              />
              <div className="absolute inset-0 bg-slate-900/20" />
              <div className="absolute bg-white/95 backdrop-blur-xs p-2 rounded-xl shadow-lg flex items-center gap-2 text-[11px] text-slate-900">
                <Truck className="w-4 h-4 text-[#1B5E20] animate-bounce" />
                <span className="font-bold">En Route to {order.deliveryAddress.postcode}</span>
              </div>
            </div>
          </div>

          {/* Itemized Order Breakdown with Cuts & Scale Info */}
          <div className="space-y-2">
            <h4 className="font-bold text-slate-900 text-xs">Itemized Order Details:</h4>
            <div className="bg-slate-50 p-3 rounded-2xl border border-slate-200 space-y-2">
              {order.items.map((item, idx) => (
                <div
                  key={idx}
                  className="flex items-center justify-between text-xs py-1 border-b border-slate-200/60 last:border-0"
                >
                  <div>
                    <span className="font-bold text-slate-900">
                      {item.quantity}x {item.product.name}
                    </span>
                    <div className="text-[11px] text-slate-500 flex flex-wrap gap-1 mt-0.5">
                      <span>{item.selectedVariant?.name || item.product.unit}</span>
                      {item.selectedCut && <span>• Cut: {item.selectedCut}</span>}
                      {item.selectedPrep && <span>• {item.selectedPrep}</span>}
                    </div>
                  </div>
                  <span className="font-bold text-slate-900">
                    £{((item.selectedVariant ? item.selectedVariant.price : item.product.price) * item.quantity).toFixed(2)}
                  </span>
                </div>
              ))}

              <div className="pt-2 border-t border-slate-200 space-y-1">
                <div className="flex justify-between text-slate-600 text-[11px]">
                  <span>Subtotal</span>
                  <span>£{order.subtotal.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-slate-600 text-[11px]">
                  <span>Delivery Fee</span>
                  <span>{order.deliveryFee === 0 ? 'FREE' : `£${order.deliveryFee.toFixed(2)}`}</span>
                </div>
                {order.discount > 0 && (
                  <div className="flex justify-between text-amber-700 text-[11px] font-bold">
                    <span>Discount / Loyalty</span>
                    <span>- £{order.discount.toFixed(2)}</span>
                  </div>
                )}
                <div className="flex justify-between font-extrabold text-sm text-slate-900 pt-1 border-t border-slate-200">
                  <span>Total Paid</span>
                  <span className="text-[#1B5E20]">£{order.total.toFixed(2)}</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Modal Bottom Actions */}
        <div className="p-4 sm:p-5 bg-slate-50 border-t border-slate-200 flex items-center justify-between gap-3 shrink-0">
          {onReorder && (
            <button
              type="button"
              onClick={() => {
                onReorder(order);
                onClose();
              }}
              className="bg-white hover:bg-slate-100 text-slate-800 font-bold text-xs px-4 py-2.5 rounded-xl border border-slate-300 shadow-2xs flex items-center gap-1.5 transition-colors"
            >
              <Repeat className="w-3.5 h-3.5 text-emerald-700" />
              <span>Reorder This Basket</span>
            </button>
          )}

          <button
            type="button"
            onClick={onClose}
            className="ml-auto bg-[#1B5E20] hover:bg-emerald-800 text-white font-bold text-xs px-5 py-2.5 rounded-xl shadow-xs transition-colors"
          >
            Close Tracking
          </button>
        </div>
      </div>
    </div>
  );
};
