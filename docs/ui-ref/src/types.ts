export type ViewMode = 'desktop' | 'mobile' | 'user_account' | 'help_guides' | 'brand_guide' | 'admin' | 'dev_kms';

export type CategoryId = 'all' | 'fresh-produce' | 'halal-meat' | 'groceries' | 'international' | 'dairy-eggs' | 'beverages' | 'snacks' | 'household';

export interface Product {
  id: string;
  name: string;
  category: CategoryId;
  price: number; // in GBP £ (e.g. 1.49)
  pricePence: number; // in integer pence (e.g. 149) for exact financial operations
  unit: string; // e.g. "1kg", "5kg", "Pack of 6", "500g"
  rating: number;
  reviewCount: number;
  image: string;
  description: string;
  isHalal?: boolean;
  isOrganic?: boolean;
  isFresh?: boolean;
  isPopular?: boolean;
  isOffer?: boolean;
  originalPrice?: number;
  origin?: string;
  stockCount: number;
  isAvailable: boolean; // Staff stock availability toggle
}

export interface CartItem {
  product: Product;
  quantity: number;
}

export type OrderStatus = 'Confirmed' | 'Out for delivery' | 'Delivered';

export interface Order {
  id: string;
  createdAt: string;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  isGuestOrder: boolean;
  userId?: string;
  deliveryAddress: {
    street: string;
    city: string;
    postcode: string;
    instructions?: string;
  };
  items: CartItem[];
  subtotalPence: number;
  deliveryFeePence: number;
  discountPence: number;
  totalPence: number;
  subtotal: number;
  deliveryFee: number;
  discount: number;
  total: number;
  status: OrderStatus;
  paymentMethod: string;
  estimatedDeliveryTime: string;
  driverName?: string;
  driverPhone?: string;
  pointsEarned: number;
  pointsRedeemed: number;
}

export type UserRole = 'guest' | 'customer' | 'staff' | 'admin';

export interface SavedAddress {
  id: string;
  label: string;
  street: string;
  city: string;
  postcode: string;
  isDefault: boolean;
}

export interface UserAccount {
  id: string;
  name: string;
  email: string;
  phone: string;
  role: UserRole;
  loyaltyPoints: number;
  addresses: SavedAddress[];
  isLoggedIn: boolean;
  joinedDate: string;
  betterAuthToken?: string;
}

export interface ImpersonationLog {
  id: string;
  adminEmail: string;
  targetUserEmail: string;
  targetUserName: string;
  reason: string;
  timestamp: string;
}

export interface DocArticle {
  id: string;
  title: string;
  slug: string;
  audience: 'customer' | 'staff' | 'dev';
  visibility: 'public' | 'internal';
  category: string;
  summary: string;
  content: string;
  lastUpdated: string;
}

export interface FeatureFlags {
  guestCheckout: boolean;
  loyaltyProgram: boolean;
  betterAuth: boolean;
  cloudflareR2: boolean;
  neonPostgres: boolean;
}

