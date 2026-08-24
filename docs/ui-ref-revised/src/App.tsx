import React, { useState, useEffect } from 'react';
import {
  Product,
  CartItem,
  Order,
  UserAccount,
  ViewMode,
  UserRole,
  CategoryId,
  ProductVariant,
  MeatCutType,
  MeatPrepType,
  SubstitutionPreference,
  BundleItem,
} from './types';
import { PRODUCTS, BUNDLES } from './data/products';
import { MOCK_USERS } from './data/mockUsers';

// Components
import { Header } from './components/Header';
import { DesktopStorefront } from './components/DesktopStorefront';
import { ProductsCatalogPage } from './components/ProductsCatalogPage';
import { MobileAppFrame } from './components/MobileAppFrame';
import { CartDrawer } from './components/CartDrawer';
import { CheckoutModal } from './components/CheckoutModal';
import { ProductDetailModal } from './components/ProductDetailModal';
import { OrderTrackingModal } from './components/OrderTrackingModal';
import { CustomerAccountView } from './components/CustomerAccountView';
import { StaffAdminPanel } from './components/StaffAdminPanel';
import { DevKmsView } from './components/DevKmsView';
import { BrandGuideView } from './components/BrandGuideView';
import { HelpGuidesView } from './components/HelpGuidesView';
import { AuthModal } from './components/AuthModal';
import { TrustComplianceModal } from './components/TrustComplianceModal';
import { WhatsAppSupportModal } from './components/WhatsAppSupportModal';
import { WishlistModal } from './components/WishlistModal';
import { CookieBanner } from './components/CookieBanner';

// Mock initial active orders for testing
const INITIAL_ORDERS: Order[] = [
  {
    id: 'AHEED-892144',
    createdAt: 'Today, 11:30 AM',
    customerName: 'Sarah Ahmed',
    customerEmail: 'sarah.ahmed@example.co.uk',
    customerPhone: '07700 900123',
    isGuestOrder: false,
    userId: 'sarah-ahmed',
    fulfilmentType: 'delivery',
    deliveryZone: 'Zone 1 (MK Central)',
    deliverySlot: 'Today (5:00 PM - 7:00 PM)',
    substitutionPreference: 'best_match',
    deliveryAddress: {
      street: '42 Midsummer Blvd, Apt 4B',
      city: 'Milton Keynes',
      postcode: 'MK9 3BP',
      instructions: 'Ring bell twice, leave in lobby if out.',
    },
    items: [
      {
        product: PRODUCTS[0], // Fresh Halal Baby Lamb Curry Cut
        quantity: 1,
        selectedVariant: PRODUCTS[0].variants?.[0],
        selectedCut: 'Curry Cut (with bone)',
        selectedPrep: 'Fat Trimmed (Extra Lean)',
        customButcherNotes: 'Cut medium pieces for biryani please.',
      },
      {
        product: PRODUCTS[1], // Fresh Halal Chicken Breast Fillets
        quantity: 2,
        selectedVariant: PRODUCTS[1].variants?.[0],
        selectedCut: 'Boneless Diced Cubes',
        selectedPrep: 'Skinless',
      },
      {
        product: PRODUCTS[4], // Laila Basmati Rice
        quantity: 1,
        selectedVariant: PRODUCTS[4].variants?.[0],
      },
    ],
    subtotalPence: 3046,
    deliveryFeePence: 0,
    discountPence: 0,
    totalPence: 3046,
    subtotal: 30.46,
    deliveryFee: 0,
    discount: 0,
    total: 30.46,
    status: 'Preparing & Weighing',
    paymentMethod: 'Stripe Visa Card (3DS)',
    estimatedDeliveryTime: 'Today (5:00 PM - 7:00 PM)',
    driverName: 'Mohammed K. (Aheed Logistics)',
    driverPhone: '07123 456789',
    pointsEarned: 30,
    pointsRedeemed: 0,
    butcherFulfilmentStatus: 'Pending Scale & Cut',
  },
];

export function App() {
  // Navigation & View Mode
  const [viewMode, setViewMode] = useState<ViewMode>('desktop');
  const [userRole, setUserRole] = useState<UserRole>('customer');
  const [isDevUser, setIsDevUser] = useState<boolean>(true);

  // Authentication & Current User
  const [currentUser, setCurrentUser] = useState<UserAccount | null>(MOCK_USERS[0]); // Sarah Ahmed by default
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);

  // Products & Categories
  const [products, setProducts] = useState<Product[]>(PRODUCTS);
  const [selectedCategory, setSelectedCategory] = useState<CategoryId>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Cart State
  const [cartItems, setCartItems] = useState<CartItem[]>([
    {
      product: PRODUCTS[0], // Baby Lamb
      quantity: 1,
      selectedVariant: PRODUCTS[0].variants?.[0],
      selectedCut: 'Curry Cut (with bone)',
      selectedPrep: 'Fat Trimmed (Extra Lean)',
      customButcherNotes: 'Cut medium pieces for karahi',
    },
    {
      product: PRODUCTS[4], // Laila Basmati Rice
      quantity: 1,
      selectedVariant: PRODUCTS[4].variants?.[0],
    },
  ]);
  const [isCartOpen, setIsCartOpen] = useState(false);

  // Wishlist & Saved Items (Pareto Group 6)
  const [wishlistIds, setWishlistIds] = useState<string[]>(['p1', 'p2', 'p5']);
  const [isWishlistOpen, setIsWishlistOpen] = useState(false);

  // Recently Viewed Products (Pareto Group 6)
  const [recentlyViewed, setRecentlyViewed] = useState<Product[]>([PRODUCTS[0], PRODUCTS[1], PRODUCTS[4]]);

  // Postcode (Milton Keynes Delivery)
  const [postcode, setPostcode] = useState<string>('MK9 3BP');

  // Checkout & Orders (Pareto Group 3 & 4)
  const [isCheckoutOpen, setIsCheckoutOpen] = useState(false);
  const [orders, setOrders] = useState<Order[]>(INITIAL_ORDERS);
  const [activeOrder, setActiveOrder] = useState<Order | null>(INITIAL_ORDERS[0]);
  const [isOrderTrackingOpen, setIsOrderTrackingOpen] = useState(false);

  // Product Detail Modal (Pareto Group 1 & 2)
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [isProductDetailOpen, setIsProductDetailOpen] = useState(false);

  // Trust, Compliance & Support Modals (Pareto Group 6 & 7)
  const [isTrustModalOpen, setIsTrustModalOpen] = useState(false);
  const [trustModalTab, setTrustModalTab] = useState<string>('halal');
  const [isWhatsAppOpen, setIsWhatsAppOpen] = useState(false);

  // Handlers
  const handleOpenProductDetail = (product: Product) => {
    setSelectedProduct(product);
    setIsProductDetailOpen(true);

    // Track recently viewed
    setRecentlyViewed((prev) => {
      const filtered = prev.filter((p) => p.id !== product.id);
      return [product, ...filtered].slice(0, 8);
    });
  };

  const handleAddToCart = (
    product: Product,
    e?: React.MouseEvent,
    variant?: ProductVariant,
    cut?: MeatCutType,
    prep?: MeatPrepType,
    notes?: string,
    subPref?: SubstitutionPreference
  ) => {
    if (e) e.stopPropagation();

    // If product has cuts or variants and wasn't added via modal, open modal to let customer customize
    if (!variant && product.variants && product.variants.length > 1 && !e?.defaultPrevented) {
      handleOpenProductDetail(product);
      return;
    }

    const chosenVariant = variant || product.variants?.[0];
    const chosenCut = cut || (product.availableCuts ? product.availableCuts[0] : undefined);
    const chosenPrep = prep || (product.availablePreps ? product.availablePreps[0] : undefined);

    setCartItems((prev) => {
      const matchIndex = prev.findIndex(
        (it) =>
          it.product.id === product.id &&
          it.selectedVariant?.id === chosenVariant?.id &&
          it.selectedCut === chosenCut &&
          it.selectedPrep === chosenPrep
      );

      if (matchIndex >= 0) {
        const updated = [...prev];
        updated[matchIndex].quantity += 1;
        return updated;
      }

      return [
        ...prev,
        {
          product,
          quantity: 1,
          selectedVariant: chosenVariant,
          selectedCut: chosenCut,
          selectedPrep: chosenPrep,
          customButcherNotes: notes,
          substitutionPreference: subPref || 'best_match',
        },
      ];
    });

    setIsCartOpen(true);
  };

  const handleUpdateCartQuantity = (productId: string, delta: number, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setCartItems((prev) =>
      prev
        .map((item) => {
          if (item.product.id === productId) {
            const newQty = item.quantity + delta;
            return newQty > 0 ? { ...item, quantity: newQty } : null;
          }
          return item;
        })
        .filter(Boolean) as CartItem[]
    );
  };

  const handleRemoveCartItem = (productId: string) => {
    setCartItems((prev) => prev.filter((item) => item.product.id !== productId));
  };

  const handleClearCart = () => {
    setCartItems([]);
  };

  const handleToggleWishlist = (productId: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setWishlistIds((prev) =>
      prev.includes(productId) ? prev.filter((id) => id !== productId) : [...prev, productId]
    );
  };

  const handleAddBundleToCart = (bundle: BundleItem) => {
    // Add all products associated with bundle to cart
    const bundleItemsToAdd: CartItem[] = bundle.items
      .map((bi) => {
        const matchingProd = products.find((p) =>
          p.name.toLowerCase().includes(bi.name.toLowerCase().split(' ')[0])
        ) || products[0];
        return {
          product: matchingProd,
          quantity: 1,
          selectedVariant: matchingProd.variants?.[0],
        };
      });

    setCartItems((prev) => [...prev, ...bundleItemsToAdd]);
    setIsCartOpen(true);
  };

  const handleOrderPlaced = (newOrder: Order) => {
    setOrders((prev) => [newOrder, ...prev]);
    setActiveOrder(newOrder);
    setIsOrderTrackingOpen(true);

    // If logged in, update loyalty points
    if (currentUser) {
      const earned = newOrder.pointsEarned || Math.floor(newOrder.total);
      const spent = newOrder.pointsRedeemed || 0;
      setCurrentUser((prev) =>
        prev
          ? {
              ...prev,
              loyaltyPoints: Math.max(0, prev.loyaltyPoints - spent + earned),
            }
          : null
      );
    }
  };

  const handleReorder = (pastOrder: Order) => {
    setCartItems([...pastOrder.items]);
    setIsCartOpen(true);
  };

  const handleUpdateOrderStatus = (orderId: string, newStatus: any) => {
    setOrders((prev) =>
      prev.map((o) => (o.id === orderId ? { ...o, status: newStatus } : o))
    );
    if (activeOrder && activeOrder.id === orderId) {
      setActiveOrder((prev) => (prev ? { ...prev, status: newStatus } : null));
    }
  };

  const handleUpdateProductStock = (productId: string, newStock: number) => {
    setProducts((prev) =>
      prev.map((p) => (p.id === productId ? { ...p, stockCount: newStock } : p))
    );
  };

  const wishlistedProductList = products.filter((p) => wishlistIds.includes(p.id));

  return (
    <div className="min-h-screen bg-[#FAFAFA] text-slate-900 flex flex-col font-sans selection:bg-emerald-100 selection:text-emerald-900">
      {/* Header */}
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
        currentUser={currentUser}
        onOpenAuthModal={() => setIsAuthModalOpen(true)}
        onSignOut={() => setCurrentUser(null)}
        isDevUser={isDevUser}
        setIsDevUser={setIsDevUser}
        wishlistCount={wishlistIds.length}
        onOpenWishlist={() => setIsWishlistOpen(true)}
        onOpenWhatsApp={() => setIsWhatsAppOpen(true)}
        onOpenTrustModal={() => {
          setTrustModalTab('halal');
          setIsTrustModalOpen(true);
        }}
      />

      {/* Main View Router */}
      <main className="flex-1">
        {viewMode === 'desktop' && (
          <DesktopStorefront
            products={products}
            selectedCategory={selectedCategory}
            setSelectedCategory={setSelectedCategory}
            cartItems={cartItems}
            onAddToCart={handleAddToCart}
            onProductClick={handleOpenProductDetail}
            wishlistIds={wishlistIds}
            onToggleWishlist={handleToggleWishlist}
            onOpenTrustModal={(tab) => {
              if (tab) setTrustModalTab(tab);
              setIsTrustModalOpen(true);
            }}
            onOpenWhatsApp={() => setIsWhatsAppOpen(true)}
            onAddBundleToCart={handleAddBundleToCart}
            onNavigateToProducts={(catId) => {
              if (catId) setSelectedCategory(catId);
              setViewMode('products');
            }}
          />
        )}

        {viewMode === 'products' && (
          <ProductsCatalogPage
            products={products}
            selectedCategory={selectedCategory}
            setSelectedCategory={setSelectedCategory}
            searchQuery={searchQuery}
            setSearchQuery={setSearchQuery}
            cartItems={cartItems}
            onAddToCart={handleAddToCart}
            onUpdateCartQuantity={handleUpdateCartQuantity}
            onProductClick={handleOpenProductDetail}
            wishlistIds={wishlistIds}
            onToggleWishlist={handleToggleWishlist}
            onBackToHome={() => setViewMode('desktop')}
          />
        )}

        {viewMode === 'mobile' && (
          <MobileAppFrame
            products={products}
            selectedCategory={selectedCategory}
            setSelectedCategory={setSelectedCategory}
            searchQuery={searchQuery}
            setSearchQuery={setSearchQuery}
            cartItems={cartItems}
            onAddToCart={handleAddToCart}
            onUpdateCartQuantity={handleUpdateCartQuantity}
            onProductClick={handleOpenProductDetail}
            wishlistIds={wishlistIds}
            onToggleWishlist={handleToggleWishlist}
            onOpenCart={() => setIsCartOpen(true)}
            postcode={postcode}
            setPostcode={setPostcode}
            currentUser={currentUser}
            onOpenAccount={() => setViewMode('user_account')}
            onOpenWishlist={() => setIsWishlistOpen(true)}
            onOpenWhatsApp={() => setIsWhatsAppOpen(true)}
          />
        )}

        {viewMode === 'admin' && (
          <StaffAdminPanel
            products={products}
            orders={orders}
            onUpdateOrderStatus={handleUpdateOrderStatus}
            currentUserRole={currentUser?.role || 'admin'}
            onUpdateProductStock={handleUpdateProductStock}
          />
        )}

        {viewMode === 'user_account' && (
          <CustomerAccountView
            currentUser={currentUser}
            orders={orders}
            onReorder={handleReorder}
            onOpenOrderTracking={(ord) => {
              setActiveOrder(ord);
              setIsOrderTrackingOpen(true);
            }}
            onUpdateAddresses={(addrs) => {
              if (currentUser) {
                setCurrentUser({ ...currentUser, addresses: addrs });
              }
            }}
            wishlistedProducts={wishlistedProductList}
            onAddToCart={handleAddToCart}
            onOpenProductDetail={handleOpenProductDetail}
            onOpenWhatsApp={() => setIsWhatsAppOpen(true)}
          />
        )}

        {viewMode === 'brand_guide' && <BrandGuideView />}
        {viewMode === 'help_guides' && <HelpGuidesView />}
        {viewMode === 'dev_kms' && <DevKmsView />}
      </main>

      {/* Cart Drawer */}
      <CartDrawer
        isOpen={isCartOpen}
        onClose={() => setIsCartOpen(false)}
        cartItems={cartItems}
        onUpdateQuantity={(id, delta) => handleUpdateCartQuantity(id, delta)}
        onRemoveItem={handleRemoveCartItem}
        onProceedToCheckout={() => {
          setIsCartOpen(false);
          setIsCheckoutOpen(true);
        }}
        postcode={postcode}
        onOpenProductModal={handleOpenProductDetail}
      />

      {/* Checkout Modal */}
      <CheckoutModal
        isOpen={isCheckoutOpen}
        onClose={() => setIsCheckoutOpen(false)}
        cartItems={cartItems}
        postcode={postcode}
        currentUser={currentUser}
        onOrderPlaced={handleOrderPlaced}
        onClearCart={handleClearCart}
      />

      {/* Product Detail & Master Butcher Customisation Modal */}
      <ProductDetailModal
        product={selectedProduct}
        isOpen={isProductDetailOpen}
        onClose={() => setIsProductDetailOpen(false)}
        onAddToCart={handleAddToCart}
        isWishlisted={selectedProduct ? wishlistIds.includes(selectedProduct.id) : false}
        onToggleWishlist={(id, e) => handleToggleWishlist(id, e)}
        onOpenWhatsApp={() => {
          setIsProductDetailOpen(false);
          setIsWhatsAppOpen(true);
        }}
      />

      {/* Live 4-Step Order Tracking Modal */}
      <OrderTrackingModal
        order={activeOrder}
        isOpen={isOrderTrackingOpen}
        onClose={() => setIsOrderTrackingOpen(false)}
        onReorder={handleReorder}
      />

      {/* Wishlist Modal */}
      <WishlistModal
        isOpen={isWishlistOpen}
        onClose={() => setIsWishlistOpen(false)}
        wishlistedProducts={wishlistedProductList}
        onRemoveFromWishlist={(id) => handleToggleWishlist(id)}
        onAddToCart={handleAddToCart}
        onAddAllToCart={(prods) => {
          prods.forEach((p) => handleAddToCart(p));
        }}
        onOpenProductDetail={handleOpenProductDetail}
      />

      {/* Trust & Standards Hub Modal (Group 7) */}
      <TrustComplianceModal
        isOpen={isTrustModalOpen}
        onClose={() => setIsTrustModalOpen(false)}
        initialTab={trustModalTab}
      />

      {/* WhatsApp Store Desk Modal (Group 6) */}
      <WhatsAppSupportModal
        isOpen={isWhatsAppOpen}
        onClose={() => setIsWhatsAppOpen(false)}
      />

      {/* Auth / Login Modal */}
      <AuthModal
        isOpen={isAuthModalOpen}
        onClose={() => setIsAuthModalOpen(false)}
        onLogin={(user) => {
          setCurrentUser(user);
          setIsAuthModalOpen(false);
        }}
      />

      {/* GDPR Cookie Consent Banner (Group 7) */}
      <CookieBanner
        onOpenTrustModal={(tab) => {
          setTrustModalTab(tab);
          setIsTrustModalOpen(true);
        }}
      />
    </div>
  );
}

export default App;
