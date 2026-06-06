import React from "react";
import { Cpu } from "lucide-react";
import { TradingSignal, TelegramConfig } from "../types";
import VolatilityScanner from "./VolatilityScanner";

interface Props {
  signals: TradingSignal[];
  config: TelegramConfig;
  onNavigate: (tab: any) => void;
  persistConfig: (newConfig: TelegramConfig) => void;

  // Scanner Bot
  onSignalGenerated: (data: any, skipAutoBroadcast?: boolean) => void;
  aiConfigured: boolean;
  onPostDirectTelegram: (text: string) => Promise<{ success: boolean; messageId?: string; error?: string }>;

  // Composer Form / Draft
  currentDraft: any;
  editableText: string;
  setEditableText: (text: string) => void;
  editableRationale: string;
  setEditableRationale: (text: string) => void;
  loadedTemplate: any;
  onClearLoadedTemplate: () => void;

  // AlertsView / Active Updates
  selectedSignal: TradingSignal | null;
  onSelectSignal: (sig: TradingSignal | null) => void;
  onSendSignalUpdate: (type: "TP1" | "TP2" | "TP3" | "SL" | "CLOSED" | "CUSTOM") => Promise<void>;
  customUpdateText: string;
  onCustomUpdateChange: (text: string) => void;
  submittingUpdate: boolean;
  updateError: string;
}

export default function DashboardView({ 
  signals, 
  config, 
  onNavigate,
  persistConfig,
  aiConfigured,
  onPostDirectTelegram,
  onSignalGenerated,
  currentDraft,
  editableText,
  setEditableText,
  editableRationale,
  setEditableRationale,
  loadedTemplate,
  onClearLoadedTemplate,
  selectedSignal,
  onSelectSignal,
  onSendSignalUpdate,
  customUpdateText,
  onCustomUpdateChange,
  submittingUpdate,
  updateError
}: Props) {
  return (
    <div className="space-y-6 animate-fade-in" id="dashboard-view-panel">
      
      {/* Title block */}
      <div className="border-b border-slate-850 pb-4">
        <h3 className="text-base font-bold text-white tracking-tight flex items-center gap-2">
          <Cpu className="w-5 h-5 text-sky-400 animate-pulse" />
          <span>Interactive Algorithmic Volatility Scanner</span>
        </h3>
        <p className="text-xs text-slate-400 mt-0.5">Configure live scan thresholds, strategy trigger intervals, and target synthetic index coordinates to broadcast automatically.</p>
      </div>

      {/* 🎯 INTEGRATED VOLATILITY SCANNER STRATEGY CONFIGURATION (Only keeping the Scanner Bot as requested) */}
      <div className="bg-slate-950 border border-slate-850/80 rounded-2xl p-5 space-y-4" id="integrated-dashboard-control-deck">
        <VolatilityScanner 
          onSignalGenerated={onSignalGenerated}
          telegramConfig={config}
          aiConfigured={aiConfigured}
          onPostDirectTelegram={onPostDirectTelegram}
        />
      </div>

    </div>
  );
}
