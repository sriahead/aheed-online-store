import { Product, CategoryId, BundleItem } from '../types';

export interface SubCategoryInfo {
  id: string;
  name: string;
  categoryId: CategoryId;
}

export interface CategoryInfo {
  id: CategoryId;
  name: string;
  iconName: string;
  badgeCount?: number;
  description: string;
  color: string;
  subcategories: string[];
}

export const CATEGORIES: CategoryInfo[] = [
  {
    id: 'all',
    name: 'All Categories',
    iconName: 'LayoutGrid',
    description: 'Browse the full cultural grocery range',
    color: 'bg-emerald-100 text-emerald-800',
    subcategories: ['All', 'Best Sellers', 'Special Offers', 'Multi-Buy Deals', 'New Arrivals'],
  },
  {
    id: 'halal-meat',
    name: 'Halal Meat & Poultry',
    iconName: 'Beef',
    description: '100% Certified HMC Halal Fresh Meat Cut to Order',
    color: 'bg-red-50 text-red-700',
    subcategories: ['All Meat', 'Fresh Chicken', 'Lamb & Mutton', 'Beef & Keema', 'Steaks & Chops', 'Whole Birds'],
  },
  {
    id: 'fresh-produce',
    name: 'Fresh Produce',
    iconName: 'Apple',
    description: 'Daily fresh vegetables, fruits & desi herbs',
    color: 'bg-emerald-50 text-emerald-700',
    subcategories: ['All Produce', 'Desi Vegetables', 'Fresh Herbs & Chillies', 'Roots & Onions', 'Exotic & Citrus Fruits'],
  },
  {
    id: 'groceries',
    name: 'Groceries & Rice',
    iconName: 'ShoppingBag',
    description: 'Basmati rice, lentils, atta flour, spices & cooking oils',
    color: 'bg-amber-50 text-amber-800',
    subcategories: ['All Groceries', 'Basmati Rice', 'Flours & Atta', 'Lentils & Daal', 'Spices & Masalas', 'Ghee & Cooking Oils'],
  },
  {
    id: 'international',
    name: 'International Staples',
    iconName: 'Globe',
    description: 'South Asian, Afro-Caribbean & Middle-Eastern authentic brands',
    color: 'bg-orange-50 text-orange-800',
    subcategories: ['All International', 'South Asian Staples', 'Afro-Caribbean', 'Middle Eastern & Turkish', 'Sauces & Pickles'],
  },
  {
    id: 'dairy-eggs',
    name: 'Dairy & Eggs',
    iconName: 'Milk',
    description: 'Fresh milk, desi yogurt, paneer, butter & free-range eggs',
    color: 'bg-blue-50 text-blue-800',
    subcategories: ['All Dairy', 'Desi Yogurt & Dahi', 'Paneer & Halal Cheese', 'Fresh Milk & Cream', 'Farm Eggs'],
  },
  {
    id: 'beverages',
    name: 'Beverages',
    iconName: 'Coffee',
    description: 'Karak chai tea, mango juices, squash, rooh afza & malt drinks',
    color: 'bg-purple-50 text-purple-800',
    subcategories: ['All Drinks', 'Chai & Karak Tea', 'Exotic Juices & Nectars', 'Syrups & Rooh Afza', 'Soft Drinks'],
  },
  {
    id: 'snacks',
    name: 'Snacks & Sweets',
    iconName: 'Cookie',
    description: 'Traditional nimko, samosas, rusk biscuits, baklava & dry fruits',
    color: 'bg-pink-50 text-pink-800',
    subcategories: ['All Snacks', 'Desi Nimko & Sev', 'Rusk & Biscuits', 'Dates & Dry Fruits', 'Frozen Samosas'],
  },
  {
    id: 'household',
    name: 'Household',
    iconName: 'Home',
    description: 'Washing powders, surface cleaners & kitchen essentials',
    color: 'bg-slate-100 text-slate-800',
    subcategories: ['All Household', 'Cleaning & Detergents', 'Kitchen & Foil Rolls', 'Air Fresheners & Incense'],
  },
];

export const PRODUCTS: Product[] = [
  // --- HALAL MEAT & POULTRY (Group 2 & 4 Core) ---
  {
    id: 'prod-meat-1',
    name: 'Fresh Halal Chicken Breast Fillets',
    category: 'halal-meat',
    subCategory: 'Fresh Chicken',
    price: 6.99,
    pricePence: 699,
    unit: '1 kg (approx)',
    brand: 'Aheed Master Butcher',
    rating: 4.9,
    reviewCount: 312,
    image: 'https://images.unsplash.com/photo-1604503468506-a8da13d82791?auto=format&fit=crop&w=600&q=80',
    description: '100% Certified HMC Halal hand-slaughtered fresh chicken breast fillets. Succulent, tender, and trimmed daily by our in-house master butchers.',
    isHalal: true,
    isFresh: true,
    isPopular: true,
    isBestSeller: true,
    isMeat: true,
    isApproximateWeight: true,
    approxWeightMsg: '⚖️ Master Butcher Scale Guarantee: Weighed and cut fresh on order. Final balance adjusted upon packing.',
    origin: 'UK Red Tractor Certified Farm',
    stockCount: 65,
    isAvailable: true,
    dietary: ['Halal'],
    halalCertInfo: '100% HMC Halal Certified • Stun-Free Hand Slaughter • Daily Fresh Delivery from Shropshire Farms',
    storageInfo: 'Keep refrigerated below 4°C. Consume within 3 days or freeze on day of purchase.',
    ingredients: ['100% Fresh Halal Chicken Breast Meat'],
    allergens: [],
    availableCuts: [
      'Boneless Diced Cubes',
      'Steaks',
      'Keema / Mince (Fine)',
      'Keema / Mince (Coarse)',
      'Curry Cut (with bone)'
    ],
    availablePreps: [
      'Standard',
      'Fat Trimmed (Extra Lean)',
      'Small Diced (1 inch)',
      'Medium Diced (1.5 inch)',
      'Marinated Tandoori Mix',
      'Washed & Salt Cleaned'
    ],
    variants: [
      { id: 'v-chick-500g', name: '500g Pack', weightGrams: 500, price: 3.75, pricePence: 375, unit: '500g', stockCount: 40 },
      { id: 'v-chick-1kg', name: '1 kg Standard Pack', weightGrams: 1000, price: 6.99, pricePence: 699, unit: '1 kg', stockCount: 65, isDefault: true },
      { id: 'v-chick-2kg', name: '2 kg Value Pack', weightGrams: 2000, price: 13.49, pricePence: 1349, unit: '2 kg', stockCount: 30 },
      { id: 'v-chick-5kg', name: '5 kg Catering Box', weightGrams: 5000, price: 31.99, pricePence: 3199, unit: '5 kg', stockCount: 15 },
    ],
    nutrition: {
      calories: '165 kcal / 100g',
      protein: '31.0g',
      fat: '3.6g',
      carbs: '0.0g',
      fiber: '0.0g'
    },
    reviews: [
      { id: 'r1', author: 'Zainab M.', rating: 5, date: '2 days ago', comment: 'Extremely fresh and clean chicken with zero smell. The 1-inch curry cut saved me 20 minutes of prep time!', verified: true },
      { id: 'r2', author: 'Farhan K.', rating: 5, date: '1 week ago', comment: 'Best halal butcher in Milton Keynes. Clean cuts and exactly the weight ordered.', verified: true }
    ]
  },
  {
    id: 'prod-meat-2',
    name: 'Fresh Halal Baby Lamb Curry Cut (Bone-In)',
    category: 'halal-meat',
    subCategory: 'Lamb & Mutton',
    price: 11.99,
    pricePence: 1199,
    unit: '1 kg (approx)',
    brand: 'Aheed Master Butcher',
    rating: 4.9,
    reviewCount: 198,
    image: 'https://images.unsplash.com/photo-1588168333986-5078d3ae3976?auto=format&fit=crop&w=600&q=80',
    description: 'Tender, succulent prime British grass-fed halal baby lamb. Cut into perfect traditional curry pieces with bone for rich, authentic flavour and gravy.',
    isHalal: true,
    isFresh: true,
    isPopular: true,
    isBestSeller: true,
    isMeat: true,
    isApproximateWeight: true,
    approxWeightMsg: '⚖️ Weighed to order on calibrated butcher scale. Exact weight printed on cold-chain label.',
    origin: 'Welsh Grass-Fed Lamb',
    stockCount: 42,
    isAvailable: true,
    dietary: ['Halal'],
    halalCertInfo: '100% HMC Halal Certified • Traditional Hand Slaughtered • Welsh Farm Assured',
    storageInfo: 'Store in refrigerator at 0-4°C. Freeze on delivery date for up to 3 months.',
    ingredients: ['100% Fresh Halal Baby Lamb'],
    allergens: [],
    availableCuts: [
      'Curry Cut (with bone)',
      'Biryani Cut (Large bone-in pieces)',
      'Boneless Diced Cubes',
      'Chops / Cutlets',
      'Soup Bones / Marrow Cut'
    ],
    availablePreps: [
      'Standard',
      'Fat Trimmed (Extra Lean)',
      'Small Diced (1 inch)',
      'Medium Diced (1.5 inch)',
      'Marinated Desi Curry Base'
    ],
    variants: [
      { id: 'v-lamb-1kg', name: '1 kg Standard Pack', weightGrams: 1000, price: 11.99, pricePence: 1199, unit: '1 kg', stockCount: 42, isDefault: true },
      { id: 'v-lamb-2kg', name: '2 kg Family Pack', weightGrams: 2000, price: 22.99, pricePence: 2299, unit: '2 kg', stockCount: 20 },
      { id: 'v-lamb-5kg', name: '5 kg Bulk Box (Party Cut)', weightGrams: 5000, price: 54.99, pricePence: 5499, unit: '5 kg', stockCount: 8 }
    ],
    nutrition: {
      calories: '240 kcal / 100g',
      protein: '25.0g',
      fat: '16.0g',
      carbs: '0.0g',
      fiber: '0.0g'
    },
    reviews: [
      { id: 'r3', author: 'Amina S.', rating: 5, date: '3 days ago', comment: 'Melt-in-the-mouth tender lamb! Made a Sunday korma and everyone praised the meat quality.', verified: true }
    ]
  },
  {
    id: 'prod-meat-3',
    name: 'Fresh Halal Lean Beef Keema (Mince)',
    category: 'halal-meat',
    subCategory: 'Beef & Keema',
    price: 8.49,
    pricePence: 849,
    unit: '1 kg (approx)',
    brand: 'Aheed Master Butcher',
    rating: 4.8,
    reviewCount: 145,
    image: 'https://images.unsplash.com/photo-1588168333986-5078d3ae3976?auto=format&fit=crop&w=600&q=80',
    description: 'Triple-trimmed premium British halal beef minced fresh twice daily. Ideal for keema peas, seekh kebabs, samosa filling, and lasagne.',
    isHalal: true,
    isFresh: true,
    isMeat: true,
    isApproximateWeight: true,
    approxWeightMsg: '⚖️ Minced on order. Available in Fine or Coarse grind.',
    origin: 'UK Grass-Fed Angus Cross',
    stockCount: 38,
    isAvailable: true,
    dietary: ['Halal'],
    halalCertInfo: '100% Certified HMC Halal • Less than 10% Visible Fat',
    storageInfo: 'Keep refrigerated below 4°C. Consume within 48 hours.',
    ingredients: ['100% Pure Halal Beef'],
    allergens: [],
    availableCuts: [
      'Keema / Mince (Fine)',
      'Keema / Mince (Coarse)',
      'Boneless Diced Cubes'
    ],
    availablePreps: [
      'Standard',
      'Fat Trimmed (Extra Lean)',
      'Marinated Tandoori Mix'
    ],
    variants: [
      { id: 'v-beef-500g', name: '500g Pack', weightGrams: 500, price: 4.49, pricePence: 449, unit: '500g', stockCount: 25 },
      { id: 'v-beef-1kg', name: '1 kg Pack', weightGrams: 1000, price: 8.49, pricePence: 849, unit: '1 kg', stockCount: 38, isDefault: true },
      { id: 'v-beef-2kg', name: '2 kg Value Pack', weightGrams: 2000, price: 16.25, pricePence: 1625, unit: '2 kg', stockCount: 15 }
    ]
  },
  {
    id: 'prod-meat-4',
    name: 'Fresh Whole Halal Roasting Chicken (Grade A)',
    category: 'halal-meat',
    subCategory: 'Whole Birds',
    price: 4.99,
    pricePence: 499,
    unit: '1.4 kg (approx)',
    brand: 'Aheed Master Butcher',
    rating: 4.8,
    reviewCount: 92,
    image: 'https://images.unsplash.com/photo-1587593810167-a84920ea0781?auto=format&fit=crop&w=600&q=80',
    description: 'Plump, grain-fed whole fresh halal chicken. Our butcher can clean, deskin, cut into 4 or 8 pieces, or leave whole for roasting.',
    isHalal: true,
    isFresh: true,
    isMeat: true,
    isApproximateWeight: true,
    approxWeightMsg: '⚖️ Average bird weight 1.3kg – 1.5kg.',
    origin: 'UK Farm',
    stockCount: 50,
    isAvailable: true,
    dietary: ['Halal'],
    halalCertInfo: '100% Certified HMC Halal',
    storageInfo: 'Keep chilled 0°C to 4°C.',
    ingredients: ['100% Halal Chicken'],
    allergens: [],
    availableCuts: [
      'Whole Bird (Cut in 8)',
      'Whole Bird (Cut in 4)',
      'Whole Cleaned (Skinless)',
      'Curry Cut (with bone)'
    ],
    availablePreps: [
      'Standard',
      'Skinless',
      'Skin-on',
      'With Liver & Gizzard included',
      'Washed & Salt Cleaned'
    ],
    variants: [
      { id: 'v-whole-med', name: 'Medium Bird (approx 1.3kg)', weightGrams: 1300, price: 4.99, pricePence: 499, unit: '1.3kg', stockCount: 30, isDefault: true },
      { id: 'v-whole-large', name: 'Large Bird (approx 1.7kg)', weightGrams: 1700, price: 6.29, pricePence: 629, unit: '1.7kg', stockCount: 20 },
      { id: 'v-whole-2pack', name: 'Twin Pack (2 x Whole Birds)', weightGrams: 2800, price: 9.49, pricePence: 949, unit: '2 Birds', stockCount: 15 }
    ]
  },

  // --- FRESH PRODUCE (Group 1 & 4) ---
  {
    id: 'prod-prod-1',
    name: 'Fresh Vine Ripened Red Tomatoes',
    category: 'fresh-produce',
    subCategory: 'Desi Vegetables',
    price: 1.49,
    pricePence: 149,
    originalPrice: 1.89,
    isOffer: true,
    unit: '1 kg',
    brand: 'Aheed Fresh Market',
    rating: 4.8,
    reviewCount: 128,
    image: 'https://images.unsplash.com/photo-1592924357228-91a4daadcfea?auto=format&fit=crop&w=600&q=80',
    description: 'Sweet, vibrant red vine-ripened tomatoes. Perfect balance of sweetness and acidity for curry gravies, salads, and everyday cooking.',
    isFresh: true,
    isPopular: true,
    isBestSeller: true,
    isApproximateWeight: true,
    approxWeightMsg: '⚖️ Weighed by our produce team. Approx 6-8 tomatoes per kg.',
    origin: 'UK & Netherlands Greenhouses',
    stockCount: 85,
    isAvailable: true,
    dietary: ['Vegetarian', 'Vegan', 'Gluten-Free', 'Halal'],
    storageInfo: 'Store at room temperature for maximum sweetness, or refrigerate once fully ripe.',
    ingredients: ['100% Fresh Tomatoes'],
    allergens: [],
    multiBuyPromo: {
      buyQty: 2,
      promoPrice: 2.50,
      promoLabel: 'Buy 2 for £2.50'
    },
    variants: [
      { id: 'v-tom-500g', name: '500g Punnet', weightGrams: 500, price: 0.89, pricePence: 89, unit: '500g', stockCount: 40 },
      { id: 'v-tom-1kg', name: '1 kg Bag', weightGrams: 1000, price: 1.49, pricePence: 149, unit: '1 kg', stockCount: 85, isDefault: true },
      { id: 'v-tom-5kg', name: '5 kg Wooden Crate', weightGrams: 5000, price: 6.49, pricePence: 649, unit: '5 kg Box', stockCount: 20 }
    ],
    reviews: [
      { id: 'r4', author: 'Rashid P.', rating: 5, date: 'Yesterday', comment: 'Always firm, ripe and fresh. Much better quality than standard superstores.', verified: true }
    ]
  },
  {
    id: 'prod-prod-2',
    name: 'Fresh Green Finger Chillies (Desi Hot)',
    category: 'fresh-produce',
    subCategory: 'Fresh Herbs & Chillies',
    price: 0.99,
    pricePence: 99,
    unit: '200g Pack',
    brand: 'Aheed Fresh Market',
    rating: 4.9,
    reviewCount: 86,
    image: 'https://images.unsplash.com/photo-1588252303782-cb80119abd6d?auto=format&fit=crop&w=600&q=80',
    description: 'Crisp, fiery fresh green finger chillies. An essential foundation for desi handis, biryanis, samosa stuffing, and fresh mint chutneys.',
    isFresh: true,
    isPopular: true,
    origin: 'Imported Direct',
    stockCount: 120,
    isAvailable: true,
    dietary: ['Vegetarian', 'Vegan', 'Gluten-Free', 'Halal'],
    storageInfo: 'Store in an airtight container lined with paper towel in the salad drawer.',
    ingredients: ['100% Fresh Green Chillies'],
    allergens: [],
    multiBuyPromo: {
      buyQty: 3,
      promoPrice: 2.40,
      promoLabel: '3 for £2.40'
    },
    variants: [
      { id: 'v-chilli-200g', name: '200g Pack', weightGrams: 200, price: 0.99, pricePence: 99, unit: '200g', stockCount: 120, isDefault: true },
      { id: 'v-chilli-500g', name: '500g Value Pack', weightGrams: 500, price: 2.19, pricePence: 219, unit: '500g', stockCount: 45 },
      { id: 'v-chilli-1kg', name: '1 kg Box', weightGrams: 1000, price: 3.99, pricePence: 399, unit: '1 kg', stockCount: 20 }
    ]
  },
  {
    id: 'prod-prod-3',
    name: 'Fresh Coriander Bunches (Dhania)',
    category: 'fresh-produce',
    subCategory: 'Fresh Herbs & Chillies',
    price: 0.79,
    pricePence: 79,
    unit: 'Large Bunch',
    brand: 'Aheed Fresh Market',
    rating: 4.8,
    reviewCount: 94,
    image: 'https://images.unsplash.com/photo-1599818817758-c9233630f576?auto=format&fit=crop&w=600&q=80',
    description: 'Aromatic, fragrant vibrant green coriander bunches freshly harvested. Perfect garnish and flavour base for all South Asian dishes.',
    isFresh: true,
    isPopular: true,
    origin: 'UK Local Farms',
    stockCount: 90,
    isAvailable: true,
    dietary: ['Vegetarian', 'Vegan', 'Gluten-Free', 'Halal'],
    storageInfo: 'Keep stem ends in a small glass of water in fridge.',
    ingredients: ['100% Fresh Coriander'],
    allergens: [],
    multiBuyPromo: {
      buyQty: 3,
      promoPrice: 2.00,
      promoLabel: '3 for £2.00'
    },
    variants: [
      { id: 'v-cor-1', name: '1 Large Bunch', weightGrams: 100, price: 0.79, pricePence: 79, unit: '1 Bunch', stockCount: 90, isDefault: true },
      { id: 'v-cor-3', name: '3 Bunches Bundle', weightGrams: 300, price: 2.00, pricePence: 200, unit: '3 Bunches', stockCount: 50 }
    ]
  },
  {
    id: 'prod-prod-4',
    name: 'Brown Onions (Sack / Bag)',
    category: 'fresh-produce',
    subCategory: 'Roots & Onions',
    price: 1.29,
    pricePence: 129,
    unit: '1 kg Bag',
    brand: 'Aheed Fresh Market',
    rating: 4.7,
    reviewCount: 77,
    image: 'https://images.unsplash.com/photo-1618512496248-a07fe83aa8cb?auto=format&fit=crop&w=600&q=80',
    description: 'Firm, dry-skinned golden brown cooking onions. Essential base for rich masala gravies and slow-caramelised biryani toppings.',
    isFresh: true,
    origin: 'UK Farm Assured',
    stockCount: 110,
    isAvailable: true,
    dietary: ['Vegetarian', 'Vegan', 'Gluten-Free', 'Halal'],
    storageInfo: 'Store in a cool, dark and well-ventilated dry pantry.',
    ingredients: ['100% Fresh Brown Onions'],
    allergens: [],
    variants: [
      { id: 'v-on-1kg', name: '1 kg Bag', weightGrams: 1000, price: 1.29, pricePence: 129, unit: '1 kg', stockCount: 110, isDefault: true },
      { id: 'v-on-5kg', name: '5 kg Net Sack', weightGrams: 5000, price: 4.49, pricePence: 449, unit: '5 kg Sack', stockCount: 60 },
      { id: 'v-on-10kg', name: '10 kg Jumbo Sack', weightGrams: 10000, price: 7.99, pricePence: 799, unit: '10 kg Sack', stockCount: 35 }
    ]
  },
  {
    id: 'prod-prod-5',
    name: 'Fresh Karela (Bitter Gourd)',
    category: 'fresh-produce',
    subCategory: 'Desi Vegetables',
    price: 2.99,
    pricePence: 299,
    unit: '500g',
    brand: 'Aheed Fresh Market',
    rating: 4.6,
    reviewCount: 45,
    image: 'https://images.unsplash.com/photo-1597362925123-77861d3fbac7?auto=format&fit=crop&w=600&q=80',
    description: 'Fresh, crunchy deep green bitter gourds. Famous for traditional stuffed karela, crispy fry-ups, and natural health benefits.',
    isFresh: true,
    isApproximateWeight: true,
    origin: 'Kenya / India Air Freight',
    stockCount: 30,
    isAvailable: true,
    dietary: ['Vegetarian', 'Vegan', 'Gluten-Free', 'Halal'],
    storageInfo: 'Refrigerate in produce drawer up to 5 days.',
    ingredients: ['100% Fresh Bitter Gourd'],
    allergens: [],
    variants: [
      { id: 'v-kar-500g', name: '500g Bag', weightGrams: 500, price: 2.99, pricePence: 299, unit: '500g', stockCount: 30, isDefault: true },
      { id: 'v-kar-1kg', name: '1 kg Bag', weightGrams: 1000, price: 5.49, pricePence: 549, unit: '1 kg', stockCount: 15 }
    ]
  },

  // --- GROCERIES & RICE (Group 1, 2, 5) ---
  {
    id: 'prod-groc-1',
    name: 'Laila Superior Extra Long Basmati Rice',
    category: 'groceries',
    subCategory: 'Basmati Rice',
    price: 6.49,
    pricePence: 649,
    originalPrice: 7.99,
    isOffer: true,
    unit: '2 kg Bag',
    brand: 'Laila',
    rating: 4.9,
    reviewCount: 284,
    image: 'https://images.unsplash.com/photo-1586201375761-83865001e31c?auto=format&fit=crop&w=600&q=80',
    description: 'Naturally aged Himalayan extra-long grain basmati rice. Fluffy, non-sticky, with delicate fragrance. The premier choice for royal biryanis and pilafs.',
    isPopular: true,
    isBestSeller: true,
    origin: 'Himalayan Foothills, Punjab',
    stockCount: 95,
    isAvailable: true,
    dietary: ['Vegetarian', 'Vegan', 'Gluten-Free', 'Halal'],
    storageInfo: 'Store in an airtight container in a cool, dry place.',
    ingredients: ['100% Pure Aged Basmati Rice'],
    allergens: [],
    variants: [
      { id: 'v-rice-1kg', name: '1 kg Bag', weightGrams: 1000, price: 3.49, pricePence: 349, unit: '1 kg', stockCount: 50 },
      { id: 'v-rice-2kg', name: '2 kg Bag', weightGrams: 2000, price: 6.49, pricePence: 649, unit: '2 kg', stockCount: 95, isDefault: true },
      { id: 'v-rice-5kg', name: '5 kg Sack (Zipper)', weightGrams: 5000, price: 14.99, pricePence: 1499, unit: '5 kg Sack', stockCount: 40 },
      { id: 'v-rice-10kg', name: '10 kg Master Sack', weightGrams: 10000, price: 27.99, pricePence: 2799, unit: '10 kg Sack', stockCount: 25 },
      { id: 'v-rice-20kg', name: '20 kg Catering Sack', weightGrams: 20000, price: 51.99, pricePence: 5199, unit: '20 kg Sack', stockCount: 10 }
    ],
    reviews: [
      { id: 'r5', author: 'Nadia B.', rating: 5, date: '4 days ago', comment: 'Grains double in length when cooked. Perfect aroma for biryani.', verified: true }
    ]
  },
  {
    id: 'prod-groc-2',
    name: 'Elephant Atta Medium Chapatti Flour',
    category: 'groceries',
    subCategory: 'Flours & Atta',
    price: 8.99,
    pricePence: 899,
    unit: '10 kg Sack',
    brand: 'Elephant Atta',
    rating: 4.8,
    reviewCount: 167,
    image: 'https://images.unsplash.com/photo-1509440159596-0249088772ff?auto=format&fit=crop&w=600&q=80',
    description: 'Milled from high quality wheat, Elephant Atta Medium is naturally high in fibre and low in salt. Produces soft, fluffy, golden rotis and parathas every time.',
    isPopular: true,
    isBestSeller: true,
    origin: 'UK Milled',
    stockCount: 54,
    isAvailable: true,
    dietary: ['Vegetarian', 'Vegan', 'Halal'],
    storageInfo: 'Store in a cool dry place. Transfer to a sealed tin once opened.',
    ingredients: ['Wheat Flour', 'Calcium Carbonate', 'Iron', 'Niacin', 'Thiamin'],
    allergens: ['Gluten (Wheat)'],
    variants: [
      { id: 'v-atta-5kg', name: '5 kg Sack', weightGrams: 5000, price: 4.99, pricePence: 499, unit: '5 kg', stockCount: 30 },
      { id: 'v-atta-10kg', name: '10 kg Sack', weightGrams: 10000, price: 8.99, pricePence: 899, unit: '10 kg', stockCount: 54, isDefault: true },
      { id: 'v-atta-25kg', name: '25 kg Jumbo Sack', weightGrams: 25000, price: 19.99, pricePence: 1999, unit: '25 kg', stockCount: 12 }
    ]
  },
  {
    id: 'prod-groc-3',
    name: 'Shan Bombay Biryani Recipe & Seasoning Mix',
    category: 'groceries',
    subCategory: 'Spices & Masalas',
    price: 1.25,
    pricePence: 125,
    unit: '60g Pack',
    brand: 'Shan Foods',
    rating: 4.9,
    reviewCount: 310,
    image: 'https://images.unsplash.com/photo-1596040033229-a9821ebd058d?auto=format&fit=crop&w=600&q=80',
    description: 'The iconic spice blend for authentic Bombay style layered meat & potato biryani. Sealed in foil pouches to lock in rich aroma.',
    isPopular: true,
    origin: 'Pakistan',
    stockCount: 180,
    isAvailable: true,
    dietary: ['Vegetarian', 'Halal'],
    storageInfo: 'Store in a dry cupboard away from direct sunlight.',
    ingredients: ['Salt', 'Red Chilli', 'Dried Plums with Pits', 'Fenugreek', 'Cinnamon', 'Clove', 'Cardamom', 'Mace', 'Nutmeg', 'Garlic', 'Ginger', 'Paprika'],
    allergens: ['May contain traces of Mustard and Gluten'],
    multiBuyPromo: {
      buyQty: 4,
      promoPrice: 4.00,
      promoLabel: '4 for £4.00'
    },
    variants: [
      { id: 'v-shan-single', name: 'Single 60g Pack', weightGrams: 60, price: 1.25, pricePence: 125, unit: '60g', stockCount: 180, isDefault: true },
      { id: 'v-shan-box6', name: 'Box of 6 Packs (Value Pack)', weightGrams: 360, price: 6.00, pricePence: 600, unit: 'Pack of 6', stockCount: 40 }
    ]
  },
  {
    id: 'prod-groc-4',
    name: 'KTC Pure Butter Ghee (Desi Ghee Tin)',
    category: 'groceries',
    subCategory: 'Ghee & Cooking Oils',
    price: 5.99,
    pricePence: 599,
    unit: '500g Tin',
    brand: 'KTC',
    rating: 4.8,
    reviewCount: 88,
    image: 'https://images.unsplash.com/photo-1589927986089-35812388d1f4?auto=format&fit=crop&w=600&q=80',
    description: 'Traditional clarified golden butter ghee with rich nutty aroma. Perfect for frying samosas, tempering daal tadka, and brushing warm naans.',
    origin: 'UK Produced',
    stockCount: 46,
    isAvailable: true,
    dietary: ['Vegetarian', 'Gluten-Free', 'Halal'],
    storageInfo: 'Store in a cool dry place. Does not require refrigeration after opening.',
    ingredients: ['100% Pure Milk Fat (Butter Ghee)'],
    allergens: ['Milk (Dairy)'],
    variants: [
      { id: 'v-ghee-500g', name: '500g Tin', weightGrams: 500, price: 5.99, pricePence: 599, unit: '500g', stockCount: 46, isDefault: true },
      { id: 'v-ghee-1kg', name: '1 kg Tin', weightGrams: 1000, price: 10.99, pricePence: 1099, unit: '1 kg', stockCount: 30 },
      { id: 'v-ghee-2kg', name: '2 kg Big Tin', weightGrams: 2000, price: 19.99, pricePence: 1999, unit: '2 kg', stockCount: 15 }
    ]
  },
  {
    id: 'prod-groc-5',
    name: 'TRS Red Split Lentils (Masoor Dal)',
    category: 'groceries',
    subCategory: 'Lentils & Daal',
    price: 2.29,
    pricePence: 229,
    unit: '1 kg Bag',
    brand: 'TRS',
    rating: 4.8,
    reviewCount: 65,
    image: 'https://images.unsplash.com/photo-1515543237350-b3eea1ec8082?auto=format&fit=crop&w=600&q=80',
    description: 'Premium quality washed red split lentils. Quick cooking, protein-rich, and creamy when simmered with garlic, cumin, and fresh ghee tadka.',
    origin: 'Canada / Turkey',
    stockCount: 75,
    isAvailable: true,
    dietary: ['Vegetarian', 'Vegan', 'Gluten-Free', 'Halal'],
    storageInfo: 'Store in an airtight jar in a cool place.',
    ingredients: ['100% Red Split Lentils'],
    allergens: ['Packed in a facility handling Nuts and Mustard'],
    variants: [
      { id: 'v-dal-1kg', name: '1 kg Bag', weightGrams: 1000, price: 2.29, pricePence: 229, unit: '1 kg', stockCount: 75, isDefault: true },
      { id: 'v-dal-2kg', name: '2 kg Bag', weightGrams: 2000, price: 4.29, pricePence: 429, unit: '2 kg', stockCount: 40 }
    ]
  },

  // --- DAIRY & EGGS ---
  {
    id: 'prod-dairy-1',
    name: 'Aani Natural Set Desi Dahi (Yogurt)',
    category: 'dairy-eggs',
    subCategory: 'Desi Yogurt & Dahi',
    price: 1.89,
    pricePence: 189,
    unit: '1 kg Bucket',
    brand: 'Aani',
    rating: 4.8,
    reviewCount: 112,
    image: 'https://images.unsplash.com/photo-1488477181946-6428a0291777?auto=format&fit=crop&w=600&q=80',
    description: 'Traditional thick and creamy whole milk set yogurt. Ideal for marinades, soothing raita with mint, or refreshing sweet lassi.',
    isFresh: true,
    isPopular: true,
    origin: 'UK Dairy Farms',
    stockCount: 60,
    isAvailable: true,
    dietary: ['Vegetarian', 'Gluten-Free', 'Halal'],
    storageInfo: 'Keep refrigerated between 1°C and 5°C. Consume within 4 days of opening.',
    ingredients: ['Pasteurised Whole Milk', 'Live Lactic Yogurt Cultures'],
    allergens: ['Milk (Dairy)'],
    variants: [
      { id: 'v-dahi-500g', name: '500g Tub', weightGrams: 500, price: 1.19, pricePence: 119, unit: '500g', stockCount: 40 },
      { id: 'v-dahi-1kg', name: '1 kg Bucket', weightGrams: 1000, price: 1.89, pricePence: 189, unit: '1 kg', stockCount: 60, isDefault: true },
      { id: 'v-dahi-2kg', name: '2 kg Family Bucket', weightGrams: 2000, price: 3.49, pricePence: 349, unit: '2 kg', stockCount: 25 }
    ]
  },
  {
    id: 'prod-dairy-2',
    name: 'Fresh Farm Grade A Large Free Range Eggs',
    category: 'dairy-eggs',
    subCategory: 'Farm Eggs',
    price: 2.99,
    pricePence: 299,
    unit: 'Dozen (12 Pack)',
    brand: 'Local Farm Assured',
    rating: 4.9,
    reviewCount: 88,
    image: 'https://images.unsplash.com/photo-1516467508483-a7212febe31a?auto=format&fit=crop&w=600&q=80',
    description: 'British Lion quality stamped free-range farm eggs with rich golden yolks. Collected daily from local Buckinghamshire pastures.',
    isFresh: true,
    origin: 'Buckinghamshire, UK',
    stockCount: 70,
    isAvailable: true,
    dietary: ['Vegetarian', 'Gluten-Free', 'Halal'],
    storageInfo: 'Store in egg carton in refrigerator below 5°C.',
    ingredients: ['100% Free Range Hens Eggs'],
    allergens: ['Eggs'],
    variants: [
      { id: 'v-egg-6', name: 'Half Dozen (6 Eggs)', weightGrams: 360, price: 1.69, pricePence: 169, unit: '6 Pack', stockCount: 40 },
      { id: 'v-egg-12', name: '1 Dozen (12 Eggs)', weightGrams: 720, price: 2.99, pricePence: 299, unit: '12 Pack', stockCount: 70, isDefault: true },
      { id: 'v-egg-30', name: 'Catering Tray (30 Eggs)', weightGrams: 1800, price: 6.49, pricePence: 649, unit: '30 Tray', stockCount: 30 }
    ]
  },
  {
    id: 'prod-dairy-3',
    name: 'Fresh Block Desi Paneer (Cooking Cheese)',
    category: 'dairy-eggs',
    subCategory: 'Paneer & Halal Cheese',
    price: 2.79,
    pricePence: 279,
    unit: '450g Block',
    brand: 'Aani',
    rating: 4.7,
    reviewCount: 74,
    image: 'https://images.unsplash.com/photo-1559561853-08451507cbe7?auto=format&fit=crop&w=600&q=80',
    description: 'Firm, fresh non-melting Indian cottage cheese. Does not disintegrate during simmering; absorbs curry and tikka marinades wonderfully.',
    isFresh: true,
    origin: 'UK Dairy',
    stockCount: 35,
    isAvailable: true,
    dietary: ['Vegetarian', 'Gluten-Free', 'Halal'],
    storageInfo: 'Keep refrigerated. Submerge in salted water after opening.',
    ingredients: ['Pasteurised Cow Milk', 'Acid Regulator (Citric Acid)'],
    allergens: ['Milk (Dairy)'],
    variants: [
      { id: 'v-pan-225g', name: '225g Pack', weightGrams: 225, price: 1.59, pricePence: 159, unit: '225g', stockCount: 20 },
      { id: 'v-pan-450g', name: '450g Standard Block', weightGrams: 450, price: 2.79, pricePence: 279, unit: '450g', stockCount: 35, isDefault: true },
      { id: 'v-pan-1kg', name: '1 kg Catering Block', weightGrams: 1000, price: 5.89, pricePence: 589, unit: '1 kg', stockCount: 15 }
    ]
  },

  // --- BEVERAGES ---
  {
    id: 'prod-bev-1',
    name: 'Rubicon Mango Juice Drink',
    category: 'beverages',
    subCategory: 'Exotic Juices & Nectars',
    price: 1.79,
    pricePence: 179,
    unit: '1 Litre Carton',
    brand: 'Rubicon',
    rating: 4.9,
    reviewCount: 230,
    image: 'https://images.unsplash.com/photo-1534353473418-4cfa6c56fd38?auto=format&fit=crop&w=600&q=80',
    description: 'Rich, luscious Alphonso mango juice drink made with handpicked ripe Alphonso mango puree. Best served icy cold.',
    isPopular: true,
    isBestSeller: true,
    origin: 'UK / India',
    stockCount: 140,
    isAvailable: true,
    dietary: ['Vegetarian', 'Vegan', 'Gluten-Free', 'Halal'],
    storageInfo: 'Refrigerate after opening and drink within 4 days.',
    ingredients: ['Water', 'Mango Puree (19%)', 'Sugar', 'Citric Acid', 'Antioxidant (Ascorbic Acid)'],
    allergens: [],
    multiBuyPromo: {
      buyQty: 4,
      promoPrice: 6.00,
      promoLabel: '4 for £6.00'
    },
    variants: [
      { id: 'v-rub-1l', name: '1 Litre Carton', weightGrams: 1000, price: 1.79, pricePence: 179, unit: '1 Litre', stockCount: 140, isDefault: true },
      { id: 'v-rub-case', name: 'Case of 12 x 1L (Party Pack)', weightGrams: 12000, price: 18.99, pricePence: 1899, unit: 'Case of 12', stockCount: 25 }
    ]
  },
  {
    id: 'prod-bev-2',
    name: 'Ahmed Foods Rooh Afza / Rose Syrup',
    category: 'beverages',
    subCategory: 'Syrups & Rooh Afza',
    price: 2.99,
    pricePence: 299,
    unit: '800ml Glass Bottle',
    brand: 'Ahmed Foods',
    rating: 4.8,
    reviewCount: 95,
    image: 'https://images.unsplash.com/photo-1546173159-315724a31696?auto=format&fit=crop&w=600&q=80',
    description: 'Refreshing herbal rose concentrated syrup formulated with herbs, rose water, and cooling natural essences. Perfect in cold milk or falooda.',
    origin: 'Pakistan',
    stockCount: 50,
    isAvailable: true,
    dietary: ['Vegetarian', 'Vegan', 'Halal'],
    storageInfo: 'Store at ambient room temperature. Do not refrigerate bottle.',
    ingredients: ['Sugar', 'Water', 'Distillate of Rose', 'Distillate of Kewra', 'Citric Acid', 'Permitted Food Colours'],
    allergens: [],
    variants: [
      { id: 'v-rooh-800ml', name: '800ml Bottle', weightGrams: 800, price: 2.99, pricePence: 299, unit: '800ml', stockCount: 50, isDefault: true }
    ]
  },

  // --- SNACKS & SWEETS ---
  {
    id: 'prod-snack-1',
    name: 'Haldirams All in One Desi Spicy Nimko Mix',
    category: 'snacks',
    subCategory: 'Desi Nimko & Sev',
    price: 1.99,
    pricePence: 199,
    unit: '200g Pack',
    brand: 'Haldirams',
    rating: 4.8,
    reviewCount: 140,
    image: 'https://images.unsplash.com/photo-1599490659213-e2b9527bd087?auto=format&fit=crop&w=600&q=80',
    description: 'Crunchy blend of chickpea noodles, lentils, peanuts, cashews, raisins, and aromatic spices. The quintessential tea-time savoury snack.',
    isPopular: true,
    origin: 'India',
    stockCount: 80,
    isAvailable: true,
    dietary: ['Vegetarian', 'Halal'],
    storageInfo: 'Store in a cool, dry place. Reseal after opening.',
    ingredients: ['Chickpea Flour', 'Vegetable Oil', 'Peanuts', 'Lentils', 'Cashew Nuts', 'Raisins', 'Spices (Chilli, Black Salt, Cumin)'],
    allergens: ['Peanuts', 'Tree Nuts (Cashew)'],
    multiBuyPromo: {
      buyQty: 3,
      promoPrice: 5.00,
      promoLabel: '3 for £5.00'
    },
    variants: [
      { id: 'v-hald-200g', name: '200g Pack', weightGrams: 200, price: 1.99, pricePence: 199, unit: '200g', stockCount: 80, isDefault: true },
      { id: 'v-hald-400g', name: '400g Big Pack', weightGrams: 400, price: 3.49, pricePence: 349, unit: '400g', stockCount: 45 }
    ]
  },
  {
    id: 'prod-snack-2',
    name: 'Premium Palestinian Medjool Jumbo Dates',
    category: 'snacks',
    subCategory: 'Dates & Dry Fruits',
    price: 6.99,
    pricePence: 699,
    originalPrice: 8.49,
    isOffer: true,
    unit: '900g Box',
    brand: 'Al-Quds Reserve',
    rating: 5.0,
    reviewCount: 160,
    image: 'https://images.unsplash.com/photo-1577069861033-55d04cec4ef5?auto=format&fit=crop&w=600&q=80',
    description: 'Rich, soft, caramel-like jumbo Medjool dates freshly harvested and sorted. 100% ethically sourced premium fruit.',
    isPopular: true,
    origin: 'Jericho, Palestine',
    stockCount: 65,
    isAvailable: true,
    dietary: ['Vegetarian', 'Vegan', 'Gluten-Free', 'Halal'],
    storageInfo: 'Store in a cool dry place or refrigerate for chewy texture.',
    ingredients: ['100% Pure Medjool Dates with stones'],
    allergens: [],
    variants: [
      { id: 'v-date-500g', name: '500g Box', weightGrams: 500, price: 4.29, pricePence: 429, unit: '500g', stockCount: 35 },
      { id: 'v-date-900g', name: '900g Jumbo Box', weightGrams: 900, price: 6.99, pricePence: 699, unit: '900g', stockCount: 65, isDefault: true },
      { id: 'v-date-5kg', name: '5 kg Wholesale Case', weightGrams: 5000, price: 34.99, pricePence: 3499, unit: '5 kg', stockCount: 12 }
    ]
  },

  // --- HOUSEHOLD ---
  {
    id: 'prod-house-1',
    name: 'Dettol Antibacterial Surface Cleanser Spray',
    category: 'household',
    subCategory: 'Cleaning & Detergents',
    price: 1.99,
    pricePence: 199,
    unit: '750ml Spray',
    brand: 'Dettol',
    rating: 4.9,
    reviewCount: 110,
    image: 'https://images.unsplash.com/photo-1583947215259-38e31be8751f?auto=format&fit=crop&w=600&q=80',
    description: 'Kills 99.9% of bacteria and viruses without bleach. Safe for kitchen worktops, butcher prep areas, and food contact surfaces.',
    origin: 'UK',
    stockCount: 75,
    isAvailable: true,
    storageInfo: 'Keep out of reach of children.',
    ingredients: ['Benzalkonium Chloride 0.096% w/w', 'Disinfectant Surfactants'],
    allergens: [],
    variants: [
      { id: 'v-det-750ml', name: '750ml Spray Trigger', weightGrams: 750, price: 1.99, pricePence: 199, unit: '750ml', stockCount: 75, isDefault: true },
      { id: 'v-det-twin', name: 'Twin Pack (2 x 750ml)', weightGrams: 1500, price: 3.49, pricePence: 349, unit: '2 x 750ml', stockCount: 30 }
    ]
  }
];

// --- PARETO GROUP 5: CURATED BUNDLES & PROMOTIONS ---
export const BUNDLES: BundleItem[] = [
  {
    id: 'bundle-meat-box',
    title: 'Weekly Halal Family Meat Box',
    tagline: 'Fresh Chicken Fillets + Baby Lamb Curry Cut + Beef Keema',
    category: 'Halal Meat & Poultry',
    badge: 'Save £4.50 • Most Popular',
    savingsText: 'Save £4.50 vs individual items',
    price: 22.99,
    originalPrice: 27.47,
    image: 'https://images.unsplash.com/photo-1588168333986-5078d3ae3976?auto=format&fit=crop&w=600&q=80',
    items: [
      { name: 'Fresh Halal Chicken Breast Fillets', quantity: '1 kg (Diced)' },
      { name: 'Fresh Halal Baby Lamb Curry Cut', quantity: '1 kg (Bone-in)' },
      { name: 'Fresh Halal Beef Keema (Mince)', quantity: '1 kg (Coarse)' },
    ],
    productIds: ['prod-meat-1', 'prod-meat-2', 'prod-meat-3'],
  },
  {
    id: 'bundle-biryani-master',
    title: 'Desi Biryani Master Box',
    tagline: 'Aged Basmati Rice + Shan Bombay Mix + Pure Desi Ghee + Golden Fried Onions',
    category: 'Groceries & Staples',
    badge: 'Save £3.00 • Chef Choice',
    savingsText: 'Save £3.00 bundle special',
    price: 15.49,
    originalPrice: 18.49,
    image: 'https://images.unsplash.com/photo-1586201375761-83865001e31c?auto=format&fit=crop&w=600&q=80',
    items: [
      { name: 'Laila Extra Long Basmati Rice', quantity: '2 kg Sack' },
      { name: 'Shan Bombay Biryani Spice Mix', quantity: '2 x 60g Packs' },
      { name: 'KTC Pure Butter Ghee Tin', quantity: '500g Tin' },
      { name: 'Fresh Green Finger Chillies & Coriander', quantity: 'Fresh Pack' },
    ],
    productIds: ['prod-groc-1', 'prod-groc-3', 'prod-groc-4', 'prod-prod-2'],
  },
  {
    id: 'bundle-green-essentials',
    title: 'Daily Desi Fresh Produce Pack',
    tagline: 'Vine Tomatoes + Brown Onions + Green Chillies + Fresh Coriander',
    category: 'Fresh Produce',
    badge: 'Save £1.80 • Daily Fresh',
    savingsText: 'Save £1.80 on your weekly greens',
    price: 4.99,
    originalPrice: 6.79,
    image: 'https://images.unsplash.com/photo-1592924357228-91a4daadcfea?auto=format&fit=crop&w=600&q=80',
    items: [
      { name: 'Fresh Vine Ripened Red Tomatoes', quantity: '1 kg' },
      { name: 'Brown Cooking Onions', quantity: '1 kg Bag' },
      { name: 'Fresh Green Finger Chillies', quantity: '200g Pack' },
      { name: 'Fresh Coriander Bunches', quantity: '2 Bunches' },
    ],
    productIds: ['prod-prod-1', 'prod-prod-4', 'prod-prod-2', 'prod-prod-3'],
  },
];
