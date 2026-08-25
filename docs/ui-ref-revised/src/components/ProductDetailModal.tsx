import React, { useState } from 'react';
import { Product, ProductVariant, MeatCutType, MeatPrepType, SubstitutionPreference, CartItem } from '../types';
import {
  X,
  Star,
  ShieldCheck,
  MapPin,
  Plus,
  Minus,
  Check,
  ShoppingBag,
  Scale,
  Sparkles,
  AlertCircle,
  Clock,
  Heart,
  CheckCircle2,
  ChevronRight,
  MessageSquare
} from 'lucide-react';

interface ProductDetailModalProps {
  product: Product | null;
  onClose: () => void;
  onAddToCart: (
    product: Product,
    quantity: number,
    selectedVariant?: ProductVariant,
    selectedCut?: MeatCutType,
    selectedPrep?: MeatPrepType,
    customButcherNotes?: string,
    substitutionPreference?: SubstitutionPreference
  ) => void;
  allProducts: Product[];
  onOpenOtherProduct?: (product: Product) => void;
  isWishlisted?: boolean;
  onToggleWishlist?: (productId: string) => void;
}

export const ProductDetailModal: React.FC<ProductDetailModalProps> = ({
  product,
  onClose,
  onAddToCart,
  allProducts,
  onOpenOtherProduct,
  isWishlisted = false,
  onToggleWishlist,
}) => {
  const [selectedVariant, setSelectedVariant] = useState<ProductVariant | undefined>(
    product?.variants?.find((v) => v.isDefault) || product?.variants?.[0]
  );
  const [selectedCut, setSelectedCut] = useState<MeatCutType | undefined>(
    product?.availableCuts?.[0]
  );
  const [selectedPrep, setSelectedPrep] = useState<MeatPrepType | undefined>(
    product?.availablePreps?.[0]
  );
  const [customButcherNotes, setCustomButcherNotes] = useState('');
  const [substitutionPreference, setSubstitutionPreference] = useState<SubstitutionPreference>('best_match');
  const [quantity, setQuantity] = useState(1);
  const [activeTab, setActiveTab] = useState<'details' | 'nutrition' | 'reviews'>('details');
  const [reviewAuthor, setReviewAuthor] = useState('');
  const [reviewComment, setReviewComment] = useState('');
  const [reviewRating, setReviewRating] = useState(5);
  const [reviewSubmitted, setReviewSubmitted] = useState(false);

  // Sync state when product changes
  React.useEffect(() => {
    if (product) {
      setSelectedVariant(product.variants?.find((v) => v.isDefault) || product.variants?.[0]);
      setSelectedCut(product.availableCuts?.[0]);
      setSelectedPrep(product.availablePreps?.[0]);
      setCustomButcherNotes('');
      setQuantity(1);
      setActiveTab('details');
      setReviewSubmitted(false);
    }
  }, [product]);

  if (!product) return null;

  const currentPrice = selectedVariant ? selectedVariant.price : product.price;
  const currentUnit = selectedVariant ? selectedVariant.unit : product.unit;
  const totalPrice = currentPrice * quantity;
  const isOutOfStock = !product.isAvailable || product.stockCount <= 0;

  // Frequently bought together product (pairing)
  const pairedProduct = allProducts.find(
    (p) => p.id !== product.id && (
      (product.category === 'halal-meat' && p.id === 'prod-groc-3') || // Shan Masala
      (product.category === 'groceries' && p.id === 'prod-groc-4') || // Ghee
      (product.category === 'fresh-produce' && p.id === 'prod-prod-2') || // Chillies
      p.isPopular
    )
  );

  const handleAddBundlePair = () => {
    if (!pairedProduct) return;
    // Add current product
    onAddToCart(product, quantity, selectedVariant, selectedCut, selectedPrep, customButcherNotes, substitutionPreference);
    // Add paired product
    onAddToCart(pairedProduct, 1);
    onClose();
  };

  const handleAddReview = (e: React.FormEvent) => {
    e.preventDefault();
    if (!reviewAuthor.trim() || !reviewComment.trim()) return;
    if (!product.reviews) product.reviews = [];
    product.reviews.unshift({
      id: `rev-${Date.now()}`,
      author: reviewAuthor,
      rating: reviewRating,
      date: 'Just now',
      comment: reviewComment,
      verified: true,
    });
    product.reviewCount += 1;
    setReviewSubmitted(true);
    setReviewAuthor('');
    setReviewComment('');
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/70 backdrop-blur-xs animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-2xl bg-white rounded-3xl shadow-2xl overflow-hidden border border-slate-200 flex flex-col max-h-[92vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top Header Actions */}
        <div className="absolute top-4 right-4 z-20 flex items-center gap-2">
          {onToggleWishlist && (
            <button
              type="button"
              onClick={() => onToggleWishlist(product.id)}
              className={`w-9 h-9 rounded-full shadow-md flex items-center justify-center transition-transform hover:scale-105 ${
                isWishlisted
                  ? 'bg-rose-50 text-rose-500'
                  : 'bg-white/90 text-slate-600 hover:text-rose-500'
              }`}
            >
              <Heart className={`w-4 h-4 ${isWishlisted ? 'fill-rose-500' : ''}`} />
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            className="w-9 h-9 rounded-full bg-white/90 hover:bg-white text-slate-700 shadow-md flex items-center justify-center transition-transform hover:scale-105"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Hero Image */}
        <div className="relative aspect-16/9 bg-slate-100 w-full overflow-hidden shrink-0">
          <img
            src={product.image}
            alt={product.name}
            className="w-full h-full object-cover"
          />
          <div className="absolute top-4 left-4 flex flex-wrap gap-1.5 max-w-[70%]">
            {product.isHalal && (
              <span className="bg-[#1B5E20] text-white text-xs font-bold px-2.5 py-1 rounded-full shadow-md flex items-center gap-1">
                <ShieldCheck className="w-3.5 h-3.5" /> 100% Certified HMC Halal
              </span>
            )}
            {product.isFresh && (
              <span className="bg-emerald-600 text-white text-xs font-bold px-2.5 py-1 rounded-full shadow-md">
                Daily Fresh Farm
              </span>
            )}
            {product.isOffer && (
              <span className="bg-[#F57C00] text-white text-xs font-bold px-2.5 py-1 rounded-full shadow-md">
                Special Offer
              </span>
            )}
          </div>
        </div>

        {/* Modal Scrollable Body */}
        <div className="p-5 sm:p-6 overflow-y-auto space-y-5 flex-1">
          {/* Title & Brand Header */}
          <div>
            <div className="flex items-center justify-between text-xs text-slate-500 mb-1">
              <span className="font-bold text-emerald-800 tracking-wider text-xs">
                {product.brand || 'Aheed Cultural Groceries'}
              </span>
              {product.origin && (
                <span className="flex items-center gap-1 text-slate-500 font-medium">
                  <MapPin className="w-3.5 h-3.5 text-emerald-600" />
                  Origin: {product.origin}
                </span>
              )}
            </div>

            <h2 className="text-xl sm:text-2xl font-extrabold text-slate-900 leading-tight">
              {product.name}
            </h2>

            {/* Ratings & Subcategory */}
            <div className="flex items-center gap-3 mt-2 text-xs">
              <div className="flex items-center gap-1 text-amber-500 font-bold">
                <Star className="w-4 h-4 fill-amber-400 text-amber-400" />
                <span>{product.rating.toFixed(1)}</span>
              </div>
              <span className="text-slate-400">({product.reviewCount} customer reviews)</span>
              {product.subCategory && (
                <span className="bg-slate-100 text-slate-700 px-2 py-0.5 rounded-md font-medium text-[11px]">
                  {product.subCategory}
                </span>
              )}
            </div>
          </div>

          {/* Tab Navigation */}
          <div className="flex border-b border-slate-200 gap-4 text-xs font-bold">
            <button
              type="button"
              onClick={() => setActiveTab('details')}
              className={`pb-2 border-b-2 transition-colors ${
                activeTab === 'details'
                  ? 'border-[#1B5E20] text-[#1B5E20]'
                  : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              Product & Cuts
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('nutrition')}
              className={`pb-2 border-b-2 transition-colors ${
                activeTab === 'nutrition'
                  ? 'border-[#1B5E20] text-[#1B5E20]'
                  : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              Ingredients & Allergens
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('reviews')}
              className={`pb-2 border-b-2 transition-colors ${
                activeTab === 'reviews'
                  ? 'border-[#1B5E20] text-[#1B5E20]'
                  : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              Customer Reviews ({product.reviews?.length || product.reviewCount})
            </button>
          </div>

          {/* TAB 1: PRODUCT, VARIANTS, CUTS & BUTCHER NOTES */}
          {activeTab === 'details' && (
            <div className="space-y-4">
              {/* Description */}
              <p className="text-xs sm:text-sm text-slate-600 leading-relaxed bg-slate-50 p-3.5 rounded-2xl border border-slate-200/80">
                {product.description}
              </p>

              {/* Approximate Weight Messaging */}
              {product.isApproximateWeight && (
                <div className="bg-amber-50/80 border border-amber-200 rounded-2xl p-3 text-xs text-amber-900 flex items-start gap-2.5">
                  <Scale className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                  <div>
                    <p className="font-bold text-amber-950">Approximate Weight Notice</p>
                    <p className="text-[11px] text-amber-800 mt-0.5 leading-normal">
                      {product.approxWeightMsg || 'Sold by approximate weight. Our master butcher weighs to order on calibrated scales. Final balance is confirmed upon packing.'}
                    </p>
                  </div>
                </div>
              )}

              {/* Group 2: Weight & Size Variant Selector */}
              {product.variants && product.variants.length > 0 && (
                <div className="space-y-2">
                  <label className="block text-xs font-bold text-slate-800">
                    Select Weight / Pack Size:
                  </label>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {product.variants.map((v) => {
                      const isSelected = selectedVariant?.id === v.id;
                      return (
                        <button
                          key={v.id}
                          type="button"
                          onClick={() => setSelectedVariant(v)}
                          className={`p-2.5 rounded-xl border text-left transition-all ${
                            isSelected
                              ? 'border-[#1B5E20] bg-emerald-50 text-emerald-950 ring-2 ring-emerald-500/20 shadow-xs'
                              : 'border-slate-200 hover:border-slate-300 bg-white text-slate-700'
                          }`}
                        >
                          <div className="font-bold text-xs">{v.name}</div>
                          <div className="text-xs font-extrabold text-[#1B5E20] mt-0.5">
                            £{v.price.toFixed(2)}
                          </div>
                          {v.weightGrams && (
                            <div className="text-[10px] text-slate-400">
                              £{((v.price / v.weightGrams) * 1000).toFixed(2)}/kg
                            </div>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Group 4: Meat Cuts Selection */}
              {product.availableCuts && product.availableCuts.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="block text-xs font-bold text-slate-800">
                      Butcher Cut Selection:
                    </label>
                    <span className="text-[10px] text-slate-500">Freshly cut on butcher block</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    {product.availableCuts.map((cut) => {
                      const isSelected = selectedCut === cut;
                      return (
                        <button
                          key={cut}
                          type="button"
                          onClick={() => setSelectedCut(cut)}
                          className={`p-2 rounded-xl border text-left text-xs transition-all flex items-center justify-between ${
                            isSelected
                              ? 'border-red-600 bg-red-50 text-red-950 font-bold ring-2 ring-red-500/20'
                              : 'border-slate-200 hover:border-slate-300 bg-white text-slate-700'
                          }`}
                        >
                          <span>{cut}</span>
                          {isSelected && <Check className="w-3.5 h-3.5 text-red-600" />}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Group 4: Preparation Style */}
              {product.availablePreps && product.availablePreps.length > 0 && (
                <div className="space-y-2">
                  <label className="block text-xs font-bold text-slate-800">
                    Preparation & Cleaning Style:
                  </label>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {product.availablePreps.map((prep) => {
                      const isSelected = selectedPrep === prep;
                      return (
                        <button
                          key={prep}
                          type="button"
                          onClick={() => setSelectedPrep(prep)}
                          className={`p-2 rounded-xl border text-left text-[11px] transition-all ${
                            isSelected
                              ? 'border-[#1B5E20] bg-emerald-50 text-emerald-950 font-bold'
                              : 'border-slate-200 hover:border-slate-300 bg-white text-slate-700'
                          }`}
                        >
                          {prep}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Custom Butcher Notes */}
              {product.isMeat && (
                <div className="space-y-1.5">
                  <label className="block text-xs font-bold text-slate-800">
                    Custom Butcher Instructions (Optional):
                  </label>
                  <input
                    type="text"
                    value={customButcherNotes}
                    onChange={(e) => setCustomButcherNotes(e.target.value)}
                    placeholder="e.g. Cut into small curry pieces, remove all chicken skin, trim fat"
                    className="w-full text-xs px-3 py-2 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-slate-50 focus:bg-white"
                    maxLength={120}
                  />
                </div>
              )}

              {/* Group 4: Substitution Preference for this Item */}
              <div className="space-y-1.5 bg-slate-50 p-3 rounded-2xl border border-slate-200">
                <label className="block text-xs font-bold text-slate-800">
                  Item Substitution Preference:
                </label>
                <div className="grid grid-cols-3 gap-2 text-[11px]">
                  <button
                    type="button"
                    onClick={() => setSubstitutionPreference('best_match')}
                    className={`p-2 rounded-lg border text-center transition-all ${
                      substitutionPreference === 'best_match'
                        ? 'border-emerald-600 bg-emerald-100/70 font-bold text-emerald-900'
                        : 'border-slate-200 bg-white text-slate-600'
                    }`}
                  >
                    Best Match
                  </button>
                  <button
                    type="button"
                    onClick={() => setSubstitutionPreference('contact_me')}
                    className={`p-2 rounded-lg border text-center transition-all ${
                      substitutionPreference === 'contact_me'
                        ? 'border-emerald-600 bg-emerald-100/70 font-bold text-emerald-900'
                        : 'border-slate-200 bg-white text-slate-600'
                    }`}
                  >
                    Call / WhatsApp Me
                  </button>
                  <button
                    type="button"
                    onClick={() => setSubstitutionPreference('no_substitute')}
                    className={`p-2 rounded-lg border text-center transition-all ${
                      substitutionPreference === 'no_substitute'
                        ? 'border-emerald-600 bg-emerald-100/70 font-bold text-emerald-900'
                        : 'border-slate-200 bg-white text-slate-600'
                    }`}
                  >
                    Refund If Out
                  </button>
                </div>
              </div>

              {/* Frequently Bought Together Upsell */}
              {pairedProduct && (
                <div className="bg-linear-to-r from-emerald-50 to-amber-50 p-3.5 rounded-2xl border border-emerald-200/80 space-y-2">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-950">
                    <Sparkles className="w-4 h-4 text-amber-500" />
                    <span>Frequently Bought Together:</span>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2.5">
                      <img
                        src={pairedProduct.image}
                        alt={pairedProduct.name}
                        className="w-12 h-12 rounded-xl object-cover border border-slate-200"
                      />
                      <div>
                        <div className="text-xs font-bold text-slate-900 line-clamp-1">
                          {pairedProduct.name}
                        </div>
                        <div className="text-xs font-extrabold text-[#1B5E20]">
                          + £{pairedProduct.price.toFixed(2)}
                        </div>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={handleAddBundlePair}
                      className="bg-slate-900 hover:bg-black text-white text-xs font-bold px-3 py-2 rounded-xl shadow-xs shrink-0"
                    >
                      Add Both to Basket
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 2: INGREDIENTS, ALLERGENS, HALAL & NUTRITION */}
          {activeTab === 'nutrition' && (
            <div className="space-y-4 text-xs">
              {/* Halal Guarantee */}
              {product.isHalal && (
                <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-3.5 space-y-1">
                  <div className="flex items-center gap-1.5 font-bold text-emerald-950">
                    <ShieldCheck className="w-4 h-4 text-[#1B5E20]" />
                    <span>100% Certified HMC Halal Guarantee</span>
                  </div>
                  <p className="text-emerald-900 text-[11px] leading-relaxed">
                    {product.halalCertInfo || 'Inspected and certified by the Halal Monitoring Committee (HMC). Stun-free traditional slaughter by practicing Muslim slaughtermen.'}
                  </p>
                </div>
              )}

              {/* Allergens Warning */}
              <div className="bg-slate-50 border border-slate-200 rounded-2xl p-3.5 space-y-2">
                <div className="flex items-center gap-1.5 font-bold text-slate-900">
                  <AlertCircle className="w-4 h-4 text-amber-600" />
                  <span>Allergen Information</span>
                </div>
                {product.allergens && product.allergens.length > 0 ? (
                  <div className="flex flex-wrap gap-1.5">
                    {product.allergens.map((alg) => (
                      <span key={alg} className="bg-rose-100 text-rose-900 font-bold px-2 py-0.5 rounded-md text-[11px] border border-rose-200">
                        Contains: {alg}
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className="text-slate-600 text-[11px]">
                    No major allergens present. Free from artificial colourings, preservatives, and GMO ingredients.
                  </p>
                )}
              </div>

              {/* Ingredients List */}
              {product.ingredients && product.ingredients.length > 0 && (
                <div className="space-y-1.5">
                  <h4 className="font-bold text-slate-900">Full Ingredients List:</h4>
                  <p className="text-slate-600 bg-slate-50 p-3 rounded-xl border border-slate-200/80 leading-relaxed text-[11px]">
                    {product.ingredients.join(', ')}
                  </p>
                </div>
              )}

              {/* Nutrition Table */}
              {product.nutrition && (
                <div className="space-y-2">
                  <h4 className="font-bold text-slate-900">Nutritional Values (Typical per 100g):</h4>
                  <div className="grid grid-cols-5 gap-2 text-center">
                    <div className="bg-slate-50 p-2 rounded-xl border border-slate-200">
                      <div className="text-[10px] text-slate-400 font-medium">Energy</div>
                      <div className="text-xs font-bold text-slate-800 mt-0.5">{product.nutrition.calories || 'N/A'}</div>
                    </div>
                    <div className="bg-slate-50 p-2 rounded-xl border border-slate-200">
                      <div className="text-[10px] text-slate-400 font-medium">Protein</div>
                      <div className="text-xs font-bold text-slate-800 mt-0.5">{product.nutrition.protein || 'N/A'}</div>
                    </div>
                    <div className="bg-slate-50 p-2 rounded-xl border border-slate-200">
                      <div className="text-[10px] text-slate-400 font-medium">Fat</div>
                      <div className="text-xs font-bold text-slate-800 mt-0.5">{product.nutrition.fat || 'N/A'}</div>
                    </div>
                    <div className="bg-slate-50 p-2 rounded-xl border border-slate-200">
                      <div className="text-[10px] text-slate-400 font-medium">Carbs</div>
                      <div className="text-xs font-bold text-slate-800 mt-0.5">{product.nutrition.carbs || 'N/A'}</div>
                    </div>
                    <div className="bg-slate-50 p-2 rounded-xl border border-slate-200">
                      <div className="text-[10px] text-slate-400 font-medium">Fiber</div>
                      <div className="text-xs font-bold text-slate-800 mt-0.5">{product.nutrition.fiber || '0g'}</div>
                    </div>
                  </div>
                </div>
              )}

              {/* Storage Instructions */}
              {product.storageInfo && (
                <div className="flex items-start gap-2 bg-slate-50 p-3 rounded-xl border border-slate-200">
                  <Clock className="w-4 h-4 text-slate-500 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-bold text-slate-800">Storage & Freshness: </span>
                    <span className="text-slate-600">{product.storageInfo}</span>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 3: CUSTOMER REVIEWS */}
          {activeTab === 'reviews' && (
            <div className="space-y-4 text-xs">
              {/* Review Form */}
              <form onSubmit={handleAddReview} className="bg-slate-50 p-3.5 rounded-2xl border border-slate-200 space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-slate-900">Leave a Verified Customer Review:</span>
                  <div className="flex items-center gap-1">
                    {[1, 2, 3, 4, 5].map((star) => (
                      <button
                        key={star}
                        type="button"
                        onClick={() => setReviewRating(star)}
                        className="text-amber-400 focus:outline-none"
                      >
                        <Star className={`w-4 h-4 ${reviewRating >= star ? 'fill-amber-400' : 'text-slate-300'}`} />
                      </button>
                    ))}
                  </div>
                </div>
                <input
                  type="text"
                  placeholder="Your Name (e.g. Ayesha K.)"
                  value={reviewAuthor}
                  onChange={(e) => setReviewAuthor(e.target.value)}
                  className="w-full text-xs px-3 py-1.5 rounded-xl border border-slate-200 bg-white"
                  required
                />
                <textarea
                  placeholder="Write your honest review on product quality, cut accuracy, freshness, or taste..."
                  value={reviewComment}
                  onChange={(e) => setReviewComment(e.target.value)}
                  rows={2}
                  className="w-full text-xs px-3 py-1.5 rounded-xl border border-slate-200 bg-white resize-none"
                  required
                />
                <div className="flex justify-between items-center">
                  {reviewSubmitted && (
                    <span className="text-emerald-700 font-bold text-xs flex items-center gap-1">
                      <CheckCircle2 className="w-3.5 h-3.5" /> Review submitted!
                    </span>
                  )}
                  <button
                    type="submit"
                    className="ml-auto bg-[#1B5E20] hover:bg-emerald-800 text-white font-bold px-4 py-1.5 rounded-xl shadow-2xs"
                  >
                    Post Review
                  </button>
                </div>
              </form>

              {/* Reviews List */}
              <div className="space-y-2.5">
                {product.reviews && product.reviews.length > 0 ? (
                  product.reviews.map((rev) => (
                    <div key={rev.id} className="p-3 bg-white rounded-xl border border-slate-200 space-y-1">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5">
                          <span className="font-bold text-slate-900">{rev.author}</span>
                          {rev.verified && (
                            <span className="text-[10px] bg-emerald-50 text-emerald-800 font-semibold px-1.5 py-0.2 rounded border border-emerald-200 flex items-center gap-0.5">
                              <CheckCircle2 className="w-2.5 h-2.5" /> Verified Buyer
                            </span>
                          )}
                        </div>
                        <span className="text-[10px] text-slate-400">{rev.date}</span>
                      </div>
                      <div className="flex items-center gap-1 text-amber-400">
                        {Array.from({ length: rev.rating }).map((_, i) => (
                          <Star key={i} className="w-3 h-3 fill-amber-400" />
                        ))}
                      </div>
                      <p className="text-slate-600 text-xs leading-relaxed">{rev.comment}</p>
                    </div>
                  ))
                ) : (
                  <div className="text-center py-4 text-slate-400">
                    <MessageSquare className="w-8 h-8 mx-auto text-slate-300 mb-1" />
                    <p>No customer reviews yet. Be the first to review this product!</p>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Modal Bottom Bar: Price & Add to Cart */}
        <div className="p-4 sm:p-5 bg-slate-50 border-t border-slate-200 flex items-center justify-between gap-3 shrink-0">
          <div>
            <div className="text-[11px] text-slate-500 font-medium">Total Selected:</div>
            <div className="flex items-baseline gap-1.5">
              <span className="text-xl sm:text-2xl font-extrabold text-[#1B5E20]">
                £{totalPrice.toFixed(2)}
              </span>
              <span className="text-xs text-slate-500">
                ({quantity} × £{currentPrice.toFixed(2)} / {currentUnit})
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Quantity Stepper */}
            {!isOutOfStock && (
              <div className="flex items-center bg-white border border-slate-300 rounded-2xl p-1 shadow-2xs">
                <button
                  type="button"
                  onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                  className="w-8 h-8 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold flex items-center justify-center transition-colors"
                >
                  <Minus className="w-4 h-4" />
                </button>
                <span className="w-8 text-center font-bold text-sm text-slate-900">
                  {quantity}
                </span>
                <button
                  type="button"
                  onClick={() => setQuantity((q) => q + 1)}
                  className="w-8 h-8 rounded-xl bg-[#1B5E20] hover:bg-emerald-800 text-white font-bold flex items-center justify-center transition-colors shadow-2xs"
                >
                  <Plus className="w-4 h-4" />
                </button>
              </div>
            )}

            {/* Add Button */}
            {isOutOfStock ? (
              <button
                type="button"
                disabled
                className="bg-slate-300 text-slate-500 font-bold text-sm px-6 py-3 rounded-2xl cursor-not-allowed"
              >
                Out of Stock
              </button>
            ) : (
              <button
                type="button"
                onClick={() => {
                  onAddToCart(
                    product,
                    quantity,
                    selectedVariant,
                    selectedCut,
                    selectedPrep,
                    customButcherNotes,
                    substitutionPreference
                  );
                  onClose();
                }}
                className="bg-[#1B5E20] hover:bg-emerald-800 text-white font-bold text-sm px-6 py-3 rounded-2xl shadow-md hover:shadow-lg transition-all active:scale-95 flex items-center gap-2"
              >
                <ShoppingBag className="w-4 h-4" />
                <span>Add to Basket</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
