import React, { useState } from 'react';
import { DocArticle, UserAccount, ImpersonationLog, FeatureFlags } from '../types';
import { DOC_ARTICLES } from '../data/docs';
import { MOCK_USERS } from '../data/mockUsers';
import {
  Code2,
  Database,
  Cloud,
  HardDrive,
  ShieldAlert,
  UserCheck,
  RotateCcw,
  BookOpen,
  Search,
  CheckCircle2,
  AlertTriangle,
  Server,
  Terminal,
  ToggleLeft,
  ToggleRight,
  Clock,
  Sparkles,
  ChevronRight,
  Lock
} from 'lucide-react';

interface DevKmsViewProps {
  onStartImpersonation: (targetUser: UserAccount, reason: string) => void;
  impersonationLogs: ImpersonationLog[];
  onResetDatabase: () => void;
}

export const DevKmsView: React.FC<DevKmsViewProps> = ({
  onStartImpersonation,
  impersonationLogs,
  onResetDatabase,
}) => {
  const [activeTab, setActiveTab] = useState<'kms_docs' | 'impersonation' | 'serverless_health' | 'feature_flags'>('kms_docs');

  // KMS Filters
  const [docAudienceFilter, setDocAudienceFilter] = useState<'all' | 'customer' | 'staff' | 'dev'>('all');
  const [selectedDoc, setSelectedDoc] = useState<DocArticle>(DOC_ARTICLES[0]);
  const [searchDocQuery, setSearchDocQuery] = useState('');

  // Impersonation Modal State
  const [selectedTargetUser, setSelectedTargetUser] = useState<UserAccount | null>(null);
  const [impersonationReason, setImpersonationReason] = useState('');

  // Feature Flags State
  const [flags, setFlags] = useState<FeatureFlags>({
    guestCheckout: true,
    loyaltyProgram: true,
    betterAuth: true,
    cloudflareR2: true,
    neonPostgres: true,
  });

  const handleTriggerImpersonation = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTargetUser || !impersonationReason.trim()) return;

    onStartImpersonation(selectedTargetUser, impersonationReason);
    setSelectedTargetUser(null);
    setImpersonationReason('');
  };

  const filteredDocs = DOC_ARTICLES.filter((d) => {
    const matchesAudience = docAudienceFilter === 'all' || d.audience === docAudienceFilter;
    const matchesSearch =
      d.title.toLowerCase().includes(searchDocQuery.toLowerCase()) ||
      d.content.toLowerCase().includes(searchDocQuery.toLowerCase());
    return matchesAudience && matchesSearch;
  });

  return (
    <div className="max-w-7xl mx-auto px-4 py-8 font-[#Poppins,sans-serif]">
      {/* Dev Header */}
      <div className="bg-slate-950 text-white rounded-3xl p-6 mb-8 border border-slate-800 shadow-2xl flex flex-wrap items-center justify-between gap-6">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-[#1B5E20] to-emerald-600 flex items-center justify-center text-white text-xl font-mono font-bold shadow-md">
            <Code2 className="w-7 h-7" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-mono font-bold">Dev & KMS Console</h1>
              <span className="bg-emerald-950 text-emerald-400 text-[10px] font-mono border border-emerald-800 px-2.5 py-0.5 rounded-full">
                Zero-Trust Internal Deployment
              </span>
            </div>
            <p className="text-xs text-slate-400 font-mono mt-1">
              Nextra Docs-as-Code KMS • Impersonation Audit Engine • All-Serverless Origin Health
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={onResetDatabase}
          className="flex items-center gap-1.5 bg-red-950/80 hover:bg-red-900 text-red-200 border border-red-800 px-4 py-2 rounded-xl text-xs font-mono font-bold transition-all"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          Reset DB & Seed Baseline Data
        </button>
      </div>

      {/* Dev Tabs */}
      <div className="flex border-b border-slate-200 mb-8 overflow-x-auto">
        <button
          type="button"
          onClick={() => setActiveTab('kms_docs')}
          className={`flex items-center gap-2 px-5 py-3 text-xs font-mono font-bold border-b-2 transition-all whitespace-nowrap ${
            activeTab === 'kms_docs'
              ? 'border-[#1B5E20] text-[#1B5E20]'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <BookOpen className="w-4 h-4" />
          KMS Nextra Site (Docs-as-Code)
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('impersonation')}
          className={`flex items-center gap-2 px-5 py-3 text-xs font-mono font-bold border-b-2 transition-all whitespace-nowrap ${
            activeTab === 'impersonation'
              ? 'border-[#1B5E20] text-[#1B5E20]'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <UserCheck className="w-4 h-4 text-amber-600" />
          Login as User / Impersonation Console
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('serverless_health')}
          className={`flex items-center gap-2 px-5 py-3 text-xs font-mono font-bold border-b-2 transition-all whitespace-nowrap ${
            activeTab === 'serverless_health'
              ? 'border-[#1B5E20] text-[#1B5E20]'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <Server className="w-4 h-4" />
          All-Serverless Origin Health Check
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('feature_flags')}
          className={`flex items-center gap-2 px-5 py-3 text-xs font-mono font-bold border-b-2 transition-all whitespace-nowrap ${
            activeTab === 'feature_flags'
              ? 'border-[#1B5E20] text-[#1B5E20]'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <ToggleRight className="w-4 h-4" />
          Feature Flag Controls
        </button>
      </div>

      {/* TAB 1: KMS NEXTA SITE */}
      {activeTab === 'kms_docs' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          <div className="lg:col-span-4 space-y-4">
            <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl">
              {(['all', 'customer', 'staff', 'dev'] as const).map((aud) => (
                <button
                  key={aud}
                  type="button"
                  onClick={() => setDocAudienceFilter(aud)}
                  className={`flex-1 py-1.5 rounded-lg text-[11px] font-mono capitalize transition-all ${
                    docAudienceFilter === aud ? 'bg-white font-bold text-slate-900 shadow-2xs' : 'text-slate-500'
                  }`}
                >
                  {aud}
                </button>
              ))}
            </div>

            <div className="space-y-2">
              {filteredDocs.map((doc) => (
                <button
                  key={doc.id}
                  type="button"
                  onClick={() => setSelectedDoc(doc)}
                  className={`w-full text-left p-4 rounded-2xl border font-mono text-xs transition-all ${
                    selectedDoc.id === doc.id
                      ? 'bg-slate-950 text-white border-slate-800 ring-1 ring-emerald-500'
                      : 'bg-white border-slate-200 text-slate-800 hover:border-slate-300'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span
                      className={`text-[9px] uppercase px-2 py-0.5 rounded font-extrabold ${
                        doc.visibility === 'public' ? 'bg-emerald-100 text-[#1B5E20]' : 'bg-amber-100 text-amber-900'
                      }`}
                    >
                      {doc.visibility} • {doc.audience}
                    </span>
                    <span className="text-[10px] text-slate-400">{doc.lastUpdated}</span>
                  </div>
                  <h3 className="font-bold">{doc.title}</h3>
                  <p className="text-[11px] text-slate-400 line-clamp-2 mt-1">{doc.summary}</p>
                </button>
              ))}
            </div>
          </div>

          <div className="lg:col-span-8 bg-slate-950 text-slate-100 rounded-3xl p-6 sm:p-8 border border-slate-800 font-mono text-xs leading-relaxed space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-4">
              <div>
                <span className="text-emerald-400 font-bold">// Nextra Docs-as-Code Renderer</span>
                <h2 className="text-xl font-bold text-white mt-1">{selectedDoc.title}</h2>
              </div>
              <div className="text-right text-[11px] text-slate-400">
                <p>Frontmatter: <span className="text-amber-400">visibility: {selectedDoc.visibility}</span></p>
                <p>Audience: <span className="text-emerald-400">{selectedDoc.audience}</span></p>
              </div>
            </div>

            <pre className="bg-slate-900 p-4 rounded-2xl border border-slate-800 text-slate-300 whitespace-pre-wrap font-mono text-xs overflow-x-auto">
              {selectedDoc.content}
            </pre>
          </div>
        </div>
      )}

      {/* TAB 2: IMPERSONATION CONSOLE */}
      {activeTab === 'impersonation' && (
        <div className="space-y-8">
          <div className="bg-amber-50 rounded-2xl p-6 border border-amber-200 text-amber-950">
            <div className="flex items-start gap-3">
              <ShieldAlert className="w-6 h-6 text-amber-700 shrink-0 mt-0.5" />
              <div>
                <h2 className="font-extrabold text-sm uppercase tracking-wider text-amber-900">
                  UK GDPR / PECR Compliance Surface: Admin Impersonation Console
                </h2>
                <p className="text-xs text-amber-900/90 mt-1 leading-relaxed">
                  Impersonation allows store managers to view customer screens for real-time order troubleshooting. Every session requires a documented compliance reason and produces an immutable audit log entry.
                </p>
              </div>
            </div>
          </div>

          {/* Trigger Impersonation Card */}
          <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs max-w-2xl">
            <h3 className="font-bold text-slate-900 text-sm mb-4">Start Impersonation Session</h3>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Target Account</label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {MOCK_USERS.filter((u) => u.role === 'customer').map((u) => (
                    <button
                      key={u.id}
                      type="button"
                      onClick={() => setSelectedTargetUser(u)}
                      className={`p-3 rounded-xl border text-left text-xs transition-all ${
                        selectedTargetUser?.id === u.id
                          ? 'border-amber-500 bg-amber-50 ring-1 ring-amber-500'
                          : 'border-slate-200 hover:border-slate-300'
                      }`}
                    >
                      <p className="font-bold text-slate-900">{u.name}</p>
                      <p className="text-slate-500 text-[11px]">{u.email}</p>
                    </button>
                  ))}
                </div>
              </div>

              {selectedTargetUser && (
                <form onSubmit={handleTriggerImpersonation} className="space-y-3 pt-2">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Audit Reason (Mandatory: Who, Whom, When, Why)
                    </label>
                    <textarea
                      rows={2}
                      value={impersonationReason}
                      onChange={(e) => setImpersonationReason(e.target.value)}
                      placeholder="e.g. Assisting customer Sarah Ahmed with MK9 Milton Keynes delivery address update."
                      required
                      className="w-full bg-slate-50 p-2.5 rounded-xl border border-slate-300 text-xs focus:outline-none focus:border-amber-500"
                    />
                  </div>

                  <button
                    type="submit"
                    className="bg-amber-600 hover:bg-amber-700 text-slate-950 font-extrabold text-xs px-5 py-2.5 rounded-xl flex items-center gap-2"
                  >
                    <UserCheck className="w-4 h-4" />
                    Launch Impersonated Session
                  </button>
                </form>
              )}
            </div>
          </div>

          {/* Audit Logs Table */}
          <div className="bg-slate-950 text-slate-100 rounded-2xl p-6 border border-slate-800 font-mono text-xs">
            <h3 className="font-bold text-amber-400 mb-4 flex items-center gap-2">
              <Lock className="w-4 h-4" />
              Impersonation Audit Trail Log (Immutable)
            </h3>

            {impersonationLogs.length === 0 ? (
              <p className="text-slate-500 italic">No impersonation sessions triggered yet.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead className="text-slate-500 uppercase text-[10px] border-b border-slate-800">
                    <tr>
                      <th className="py-2">Timestamp</th>
                      <th className="py-2">Admin Email</th>
                      <th className="py-2">Target User</th>
                      <th className="py-2">Audit Reason</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800">
                    {impersonationLogs.map((log) => (
                      <tr key={log.id}>
                        <td className="py-2 text-slate-400">{log.timestamp}</td>
                        <td className="py-2 text-amber-300">{log.adminEmail}</td>
                        <td className="py-2 text-emerald-300">{log.targetUserEmail}</td>
                        <td className="py-2 text-slate-300">{log.reason}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 3: SERVERLESS ORIGIN HEALTH */}
      {activeTab === 'serverless_health' && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-slate-950 text-slate-100 p-6 rounded-2xl border border-slate-800 font-mono space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-emerald-400 font-bold flex items-center gap-2 text-xs">
                <Database className="w-4 h-4" /> Neon PostgreSQL
              </span>
              <span className="bg-emerald-950 text-emerald-300 px-2 py-0.5 rounded text-[10px]">
                Active (18ms)
              </span>
            </div>
            <p className="text-xs text-slate-400">Scale-to-zero serverless PostgreSQL instance.</p>
            <div className="bg-slate-900 p-2.5 rounded-xl border border-slate-800 text-[11px]">
              <p className="text-slate-500">// Connection Pool</p>
              <p className="text-emerald-300">Pooled WebSocket endpoint</p>
            </div>
          </div>

          <div className="bg-slate-950 text-slate-100 p-6 rounded-2xl border border-slate-800 font-mono space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-blue-400 font-bold flex items-center gap-2 text-xs">
                <Cloud className="w-4 h-4" /> Cloudflare Workers
              </span>
              <span className="bg-blue-950 text-blue-300 px-2 py-0.5 rounded text-[10px]">
                LHR - London Edge
              </span>
            </div>
            <p className="text-xs text-slate-400">OpenNext adapter runtime executing server routes.</p>
            <div className="bg-slate-900 p-2.5 rounded-xl border border-slate-800 text-[11px]">
              <p className="text-slate-500">// Edge Latency</p>
              <p className="text-blue-300">9ms global edge response</p>
            </div>
          </div>

          <div className="bg-slate-950 text-slate-100 p-6 rounded-2xl border border-slate-800 font-mono space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-amber-400 font-bold flex items-center gap-2 text-xs">
                <HardDrive className="w-4 h-4" /> Cloudflare R2 S3
              </span>
              <span className="bg-amber-950 text-amber-300 px-2 py-0.5 rounded text-[10px]">
                Zero Egress
              </span>
            </div>
            <p className="text-xs text-slate-400">Product asset bucket via S3 API compatibility.</p>
            <div className="bg-slate-900 p-2.5 rounded-xl border border-slate-800 text-[11px]">
              <p className="text-slate-500">// Bucket</p>
              <p className="text-amber-300">aheed-assets-bucket</p>
            </div>
          </div>
        </div>
      )}

      {/* TAB 4: FEATURE FLAGS */}
      {activeTab === 'feature_flags' && (
        <div className="bg-white rounded-2xl border border-slate-200 p-6 max-w-xl space-y-4 shadow-xs">
          <h3 className="font-bold text-slate-900 text-sm">Runtime Feature Flags</h3>

          <div className="space-y-3 divide-y divide-slate-100 text-xs">
            {Object.entries(flags).map(([key, val]) => (
              <div key={key} className="pt-3 flex items-center justify-between">
                <div>
                  <span className="font-bold text-slate-800 capitalize">{key.replace(/([A-Z])/g, ' $1')}</span>
                  <p className="text-[11px] text-slate-400">Controls runtime execution of {key} flow.</p>
                </div>
                <button
                  type="button"
                  onClick={() => setFlags((prev) => ({ ...prev, [key]: !val }))}
                  className={`px-3 py-1 rounded-full font-bold transition-all ${
                    val ? 'bg-[#1B5E20] text-white' : 'bg-slate-200 text-slate-600'
                  }`}
                >
                  {val ? 'ENABLED' : 'DISABLED'}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
