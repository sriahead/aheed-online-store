import React from 'react';
import { UserAccount } from '../types';
import { AlertTriangle, LogOut, ShieldAlert } from 'lucide-react';

interface ImpersonationBannerProps {
  impersonatedUser: UserAccount | null;
  onExitImpersonation: () => void;
}

export const ImpersonationBanner: React.FC<ImpersonationBannerProps> = ({
  impersonatedUser,
  onExitImpersonation,
}) => {
  if (!impersonatedUser) return null;

  return (
    <div className="bg-amber-600 text-slate-950 px-4 py-2 text-xs font-bold flex flex-wrap items-center justify-between gap-2 shadow-md border-b-2 border-amber-800 animate-pulse">
      <div className="flex items-center gap-2">
        <ShieldAlert className="w-4 h-4 text-amber-950 shrink-0" />
        <span>
          YOU ARE CURRENTLY IMPERSONATING:{' '}
          <span className="underline font-extrabold">{impersonatedUser.name}</span> ({impersonatedUser.email})
        </span>
        <span className="bg-amber-950 text-amber-100 px-2 py-0.5 rounded text-[10px] uppercase tracking-wider ml-2">
          Payments & Live Checkout Disabled
        </span>
      </div>

      <button
        type="button"
        onClick={onExitImpersonation}
        className="flex items-center gap-1 bg-slate-900 hover:bg-black text-amber-300 hover:text-white px-3 py-1 rounded-lg text-xs font-semibold transition-all"
      >
        <LogOut className="w-3.5 h-3.5" />
        Exit Impersonation Mode
      </button>
    </div>
  );
};
