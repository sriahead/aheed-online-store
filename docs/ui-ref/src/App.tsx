import React, { useState } from 'react';
import { ViewMode, UserRole, CategoryId, Product, CartItem, Order, OrderStatus, UserAccount, ImpersonationLog } from './types';
import { PRODUCTS } from './data/products';
import { MOCK_USERS } from './data/mockUsers';
import { Header } from './components/Header';
import { ImpersonationBanner } from './components/ImpersonationBanner';
import { DesktopStorefront } from './components/DesktopStorefront';
import { MobileAppFrame } from './components/MobileAppFrame';
import { CustomerAccountView } from './components/CustomerAccountView';
import { HelpGuidesView } from './components/HelpGuidesView';
import { StaffAdminPanel } from './components/StaffAdminPanel';
import { DevKmsView } from './components/DevKmsView';
import { BrandGuideView } from './components/BrandGuideView';
import { ProductDetailModal } from './components/ProductDetailModal';
import { CartDrawer } from './components/CartDrawer';
import { CheckoutModal } from './components/CheckoutModal';
import { OrderTrackingModal } from './components/OrderTrackingModal';
import { AuthModal } from './components/AuthModal';

export default function App() {
  const [viewMode, setViewMode] = useState<ViewMode>('desktop');
  const [userRole, setUserRole] = useState<UserRole>('customer');
  const [selectedCategory, setSelectedCategory] = useState<CategoryId>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [postcode, setPostcode] = useState('LE2 7TR');

  // Active User Account State (Better Auth simulation)
  const [currentUser, setCurrentUser] = useState<UserAccount | null>(MOCK_USERS[0]);
  const [impersonatedUser, setImpersonatedUser] = useState<UserAccount | null>(null);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [isDevUser, setIsDevUser] = useState(false);

  const [impersonationLogs, setImpersonationLogs] = useState<ImpersonationLog[]>([
    {
      id: 'imp-1',
      adminEmail: 'admin@aheedfood.co.uk',
      targetUserEmail: 'sarah.ahmed@example.com',
      targetUserName: 'Sarah Ahmed',
      reason: 'Assisting customer Sarah Ahmed with Leicester delivery address confirmation.',
      timestamp: new Date().toISOString().split('T')[0] + ' 10:14 AM',
    },
  ]);

  // Cart State
  const [cartItems, setCartItems] = useState<CartItem[]>([
    { product: PRODUCTS[0], quantity: 2 }, // Fresh Vine Tomatoes
    { product: PRODUCTS[2], quantity: 1 }, // Fresh Halal Chicken Breast
    { product: PRODUCTS[1], quantity: 1 }, // Laila Basmati Rice
  ]);
  const [isCartOpen, setIsCartOpen] = useState(false);

  // Modals & Selected items
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [isCheckoutOpen, setIsCheckoutOpen] = useState(false);

  // Orders State
  const [allOrders, setAllOrders] = useState<Order[]>([
    {
      id: 'AHEED-884102',
      createdAt: 'Today, 09:15 AM',
      customerName: 'Sarah Ahmed',
      customerEmail: 'sarah.ahmed@example.com',
      customerPhone: '07700 900123',
      isGuestOrder: false,
      userId: 'usr-1',
      deliveryAddress: {
        street: '42 Evington Valley Road',
        city: 'Leicester',
        postcode: 'LE2 2BD',
        instructions: 'Ring doorbell twice please',
      },
      items: [
        { product: PRODUCTS[0], quantity: 2 },
        { product: PRODUCTS[2], quantity: 1 },
      ],
      subtotalPence: 797,
      deliveryFeePence: 0,
      discountPence: 0,
      totalPence: 797,
      subtotal: 7.97,
      deliveryFee: 0,
      discount: 0,
      total: 7.97,
      status: 'Out for delivery',
      paymentMethod: 'Stripe Card Payment',
      estimatedDeliveryTime: 'Today (5:00 PM - 7:00 PM)',
      driverName: 'Mohammed K.',
      driverPhone: '07123 456789',
      pointsEarned: 8,
      pointsRedeemed: 0,
    },
  ]);

  const [activeOrder, setActiveOrder] = useState<Order | null>(allOrders[0]);
  const [isOrderTrackingOpen, setIsOrderTrackingOpen] = useState(false);

  // Auth Handlers
  const handleSelectUser = (user: UserAccount | null) => {
    setCurrentUser(user);
    if (user) {
      setUserRole(user.role);
      if (user.role === 'staff') {
        // Aheed Admin / Store Manager
        setViewMode('admin');
      } else if (user.role === 'admin') {
        // Dev / Systems Architect
        setIsDevUser(true);
        setViewMode('dev_kms');
      } else {
        setViewMode('desktop');
      }
    } else {
      setUserRole('guest');
      setViewMode('desktop');
    }
  };

  const handleSignOut = () => {
    setCurrentUser(null);
    setUserRole('guest');
    setImpersonatedUser(null);
    setIsDevUser(false);
    setViewMode('desktop');
  };

  // Impersonation Handlers
  const handleStartImpersonation = (targetUser: UserAccount, reason: string) => {
    setImpersonatedUser(targetUser);
    const newLog: ImpersonationLog = {
      id: `imp-${Date.now()}`,
      adminEmail: 'admin@aheedfood.co.uk',
      targetUserEmail: targetUser.email,
      targetUserName: targetUser.name,
      reason,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };
    setImpersonationLogs((prev) => [newLog, ...prev]);
    setViewMode('user_account');
  };

  const handleExitImpersonation = () => {
    setImpersonatedUser(null);
  };

  // Cart Handlers
  const handleAddToCart = (product: Product, quantityOrEvent?: number | React.MouseEvent) => {
    const qty = typeof quantityOrEvent === 'number' ? quantityOrEvent : 1;

    setCartItems((prev) => {
      const existing = prev.find((item) => item.product.id === product.id);
      if (existing) {
        return prev.map((item) =>
          item.product.id === product.id
            ? { ...item, quantity: item.quantity + qty }
            : item
        );
      }
      return [...prev, { product, quantity: qty }];
    });
  };

  const handleUpdateCartQuantity = (productId: string, delta: number) => {
    setCartItems((prev) =>
      prev
        .map((item) => {
          if (item.product.id === productId) {
            const newQty = item.quantity + delta;
            return newQty > 0 ? { ...item, quantity: newQty } : null;
          }
          return item;
        })
        .filter((item): item is CartItem => item !== null)
    );
  };

  const handleRemoveCartItem = (productId: string) => {
    setCartItems((prev) => prev.filter((item) => item.product.id !== productId));
  };

  // Order Handlers
  const handleOrderPlaced = (newOrder: Order) => {
    setAllOrders((prev) => [newOrder, ...prev]);
    setActiveOrder(newOrder);
    setIsOrderTrackingOpen(true);
  };

  const handleUpdateOrderStatus = (orderId: string, newStatus: OrderStatus) => {
    setAllOrders((prev) =>
      prev.map((o) => (o.id === orderId ? { ...o, status: newStatus } : o))
    );
    if (activeOrder && activeOrder.id === orderId) {
      setActiveOrder((prev) => (prev ? { ...prev, status: newStatus } : null));
    }
  };

  const handleResetDatabase = () => {
    setCartItems([
      { product: PRODUCTS[0], quantity: 2 },
      { product: PRODUCTS[2], quantity: 1 },
    ]);
    setSelectedCategory('all');
    setSearchQuery('');
    alert('Baseline database successfully re-seeded!');
  };

  const activeCustomer = impersonatedUser || currentUser;

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 text-slate-900 font-['Poppins',sans-serif]">
      {/* Top Banner if Impersonating */}
      <ImpersonationBanner
        impersonatedUser={impersonatedUser}
        onExitImpersonation={handleExitImpersonation}
      />

      {/* Top Header */}
      <Header
        viewMode={viewMode}
        setViewMode={setViewMode}
        userRole={userRole}
        setUserRole={setUserRole}
        searchQuery={searchQuery}
        setSearchQuery={setSearchQuery}
        cartItems={cartItems}
        setIsCartOpen={setIsCartOpen}
        activeOrder={activeOrder}
        setIsOrderTrackingOpen={setIsOrderTrackingOpen}
        postcode={postcode}
        setPostcode={setPostcode}
        currentUser={activeCustomer}
        onOpenAuthModal={() => setIsAuthModalOpen(true)}
        onSignOut={handleSignOut}
        isDevUser={isDevUser}
        setIsDevUser={setIsDevUser}
      />

      {/* Main View Mode Router */}
      <main className="flex-1">
        {/* VIEW 1: GUEST / DESKTOP STOREFRONT */}
        {viewMode === 'desktop' && (
          <DesktopStorefront
            products={PRODUCTS}
            selectedCategory={selectedCategory}
            setSelectedCategory={setSelectedCategory}
            searchQuery={searchQuery}
            setSearchQuery={setSearchQuery}
            cartItems={cartItems}
            onAddToCart={handleAddToCart}
            onProductClick={(product) => setSelectedProduct(product)}
          />
        )}

        {/* MOBILE STOREFRONT FRAME */}
        {viewMode === 'mobile' && (
          <MobileAppFrame
            products={PRODUCTS}
            selectedCategory={selectedCategory}
            setSelectedCategory={setSelectedCategory}
            searchQuery={searchQuery}
            setSearchQuery={setSearchQuery}
            cartItems={cartItems}
            onAddToCart={handleAddToCart}
            onUpdateCartQuantity={handleUpdateCartQuantity}
            onProductClick={(product) => setSelectedProduct(product)}
            onProceedToCheckout={() => setIsCheckoutOpen(true)}
            activeOrder={activeOrder}
            onTrackOrder={() => setIsOrderTrackingOpen(true)}
          />
        )}

        {/* VIEW 2: CUSTOMER ACCOUNT & LOYALTY (AUTHENTICATED USER VIEW) */}
        {viewMode === 'user_account' && (
          <CustomerAccountView
            currentUser={activeCustomer}
            orders={allOrders}
            onAddToCart={handleAddToCart}
            onTrackOrder={(o) => {
              setActiveOrder(o);
              setIsOrderTrackingOpen(true);
            }}
            onLogout={handleSignOut}
            onSwitchToHelp={() => setViewMode('help_guides')}
          />
        )}

        {/* CUSTOMER HELP GUIDE & FAQS */}
        {viewMode === 'help_guides' && <HelpGuidesView />}

        {/* VIEW 3: STORE ADMIN / STAFF PANEL */}
        {viewMode === 'admin' && (
          <StaffAdminPanel
            products={PRODUCTS}
            orders={allOrders}
            onUpdateOrderStatus={handleUpdateOrderStatus}
            currentUserRole={userRole}
          />
        )}

        {/* VIEW 4: DEV KMS & TOOLING CONSOLE */}
        {viewMode === 'dev_kms' && (
          <DevKmsView
            onStartImpersonation={handleStartImpersonation}
            impersonationLogs={impersonationLogs}
            onResetDatabase={handleResetDatabase}
          />
        )}

        {/* BRAND SYSTEM GUIDE */}
        {viewMode === 'brand_guide' && <BrandGuideView />}
      </main>

      {/* Global Modals & Drawers */}
      <AuthModal
        isOpen={isAuthModalOpen}
        onClose={() => setIsAuthModalOpen(false)}
        currentUser={activeCustomer}
        onSelectUser={handleSelectUser}
      />

      <ProductDetailModal
        product={selectedProduct}
        onClose={() => setSelectedProduct(null)}
        onAddToCart={(p, q) => handleAddToCart(p, q)}
        isInCart={cartItems.some((ci) => ci.product.id === selectedProduct?.id)}
      />

      <CartDrawer
        isOpen={isCartOpen}
        onClose={() => setIsCartOpen(false)}
        cartItems={cartItems}
        onUpdateQuantity={handleUpdateCartQuantity}
        onRemoveItem={handleRemoveCartItem}
        onProceedToCheckout={() => setIsCheckoutOpen(true)}
        postcode={postcode}
      />

      <CheckoutModal
        isOpen={isCheckoutOpen}
        onClose={() => setIsCheckoutOpen(false)}
        cartItems={cartItems}
        postcode={postcode}
        onOrderPlaced={handleOrderPlaced}
        onClearCart={() => setCartItems([])}
      />

      <OrderTrackingModal
        isOpen={isOrderTrackingOpen}
        order={activeOrder}
        onClose={() => setIsOrderTrackingOpen(false)}
        onUpdateStatus={(status) => {
          if (activeOrder) handleUpdateOrderStatus(activeOrder.id, status);
        }}
      />

      {/* Footer */}
      <footer className="bg-slate-900 text-slate-400 py-8 px-4 text-xs border-t border-slate-800">
        <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-7 h-7 rounded-lg bg-[#1B5E20] text-white flex items-center justify-center font-bold">
              A
            </div>
            <div>
              <p className="font-bold text-slate-200">Aheed Food Centre — Leicester, UK</p>
              <p className="text-[11px]">Cultural Groceries, Fresh Produce & HMC Halal Meat</p>
            </div>
          </div>

          <div className="flex items-center gap-4 text-slate-400">
            <button type="button" onClick={() => setViewMode('help_guides')} className="hover:text-white">
              Customer Help Guide
            </button>
            <span>•</span>
            <button type="button" onClick={() => setViewMode('dev_kms')} className="hover:text-white">
              Dev KMS & Architecture
            </button>
            <span>•</span>
            <button type="button" onClick={() => setViewMode('brand_guide')} className="hover:text-white">
              Brand Spec
            </button>
          </div>

          <p className="text-slate-500">
            © {new Date().getFullYear()} Aheed Food Centre. Spec-Driven Development Prototype.
          </p>
        </div>
      </footer>
    </div>
  );
}
