import React, { useState } from 'react';
import { DOC_ARTICLES } from '../data/docs';
import { DocArticle } from '../types';
import {
  Search,
  BookOpen,
  HelpCircle,
  Truck,
  CreditCard,
  ShoppingBag,
  Award,
  ChevronRight,
  Sparkles,
  ShieldCheck,
  Check
} from 'lucide-react';

export const HelpGuidesView: React.FC = () => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [activeArticle, setActiveArticle] = useState<DocArticle | null>(DOC_ARTICLES[0]);

  // Public customer articles
  const customerArticles = DOC_ARTICLES.filter((art) => art.visibility === 'public');

  const categories = Array.from(new Set(customerArticles.map((a) => a.category)));

  const filteredArticles = customerArticles.filter((art) => {
    const matchesSearch =
      art.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      art.summary.toLowerCase().includes(searchQuery.toLowerCase()) ||
      art.content.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory = selectedCategory === 'all' || art.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  return (
    <div className="max-w-7xl mx-auto px-4 py-8 font-['Poppins',sans-serif]">
      {/* Help Center Hero */}
      <div className="bg-gradient-to-r from-[#1B5E20] to-emerald-800 text-white rounded-3xl p-8 mb-8 shadow-lg">
        <div className="max-w-2xl">
          <span className="bg-amber-400 text-slate-900 text-xs font-bold px-3 py-1 rounded-full uppercase tracking-wider mb-3 inline-block">
            Customer Help Guide & FAQs
          </span>
          <h1 className="text-2xl sm:text-3xl font-extrabold mb-3 leading-tight">
            How can we help your grocery shopping today?
          </h1>
          <p className="text-emerald-100 text-sm mb-6 leading-relaxed">
            Task-oriented guides written in plain English. Learn about guest orders, Stripe payment privacy, Aheed Milton Keynes self-delivery, and earning loyalty rewards.
          </p>

          {/* Search Input */}
          <div className="relative">
            <Search className="w-5 h-5 absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search help topics (e.g. 'guest checkout', 'delivery time', 'loyalty points', 'stripe')"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-white text-slate-900 pl-12 pr-4 py-3 rounded-2xl text-sm font-medium shadow-md focus:outline-none focus:ring-2 focus:ring-amber-400"
            />
          </div>
        </div>
      </div>

      {/* Category Pills */}
      <div className="flex items-center gap-2 overflow-x-auto pb-4 mb-6">
        <button
          type="button"
          onClick={() => setSelectedCategory('all')}
          className={`px-4 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all ${
            selectedCategory === 'all'
              ? 'bg-[#1B5E20] text-white shadow-xs'
              : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
          }`}
        >
          All Topics ({customerArticles.length})
        </button>
        {categories.map((cat) => (
          <button
            key={cat}
            type="button"
            onClick={() => setSelectedCategory(cat)}
            className={`px-4 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all ${
              selectedCategory === cat
                ? 'bg-[#1B5E20] text-white shadow-xs'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* Main Content Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Sidebar Articles List */}
        <div className="lg:col-span-4 space-y-3">
          <h2 className="font-bold text-slate-900 text-sm uppercase tracking-wider mb-2">Help Articles</h2>
          {filteredArticles.length === 0 ? (
            <p className="text-xs text-slate-500 italic p-4 bg-slate-50 rounded-xl">No articles matching search.</p>
          ) : (
            filteredArticles.map((article) => (
              <button
                key={article.id}
                type="button"
                onClick={() => setActiveArticle(article)}
                className={`w-full text-left p-4 rounded-2xl border transition-all flex items-start justify-between gap-3 ${
                  activeArticle?.id === article.id
                    ? 'bg-emerald-50 border-[#1B5E20] ring-1 ring-[#1B5E20]'
                    : 'bg-white border-slate-200 hover:border-slate-300'
                }`}
              >
                <div>
                  <span className="text-[10px] font-extrabold text-[#1B5E20] uppercase tracking-wider">
                    {article.category}
                  </span>
                  <h3 className="font-bold text-slate-900 text-sm mt-0.5">{article.title}</h3>
                  <p className="text-xs text-slate-500 line-clamp-2 mt-1">{article.summary}</p>
                </div>
                <ChevronRight
                  className={`w-4 h-4 shrink-0 mt-1 transition-transform ${
                    activeArticle?.id === article.id ? 'text-[#1B5E20] translate-x-1' : 'text-slate-400'
                  }`}
                />
              </button>
            ))
          )}
        </div>

        {/* Article Content Viewer */}
        <div className="lg:col-span-8 bg-white rounded-3xl border border-slate-200 p-6 sm:p-8 shadow-xs">
          {activeArticle ? (
            <div>
              <div className="flex items-center gap-2 mb-3">
                <span className="bg-emerald-100 text-[#1B5E20] text-xs font-extrabold px-3 py-1 rounded-full">
                  {activeArticle.category}
                </span>
                <span className="text-xs text-slate-400">Updated: {activeArticle.lastUpdated}</span>
              </div>

              <h2 className="text-2xl font-extrabold text-slate-900 mb-4">{activeArticle.title}</h2>

              <div className="prose prose-slate max-w-none text-sm text-slate-700 space-y-4 leading-relaxed border-t border-slate-100 pt-6">
                {activeArticle.content.split('\n\n').map((paragraph, idx) => {
                  if (paragraph.startsWith('# ')) {
                    return null; // Skip main header since displayed above
                  }
                  if (paragraph.startsWith('### ')) {
                    return (
                      <h3 key={idx} className="text-base font-bold text-slate-900 mt-4 mb-2">
                        {paragraph.replace('### ', '')}
                      </h3>
                    );
                  }
                  if (paragraph.startsWith('- ')) {
                    return (
                      <ul key={idx} className="list-disc pl-5 space-y-1">
                        {paragraph.split('\n').map((line, lIdx) => (
                          <li key={lIdx}>{line.replace('- ', '')}</li>
                        ))}
                      </ul>
                    );
                  }
                  return <p key={idx}>{paragraph}</p>;
                })}
              </div>

              {/* Helpful feedback box */}
              <div className="mt-8 pt-6 border-t border-slate-200 flex flex-wrap items-center justify-between gap-4 bg-slate-50 p-4 rounded-2xl">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="w-5 h-5 text-[#1B5E20]" />
                  <span className="text-xs font-bold text-slate-800">Was this article helpful?</span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => alert('Thank you for your feedback!')}
                    className="px-3 py-1.5 bg-white hover:bg-slate-100 text-slate-800 rounded-xl text-xs font-bold border border-slate-200 shadow-2xs"
                  >
                    Yes, thank you
                  </button>
                  <button
                    type="button"
                    onClick={() => alert('Thank you! We will update this guide.')}
                    className="px-3 py-1.5 bg-white hover:bg-slate-100 text-slate-800 rounded-xl text-xs font-bold border border-slate-200 shadow-2xs"
                  >
                    No, I need more help
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div className="text-center py-16 text-slate-400">
              <BookOpen className="w-12 h-12 mx-auto mb-3 text-slate-300" />
              <p className="font-semibold text-slate-600">Select an article from the left sidebar to view help.</p>
            </div>
          )}
        </div>
      </div>

      {/* Common Troubleshooting FAQ Accordion */}
      <div className="mt-12 bg-emerald-50 rounded-3xl p-8 border border-emerald-200">
        <h2 className="text-lg font-bold text-slate-900 mb-6 flex items-center gap-2">
          <HelpCircle className="w-5 h-5 text-[#1B5E20]" />
          Common Grocery Questions & Troubleshooting
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-white p-5 rounded-2xl border border-emerald-100 shadow-2xs">
            <h3 className="font-bold text-slate-900 text-sm mb-2 text-[#1B5E20]">Failed Stripe Payment?</h3>
            <p className="text-xs text-slate-600 leading-relaxed">
              Double check your postcode matches your card billing address. If payments fail, your cart remains saved so you won't lose your selected produce.
            </p>
          </div>

          <div className="bg-white p-5 rounded-2xl border border-emerald-100 shadow-2xs">
            <h3 className="font-bold text-slate-900 text-sm mb-2 text-[#1B5E20]">Missing an Item or Wrong Cut?</h3>
            <p className="text-xs text-slate-600 leading-relaxed">
              Our in-house butcher team calls you directly if a specific meat cut is unavailable before dispatching. You can request a instant refund or replacement.
            </p>
          </div>

          <div className="bg-white p-5 rounded-2xl border border-emerald-100 shadow-2xs">
            <h3 className="font-bold text-slate-900 text-sm mb-2 text-[#1B5E20]">Milton Keynes Postcode Coverage</h3>
            <p className="text-xs text-slate-600 leading-relaxed">
              We deliver locally across Milton Keynes postcodes MK1, MK2, MK3, MK4, MK5, MK6, MK9, MK10, MK14, and Bletchley/Wolverton/Newport Pagnell. Delivery fee is £2.99 or FREE over £35.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
