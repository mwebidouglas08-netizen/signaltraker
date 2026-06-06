import React from "react";
import { 
  Settings, 
  Volume2, 
  BellRing, 
  Sparkles, 
  CheckCircle2, 
  Info, 
  Activity, 
  ShieldAlert 
} from "lucide-react";
import TelegramConfigPanel from "./TelegramConfigPanel";
import { TelegramConfig } from "../types";

interface Props {
  config: TelegramConfig;
  onChange: (cfg: TelegramConfig) => void;
  aiConfigured: boolean;
}

export default function SettingsView({ config, onChange, aiConfigured }: Props) {
  
  const handleToggleScanner = () => {
    onChange({
      ...config,
      enableScannerBroadcast: config.enableScannerBroadcast === false ? true : false
    });
  };

  const handleToggleManual = () => {
    onChange({
      ...config,
      enableManualBroadcast: config.enableManualBroadcast === false ? true : false
    });
  };

  return (
    <div className="space-y-6 animate-fade-in text-sans" id="settings-view-panel">
      
      {/* Title block */}
      <div className="border-b border-slate-850 pb-4">
        <h3 className="text-base font-bold text-white tracking-tight flex items-center gap-2">
          <Settings className="w-5 h-5 text-sky-400" />
          <span>System Settings & Coordination Control</span>
        </h3>
        <p className="text-xs text-slate-400 mt-0.5">Manage Telegram API tokens, bot integration credentials, and AI engine status settings.</p>
      </div>

      {/* Integrate Telegram connection panel right here! */}
      <div className="bg-slate-950 p-2.5 rounded-2xl border border-slate-900 shadow-xl overflow-hidden">
        <TelegramConfigPanel config={config} onChange={onChange} />
      </div>

      {/* Sharing Toggles Configuration */}
      <div className="bg-slate-950 border border-slate-850 rounded-2xl p-5 space-y-4">
        <div className="flex items-center gap-2 border-b border-slate-900 pb-2.5">
          <Activity className="w-4 h-4 text-sky-455" />
          <span className="text-xs font-bold text-slate-205 uppercase tracking-wider">Broadcasting Preferences</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          
          {/* Option 1: Scanner triggers sharing */}
          <div className="p-4 bg-slate-900/35 border border-slate-850/60 rounded-xl relative flex flex-col justify-between">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-200">1. Volatility Scanner Live Triggers</span>
                <span className={`w-2 h-2 rounded-full ${config.enableScannerBroadcast !== false ? "bg-emerald-400 animate-pulse" : "bg-slate-600"}`}></span>
              </div>
              <p className="text-[10.5px] text-slate-450 leading-relaxed font-sans">
                When enabled, the automated Volatility Scanner Bot will broadcast digit setup alerts directly to your VIP room. Turning this off creates local drafts only.
              </p>
            </div>

            <div className="pt-4 flex justify-end">
              <button
                type="button"
                onClick={handleToggleScanner}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold border cursor-pointer transition-all ${
                  config.enableScannerBroadcast !== false
                    ? "bg-emerald-950/60 border-emerald-800 text-emerald-300"
                    : "bg-slate-950 border-slate-800 text-slate-500"
                }`}
                id="toggle-btn-settings-scanner"
              >
                <span>{config.enableScannerBroadcast !== false ? "🟢 Broadcasting Live" : "🔴 Draft Only Mode"}</span>
              </button>
            </div>
          </div>

          {/* Option 2: Composer Auto-Share */}
          <div className="p-4 bg-slate-900/35 border border-slate-850/60 rounded-xl relative flex flex-col justify-between">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-200">2. Composer Auto-Share Loop</span>
                <span className={`w-2 h-2 rounded-full ${config.enableManualBroadcast !== false ? "bg-emerald-400 animate-pulse" : "bg-slate-600"}`}></span>
              </div>
              <p className="text-[10.5px] text-slate-450 leading-relaxed font-sans">
                When active, completing your custom-crafted signal formulations instantly dispatches them to public feeds. Toggle off to manually compile and approve.
              </p>
            </div>

            <div className="pt-4 flex justify-end">
              <button
                type="button"
                onClick={handleToggleManual}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold border cursor-pointer transition-all ${
                  config.enableManualBroadcast !== false
                    ? "bg-emerald-950/60 border-emerald-800 text-emerald-300"
                    : "bg-slate-950 border-slate-800 text-slate-500"
                }`}
                id="toggle-btn-settings-manual"
              >
                <span>{config.enableManualBroadcast !== false ? "🟢 Auto-Share Active" : "🔴 Manual Review Required"}</span>
              </button>
            </div>
          </div>

        </div>
      </div>

      {/* Technical Integration Health Status */}
      <div className="bg-slate-950 border border-slate-850 rounded-2xl p-5 space-y-4">
        <div className="flex items-center gap-2 border-b border-slate-900 pb-2.5">
          <Volume2 className="w-4 h-4 text-amber-500" />
          <span className="text-xs font-bold text-slate-205 uppercase tracking-wider">System Integration Health Diagnostic</span>
        </div>

        <div className="space-y-3 font-sans">
          <div className="flex items-center justify-between p-2.5 bg-slate-900/40 border border-slate-850 rounded-xl">
            <div className="space-y-0.5">
              <span className="text-xs font-semibold text-slate-200">Gemini 3.5 AI Core Processor</span>
              <p className="text-[10px] text-slate-450">Used to refine manual signal drafting strategies with technical rationale.</p>
            </div>
            <span className={`text-[10.5px] font-bold px-2 py-0.5 rounded-lg border uppercase ${
              aiConfigured 
                ? "bg-emerald-950/40 text-emerald-400 border-emerald-900/30" 
                : "bg-amber-950/30 text-amber-500 border-amber-900/30 animate-pulse"
            }`}>
              {aiConfigured ? "Secured" : "Incomplete Integration (Fallback mode)"}
            </span>
          </div>

          <div className="flex items-center justify-between p-2.5 bg-slate-900/40 border border-slate-850 rounded-xl">
            <div className="space-y-0.5">
              <span className="text-xs font-semibold text-slate-200">Telegram Bot Admin Coordinates</span>
              <p className="text-[10px] text-slate-450">Bot token presence configuration required as original sender block.</p>
            </div>
            <span className={`text-[10.5px] font-bold px-2 py-0.5 rounded-lg border uppercase ${
              config.botToken ? "bg-emerald-950/40 text-emerald-400 border-emerald-900/30" : "bg-rose-950/30 text-rose-450 border-rose-900/30"
            }`}>
              {config.botToken ? "Configured" : "Missing Token"}
            </span>
          </div>
        </div>
      </div>

    </div>
  );
}
