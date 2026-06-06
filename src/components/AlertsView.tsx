import React from "react";
import { 
  BellRing, 
  Target, 
  Shield, 
  MessageSquare, 
  Send, 
  X, 
  ArrowRight, 
  Sparkles, 
  Info, 
  Layers,
  Save,
  Clock,
  TrendingUp,
  Calendar,
  Check,
  AlertCircle
} from "lucide-react";
import { TradingSignal, SignalStatus, TelegramConfig } from "../types";

interface Props {
  signals: TradingSignal[];
  selectedSignal: TradingSignal | null;
  onSelectSignal: (sig: TradingSignal | null) => void;
  onSendSignalUpdate: (updateType: "TP1" | "TP2" | "TP3" | "SL" | "CLOSED" | "CUSTOM") => void;
  customUpdateText: string;
  onCustomUpdateChange: (text: string) => void;
  submittingUpdate: boolean;
  updateError: string;
  telegramConfig: TelegramConfig;
  onPostGeneralAlert: (text: string) => Promise<{ success: boolean; error?: string }>;
}

export default function AlertsView({
  signals,
  selectedSignal,
  onSelectSignal,
  onSendSignalUpdate,
  customUpdateText,
  onCustomUpdateChange,
  submittingUpdate,
  updateError,
  telegramConfig,
  onPostGeneralAlert
}: Props) {
  
  // Filter only ACTIVE / RUNNING signals for management
  const activeSignals = signals.filter(
    (s) => s.status === "ACTIVE" || s.status.includes("TP")
  );

  // --- STATE FOR OPERATIONAL ALERTS ---

  // Feature 1: Pre-Signal Standby Call Alert
  const [preSignalText, setPreSignalText] = React.useState<string>(() => {
    return localStorage.getItem("broadcast_pre_signal_alert_preset") || 
      `⏰ <b>STANDBY VIP MEMBERS!</b>\n\nOur Volatility Scanner Bot is detecting high-probability structural setups. Keep notifications option ON.\n\nNext VIP contract draft loading shortly! 🚀`;
  });
  const [preSaveStatus, setPreSaveStatus] = React.useState<string>("");
  const [prePostStatus, setPrePostStatus] = React.useState<{ status: "idle" | "loading" | "success" | "error"; msg?: string }>({ status: "idle" });

  // Feature 2: Next Session Release Schedule Alert
  const [nextSessionText, setNextSessionText] = React.useState<string>(() => {
    return localStorage.getItem("broadcast_next_session_alert_preset") || 
      `🚀 <b>NEXT TRADING SESSION SCHEDULE:</b>\n\nWe will release our next high-performance trading signal session in approximately <b>45 minutes</b>.\n\nEnsure your broker setups are primed! Let's conquer the next move together. 🔥`;
  });
  const [nextSaveStatus, setNextSaveStatus] = React.useState<string>("");
  const [nextPostStatus, setNextPostStatus] = React.useState<{ status: "idle" | "loading" | "success" | "error"; msg?: string }>({ status: "idle" });

  // --- HANDLERS FOR SAVING & POSTING OPERATIONAL ALERTS ---

  const handleSavePreAlert = () => {
    localStorage.setItem("broadcast_pre_signal_alert_preset", preSignalText);
    setPreSaveStatus("Saved to presets! 💾");
    setTimeout(() => setPreSaveStatus(""), 3000);
  };

  const handlePreSignalChange = (text: string) => {
    setPreSignalText(text);
    localStorage.setItem("broadcast_pre_signal_alert_preset", text);
    setPreSaveStatus("Auto-saved! ⚡");
    // Clear save status after brief delay so it doesn't stay forever
    setTimeout(() => {
      setPreSaveStatus((prev) => prev === "Auto-saved! ⚡" ? "" : prev);
    }, 2000);
  };

  const handlePostPreAlert = async () => {
    if (!preSignalText.trim()) return;
    setPrePostStatus({ status: "loading" });
    const res = await onPostGeneralAlert(preSignalText);
    if (res.success) {
      setPrePostStatus({ status: "success", msg: "Standby Alert dispatched successfully to linked channel!" });
      setTimeout(() => setPrePostStatus({ status: "idle" }), 4000);
    } else {
      setPrePostStatus({ status: "error", msg: res.error || "Failed to post standby pre-alert." });
    }
  };

  const handleSaveNextAlert = () => {
    localStorage.setItem("broadcast_next_session_alert_preset", nextSessionText);
    setNextSaveStatus("Saved to presets! 💾");
    setTimeout(() => setNextSaveStatus(""), 3000);
  };

  const handleNextSessionChange = (text: string) => {
    setNextSessionText(text);
    localStorage.setItem("broadcast_next_session_alert_preset", text);
    setNextSaveStatus("Auto-saved! ⚡");
    // Clear save status after brief delay
    setTimeout(() => {
      setNextSaveStatus((prev) => prev === "Auto-saved! ⚡" ? "" : prev);
    }, 2005);
  };

  const handlePostNextAlert = async () => {
    if (!nextSessionText.trim()) return;
    setNextPostStatus({ status: "loading" });
    const res = await onPostGeneralAlert(nextSessionText);
    if (res.success) {
      setNextPostStatus({ status: "success", msg: "Next Session Alert dispatched successfully to linked channel!" });
      setTimeout(() => setNextPostStatus({ status: "idle" }), 4000);
    } else {
      setNextPostStatus({ status: "error", msg: res.error || "Failed to post session release schedule." });
    }
  };

  return (
    <div className="space-y-8 animate-fade-in text-sans" id="alerts-view-panel">
      
      {/* Title Header */}
      <div className="border-b border-slate-850 pb-4">
        <h3 className="text-base font-bold text-white tracking-tight flex items-center gap-2 animate-pulse">
          <BellRing className="w-5 h-5 text-sky-400" />
          <span>Active Alerts & Live Telemetry Panel</span>
        </h3>
        <p className="text-xs text-slate-400 mt-0.5">Send real-time updates (TP/SL hits and customer announcements) as replies to active Telegram posts.</p>
      </div>

      {activeSignals.length === 0 ? (
        <div className="text-center py-12 px-6 bg-slate-1000/60 border border-slate-900 rounded-2xl space-y-4">
          <div className="w-12 h-12 rounded-full bg-slate-900 flex items-center justify-center mx-auto text-slate-600">
            <BellRing className="w-5.5 h-5.5" />
          </div>
          <div className="space-y-1.5 max-w-sm mx-auto">
            <h4 className="text-sm font-semibold text-slate-200">No Open Running Signals</h4>
            <p className="text-xs text-slate-400 leading-relaxed">
              When you broadcast a signal, it remains "Active" in the registry. Select active items here to dispatch target telemetry.
            </p>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6" id="alerts-signals-grid">
          
          {/* Active Lists Selection Container */}
          <div className="lg:col-span-5 space-y-3.5">
            <span className="text-[10px] uppercase font-bold text-slate-400 block tracking-wider">
              Open Channel Positions ({activeSignals.length})
            </span>
            
            <div className="space-y-2.5 max-h-[420px] overflow-y-auto pr-1">
              {activeSignals.map((sig) => {
                const isSelected = selectedSignal?.id === sig.id;
                return (
                  <div
                    key={sig.id}
                    onClick={() => onSelectSignal(sig)}
                    className={`p-3.5 rounded-xl border cursor-pointer transition-all ${
                      isSelected
                        ? "bg-slate-900 border-sky-500/40 shadow-md shadow-sky-500/5 text-white"
                        : "bg-slate-950 border-slate-850/60 hover:border-slate-800 text-slate-300 hover:bg-slate-900/30"
                    }`}
                    id={`active-sig-item-${sig.id}`}
                  >
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wider ${
                            sig.action.includes("BUY") || sig.action.includes("UNDER") 
                              ? "bg-emerald-950 text-emerald-400" 
                              : "bg-rose-950/60 text-rose-450"
                          }`}>
                            {sig.action}
                          </span>
                          <span className="text-xs font-bold font-mono tracking-wide">{sig.symbol}</span>
                        </div>
                        <span className="text-[10px] px-2 py-0.5 rounded bg-slate-900/80 border border-slate-850 text-sky-400 font-mono">
                          ID: {sig.sentMessageId || "Simulated"}
                        </span>
                      </div>

                      <div className="grid grid-cols-2 gap-1 text-[10px] text-slate-400 font-mono">
                        <div>Entry: <span className="text-slate-200 font-bold">{sig.entry || "CMP"}</span></div>
                        <div>SL: <span className="text-rose-400 font-semibold">{sig.sl || "None"}</span></div>
                        <div className="col-span-2 truncate">TP1: <span className="text-emerald-400 font-semibold">{sig.tp1 || "N/A"}</span> &bull; TP2: <span className="text-emerald-400 font-semibold">{sig.tp2 || "N/A"}</span></div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Action update parameters */}
          <div className="lg:col-span-7">
            {selectedSignal ? (
              <div className="bg-slate-950 border border-slate-850 rounded-2xl p-5 space-y-4 shadow-xl">
                
                {/* Details header */}
                <div className="flex items-start justify-between border-b border-slate-900 pb-3">
                  <div className="space-y-0.5">
                    <span className="text-[9px] font-bold text-sky-400 uppercase tracking-widest font-mono">Live Telemetry Control</span>
                    <h4 className="text-sm font-bold text-white flex items-center gap-1.5 font-mono">
                      <span>{selectedSignal.symbol}</span>
                      <span className="text-slate-500 italic font-sans font-normal text-xs">&bull; {selectedSignal.assetClass}</span>
                    </h4>
                  </div>
                  <button
                    onClick={() => onSelectSignal(null)}
                    className="p-1 hover:bg-slate-900 rounded-lg text-slate-500 hover:text-white transition-all cursor-pointer"
                    title="Close details focus"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                {/* Simulated targets hits layout */}
                <div className="space-y-3">
                  <span className="text-[10.5px] uppercase font-bold text-slate-400 block tracking-wider">
                    Quick Send Target Telemetry (Reply to original message ID {selectedSignal.sentMessageId})
                  </span>

                  <div className="grid grid-cols-2 gap-2.5">
                    <button
                      type="button"
                      onClick={() => onSendSignalUpdate("TP1")}
                      disabled={submittingUpdate || !selectedSignal.tp1}
                      className="p-3 text-xs font-semibold bg-amber-500/10 hover:bg-amber-500/20 disabled:hover:bg-amber-500/15 disabled:opacity-40 text-amber-300 border border-amber-500/25 rounded-xl cursor-pointer disabled:cursor-not-allowed transition-all flex flex-col items-center justify-center gap-1"
                      id="telemetry-tp1-hit"
                    >
                      <Target className="w-4 h-4 text-amber-400" />
                      <span>Send TP 1 Hit ({selectedSignal.tp1 || "N/A"})</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => onSendSignalUpdate("TP2")}
                      disabled={submittingUpdate || !selectedSignal.tp2}
                      className="p-3 text-xs font-semibold bg-emerald-500/10 hover:bg-emerald-500/20 disabled:hover:bg-emerald-500/15 disabled:opacity-40 text-emerald-300 border border-emerald-500/25 rounded-xl cursor-pointer disabled:cursor-not-allowed transition-all flex flex-col items-center justify-center gap-1"
                      id="telemetry-tp2-hit"
                    >
                      <Target className="w-4 h-4 text-emerald-400 animate-pulse" />
                      <span>Send TP 2 Hit ({selectedSignal.tp2 || "N/A"})</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => onSendSignalUpdate("TP3")}
                      disabled={submittingUpdate || !selectedSignal.tp3}
                      className="p-3 text-xs font-semibold bg-indigo-500/10 hover:bg-indigo-500/15 disabled:hover:bg-indigo-500/10 disabled:opacity-40 text-indigo-300 border border-indigo-500/25 rounded-xl cursor-pointer disabled:cursor-not-allowed transition-all flex flex-col items-center justify-center gap-1"
                      id="telemetry-tp3-hit"
                    >
                      <Sparkles className="w-4 h-4 text-indigo-400" />
                      <span>Send TP 3 Hit ({selectedSignal.tp3 || "N/A"})</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => onSendSignalUpdate("SL")}
                      disabled={submittingUpdate || !selectedSignal.sl}
                      className="p-3 text-xs font-semibold bg-rose-500/10 hover:bg-rose-500/20 disabled:hover:bg-rose-500/15 disabled:opacity-40 text-rose-300 border border-rose-500/25 rounded-xl cursor-pointer disabled:cursor-not-allowed transition-all flex flex-col items-center justify-center gap-1"
                      id="telemetry-sl-hit"
                    >
                      <Shield className="w-4 h-4 text-rose-450" />
                      <span>Send Stop Loss Hit ({selectedSignal.sl || "N/A"})</span>
                    </button>
                  </div>

                  <button
                    type="button"
                    onClick={() => onSendSignalUpdate("CLOSED")}
                    disabled={submittingUpdate}
                    className="w-full py-2 bg-slate-900 border border-slate-800 hover:text-white text-slate-300 font-bold rounded-xl text-center text-xs transition-all tracking-wide cursor-pointer flex items-center justify-center gap-1.5"
                    id="telemetry-manual-close"
                  >
                    <span>🚪 Close Trade position manually at current rate</span>
                  </button>
                </div>

                {/* Custom Update block */}
                <div className="space-y-2 pt-3 border-t border-slate-900/90">
                  <div className="flex items-center gap-1.5 text-xs text-slate-300 font-semibold uppercase tracking-wider font-sans">
                    <MessageSquare className="w-3.5 h-3.5 text-sky-400" />
                    <span>Send Custom Announcement to original message thread</span>
                  </div>

                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={customUpdateText}
                      onChange={(e) => onCustomUpdateChange(e.target.value)}
                      placeholder="e.g. Setting Stop Loss to entry level, position in profit..."
                      className="flex-1 px-3.5 py-2 text-xs bg-slate-900 border border-slate-800 focus:border-sky-500 rounded-xl text-slate-200 outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => onSendSignalUpdate("CUSTOM")}
                      disabled={submittingUpdate || !customUpdateText.trim()}
                      className="px-4 py-2 bg-sky-600 hover:bg-sky-500 disabled:bg-slate-850 disabled:text-slate-500 text-white font-bold text-xs rounded-xl flex items-center justify-center gap-1 transition-all"
                    >
                      <span>Send</span>
                    </button>
                  </div>
                </div>

                {/* Error feedback */}
                {updateError && (
                  <div className="p-3 bg-rose-950/20 text-rose-300 border border-rose-900/40 rounded-xl text-xs flex items-center gap-2">
                    <span className="shrink-0 text-rose-400 font-bold">&#9888;</span>
                    <span>{updateError}</span>
                  </div>
                )}

                <div className="p-3 bg-slate-900/40 rounded-xl border border-slate-850/50 flex items-start gap-2.5 text-[10.5px] text-slate-400 font-sans leading-normal">
                  <Info className="w-4 h-4 text-sky-450 shrink-0 mt-0.5" />
                  <span>The custom replies will link natively using Telegram reply threading models. Ensure your bot has permission to post reply updates.</span>
                </div>

              </div>
            ) : (
              <div className="h-full flex flex-col items-center justify-center text-center p-8 bg-slate-950/40 border border-slate-900 border-dashed rounded-2xl min-h-[340px]">
                <Layers className="w-8 h-8 text-slate-600 mb-3" />
                <h5 className="text-xs font-bold text-slate-300 uppercase tracking-widest font-sans">Active Target Monitor</h5>
                <p className="text-[11px] text-slate-400 mt-1.5 max-w-xs leading-normal">
                  Select any active running signal from the left column to configure target replies, manual price adjustments, and dynamic TP achievements.
                </p>
              </div>
            )}
          </div>

        </div>
      )}

      {/* --- NEW SECTION: DYNAMIC OPERATIONAL ALERTS SUITE --- */}
      <div className="pt-8 border-t border-slate-850/80 space-y-5" id="vip-operational-alerts-deck">
        <div className="space-y-1">
          <h4 className="text-sm font-bold text-slate-100 flex items-center gap-2 font-mono">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 inline-block animate-ping"></span>
            <span>VIP Channel Multi-Operational Client Announcement Alerts</span>
          </h4>
          <p className="text-xs text-slate-400 leading-normal max-w-3xl">
            Quickly formulate, save templates of, and dispatch standalone community alerts. Target channel destination is detected automatically from your active connection:
            {!telegramConfig.chatId ? (
              <span className="text-rose-400 font-semibold font-mono"> (⚠️ Configure Telegram Credentials in settings)</span>
            ) : (
              <span className="text-sky-400 font-semibold font-mono"> (Detected Auto-Linked Room: {telegramConfig.chatTitle || telegramConfig.chatId})</span>
            )}
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

          {/* ALERT FEATURE 1: STANDBY WARNING ALERT */}
          <div className="bg-slate-950 border border-slate-850/80 hover:border-slate-800 rounded-2xl p-4.5 flex flex-col justify-between space-y-4 shadow-lg transition-all" id="operational-alert-pre-card">
            <div className="space-y-2.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="p-2 bg-amber-500/10 text-amber-400 rounded-lg">
                    <Clock className="w-4 h-4" />
                  </div>
                  <div>
                    <h5 className="text-xs font-bold text-slate-200">1st Standby Warning</h5>
                    <p className="text-[9px] text-slate-500 uppercase font-bold tracking-wider">Before Sending Draft</p>
                  </div>
                </div>
                <span className="text-[8.5px] font-bold bg-amber-950/60 text-amber-400 px-1.5 py-0.5 rounded font-mono">PRE-ALERT</span>
              </div>
              <p className="text-[10.5px] text-slate-400 leading-relaxed font-sans">
                Sends a preparatory warning alert asking participants to align accounts and expect a swift digital index move shortly.
              </p>

              {/* Space to insert */}
              <div className="space-y-1 pt-1 font-sans">
                <div className="flex items-center justify-between">
                  <label className="text-[9px] uppercase font-bold text-slate-500 block">Edit Draft Signal Alert Warning</label>
                  <span className="text-[9px] text-teal-400 font-bold animate-pulse font-mono">Auto-saves instantly ⚡</span>
                </div>
                <textarea
                  value={preSignalText}
                  onChange={(e) => handlePreSignalChange(e.target.value)}
                  className="w-full h-32 text-[10.5px] bg-slate-900 border border-slate-850 focus:border-amber-500/40 rounded-xl p-2.5 text-slate-100 placeholder-slate-650 outline-none transition-all font-mono leading-normal"
                  placeholder="Insert custom Pre-Signal stand-by warning here..."
                  id="textarea-pre-signal-broadcaster"
                />
              </div>
            </div>

            <div className="space-y-2 pt-2.5 border-t border-slate-900">
              <div className="flex items-center gap-2 font-sans">
                <button
                  type="button"
                  onClick={handleSavePreAlert}
                  className="flex-1 py-2 text-[11px] bg-slate-900 hover:bg-slate-850 text-slate-300 font-semibold rounded-lg transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                  id="btn-save-pre-preset"
                  title="Save current raw warning to presets cache"
                >
                  <Save className="w-3.5 h-3.5 text-slate-450" />
                  <span>Save Option 💾</span>
                </button>

                <button
                  type="button"
                  disabled={prePostStatus.status === "loading" || !telegramConfig.chatId}
                  onClick={handlePostPreAlert}
                  className="flex-1 py-2 text-[11px] bg-gradient-to-r from-amber-600 to-amber-500 hover:from-amber-550 hover:to-amber-450 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold rounded-lg transition-all flex items-center justify-center gap-1.5 cursor-pointer shadow-md"
                  id="btn-send-pre-telegram"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>Send to Channel</span>
                </button>
              </div>

              {preSaveStatus && (
                <p className="text-[9.5px] text-teal-400 font-semibold font-sans text-center">{preSaveStatus}</p>
              )}

              {prePostStatus.status !== "idle" && (
                <div className={`p-2.5 rounded-xl text-[10px] font-sans ${
                  prePostStatus.status === "success" 
                    ? "bg-emerald-950/30 text-emerald-300 border border-emerald-900/30" 
                    : prePostStatus.status === "error" 
                    ? "bg-rose-950/25 text-rose-300 border border-rose-900/35" 
                    : "bg-slate-900 text-slate-450 border border-slate-850/70"
                }`}>
                  {prePostStatus.status === "loading" ? "⏳ Publishing standby update to VIP Telegram channel..." : prePostStatus.msg}
                </div>
              )}
            </div>
          </div>

          {/* ALERT FEATURE 2: NEXT SESSION TIMER RELEASE REMINDER */}
          <div className="bg-slate-950 border border-slate-850/80 hover:border-slate-800 rounded-2xl p-4.5 flex flex-col justify-between space-y-4 shadow-lg transition-all" id="operational-alert-next-card">
            <div className="space-y-2.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="p-2 bg-indigo-500/10 text-indigo-400 rounded-lg">
                    <Calendar className="w-4 h-4" />
                  </div>
                  <div>
                    <h5 className="text-xs font-bold text-slate-200">3rd Next Release Timer</h5>
                    <p className="text-[9px] text-slate-500 uppercase font-bold tracking-wider">Session Release Schedule</p>
                  </div>
                </div>
                <span className="text-[8.5px] font-bold bg-indigo-950/60 text-indigo-400 px-1.5 py-0.5 rounded font-mono">SCHEDULE</span>
              </div>
              <p className="text-[10.5px] text-slate-400 leading-relaxed font-sans">
                Informs participants of the exact expected duration or timestamp of when the next trading signal is scheduled.
              </p>

              {/* Space to insert */}
              <div className="space-y-1 pt-1 font-sans">
                <div className="flex items-center justify-between">
                  <label className="text-[9px] uppercase font-bold text-slate-500 block">Edit Release Schedule Reminder copy</label>
                  <span className="text-[9px] text-teal-400 font-bold animate-pulse font-mono">Auto-saves instantly ⚡</span>
                </div>
                <textarea
                  value={nextSessionText}
                  onChange={(e) => handleNextSessionChange(e.target.value)}
                  className="w-full h-32 text-[10.5px] bg-slate-900 border border-slate-850 focus:border-indigo-500/40 rounded-xl p-2.5 text-slate-100 placeholder-slate-650 outline-none transition-all font-mono leading-normal"
                  placeholder="Insert custom next session timer copy..."
                  id="textarea-next-session-broadcaster"
                />
              </div>
            </div>

            <div className="space-y-2 pt-2.5 border-t border-slate-900">
              <div className="flex items-center gap-2 font-sans">
                <button
                  type="button"
                  onClick={handleSaveNextAlert}
                  className="flex-1 py-2 text-[11px] bg-slate-900 hover:bg-slate-850 text-slate-300 font-semibold rounded-lg transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                  id="btn-save-next-preset"
                  title="Save current scheduling reminder to presets cache"
                >
                  <Save className="w-3.5 h-3.5 text-slate-450" />
                  <span>Save Option 💾</span>
                </button>

                <button
                  type="button"
                  disabled={nextPostStatus.status === "loading" || !telegramConfig.chatId}
                  onClick={handlePostNextAlert}
                  className="flex-1 py-2 text-[11px] bg-gradient-to-r from-indigo-600 to-indigo-500 hover:from-indigo-550 hover:to-indigo-450 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold rounded-lg transition-all flex items-center justify-center gap-1.5 cursor-pointer shadow-md"
                  id="btn-send-next-telegram"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>Send to Channel</span>
                </button>
              </div>

              {nextSaveStatus && (
                <p className="text-[9.5px] text-teal-400 font-semibold font-sans text-center">{nextSaveStatus}</p>
              )}

              {nextPostStatus.status !== "idle" && (
                <div className={`p-2.5 rounded-xl text-[10px] font-sans ${
                  nextPostStatus.status === "success" 
                    ? "bg-emerald-950/30 text-emerald-300 border border-emerald-900/30" 
                    : nextPostStatus.status === "error" 
                    ? "bg-rose-950/25 text-rose-300 border border-rose-900/35" 
                    : "bg-slate-900 text-slate-450 border border-slate-850/70"
                }`}>
                  {nextPostStatus.status === "loading" ? "⏳ Publishing scheduling update alert to VIP channel..." : nextPostStatus.msg}
                </div>
              )}
            </div>
          </div>

        </div>
      </div>

    </div>
  );
}
