import React, { useState } from 'react';
import { Product, Order, OrderStatus, CategoryId, UserRole } from '../types';
import { CATEGORIES } from '../data/products';
import { DOC_ARTICLES } from '../data/docs';
import {
  Store,
  CheckCircle2,
  AlertCircle,
  Truck,
  Plus,
  PackageCheck,
  TrendingUp,
  DollarSign,
  Layers,
  BookOpen,
  Eye,
  EyeOff,
  Edit,
  Trash2,
  Award,
  ShieldAlert,
  Search,
  ChevronRight,
  Sparkles,
  Scale,
  Printer,
  Check,
  RotateCcw,
  Clock,
  ShieldCheck,
  UserCheck
} from 'lucide-react';

interface StaffAdminPanelProps {
  products: Product[];
  orders: Order[];
  onUpdateOrderStatus: (orderId: string, newStatus: OrderStatus) => void;
  currentUserRole?: UserRole;
  onUpdateProductStock?: (productId: string, newStock: number) => void;
}

export const StaffAdminPanel: React.FC<StaffAdminPanelProps> = ({
  products,
  orders,
  onUpdateOrderStatus,
  currentUserRole = 'admin',
  onUpdateProductStock,
}) => {
  const [activeTab, setActiveTab] = useState<
    'butcher_counter' | 'inventory' | 'orders' | 'loyalty_config' | 'reports' | 'runbook'
  >('butcher_counter');
  
  const [permissionRole, setPermissionRole] = useState<'staff' | 'admin'>(
    currentUserRole === 'staff' ? 'staff' : 'admin'
  );

  // Local state for products (live stock availability toggles & stock count editing)
  const [productList, setProductList] = useState<Product[]>(products);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<CategoryId>('all');

  // Butcher Station Interactive Scale State
  const [selectedOrderForButcher, setSelectedOrderForButcher] = useState<Order | null>(
    orders.find((o) => o.items.some((i) => i.product.isMeat || i.product.isApproximateWeight)) || orders[0] || null
  );
  const [scaleReadingKg, setScaleReadingKg] = useState<number>(1.04);
  const [isLabelPrinted, setIsLabelPrinted] = useState(false);
  const [preparedItems, setPreparedItems] = useState<Record<string, boolean>>({});

  // Add Product Form State (Integer Pence!)
  const [isAddingProduct, setIsAddingProduct] = useState(false);
  const [newProductName, setNewProductName] = useState('');
  const [newProductCategory, setNewProductCategory] = useState<CategoryId>('halal-meat');
  const [newPricePence, setNewPricePence] = useState<number>(699); // Integer pence!
  const [newUnit, setNewUnit] = useState('1 kg');
  const [newStock, setNewStock] = useState(25);
  const [newDescription, setNewDescription] = useState('');

  // Loyalty Config State
  const [pointsPerPound, setPointsPerPound] = useState(1);
  const [pencePerPointRedeemed, setPencePerPointRedeemed] = useState(1); // 100 pts = 100p (£1)

  // Handlers
  const handleToggleAvailability = (productId: string) => {
    setProductList((prev) =>
      prev.map((p) => (p.id === productId ? { ...p, isAvailable: !p.isAvailable } : p))
    );
  };

  const handleUpdateStock = (productId: string, delta: number) => {
    setProductList((prev) =>
      prev.map((p) => {
        if (p.id === productId) {
          const newCount = Math.max(0, p.stockCount + delta);
          if (onUpdateProductStock) onUpdateProductStock(productId, newCount);
          return { ...p, stockCount: newCount };
        }
        return p;
      })
    );
  };

  const handleAddProduct = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newProductName || newPricePence <= 0) return;

    const priceGBP = Number((newPricePence / 100).toFixed(2));

    const newProd: Product = {
      id: `prod-${Date.now()}`,
      name: newProductName,
      category: newProductCategory,
      price: priceGBP,
      pricePence: newPricePence,
      unit: newUnit,
      rating: 5.0,
      reviewCount: 1,
      image:
        newProductCategory === 'halal-meat'
          ? 'https://images.unsplash.com/photo-1604503468506-a8da13d82791?auto=format&fit=crop&w=600&q=80'
          : 'https://images.unsplash.com/photo-1542838132-92c53300491e?auto=format&fit=crop&w=600&q=80',
      description: newDescription || 'Fresh cultural grocery staple selected for Aheed Food Centre.',
      stockCount: newStock,
      isAvailable: true,
      origin: 'UK Local Farm',
      isHalal: newProductCategory === 'halal-meat',
      isFresh: true,
    };

    setProductList((prev) => [newProd, ...prev]);
    setIsAddingProduct(false);
    setNewProductName('');
    setNewDescription('');
  };

  const filteredProducts = productList.filter((p) => {
    const matchesCategory = selectedCategory === 'all' || p.category === selectedCategory;
    const matchesSearch =
      p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.description.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  // Calculate quick stats
  const totalRevenue = orders.reduce((acc, o) => acc + o.total, 0);
  const outForDeliveryCount = orders.filter((o) => o.status === 'Out for delivery').length;
  const preparingCount = orders.filter((o) => o.status === 'Preparing & Weighing' || o.status === 'Confirmed').length;
  const lowStockCount = productList.filter((p) => p.stockCount <= 5).length;

  return (
    <div className="max-w-7xl mx-auto px-4 py-8 space-y-6">
      {/* Top Banner & Mode Bar */}
      <div className="bg-slate-900 text-white p-6 rounded-3xl shadow-xl flex flex-wrap items-center justify-between gap-4 border border-slate-800">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-[#1B5E20] border border-emerald-500/50 flex items-center justify-center text-white shadow-lg">
            <Store className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold tracking-tight text-white">
                Aheed Food Centre — Staff Admin & Fresh Fulfilment
              </h1>
              <span className="bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 text-[10px] font-bold px-2.5 py-0.5 rounded-full uppercase tracking-wider">
                Live Store OPS
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              Butcher counter scale integration, order packing, stock control & Milton Keynes dispatch.
            </p>
          </div>
        </div>

        {/* Role switcher simulation */}
        <div className="flex items-center gap-2 bg-slate-800 p-1.5 rounded-2xl border border-slate-700">
          <span className="text-xs text-slate-400 pl-2">Viewing as:</span>
          <button
            type="button"
            onClick={() => setPermissionRole('staff')}
            className={`px-3 py-1 rounded-xl text-xs font-bold transition-all ${
              permissionRole === 'staff'
                ? 'bg-[#1B5E20] text-white shadow-xs'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            Store Staff / Butcher
          </button>
          <button
            type="button"
            onClick={() => setPermissionRole('admin')}
            className={`px-3 py-1 rounded-xl text-xs font-bold transition-all ${
              permissionRole === 'admin'
                ? 'bg-[#1B5E20] text-white shadow-xs'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            Store Manager (Admin)
          </button>
        </div>
      </div>

      {/* KPI Stats Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex items-center gap-3.5">
          <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-700 flex items-center justify-center">
            <Scale className="w-5 h-5" />
          </div>
          <div>
            <span className="text-xs text-slate-500 font-medium">Butcher Prep Queue</span>
            <div className="text-lg font-extrabold text-slate-900">{preparingCount} orders</div>
          </div>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex items-center gap-3.5">
          <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-700 flex items-center justify-center">
            <Truck className="w-5 h-5" />
          </div>
          <div>
            <span className="text-xs text-slate-500 font-medium">Dispatched / In Transit</span>
            <div className="text-lg font-extrabold text-slate-900">{outForDeliveryCount} orders</div>
          </div>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex items-center gap-3.5">
          <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center">
            <DollarSign className="w-5 h-5" />
          </div>
          <div>
            <span className="text-xs text-slate-500 font-medium">Today's Revenue</span>
            <div className="text-lg font-extrabold text-slate-900">£{totalRevenue.toFixed(2)}</div>
          </div>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex items-center gap-3.5">
          <div className="w-10 h-10 rounded-xl bg-rose-50 text-rose-700 flex items-center justify-center">
            <AlertCircle className="w-5 h-5" />
          </div>
          <div>
            <span className="text-xs text-slate-500 font-medium">Low Stock Alerts</span>
            <div className="text-lg font-extrabold text-slate-900">{lowStockCount} items</div>
          </div>
        </div>
      </div>

      {/* Tabs Navigation */}
      <div className="flex border-b border-slate-200 gap-2 overflow-x-auto no-scrollbar">
        <button
          type="button"
          onClick={() => setActiveTab('butcher_counter')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-t-2xl font-bold text-xs transition-colors ${
            activeTab === 'butcher_counter'
              ? 'bg-white border-t border-x border-slate-200 text-[#1B5E20] -mb-px'
              : 'text-slate-500 hover:text-slate-900'
          }`}
        >
          <Scale className="w-4 h-4 text-red-600" />
          <span>🔴 Butcher Counter & Fresh Fulfilment</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('orders')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-t-2xl font-bold text-xs transition-colors ${
            activeTab === 'orders'
              ? 'bg-white border-t border-x border-slate-200 text-[#1B5E20] -mb-px'
              : 'text-slate-500 hover:text-slate-900'
          }`}
        >
          <PackageCheck className="w-4 h-4" />
          <span>Live Orders & Status ({orders.length})</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('inventory')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-t-2xl font-bold text-xs transition-colors ${
            activeTab === 'inventory'
              ? 'bg-white border-t border-x border-slate-200 text-[#1B5E20] -mb-px'
              : 'text-slate-500 hover:text-slate-900'
          }`}
        >
          <Layers className="w-4 h-4" />
          <span>Stock & Availability ({productList.length})</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('loyalty_config')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-t-2xl font-bold text-xs transition-colors ${
            activeTab === 'loyalty_config'
              ? 'bg-white border-t border-x border-slate-200 text-[#1B5E20] -mb-px'
              : 'text-slate-500 hover:text-slate-900'
          }`}
        >
          <Award className="w-4 h-4" />
          <span>Loyalty & Delivery Zones</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('runbook')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-t-2xl font-bold text-xs transition-colors ${
            activeTab === 'runbook'
              ? 'bg-white border-t border-x border-slate-200 text-[#1B5E20] -mb-px'
              : 'text-slate-500 hover:text-slate-900'
          }`}
        >
          <BookOpen className="w-4 h-4" />
          <span>Staff OPS Runbook</span>
        </button>
      </div>

      {/* TAB 1: BUTCHER COUNTER & FRESH FULFILMENT (Pareto Group 4 Core) */}
      {activeTab === 'butcher_counter' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left: Orders Needing Butcher Attention */}
          <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-xs space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-extrabold text-slate-900 text-sm flex items-center gap-2">
                <Scale className="w-4 h-4 text-red-600" />
                <span>Meat & Fresh Orders Queue</span>
              </h3>
              <span className="text-[11px] bg-red-50 text-red-700 font-bold px-2 py-0.5 rounded-full">
                {orders.length} in queue
              </span>
            </div>

            <div className="space-y-2.5">
              {orders.map((ord) => {
                const isSelected = selectedOrderForButcher?.id === ord.id;
                const meatItemCount = ord.items.filter((i) => i.product.isMeat || i.product.isApproximateWeight).length;

                return (
                  <div
                    key={ord.id}
                    onClick={() => {
                      setSelectedOrderForButcher(ord);
                      setIsLabelPrinted(false);
                    }}
                    className={`p-3.5 rounded-2xl border cursor-pointer transition-all ${
                      isSelected
                        ? 'border-red-600 bg-red-50/50 ring-2 ring-red-500/20 shadow-xs'
                        : 'border-slate-200 hover:border-slate-300 bg-white'
                    }`}
                  >
                    <div className="flex items-center justify-between text-xs font-bold">
                      <span className="text-slate-900">{ord.id}</span>
                      <span
                        className={`text-[10px] px-2 py-0.5 rounded-full ${
                          ord.status === 'Confirmed'
                            ? 'bg-amber-100 text-amber-800'
                            : ord.status === 'Preparing & Weighing'
                            ? 'bg-blue-100 text-blue-800'
                            : 'bg-emerald-100 text-emerald-800'
                        }`}
                      >
                        {ord.status}
                      </span>
                    </div>

                    <div className="text-xs font-medium text-slate-700 mt-1">
                      {ord.customerName} • {ord.deliverySlot}
                    </div>

                    <div className="flex items-center gap-2 mt-2 text-[11px] text-slate-500">
                      <span className="bg-white px-2 py-0.5 rounded border border-slate-200 font-semibold text-slate-800">
                        🥩 {meatItemCount} fresh cut items
                      </span>
                      <span>{ord.fulfilmentType === 'delivery' ? '🚚 Delivery' : '🏬 Pickup'}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Right: Master Butcher Prep, Scale Reading & Label Printing Station */}
          {selectedOrderForButcher ? (
            <div className="lg:col-span-2 bg-white p-6 rounded-3xl border border-slate-200 shadow-xs space-y-6">
              <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-slate-200">
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-extrabold text-slate-900 text-base">
                      Butcher Station — Order {selectedOrderForButcher.id}
                    </h3>
                    <span className="bg-red-100 text-red-900 text-xs font-bold px-2.5 py-0.5 rounded-md">
                      HMC Halal Counter
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Customer: {selectedOrderForButcher.customerName} ({selectedOrderForButcher.customerPhone}) • Sub Pref: <strong>{selectedOrderForButcher.substitutionPreference}</strong>
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      onUpdateOrderStatus(selectedOrderForButcher.id, 'Preparing & Weighing');
                      selectedOrderForButcher.status = 'Preparing & Weighing';
                    }}
                    className="bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs px-3 py-1.5 rounded-xl shadow-2xs"
                  >
                    Mark Cutting
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      onUpdateOrderStatus(selectedOrderForButcher.id, 'Out for delivery');
                      selectedOrderForButcher.status = 'Out for delivery';
                    }}
                    className="bg-[#1B5E20] hover:bg-emerald-800 text-white font-bold text-xs px-3 py-1.5 rounded-xl shadow-2xs"
                  >
                    Ready for Packing ✓
                  </button>
                </div>
              </div>

              {/* Items Requiring Butcher Preparation */}
              <div className="space-y-3">
                <h4 className="font-bold text-slate-900 text-xs uppercase tracking-wider">
                  Cut, Trim & Clean Checklist:
                </h4>

                {selectedOrderForButcher.items.map((item, idx) => {
                  const itemKey = `${selectedOrderForButcher.id}-${idx}`;
                  const isChecked = !!preparedItems[itemKey];

                  return (
                    <div
                      key={itemKey}
                      className={`p-4 rounded-2xl border transition-all ${
                        isChecked
                          ? 'bg-emerald-50/60 border-emerald-300 text-slate-900'
                          : 'bg-slate-50 border-slate-200'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-start gap-3">
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() =>
                              setPreparedItems((prev) => ({ ...prev, [itemKey]: !prev[itemKey] }))
                            }
                            className="w-5 h-5 rounded text-[#1B5E20] focus:ring-emerald-500 mt-0.5 cursor-pointer"
                          />
                          <div>
                            <div className="font-bold text-slate-900 text-sm">
                              {item.quantity}x {item.product.name}
                            </div>
                            <div className="flex flex-wrap gap-1.5 mt-1 text-xs">
                              <span className="bg-white border border-slate-300 font-bold px-2 py-0.5 rounded text-slate-800">
                                📏 Cut: {item.selectedCut || 'Standard Cut'}
                              </span>
                              <span className="bg-white border border-slate-300 font-medium px-2 py-0.5 rounded text-slate-700">
                                🔪 Prep: {item.selectedPrep || 'Standard Clean'}
                              </span>
                              <span className="bg-emerald-100 text-emerald-900 font-bold px-2 py-0.5 rounded">
                                ⚖️ Target Weight: {item.selectedVariant?.name || item.product.unit}
                              </span>
                            </div>

                            {item.customButcherNotes && (
                              <div className="mt-2 p-2 bg-amber-50 rounded-xl border border-amber-200 text-xs text-amber-950 font-medium">
                                📝 Customer Note: "{item.customButcherNotes}"
                              </div>
                            )}
                          </div>
                        </div>

                        <span className="text-xs font-bold text-slate-900">
                          £{((item.selectedVariant ? item.selectedVariant.price : item.product.price) * item.quantity).toFixed(2)}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Digital Scale Integration Simulation */}
              <div className="bg-linear-to-br from-slate-900 to-slate-800 text-white p-5 rounded-3xl border border-slate-700 space-y-4 shadow-lg">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Scale className="w-5 h-5 text-emerald-400" />
                    <span className="font-bold text-sm">AHEED Precision Scale #02 (Calibrated)</span>
                  </div>
                  <span className="text-[10px] bg-emerald-500/20 text-emerald-300 px-2 py-0.5 rounded border border-emerald-500/40">
                    Live COM Port Active
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* Digital Scale LCD */}
                  <div className="bg-black/80 rounded-2xl p-4 border border-emerald-500/30 flex flex-col justify-between">
                    <span className="text-[10px] text-emerald-400 font-mono tracking-widest uppercase">
                      NET SCALE WEIGHT
                    </span>
                    <div className="text-3xl sm:text-4xl font-mono font-bold text-emerald-400 my-2">
                      {scaleReadingKg.toFixed(3)} <span className="text-lg text-emerald-500">kg</span>
                    </div>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => setScaleReadingKg((w) => Math.max(0.2, Number((w - 0.05).toFixed(3))))}
                        className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-mono"
                      >
                        -50g
                      </button>
                      <button
                        type="button"
                        onClick={() => setScaleReadingKg((w) => Number((w + 0.05).toFixed(3)))}
                        className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-mono"
                      >
                        +50g
                      </button>
                      <button
                        type="button"
                        onClick={() => setScaleReadingKg(1.0)}
                        className="px-2.5 py-1 rounded-lg bg-emerald-900 text-emerald-300 text-xs font-mono ml-auto"
                      >
                        Tare (0.00)
                      </button>
                    </div>
                  </div>

                  {/* Thermal Label Generator & Print simulation */}
                  <div className="bg-slate-800/90 rounded-2xl p-4 border border-slate-700 flex flex-col justify-between space-y-3">
                    <div>
                      <div className="flex items-center justify-between text-xs font-bold text-slate-200">
                        <span>Thermal Butcher Label</span>
                        <span className="text-[10px] text-amber-400">100% HMC HALAL</span>
                      </div>
                      <p className="text-[11px] text-slate-400 mt-1">
                        Order #{selectedOrderForButcher.id} • {scaleReadingKg} kg net • Pack Date: Today
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={() => setIsLabelPrinted(true)}
                      className="w-full py-2.5 rounded-xl bg-white hover:bg-slate-100 text-slate-900 font-extrabold text-xs shadow-md flex items-center justify-center gap-2 transition-colors"
                    >
                      <Printer className="w-4 h-4 text-emerald-700" />
                      <span>{isLabelPrinted ? '✓ Label Printed & Affixed' : 'Print Scale Barcode Label'}</span>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="lg:col-span-2 bg-white p-12 rounded-3xl border border-slate-200 text-center space-y-2">
              <Scale className="w-12 h-12 text-slate-300 mx-auto" />
              <h4 className="font-bold text-slate-800">Select an order from the left to start butchery prep</h4>
            </div>
          )}
        </div>
      )}

      {/* TAB 2: LIVE ORDERS MANAGEMENT */}
      {activeTab === 'orders' && (
        <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-xs space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-extrabold text-slate-900 text-base">All Customer Orders</h3>
            <span className="text-xs text-slate-500 font-medium">{orders.length} active orders</span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-slate-600 font-bold">
                  <th className="p-3">Order ID</th>
                  <th className="p-3">Customer</th>
                  <th className="p-3">Fulfilment & Slot</th>
                  <th className="p-3">Items</th>
                  <th className="p-3">Total</th>
                  <th className="p-3">Status</th>
                  <th className="p-3 text-right">Update Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {orders.map((ord) => (
                  <tr key={ord.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="p-3 font-bold font-mono text-slate-900">{ord.id}</td>
                    <td className="p-3">
                      <div className="font-bold text-slate-900">{ord.customerName}</div>
                      <div className="text-[11px] text-slate-400">{ord.customerPhone}</div>
                    </td>
                    <td className="p-3">
                      <span className="font-semibold text-slate-800 block">
                        {ord.fulfilmentType === 'delivery' ? '🚚 Delivery' : '🏬 Click & Collect'}
                      </span>
                      <span className="text-[11px] text-slate-500">{ord.deliverySlot}</span>
                    </td>
                    <td className="p-3">
                      <span className="font-medium text-slate-700">
                        {ord.items.length} items ({ord.items.reduce((a, b) => a + b.quantity, 0)} units)
                      </span>
                    </td>
                    <td className="p-3 font-bold text-[#1B5E20]">£{ord.total.toFixed(2)}</td>
                    <td className="p-3">
                      <span
                        className={`inline-block px-2.5 py-1 rounded-full font-bold text-[11px] ${
                          ord.status === 'Delivered'
                            ? 'bg-emerald-100 text-emerald-800'
                            : ord.status === 'Out for delivery'
                            ? 'bg-blue-100 text-blue-800'
                            : ord.status === 'Preparing & Weighing'
                            ? 'bg-amber-100 text-amber-800'
                            : 'bg-slate-100 text-slate-800'
                        }`}
                      >
                        {ord.status}
                      </span>
                    </td>
                    <td className="p-3 text-right space-x-1">
                      <select
                        value={ord.status}
                        onChange={(e) => onUpdateOrderStatus(ord.id, e.target.value as OrderStatus)}
                        className="bg-white border border-slate-300 rounded-lg px-2 py-1 text-xs font-medium focus:ring-2 focus:ring-emerald-500 outline-none"
                      >
                        <option value="Confirmed">Confirmed</option>
                        <option value="Preparing & Weighing">Preparing & Weighing</option>
                        <option value="Out for delivery">Out for delivery</option>
                        <option value="Delivered">Delivered</option>
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 3: INVENTORY & STOCK */}
      {activeTab === 'inventory' && (
        <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-xs space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <input
                type="text"
                placeholder="Search inventory items..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="px-3.5 py-2 text-xs rounded-xl border border-slate-300 w-64 focus:ring-2 focus:ring-emerald-500 outline-none"
              />
              <select
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value as CategoryId)}
                className="px-3 py-2 text-xs rounded-xl border border-slate-300 bg-white"
              >
                {CATEGORIES.map((cat) => (
                  <option key={cat.id} value={cat.id}>
                    {cat.name}
                  </option>
                ))}
              </select>
            </div>

            <button
              type="button"
              onClick={() => setIsAddingProduct(!isAddingProduct)}
              className="bg-[#1B5E20] hover:bg-emerald-800 text-white font-bold text-xs px-4 py-2 rounded-xl shadow-xs flex items-center gap-1.5"
            >
              <Plus className="w-4 h-4" />
              <span>Add New Product</span>
            </button>
          </div>

          {/* Add Product Modal Drawer */}
          {isAddingProduct && (
            <form onSubmit={handleAddProduct} className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-3 text-xs">
              <h4 className="font-bold text-slate-900 text-sm">Add Product to Aheed Catalogue:</h4>
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Product Title</label>
                  <input
                    type="text"
                    required
                    value={newProductName}
                    onChange={(e) => setNewProductName(e.target.value)}
                    placeholder="e.g. Fresh Halal Lamb Chops"
                    className="w-full px-3 py-1.5 rounded-xl border border-slate-300 bg-white"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Category</label>
                  <select
                    value={newProductCategory}
                    onChange={(e) => setNewProductCategory(e.target.value as CategoryId)}
                    className="w-full px-3 py-1.5 rounded-xl border border-slate-300 bg-white"
                  >
                    {CATEGORIES.filter((c) => c.id !== 'all').map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Price (in Pence)</label>
                  <input
                    type="number"
                    required
                    value={newPricePence}
                    onChange={(e) => setNewPricePence(Number(e.target.value))}
                    className="w-full px-3 py-1.5 rounded-xl border border-slate-300 bg-white font-mono"
                  />
                  <span className="text-[10px] text-slate-500 mt-0.5 block">
                    = £{(newPricePence / 100).toFixed(2)} GBP
                  </span>
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Stock Count</label>
                  <input
                    type="number"
                    required
                    value={newStock}
                    onChange={(e) => setNewStock(Number(e.target.value))}
                    className="w-full px-3 py-1.5 rounded-xl border border-slate-300 bg-white"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsAddingProduct(false)}
                  className="px-3 py-1.5 rounded-xl bg-slate-200 text-slate-700 font-bold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 rounded-xl bg-[#1B5E20] text-white font-bold"
                >
                  Save Product
                </button>
              </div>
            </form>
          )}

          {/* Products Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-slate-600 font-bold">
                  <th className="p-3">Item</th>
                  <th className="p-3">Category</th>
                  <th className="p-3">Price (£)</th>
                  <th className="p-3">Stock Level</th>
                  <th className="p-3">Availability Toggle</th>
                  <th className="p-3 text-right">Adjust Stock</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredProducts.map((p) => (
                  <tr key={p.id} className="hover:bg-slate-50/80">
                    <td className="p-3 flex items-center gap-3">
                      <img
                        src={p.image}
                        alt={p.name}
                        className="w-10 h-10 rounded-xl object-cover border border-slate-200"
                      />
                      <div>
                        <div className="font-bold text-slate-900">{p.name}</div>
                        <div className="text-[11px] text-slate-400">{p.unit}</div>
                      </div>
                    </td>
                    <td className="p-3 font-medium text-slate-700">{p.category}</td>
                    <td className="p-3 font-extrabold text-[#1B5E20]">£{p.price.toFixed(2)}</td>
                    <td className="p-3">
                      <span
                        className={`font-bold px-2 py-0.5 rounded-md ${
                          p.stockCount <= 5 ? 'bg-rose-100 text-rose-800' : 'bg-slate-100 text-slate-800'
                        }`}
                      >
                        {p.stockCount} in stock
                      </span>
                    </td>
                    <td className="p-3">
                      <button
                        type="button"
                        onClick={() => handleToggleAvailability(p.id)}
                        className={`px-3 py-1 rounded-full text-[11px] font-bold transition-colors ${
                          p.isAvailable
                            ? 'bg-emerald-100 text-emerald-800 hover:bg-emerald-200'
                            : 'bg-rose-100 text-rose-800 hover:bg-rose-200'
                        }`}
                      >
                        {p.isAvailable ? '✓ Available for Sale' : '✕ Hidden / Unavailable'}
                      </button>
                    </td>
                    <td className="p-3 text-right space-x-1">
                      <button
                        type="button"
                        onClick={() => handleUpdateStock(p.id, -5)}
                        className="px-2 py-1 rounded bg-slate-100 text-slate-700 font-bold hover:bg-slate-200"
                      >
                        -5
                      </button>
                      <button
                        type="button"
                        onClick={() => handleUpdateStock(p.id, 5)}
                        className="px-2 py-1 rounded bg-slate-100 text-slate-700 font-bold hover:bg-slate-200"
                      >
                        +5
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 4: LOYALTY & DELIVERY CONFIG */}
      {activeTab === 'loyalty_config' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-xs space-y-4">
            <div className="flex items-center gap-2">
              <Award className="w-5 h-5 text-amber-600" />
              <h3 className="font-extrabold text-slate-900 text-base">Aheed Loyalty Program Parameters</h3>
            </div>
            <p className="text-xs text-slate-600">
              Configure point accumulation rules and redemption thresholds for customer rewards.
            </p>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1">Points Earned per £1.00 Spent</label>
                <input
                  type="number"
                  value={pointsPerPound}
                  onChange={(e) => setPointsPerPound(Number(e.target.value))}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Redemption Rate (100 Points = £1.00)</label>
                <input
                  type="number"
                  value={pencePerPointRedeemed}
                  onChange={(e) => setPencePerPointRedeemed(Number(e.target.value))}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300"
                />
              </div>
            </div>
          </div>

          <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-xs space-y-4">
            <div className="flex items-center gap-2">
              <Truck className="w-5 h-5 text-[#1B5E20]" />
              <h3 className="font-extrabold text-slate-900 text-base">Milton Keynes Delivery Zones</h3>
            </div>
            <div className="space-y-2 text-xs">
              <div className="p-3 bg-slate-50 rounded-2xl border border-slate-200 flex justify-between items-center">
                <div>
                  <span className="font-bold text-slate-900">Zone 1: MK Central (MK9, MK10)</span>
                  <p className="text-[11px] text-slate-500">Free delivery threshold: £35.00 • Standard: £2.49</p>
                </div>
                <span className="bg-emerald-100 text-emerald-800 font-bold px-2 py-0.5 rounded">Active</span>
              </div>
              <div className="p-3 bg-slate-50 rounded-2xl border border-slate-200 flex justify-between items-center">
                <div>
                  <span className="font-bold text-slate-900">Zone 2: Bletchley & Wolverton (MK1-8, MK11-15)</span>
                  <p className="text-[11px] text-slate-500">Free delivery threshold: £40.00 • Standard: £2.49</p>
                </div>
                <span className="bg-emerald-100 text-emerald-800 font-bold px-2 py-0.5 rounded">Active</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 5: STAFF OPS RUNBOOK */}
      {activeTab === 'runbook' && (
        <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-xs space-y-4">
          <div className="flex items-center gap-2">
            <BookOpen className="w-5 h-5 text-[#1B5E20]" />
            <h3 className="font-extrabold text-slate-900 text-base">Aheed Store Operations Runbook</h3>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
            {DOC_ARTICLES.filter((d) => d.audience === 'staff').map((doc) => (
              <div key={doc.id} className="p-4 rounded-2xl border border-slate-200 bg-slate-50 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-slate-900 text-sm">{doc.title}</span>
                  <span className="bg-emerald-100 text-emerald-800 text-[10px] font-bold px-2 py-0.5 rounded">
                    {doc.category}
                  </span>
                </div>
                <p className="text-slate-600">{doc.summary}</p>
                <div className="pt-2 text-[11px] text-slate-400">Last updated: {doc.lastUpdated}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
