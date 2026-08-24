import React from 'react';
import {
  Palette,
  Type,
  Layout,
  CheckCircle2,
  ShieldCheck,
  Server,
  Layers,
  BookOpen,
  Sparkles,
  Zap,
  Globe,
  Database,
  Code
} from 'lucide-react';

export const BrandGuideView: React.FC = () => {
  return (
    <div className="max-w-7xl mx-auto px-4 py-8 space-y-10">
      {/* Page Title */}
      <div className="bg-[#1B5E20] text-white p-8 rounded-3xl shadow-lg border border-emerald-700/50">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <span className="bg-emerald-800 text-emerald-200 text-xs font-bold px-3 py-1 rounded-full uppercase tracking-wider">
              Document Synthesis & Style Guide
            </span>
            <h1 className="text-3xl font-extrabold mt-2 tracking-tight">
              Aheed Food Centre — Brand Identity & SDD System
            </h1>
            <p className="text-emerald-100 text-sm max-w-2xl mt-1">
              Consolidated specification, visual brand guide, hex palette, and pivoted serverless architecture documentation.
            </p>
          </div>

          <div className="bg-emerald-900/80 border border-emerald-600/50 p-4 rounded-2xl text-xs space-y-1">
            <p className="text-amber-300 font-bold">Status: Milestone 0 Proven</p>
            <p className="text-emerald-200">Stack: Cloudflare Workers + Neon PostgreSQL</p>
            <p className="text-emerald-200">Governance: 4-Gate SDD Process</p>
          </div>
        </div>
      </div>

      {/* SECTION 1: COLOR PALETTE (From Uploaded Sheet Panel 02) */}
      <section className="space-y-4">
        <div className="flex items-center gap-2 border-b border-slate-200 pb-2">
          <Palette className="w-5 h-5 text-[#1B5E20]" />
          <h2 className="text-lg font-extrabold text-slate-900 uppercase tracking-wide">
            02 Color Palette & Swatches
          </h2>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3">
          <div className="bg-white rounded-2xl p-3 border border-slate-200 shadow-2xs space-y-2">
            <div className="h-16 rounded-xl bg-[#1B5E20] shadow-inner" />
            <div>
              <p className="font-bold text-xs text-slate-900">Primary Green</p>
              <p className="text-[11px] font-mono text-slate-500">#1B5E20</p>
            </div>
          </div>

          <div className="bg-white rounded-2xl p-3 border border-slate-200 shadow-2xs space-y-2">
            <div className="h-16 rounded-xl bg-[#4CAF50] shadow-inner" />
            <div>
              <p className="font-bold text-xs text-slate-900">Leaf Green</p>
              <p className="text-[11px] font-mono text-slate-500">#4CAF50</p>
            </div>
          </div>

          <div className="bg-white rounded-2xl p-3 border border-slate-200 shadow-2xs space-y-2">
            <div className="h-16 rounded-xl bg-[#F57C00] shadow-inner" />
            <div>
              <p className="font-bold text-xs text-slate-900">Accent Orange</p>
              <p className="text-[11px] font-mono text-slate-500">#F57C00</p>
            </div>
          </div>

          <div className="bg-white rounded-2xl p-3 border border-slate-200 shadow-2xs space-y-2">
            <div className="h-16 rounded-xl bg-[#D32F2F] shadow-inner" />
            <div>
              <p className="font-bold text-xs text-slate-900">Accent Red</p>
              <p className="text-[11px] font-mono text-slate-500">#D32F2F</p>
            </div>
          </div>

          <div className="bg-white rounded-2xl p-3 border border-slate-200 shadow-2xs space-y-2">
            <div className="h-16 rounded-xl bg-[#E8F5E9] border border-slate-200 shadow-inner" />
            <div>
              <p className="font-bold text-xs text-slate-900">Light Green</p>
              <p className="text-[11px] font-mono text-slate-500">#E8F5E9</p>
            </div>
          </div>

          <div className="bg-white rounded-2xl p-3 border border-slate-200 shadow-2xs space-y-2">
            <div className="h-16 rounded-xl bg-[#212121] shadow-inner" />
            <div>
              <p className="font-bold text-xs text-slate-900">Text Dark</p>
              <p className="text-[11px] font-mono text-slate-500">#212121</p>
            </div>
          </div>
        </div>
      </section>

      {/* SECTION 2: TYPOGRAPHY (From Uploaded Sheet Panel 03) */}
      <section className="space-y-4">
        <div className="flex items-center gap-2 border-b border-slate-200 pb-2">
          <Type className="w-5 h-5 text-[#1B5E20]" />
          <h2 className="text-lg font-extrabold text-slate-900 uppercase tracking-wide">
            03 Typography & Type Scale
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 bg-white p-6 rounded-3xl border border-slate-200 shadow-2xs">
          <div className="space-y-3">
            <div className="border-b pb-2">
              <span className="text-xs text-slate-400 font-mono">POPPOINS SEMIBOLD (Headings)</span>
              <p className="text-2xl font-semibold text-[#1B5E20]">
                Aa Bb Cc Dd Ee Ff Gg Hh 0123456789
              </p>
            </div>
            <div>
              <span className="text-xs text-slate-400 font-mono">POPPINS REGULAR (Body Text)</span>
              <p className="text-sm text-slate-700 leading-relaxed">
                Aheed Food Centre represents freshness, quality, variety and trust. Our brand is friendly, local and community focused.
              </p>
            </div>
          </div>

          <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 text-xs space-y-2">
            <h4 className="font-bold text-slate-900 uppercase">Usage Scale Rules</h4>
            <div className="space-y-1 text-slate-600">
              <p><span className="font-bold text-slate-900">H1:</span> Bold / 32px — Main Section Titles</p>
              <p><span className="font-bold text-slate-900">H2:</span> Semibold / 24px — Component Headers</p>
              <p><span className="font-bold text-slate-900">H3:</span> Semibold / 18px — Card Titles</p>
              <p><span className="font-bold text-slate-900">Body:</span> Regular / 14px — Product Descriptions</p>
              <p><span className="font-bold text-slate-900">Small:</span> Regular / 12px — Badges & Labels</p>
            </div>
          </div>
        </div>
      </section>

      {/* SECTION 3: UI BADGES & CONTROLS (Panel 07) */}
      <section className="space-y-4">
        <div className="flex items-center gap-2 border-b border-slate-200 pb-2">
          <Layout className="w-5 h-5 text-[#1B5E20]" />
          <h2 className="text-lg font-extrabold text-slate-900 uppercase tracking-wide">
            07 UI Badges & Buttons Reference
          </h2>
        </div>

        <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-2xs space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-xs font-bold text-slate-500">Badges & Tags:</span>
            <span className="bg-[#4CAF50] text-white text-xs font-bold px-3 py-1 rounded-full">New</span>
            <span className="bg-[#F57C00] text-white text-xs font-bold px-3 py-1 rounded-full">Offer</span>
            <span className="bg-[#1B5E20] text-white text-xs font-bold px-3 py-1 rounded-full">Organic</span>
            <span className="bg-[#1B5E20] text-white text-xs font-bold px-3 py-1 rounded-full">Halal</span>
            <span className="bg-[#E8F5E9] text-[#1B5E20] text-xs font-bold px-3 py-1 rounded-full">Fresh</span>
            <span className="bg-[#D32F2F] text-white text-xs font-bold px-3 py-1 rounded-full">Popular</span>
          </div>

          <div className="flex flex-wrap items-center gap-3 pt-3 border-t">
            <span className="text-xs font-bold text-slate-500">Buttons:</span>
            <button className="bg-[#1B5E20] text-white text-xs font-bold px-4 py-2 rounded-xl">Primary Button</button>
            <button className="bg-white text-slate-800 border border-slate-300 text-xs font-bold px-4 py-2 rounded-xl">Secondary Button</button>
            <button className="bg-[#F57C00] text-white text-xs font-bold px-4 py-2 rounded-xl">Accent Button</button>
          </div>
        </div>
      </section>

      {/* SECTION 4: SDD ARCHITECTURE SYNTHESIS (From Uploaded Document Text) */}
      <section className="space-y-4">
        <div className="flex items-center gap-2 border-b border-slate-200 pb-2">
          <Server className="w-5 h-5 text-[#1B5E20]" />
          <h2 className="text-lg font-extrabold text-slate-900 uppercase tracking-wide">
            Project Reference & Pivoted Architecture Synthesis
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Pivoted Architecture Card */}
          <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-2xs space-y-3">
            <div className="w-10 h-10 rounded-2xl bg-emerald-50 text-[#1B5E20] flex items-center justify-center font-bold">
              <Zap className="w-5 h-5" />
            </div>
            <h3 className="font-bold text-sm text-slate-900">Serverless Cloudflare + Neon Stack</h3>
            <p className="text-xs text-slate-600 leading-relaxed">
              Pivoted from GCP origin to Next.js on Cloudflare Workers (OpenNext), Neon serverless PostgreSQL, and Cloudflare R2 object storage for vendor-agnostic cost efficiency.
            </p>
          </div>

          {/* 4-Gate SDD Governance Card */}
          <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-2xs space-y-3">
            <div className="w-10 h-10 rounded-2xl bg-amber-50 text-amber-700 flex items-center justify-center font-bold">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <h3 className="font-bold text-sm text-slate-900">4-Gate SDD Quality System</h3>
            <ul className="text-xs text-slate-600 space-y-1 list-disc pl-4">
              <li>1. Propose before work</li>
              <li>2. Spec before code</li>
              <li>3. Validate before done</li>
              <li>4. Changelog before merge</li>
            </ul>
          </div>

          {/* Local UK Delivery Pipeline */}
          <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-2xs space-y-3">
            <div className="w-10 h-10 rounded-2xl bg-blue-50 text-blue-700 flex items-center justify-center font-bold">
              <Globe className="w-5 h-5" />
            </div>
            <h3 className="font-bold text-sm text-slate-900">Aheed Self-Delivery Pipeline</h3>
            <p className="text-xs text-slate-600 leading-relaxed">
              In-house drivers handle delivery without third-party courier fees, tracking orders through a strict 3-step status: Confirmed → Out for delivery → Delivered.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
};
