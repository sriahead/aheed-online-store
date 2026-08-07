import React from 'react';
import { Order, OrderStatus } from '../types';
import { X, CheckCircle2, Truck, Package, Clock, MapPin, Phone, ShieldCheck } from 'lucide-react';

interface OrderTrackingModalProps {
  isOpen?: boolean;
  order: Order | null;
  onClose: () => void;
  onUpdateStatus?: (status: OrderStatus) => void;
}

export const OrderTrackingModal: React.FC<OrderTrackingModalProps> = ({
  isOpen = true,
  order,
  onClose,
  onUpdateStatus,
}) => {
  if (!isOpen || !order) return null;

  const steps: { status: OrderStatus; label: string; desc: string; icon: any }[] = [
    {
      status: 'Confirmed',
      label: 'Order Confirmed',
      desc: 'Shop staff preparing fresh produce and halal cuts',
      icon: Package,
    },
    {
      status: 'Out for delivery',
      label: 'Out for Delivery',
      desc: 'Aheed local driver en route with temperature-controlled van',
      icon: Truck,
    },
    {
      status: 'Delivered',
      label: 'Delivered',
      desc: 'Order handed safely to customer',
      icon: CheckCircle2,
    },
  ];

  const getStepIndex = (s: OrderStatus) => {
    if (s === 'Confirmed') return 0;
    if (s === 'Out for delivery') return 1;
    if (s === 'Delivered') return 2;
    return 0;
  };

  const currentIndex = getStepIndex(order.status);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-lg bg-white rounded-3xl shadow-2xl overflow-hidden border border-slate-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-5 bg-[#1B5E20] text-white flex items-center justify-between">
          <div>
            <span className="text-[10px] uppercase tracking-wider font-bold text-emerald-200">
              Aheed Local Delivery Pipeline
            </span>
            <h2 className="text-lg font-extrabold flex items-center gap-2">
              Order #{order.id}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-full hover:bg-emerald-800 text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Live Status Content */}
        <div className="p-6 space-y-6">
          {/* Estimated Window */}
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex items-center justify-between">
            <div>
              <p className="text-xs text-amber-800 font-medium">Estimated Delivery Slot</p>
              <p className="text-sm font-bold text-amber-950 mt-0.5">{order.estimatedDeliveryTime}</p>
            </div>
            <div className="w-10 h-10 rounded-xl bg-amber-500/20 flex items-center justify-center text-amber-800">
              <Clock className="w-5 h-5 animate-spin" style={{ animationDuration: '6s' }} />
            </div>
          </div>

          {/* 3-Step Pipeline Visualizer */}
          <div className="relative space-y-6 pl-4 border-l-2 border-slate-200 my-4">
            {steps.map((step, idx) => {
              const Icon = step.icon;
              const isCompleted = idx <= currentIndex;
              const isCurrent = idx === currentIndex;

              return (
                <div key={step.status} className="relative flex items-start gap-4">
                  {/* Step Circle Indicator */}
                  <div
                    className={`absolute -left-[25px] top-0.5 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold transition-all ${
                      isCompleted
                        ? 'bg-[#1B5E20] text-white ring-4 ring-emerald-100 shadow-sm'
                        : 'bg-slate-200 text-slate-500'
                    }`}
                  >
                    {isCompleted ? <CheckCircle2 className="w-3.5 h-3.5" /> : idx + 1}
                  </div>

                  <div className="pl-2">
                    <h4
                      className={`font-bold text-sm leading-tight ${
                        isCurrent ? 'text-[#1B5E20]' : isCompleted ? 'text-slate-800' : 'text-slate-400'
                      }`}
                    >
                      {step.label}
                    </h4>
                    <p className="text-xs text-slate-500 mt-0.5">{step.desc}</p>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Local Driver Card */}
          <div className="bg-slate-50 rounded-2xl p-4 border border-slate-200 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-emerald-100 text-[#1B5E20] font-bold flex items-center justify-center text-sm">
                MK
              </div>
              <div>
                <p className="text-xs font-bold text-slate-900">{order.driverName || 'Mohammed K.'}</p>
                <p className="text-[11px] text-slate-500">Aheed Food Centre Delivery Team</p>
              </div>
            </div>
            <a
              href={`tel:${order.driverPhone}`}
              className="inline-flex items-center gap-1.5 bg-emerald-50 hover:bg-emerald-100 text-[#1B5E20] text-xs font-bold px-3 py-1.5 rounded-xl border border-emerald-200"
            >
              <Phone className="w-3.5 h-3.5" /> Call
            </a>
          </div>

          {/* Low-Friction Account Creation Callout for Guest Orders */}
          <div className="bg-gradient-to-r from-emerald-50 to-amber-50 rounded-2xl p-4 border border-emerald-200">
            <div className="flex items-start gap-3">
              <ShieldCheck className="w-5 h-5 text-[#1B5E20] shrink-0 mt-0.5" />
              <div className="text-xs">
                <span className="font-bold text-slate-900 block">
                  Want to save this order & earn +{Math.floor(order.total)} Aheed Loyalty Points?
                </span>
                <p className="text-slate-600 mt-0.5">
                  Create an account in 1-click. No dark patterns, no spam—just easy reordering next time.
                </p>
                <button
                  type="button"
                  onClick={() => alert(`Account created for ${order.customerEmail}! Earned ${Math.floor(order.total)} points.`)}
                  className="mt-2 bg-[#1B5E20] hover:bg-emerald-800 text-white font-bold px-3 py-1.5 rounded-xl text-[11px] transition-colors"
                >
                  Create Account with 1-Click
                </button>
              </div>
            </div>
          </div>

          {/* Delivery Address summary */}
          <div className="text-xs text-slate-600 bg-white p-3 rounded-xl border border-slate-200 space-y-1">
            <p className="font-bold text-slate-900 flex items-center gap-1">
              <MapPin className="w-3.5 h-3.5 text-[#1B5E20]" /> Destination:
            </p>
            <p>{order.deliveryAddress.street}, {order.deliveryAddress.city} {order.deliveryAddress.postcode}</p>
            {order.deliveryAddress.instructions && (
              <p className="text-slate-400 italic">Note: "{order.deliveryAddress.instructions}"</p>
            )}
          </div>

          {/* Prototype Demo Controls to Advance Order Status */}
          {onUpdateStatus && (
            <div className="pt-2 border-t border-slate-100 text-center">
              <p className="text-[11px] text-slate-400 mb-2 font-medium">
                [Prototype Simulation Control] Change Order Pipeline Stage:
              </p>
              <div className="flex justify-center gap-2">
                <button
                  type="button"
                  onClick={() => onUpdateStatus('Confirmed')}
                  className={`px-3 py-1 rounded-lg text-xs font-semibold ${
                    order.status === 'Confirmed'
                      ? 'bg-[#1B5E20] text-white'
                      : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                  }`}
                >
                  Confirmed
                </button>
                <button
                  type="button"
                  onClick={() => onUpdateStatus('Out for delivery')}
                  className={`px-3 py-1 rounded-lg text-xs font-semibold ${
                    order.status === 'Out for delivery'
                      ? 'bg-[#1B5E20] text-white'
                      : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                  }`}
                >
                  Out for Delivery
                </button>
                <button
                  type="button"
                  onClick={() => onUpdateStatus('Delivered')}
                  className={`px-3 py-1 rounded-lg text-xs font-semibold ${
                    order.status === 'Delivered'
                      ? 'bg-[#1B5E20] text-white'
                      : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                  }`}
                >
                  Delivered
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
