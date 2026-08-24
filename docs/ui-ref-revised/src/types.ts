export type ViewMode = 'desktop' | 'products' | 'mobile' | 'user_account' | 'help_guides' | 'brand_guide' | 'admin' | 'dev_kms';

export type CategoryId = 
  | 'all' 
  | 'fresh-produce' 
  | 'halal-meat' 
  | 'groceries' 
  | 'international' 
  | 'dairy-eggs' 
  | 'beverages' 
  | 'snacks' 
  | 'household';

export interface ProductVariant {
  id: string;
  name: string; // e.g. "500g", "1 kg", "2 kg", "5 kg Sack", "Pack of 6"
  weightGrams?: number;
  price: number; // in GBP £ (e.g. 6.49)
  pricePence: number; // in integer pence (e.g. 649)
  unit: string;
  stockCount: number;
  isDefault?: boolean;
}

export type MeatCutType = 
  | 'Curry Cut (with bone)'
  | 'Boneless Diced Cubes'
  | 'Keema / Mince (Fine)'
  | 'Keema / Mince (Coarse)'
  | 'Whole Bird (Cut in 8)'
  | 'Whole Bird (Cut in 4)'
  | 'Whole Cleaned (Skinless)'
  | 'Chops / Cutlets'
  | 'Steaks'
  | 'Biryani Cut (Large bone-in pieces)'
  | 'Soup Bones / Marrow Cut';

export type MeatPrepType =
  | 'Standard'
  | 'Skinless'
  | 'Skin-on'
  | 'Fat Trimmed (Extra Lean)'
  | 'Washed & Salt Cleaned'
  | 'Small Diced (1 inch)'
  | 'Medium Diced (1.5 inch)'
  | 'With Liver & Gizzard included'
  | 'Marinated Tandoori Mix'
  | 'Marinated Desi Curry Base';

export type SubstitutionPreference = 
  | 'best_match' // Allow best replacement with same/higher grade
  | 'contact_me' // Call/WhatsApp customer before replacing
  | 'no_substitute'; // Do not substitute (refund immediately)

export interface ProductReview {
  id: string;
  author: string;
  rating: number;
  date: string;
  comment: string;
  verified: boolean;
}

export interface Product {
  id: string;
  name: string;
  category: CategoryId;
  subCategory?: string;
  price: number; // in GBP £ (e.g. 1.49)
  pricePence: number; // in integer pence (e.g. 149) for exact financial operations
  unit: string; // e.g. "1kg", "5kg", "Pack of 6", "500g"
  rating: number;
  reviewCount: number;
  image: string;
  description: string;
  brand?: string;
  isHalal?: boolean;
  isOrganic?: boolean;
  isFresh?: boolean;
  isPopular?: boolean;
  isOffer?: boolean;
  originalPrice?: number;
  origin?: string;
  stockCount: number;
  isAvailable: boolean; // Staff stock availability toggle
  
  // Pareto Group 2 & 4: Variant Engine, Meat & Operations
  variants?: ProductVariant[];
  isApproximateWeight?: boolean;
  approxWeightMsg?: string;
  isMeat?: boolean;
  availableCuts?: MeatCutType[];
  availablePreps?: MeatPrepType[];
  ingredients?: string[];
  allergens?: string[];
  halalCertInfo?: string;
  storageInfo?: string;
  dietary?: ('Halal' | 'Vegetarian' | 'Vegan' | 'Gluten-Free' | 'Organic')[];
  multiBuyPromo?: {
    buyQty: number;
    promoPrice: number;
    promoLabel: string;
  };
  isBestSeller?: boolean;
  isNewArrival?: boolean;
  nutrition?: {
    calories?: string;
    protein?: string;
    fat?: string;
    carbs?: string;
    fiber?: string;
  };
  reviews?: ProductReview[];
}

export interface BundleItem {
  id: string;
  title: string;
  tagline: string;
  category: string;
  badge: string;
  savingsText: string;
  price: number;
  originalPrice: number;
  image: string;
  items: { name: string; quantity: string }[];
  productIds: string[];
}

export interface CartItem {
  product: Product;
  quantity: number;
  selectedVariant?: ProductVariant;
  selectedCut?: MeatCutType;
  selectedPrep?: MeatPrepType;
  customButcherNotes?: string;
  substitutionPreference?: SubstitutionPreference;
  approxWeightKg?: number;
}

export type OrderStatus = 'Confirmed' | 'Preparing & Weighing' | 'Out for delivery' | 'Delivered';

export interface Order {
  id: string;
  createdAt: string;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  isGuestOrder: boolean;
  userId?: string;
  fulfilmentType: 'delivery' | 'click_and_collect';
  deliveryZone?: string;
  deliverySlot: string;
  substitutionPreference: SubstitutionPreference;
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
  
  // Group 4: Fresh butcher fulfilment state
  butcherFulfilmentStatus?: 'Pending Scale & Cut' | 'Cut & Weighed' | 'Ready for Packing';
  scaleWeightKg?: number;
  finalAdjustedTotal?: number;
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
  wishlistIds?: string[];
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
