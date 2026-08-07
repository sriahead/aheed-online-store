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
  Sparkles
} from 'lucide-react';

interface StaffAdminPanelProps {
  products: Product[];
  orders: Order[];
  onUpdateOrderStatus: (orderId: string, newStatus: OrderStatus) => void;
  currentUserRole?: UserRole;
}

export const StaffAdminPanel: React.FC<StaffAdminPanelProps> = ({
  products,
  orders,
  onUpdateOrderStatus,
  currentUserRole = 'admin',
}) => {
  const [activeTab, setActiveTab] = useState<'inventory' | 'orders' | 'loyalty_config' | 'reports' | 'runbook'>('inventory');
  const [permissionRole, setPermissionRole] = useState<'staff' | 'admin'>(
    currentUserRole === 'staff' ? 'staff' : 'admin'
  );

  // Local state for products (live stock availability toggles & stock count editing)
  const [productList, setProductList] = useState<Product[]>(products);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<CategoryId>('all');

  // Add Product Form State (Integer Pence!)
  const [isAddingProduct, setIsAddingProduct] = useState(false);
  const [newProductName, setNewProductName] = useState('');
  const [newProductCategory, setNewProductCategory] = useState<CategoryId>('fresh-produce');
  const [newPricePence, setNewPricePence] = useState<number>(199); // Integer pence!
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
      prev.map((p) =>
        p.id === productId ? { ...p, stockCount: Math.max(0, p.stockCount + delta) } : p
      )
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
      image: 'https://images.unsplash.com/photo-1542838132-92c53300491e?auto=format&fit=crop&w=600&q=80',
      description: newDescription || 'Fresh cultural grocery staple selected for Aheed Food Centre.',
      stockCount: newStock,
      isAvailable: true,
      origin: 'UK Local',
    };

    setProductList((prev) => [newProd, ...prev]);
    setIsAddingProduct(false);
    setNewProductName('');
    setNewPricePence(199);
  };

  // Filtered Products
  const filteredProducts = productList.filter((p) => {
    const matchesSearch = p.name.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCat = selectedCategory === 'all' || p.category === selectedCategory;
    return matchesSearch && matchesCat;
  });

  // Financial Stats (Integer Pence calculations)
  const totalRevenuePence = orders.reduce((acc, o) => acc + (o.totalPence || Math.round(o.total * 100)), 0);
  const totalOrdersCount = orders.length;

  // Internal Operational Guide articles
  const internalDocs = DOC_ARTICLES.filter((a) => a.visibility === 'internal');

  return (
    <div className="max-w-7xl mx-auto px-4 py-8 font-['Poppins',sans-serif]">
      {/* Top Banner / Permission Tier Switcher */}
      <div className="bg-slate-900 text-white rounded-3xl p-6 mb-8 flex flex-wrap items-center justify-between gap-6 shadow-xl border border-slate-800">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-2xl bg-[#1B5E20] flex items-center justify-center text-white text-xl font-black shadow-md">
            <Store className="w-7 h-7" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold">Aheed Store Operations Portal</h1>
              <span className="bg-amber-400 text-slate-950 text-[11px] font-black px-2.5 py-0.5 rounded-full uppercase tracking-wider">
                {permissionRole === 'admin' ? 'Admin Tier (Full Management)' : 'Staff Tier (Shop-Floor)'}
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-1">
              One surface, role-gated capabilities for Leicester shop-floor and inventory management.
            </p>
          </div>
        </div>

        {/* Role Gating Switcher */}
        <div className="bg-slate-800 p-1.5 rounded-2xl flex items-center border border-slate-700">
          <button
            type="button"
            onClick={() => setPermissionRole('staff')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
              permissionRole === 'staff'
                ? 'bg-amber-400 text-slate-950 shadow-xs'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            Staff Tier (Shop-floor)
          </button>
          <button
            type="button"
            onClick={() => setPermissionRole('admin')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
              permissionRole === 'admin'
                ? 'bg-[#1B5E20] text-white shadow-xs'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            Admin Tier (Full CRUD)
          </button>
        </div>
      </div>

      {/* Tabs Bar */}
      <div className="flex border-b border-slate-200 mb-8 overflow-x-auto">
        <button
          type="button"
          onClick={() => setActiveTab('inventory')}
          className={`flex items-center gap-2 px-5 py-3 text-sm font-bold border-b-2 transition-all whitespace-nowrap ${
            activeTab === 'inventory'
              ? 'border-[#1B5E20] text-[#1B5E20]'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <Layers className="w-4 h-4" />
          Live Inventory & Availability
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('orders')}
          className={`flex items-center gap-2 px-5 py-3 text-sm font-bold border-b-2 transition-all whitespace-nowrap ${
            activeTab === 'orders'
              ? 'border-[#1B5E20] text-[#1B5E20]'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <Truck className="w-4 h-4" />
          Fulfillment & Orders ({orders.length})
        </button>

        {permissionRole === 'admin' && (
          <button
            type="button"
            onClick={() => setActiveTab('loyalty_config')}
            className={`flex items-center gap-2 px-5 py-3 text-sm font-bold border-b-2 transition-all whitespace-nowrap ${
              activeTab === 'loyalty_config'
                ? 'border-[#1B5E20] text-[#1B5E20]'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Award className="w-4 h-4" />
            Loyalty Config
          </button>
        )}

        {permissionRole === 'admin' && (
          <button
            type="button"
            onClick={() => setActiveTab('reports')}
            className={`flex items-center gap-2 px-5 py-3 text-sm font-bold border-b-2 transition-all whitespace-nowrap ${
              activeTab === 'reports'
                ? 'border-[#1B5E20] text-[#1B5E20]'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <TrendingUp className="w-4 h-4" />
            Sales & Pence Financials
          </button>
        )}

        <button
          type="button"
          onClick={() => setActiveTab('runbook')}
          className={`flex items-center gap-2 px-5 py-3 text-sm font-bold border-b-2 transition-all whitespace-nowrap ${
            activeTab === 'runbook'
              ? 'border-[#1B5E20] text-[#1B5E20]'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <BookOpen className="w-4 h-4" />
          Internal Operational Runbook
        </button>
      </div>

      {/* TAB 1: INVENTORY & PRODUCT AVAILABILITY */}
      {activeTab === 'inventory' && (
        <div className="space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3 flex-1 max-w-md">
              <div className="relative w-full">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  placeholder="Filter inventory by name..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full bg-white pl-9 pr-4 py-2 rounded-xl border border-slate-200 text-xs focus:outline-none focus:border-[#1B5E20]"
                />
              </div>
            </div>

            {permissionRole === 'admin' && (
              <button
                type="button"
                onClick={() => setIsAddingProduct(!isAddingProduct)}
                className="flex items-center gap-1.5 bg-[#1B5E20] hover:bg-emerald-800 text-white px-4 py-2 rounded-xl text-xs font-bold transition-colors"
              >
                <Plus className="w-4 h-4" />
                Add Product (Integer Pence)
              </button>
            )}
          </div>

          {/* Admin Add Product Modal/Form */}
          {permissionRole === 'admin' && isAddingProduct && (
            <form onSubmit={handleAddProduct} className="bg-emerald-50 border border-emerald-200 p-6 rounded-2xl space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-bold text-slate-900 text-sm">Add New Catalogue Item</h3>
                <span className="text-xs text-amber-800 font-extrabold bg-amber-100 px-2.5 py-0.5 rounded-full">
                  Pence Pricing Convention Applied
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">Product Title</label>
                  <input
                    type="text"
                    value={newProductName}
                    onChange={(e) => setNewProductName(e.target.value)}
                    placeholder="e.g. Fresh Halal Lamb Chops"
                    required
                    className="w-full bg-white p-2.5 rounded-xl border border-slate-300 text-xs focus:outline-none focus:border-[#1B5E20]"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">Category</label>
                  <select
                    value={newProductCategory}
                    onChange={(e) => setNewProductCategory(e.target.value as CategoryId)}
                    className="w-full bg-white p-2.5 rounded-xl border border-slate-300 text-xs focus:outline-none focus:border-[#1B5E20]"
                  >
                    {CATEGORIES.filter((c) => c.id !== 'all').map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">
                    Price in Integer Pence (e.g. 149 = £1.49)
                  </label>
                  <div className="relative">
                    <input
                      type="number"
                      value={newPricePence}
                      onChange={(e) => setNewPricePence(Number(e.target.value))}
                      required
                      min={1}
                      className="w-full bg-white p-2.5 rounded-xl border border-slate-300 text-xs font-bold text-slate-900 focus:outline-none focus:border-[#1B5E20]"
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-slate-400 font-semibold">
                      = £{(newPricePence / 100).toFixed(2)} GBP
                    </span>
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">Unit Weight/Pack</label>
                  <input
                    type="text"
                    value={newUnit}
                    onChange={(e) => setNewUnit(e.target.value)}
                    placeholder="e.g. 1 kg"
                    required
                    className="w-full bg-white p-2.5 rounded-xl border border-slate-300 text-xs focus:outline-none focus:border-[#1B5E20]"
                  />
                </div>
              </div>

              <div className="flex items-center gap-3 pt-2">
                <button
                  type="submit"
                  className="bg-[#1B5E20] hover:bg-emerald-800 text-white font-bold text-xs px-5 py-2.5 rounded-xl"
                >
                  Save Item to Catalogue
                </button>
                <button
                  type="button"
                  onClick={() => setIsAddingProduct(false)}
                  className="bg-slate-200 text-slate-700 font-bold text-xs px-4 py-2.5 rounded-xl"
                >
                  Cancel
                </button>
              </div>
            </form>
          )}

          {/* Product Inventory Table */}
          <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-xs">
            <div className="p-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between text-xs text-slate-600 font-bold">
              <span>Showing {filteredProducts.length} Items</span>
              <span className="text-[#1B5E20] italic">
                {permissionRole === 'staff'
                  ? 'Shop-Floor Staff: Toggle live product availability honestly when sold out.'
                  : 'Admin: Full pricing integer pence CRUD & stock adjustments enabled.'}
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-100 text-slate-700 uppercase text-[10px] tracking-wider border-b border-slate-200">
                  <tr>
                    <th className="p-3">Product</th>
                    <th className="p-3">Category</th>
                    <th className="p-3">Price (Pence / GBP)</th>
                    <th className="p-3">Stock Count</th>
                    <th className="p-3 text-center">Live Availability</th>
                    {permissionRole === 'admin' && <th className="p-3 text-right">Actions</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredProducts.map((p) => (
                    <tr key={p.id} className="hover:bg-slate-50 transition-colors">
                      <td className="p-3 font-semibold text-slate-900 flex items-center gap-2">
                        <img src={p.image} alt={p.name} className="w-9 h-9 object-cover rounded-lg shrink-0" />
                        <div>
                          <p className="line-clamp-1">{p.name}</p>
                          <p className="text-[10px] text-slate-400 font-normal">{p.unit}</p>
                        </div>
                      </td>
                      <td className="p-3 text-slate-600 uppercase text-[10px] font-bold">{p.category}</td>
                      <td className="p-3 font-mono">
                        <span className="font-bold text-[#1B5E20]">£{p.price.toFixed(2)}</span>
                        <span className="text-[10px] text-slate-400 block">({p.pricePence || Math.round(p.price * 100)}p)</span>
                      </td>
                      <td className="p-3">
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => handleUpdateStock(p.id, -1)}
                            className="w-5 h-5 bg-slate-100 hover:bg-slate-200 rounded font-bold text-center"
                          >
                            -
                          </button>
                          <span className={`font-bold ${p.stockCount < 10 ? 'text-amber-600' : 'text-slate-800'}`}>
                            {p.stockCount}
                          </span>
                          <button
                            type="button"
                            onClick={() => handleUpdateStock(p.id, 1)}
                            className="w-5 h-5 bg-slate-100 hover:bg-slate-200 rounded font-bold text-center"
                          >
                            +
                          </button>
                        </div>
                      </td>
                      <td className="p-3 text-center">
                        <button
                          type="button"
                          onClick={() => handleToggleAvailability(p.id)}
                          className={`px-3 py-1 rounded-full text-[11px] font-bold flex items-center gap-1 mx-auto transition-all ${
                            p.isAvailable
                              ? 'bg-emerald-100 text-[#1B5E20] hover:bg-emerald-200'
                              : 'bg-red-100 text-red-800 hover:bg-red-200'
                          }`}
                        >
                          {p.isAvailable ? (
                            <>
                              <Eye className="w-3 h-3" /> In Stock
                            </>
                          ) : (
                            <>
                              <EyeOff className="w-3 h-3" /> Out of Stock
                            </>
                          )}
                        </button>
                      </td>
                      {permissionRole === 'admin' && (
                        <td className="p-3 text-right">
                          <button
                            type="button"
                            onClick={() =>
                              setProductList((prev) => prev.filter((item) => item.id !== p.id))
                            }
                            className="text-red-500 hover:text-red-700 p-1"
                            title="Delete Item"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: FULFILLMENT & ORDERS */}
      {activeTab === 'orders' && (
        <div className="space-y-4">
          <h2 className="font-bold text-slate-900 text-base">Shop-Floor Leicester Order Queue</h2>
          {orders.length === 0 ? (
            <div className="bg-white rounded-2xl p-8 text-center text-slate-500 border border-slate-200">
              No orders in queue.
            </div>
          ) : (
            orders.map((o) => (
              <div key={o.id} className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs">
                <div className="flex flex-wrap items-center justify-between gap-4 pb-3 border-b border-slate-100">
                  <div>
                    <span className="font-bold text-slate-900 text-sm">Order #{o.id}</span>
                    <p className="text-xs text-slate-500">Customer: {o.customerName} ({o.customerPhone})</p>
                    <p className="text-xs text-slate-500">Delivery Address: {o.deliveryAddress.street}, {o.deliveryAddress.postcode}</p>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-slate-500 mr-2">Status:</span>
                    <button
                      type="button"
                      onClick={() => onUpdateOrderStatus(o.id, 'Confirmed')}
                      className={`px-3 py-1 rounded-xl text-xs font-bold ${
                        o.status === 'Confirmed' ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600'
                      }`}
                    >
                      Confirmed
                    </button>
                    <button
                      type="button"
                      onClick={() => onUpdateOrderStatus(o.id, 'Out for delivery')}
                      className={`px-3 py-1 rounded-xl text-xs font-bold ${
                        o.status === 'Out for delivery' ? 'bg-amber-500 text-slate-950' : 'bg-slate-100 text-slate-600'
                      }`}
                    >
                      Out for Delivery
                    </button>
                    <button
                      type="button"
                      onClick={() => onUpdateOrderStatus(o.id, 'Delivered')}
                      className={`px-3 py-1 rounded-xl text-xs font-bold ${
                        o.status === 'Delivered' ? 'bg-[#1B5E20] text-white' : 'bg-slate-100 text-slate-600'
                      }`}
                    >
                      Delivered
                    </button>
                  </div>
                </div>

                <div className="pt-3 flex items-center justify-between text-xs text-slate-600">
                  <span>Items: {o.items.reduce((acc, i) => acc + i.quantity, 0)} total items</span>
                  <span className="font-extrabold text-slate-900">Total: £{o.total.toFixed(2)} ({o.totalPence || Math.round(o.total * 100)}p)</span>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* TAB 3: LOYALTY CONFIG (ADMIN ONLY) */}
      {activeTab === 'loyalty_config' && permissionRole === 'admin' && (
        <div className="bg-white rounded-2xl border border-slate-200 p-6 space-y-6 shadow-xs max-w-2xl">
          <h3 className="font-bold text-slate-900 text-base flex items-center gap-2">
            <Award className="w-5 h-5 text-amber-500" />
            Aheed Loyalty Program Rules Engine
          </h3>

          <div className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Points Earned Per £1.00 GBP Spent
              </label>
              <input
                type="number"
                value={pointsPerPound}
                onChange={(e) => setPointsPerPound(Number(e.target.value))}
                className="w-full bg-slate-50 p-2.5 rounded-xl border border-slate-300 text-xs font-bold"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Discount Value Per 100 Points Redeemed (in Integer Pence)
              </label>
              <input
                type="number"
                value={pencePerPointRedeemed * 100}
                onChange={(e) => setPencePerPointRedeemed(Number(e.target.value) / 100)}
                className="w-full bg-slate-50 p-2.5 rounded-xl border border-slate-300 text-xs font-bold"
              />
              <span className="text-[11px] text-slate-500 mt-1 block">
                Current rule: 100 Points = £{(pencePerPointRedeemed * 100 / 100).toFixed(2)} discount.
              </span>
            </div>

            <button
              type="button"
              onClick={() => alert('Loyalty program rules saved successfully!')}
              className="bg-[#1B5E20] text-white font-bold text-xs px-5 py-2.5 rounded-xl hover:bg-emerald-800"
            >
              Update Loyalty Engine Rules
            </button>
          </div>
        </div>
      )}

      {/* TAB 4: REPORTS & FINANCIAL PENCE */}
      {activeTab === 'reports' && permissionRole === 'admin' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
              <span className="text-xs text-slate-500 font-bold uppercase">Total Revenue</span>
              <p className="text-2xl font-black text-[#1B5E20] mt-1">
                £{(totalRevenuePence / 100).toFixed(2)}
              </p>
              <p className="text-[11px] font-mono text-slate-400 mt-0.5">({totalRevenuePence} integer pence)</p>
            </div>

            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
              <span className="text-xs text-slate-500 font-bold uppercase">Total Orders</span>
              <p className="text-2xl font-black text-slate-900 mt-1">{totalOrdersCount}</p>
            </div>

            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
              <span className="text-xs text-slate-500 font-bold uppercase">Average Basket Value</span>
              <p className="text-2xl font-black text-amber-600 mt-1">
                £{totalOrdersCount > 0 ? ((totalRevenuePence / totalOrdersCount) / 100).toFixed(2) : '0.00'}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* TAB 5: INTERNAL OPERATIONAL RUNBOOK */}
      {activeTab === 'runbook' && (
        <div className="bg-slate-900 text-slate-100 rounded-3xl p-6 sm:p-8 border border-slate-800 space-y-6">
          <div className="border-b border-slate-800 pb-4">
            <span className="bg-amber-400 text-slate-950 text-[10px] font-extrabold px-2.5 py-0.5 rounded-full uppercase tracking-wider">
              Internal Zero-Trust Staff Guide
            </span>
            <h2 className="text-xl font-bold mt-2">Store Admin & Shop-Floor Operational Runbook</h2>
            <p className="text-xs text-slate-400 mt-1">
              Split into Staff track (shop-floor procedures) and Admin track (pricing pence, inventory, escalation).
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {internalDocs.map((doc) => (
              <div key={doc.id} className="bg-slate-950 p-5 rounded-2xl border border-slate-800 space-y-2">
                <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-wider">
                  Audience: {doc.audience}
                </span>
                <h3 className="text-sm font-bold text-white">{doc.title}</h3>
                <p className="text-xs text-slate-400 leading-relaxed">{doc.summary}</p>
                <div className="pt-2 text-[11px] text-slate-500">
                  Last verified: {doc.lastUpdated}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
