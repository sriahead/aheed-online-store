import React, { useState } from 'react';
import { UserAccount } from '../types';
import { MOCK_USERS } from '../data/mockUsers';
import {
  X,
  User,
  ShieldCheck,
  LogOut,
  Key,
  Mail,
  Lock,
  Sparkles,
  CheckCircle2,
  Store,
  Terminal,
  UserCheck,
  Building2
} from 'lucide-react';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: UserAccount | null;
  onSelectUser: (user: UserAccount | null) => void;
}

export const AuthModal: React.FC<AuthModalProps> = ({
  isOpen,
  onClose,
  currentUser,
  onSelectUser,
}) => {
  const [activeTab, setActiveTab] = useState<'quick_switch' | 'custom_login'>('quick_switch');
  const [customEmail, setCustomEmail] = useState('');
  const [customPassword, setCustomPassword] = useState('');
  const [loginError, setLoginError] = useState('');

  if (!isOpen) return null;

  const handleCustomLogin = (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError('');

    const matched = MOCK_USERS.find(
      (u) => u.email.toLowerCase() === customEmail.trim().toLowerCase()
    );

    if (matched) {
      onSelectUser(matched);
      onClose();
    } else {
      // Create ad-hoc user session
      const newUser: UserAccount = {
        id: `usr-${Date.now()}`,
        name: customEmail.split('@')[0],
        email: customEmail,
        phone: '07700 900000',
        role: customEmail.includes('admin') || customEmail.includes('dev') ? 'admin' : 'customer',
        loyaltyPoints: 50,
        isLoggedIn: true,
        joinedDate: 'Today',
        betterAuthToken: `ba_sess_custom_${Math.random().toString(36).substring(7)}`,
        addresses: [
          {
            id: 'addr-custom',
            label: 'Home',
            street: 'High Street',
            city: 'Milton Keynes',
            postcode: 'MK9 1AA',
            isDefault: true,
          },
        ],
      };
      onSelectUser(newUser);
      onClose();
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-lg bg-white rounded-3xl shadow-2xl overflow-hidden border border-slate-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-5 bg-[#1B5E20] text-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-emerald-800 flex items-center justify-center text-white">
              <User className="w-5 h-5 text-amber-300" />
            </div>
            <div>
              <h2 className="font-bold text-base">Better Auth — Account Sign In</h2>
              <p className="text-xs text-emerald-100">
                Switch user accounts & role privileges for testing
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-full hover:bg-emerald-800 text-emerald-100 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Current Active Session Status */}
        <div className="p-5 bg-slate-50 border-b border-slate-200">
          <div className="flex items-center justify-between">
            <div>
              <span className="text-[10px] uppercase font-bold tracking-wider text-slate-500">
                Active Session State
              </span>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="font-bold text-slate-900 text-sm">
                  {currentUser ? currentUser.name : 'Guest Shopper (Not Logged In)'}
                </span>
                {currentUser && (
                  <span
                    className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase ${
                      currentUser.role === 'admin'
                        ? 'bg-purple-100 text-purple-800 border border-purple-200'
                        : currentUser.role === 'staff'
                        ? 'bg-amber-100 text-amber-800 border border-amber-200'
                        : 'bg-emerald-100 text-[#1B5E20] border border-emerald-200'
                    }`}
                  >
                    {currentUser.role === 'admin' ? 'Dev / Admin' : currentUser.role}
                  </span>
                )}
              </div>
              {currentUser && (
                <p className="text-xs text-slate-500 mt-0.5">{currentUser.email}</p>
              )}
            </div>

            {currentUser && (
              <button
                type="button"
                onClick={() => {
                  onSelectUser(null);
                }}
                className="flex items-center gap-1.5 bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 px-3 py-1.5 rounded-xl text-xs font-bold transition-all"
              >
                <LogOut className="w-3.5 h-3.5" />
                Sign Out
              </button>
            )}
          </div>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-slate-200 px-5 pt-3 bg-white">
          <button
            type="button"
            onClick={() => setActiveTab('quick_switch')}
            className={`pb-3 text-xs font-bold border-b-2 transition-all mr-6 ${
              activeTab === 'quick_switch'
                ? 'border-[#1B5E20] text-[#1B5E20]'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            Quick 1-Click User Switch
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('custom_login')}
            className={`pb-3 text-xs font-bold border-b-2 transition-all ${
              activeTab === 'custom_login'
                ? 'border-[#1B5E20] text-[#1B5E20]'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            Sign In with Email & Password
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 space-y-4">
          {activeTab === 'quick_switch' && (
            <div className="space-y-3">
              <p className="text-xs text-slate-600 font-medium">
                Select a user profile to test role-based access control and developer options:
              </p>

              <div className="space-y-2.5">
                {/* 1. Customer User */}
                {MOCK_USERS.filter((u) => u.role === 'customer').map((user) => {
                  const isSelected = currentUser?.id === user.id;
                  return (
                    <button
                      key={user.id}
                      type="button"
                      onClick={() => {
                        onSelectUser(user);
                        onClose();
                      }}
                      className={`w-full p-3.5 rounded-2xl border text-left flex items-center justify-between transition-all ${
                        isSelected
                          ? 'border-[#1B5E20] bg-emerald-50/60 ring-2 ring-emerald-500/20'
                          : 'border-slate-200 hover:border-slate-300 bg-white'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-xl bg-emerald-100 text-[#1B5E20] flex items-center justify-center font-bold text-xs">
                          <User className="w-4 h-4" />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-slate-900 text-xs">{user.name}</span>
                            <span className="bg-emerald-100 text-[#1B5E20] text-[10px] font-bold px-2 py-0.5 rounded">
                              Customer
                            </span>
                          </div>
                          <p className="text-[11px] text-slate-500 mt-0.5">{user.email}</p>
                          <p className="text-[10px] text-slate-400 mt-0.5">
                            Standard Customer View • {user.loyaltyPoints} Loyalty Points
                          </p>
                        </div>
                      </div>
                      {isSelected ? (
                        <CheckCircle2 className="w-5 h-5 text-[#1B5E20]" />
                      ) : (
                        <span className="text-xs font-bold text-[#1B5E20]">Sign In</span>
                      )}
                    </button>
                  );
                })}

                {/* 2. Store Manager & Staff User */}
                {MOCK_USERS.filter((u) => u.role === 'staff').map((user) => {
                  const isSelected = currentUser?.id === user.id;
                  return (
                    <button
                      key={user.id}
                      type="button"
                      onClick={() => {
                        onSelectUser(user);
                        onClose();
                      }}
                      className={`w-full p-3.5 rounded-2xl border text-left flex items-center justify-between transition-all ${
                        isSelected
                          ? 'border-amber-500 bg-amber-50/60 ring-2 ring-amber-500/20'
                          : 'border-slate-200 hover:border-slate-300 bg-white'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-xl bg-amber-100 text-amber-800 flex items-center justify-center font-bold text-xs">
                          <Store className="w-4 h-4" />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-slate-900 text-xs">{user.name}</span>
                            <span className="bg-amber-100 text-amber-800 text-[10px] font-bold px-2 py-0.5 rounded">
                              Store Manager
                            </span>
                          </div>
                          <p className="text-[11px] text-slate-500 mt-0.5">{user.email}</p>
                          <p className="text-[10px] text-amber-800 font-medium mt-0.5">
                            ★ Opens Aheed Store Manager Panel: order fulfillment & stock availability
                          </p>
                        </div>
                      </div>
                      {isSelected ? (
                        <CheckCircle2 className="w-5 h-5 text-amber-600" />
                      ) : (
                        <span className="text-xs font-bold text-amber-700">Sign In (Store Manager)</span>
                      )}
                    </button>
                  );
                })}

                {/* 3. Dev / Systems Engineer User */}
                {MOCK_USERS.filter((u) => u.role === 'admin').map((user) => {
                  const isSelected = currentUser?.id === user.id;
                  return (
                    <button
                      key={user.id}
                      type="button"
                      onClick={() => {
                        onSelectUser(user);
                        onClose();
                      }}
                      className={`w-full p-3.5 rounded-2xl border text-left flex items-center justify-between transition-all ${
                        isSelected
                          ? 'border-purple-600 bg-purple-50/60 ring-2 ring-purple-500/20'
                          : 'border-slate-200 hover:border-slate-300 bg-white'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-xl bg-purple-100 text-purple-900 flex items-center justify-center font-bold text-xs">
                          <Terminal className="w-4 h-4" />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-slate-900 text-xs">{user.name}</span>
                            <span className="bg-purple-100 text-purple-800 text-[10px] font-bold px-2 py-0.5 rounded">
                              Dev Architect
                            </span>
                          </div>
                          <p className="text-[11px] text-slate-500 mt-0.5">{user.email}</p>
                          <p className="text-[10px] text-purple-700 font-semibold mt-0.5">
                            ★ Unlocks Dev Toolbar, Desktop/Mobile view modes & Dev KMS
                          </p>
                        </div>
                      </div>
                      {isSelected ? (
                        <CheckCircle2 className="w-5 h-5 text-purple-700" />
                      ) : (
                        <span className="text-xs font-bold text-purple-800">Sign In (Dev)</span>
                      )}
                    </button>
                  );
                })}

                {/* Guest Option */}
                <button
                  type="button"
                  onClick={() => {
                    onSelectUser(null);
                    onClose();
                  }}
                  className={`w-full p-3.5 rounded-2xl border text-left flex items-center justify-between transition-all ${
                    !currentUser
                      ? 'border-slate-400 bg-slate-100 ring-2 ring-slate-300'
                      : 'border-slate-200 hover:border-slate-300 bg-white'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-slate-200 text-slate-600 flex items-center justify-center font-bold text-xs">
                      <UserCheck className="w-4 h-4" />
                    </div>
                    <div>
                      <span className="font-bold text-slate-800 text-xs">Guest Shopper</span>
                      <p className="text-[11px] text-slate-500">Unauthenticated storefront browsing</p>
                    </div>
                  </div>
                  {!currentUser ? (
                    <CheckCircle2 className="w-5 h-5 text-slate-600" />
                  ) : (
                    <span className="text-xs font-bold text-slate-600">Browse as Guest</span>
                  )}
                </button>
              </div>
            </div>
          )}

          {activeTab === 'custom_login' && (
            <form onSubmit={handleCustomLogin} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Email Address</label>
                <div className="relative">
                  <Mail className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="email"
                    value={customEmail}
                    onChange={(e) => setCustomEmail(e.target.value)}
                    placeholder="e.g. sarah.ahmed@example.com or admin@aheedfood.co.uk"
                    required
                    className="w-full bg-slate-50 pl-10 pr-4 py-2.5 rounded-xl border border-slate-300 text-xs focus:outline-none focus:border-[#1B5E20]"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Password</label>
                <div className="relative">
                  <Lock className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="password"
                    value={customPassword}
                    onChange={(e) => setCustomPassword(e.target.value)}
                    placeholder="••••••••••••"
                    required
                    className="w-full bg-slate-50 pl-10 pr-4 py-2.5 rounded-xl border border-slate-300 text-xs focus:outline-none focus:border-[#1B5E20]"
                  />
                </div>
              </div>

              <div className="bg-amber-50 p-3 rounded-xl border border-amber-200 text-[11px] text-amber-900">
                <p className="font-semibold">Tip for Dev Access:</p>
                <p className="mt-0.5 text-amber-800">
                  Include <code className="bg-amber-100 px-1 py-0.5 rounded font-mono font-bold">admin</code> or <code className="bg-amber-100 px-1 py-0.5 rounded font-mono font-bold">dev</code> in your email address to automatically grant Developer/Admin privileges!
                </p>
              </div>

              <button
                type="submit"
                className="w-full bg-[#1B5E20] hover:bg-emerald-800 text-white font-bold text-xs py-3 rounded-xl transition-all shadow-sm"
              >
                Sign In with Better Auth
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
