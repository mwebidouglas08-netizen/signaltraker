import React, { useState, useEffect } from "react";
import { 
  Bell, 
  Send, 
  History, 
  Coins, 
  Layers, 
  Flame, 
  CheckCircle, 
  X, 
  Plus, 
  MessageSquare, 
  Eye, 
  CornerDownRight, 
  CheckCircle2, 
  TrendingUp, 
  Clock, 
  Volume2, 
  Share2, 
  Info, 
  AlertTriangle,
  RotateCcw,
  BookOpen
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import TelegramConfigPanel from "./components/TelegramConfigPanel";
import TradingSignalForm from "./components/TradingSignalForm";
import VolatilityScanner from "./components/VolatilityScanner";
import { TradingSignal, TelegramConfig, SignalStatus, SignalUpdate } from "./types";
import { Cpu } from "lucide-react";

const LOCAL_STORAGE_KEY_CONFIG = "tg_signal_broadcaster_config";
const LOCAL_STORAGE_KEY_SIGNALS = "tg_signal_broadcaster_signals";

export default function App() {
  // --- STATE ---
  const [config, setConfig] = useState<TelegramConfig>({
    botToken: "",
    chatId: "",
    chatTitle: "",
    isConnected: false,
    enableScannerBroadcast: true,
    enableManualBroadcast: true,
  });

  const [signals, setSignals] = useState<TradingSignal[]>([]);
  
  // App states
  const [aiConfigured, setAiConfigured] = useState(false);
  const [activeTab, setActiveTab] = useState<"compose" | "scanner" | "history">("scanner");
  const [currentDraft, setCurrentDraft] = useState<{
    assetClass: string;
    symbol: string;
    action: string;
    entry: string;
    tp1: string;
    tp2: string;
    tp3: string;
    sl: string;
    formattedText: string;
    rationale: string;
  } | null>(null);

  // Editable text before broadcasting
  const [editableText, setEditableText] = useState("");
  const [editableRationale, setEditableRationale] = useState("");
  
  // Status and broadcasting activity
  const [isBroadcasting, setIsBroadcasting] = useState(false);
  const [broadcastError, setBroadcastError] = useState("");
  const [broadcastSuccess, setBroadcastSuccess] = useState(false);
  const [lastBroadcastId, setLastBroadcastId] = useState<string | null>(null);

  // Active Signal Management
  const [selectedSignal, setSelectedSignal] = useState<TradingSignal | null>(null);
  const [customUpdateText, setCustomUpdateText] = useState("");
  const [submittingUpdate, setSubmittingUpdate] = useState(false);
  const [updateError, setUpdateError] = useState("");
  const [filterStatus, setFilterStatus] = useState<"ALL" | "ACTIVE" | "CLOSED">("ALL");

  // System Health
  useEffect(() => {
    fetch("/api/health")
      .then((res) => res.json())
      .then((data) => {
        setAiConfigured(data.aiConfigured);
      })
      .catch((err) => console.error("Error pinging api health:", err));
  }, []);

  // Hydrate local cache
  useEffect(() => {
    const savedConfig = localStorage.getItem(LOCAL_STORAGE_KEY_CONFIG);
    if (savedConfig) {
      try {
        const parsed = JSON.parse(savedConfig);
        setConfig({
          enableScannerBroadcast: true,
          enableManualBroadcast: true,
          ...parsed
        });
      } catch (e) {
        console.error("Failed to parse saved telegram config", e);
      }
    }

    const savedSignals = localStorage.getItem(LOCAL_STORAGE_KEY_SIGNALS);
    if (savedSignals) {
      try {
        setSignals(JSON.parse(savedSignals));
      } catch (e) {
        console.error("Failed to parse saved signals log", e);
      }
    }
  }, []);

  // Persist State Updates
  const persistConfig = (newConfig: TelegramConfig) => {
    setConfig(newConfig);
    localStorage.setItem(LOCAL_STORAGE_KEY_CONFIG, JSON.stringify(newConfig));
  };

  const persistSignals = (newSignals: TradingSignal[]) => {
    setSignals(newSignals);
    localStorage.setItem(LOCAL_STORAGE_KEY_SIGNALS, JSON.stringify(newSignals));
  };

  // Callback when Form Generates a Signal
  const handleSignalGenerated = (data: {
    assetClass: string;
    symbol: string;
    action: string;
    entry: string;
    tp1: string;
    tp2: string;
    tp3: string;
    sl: string;
    formattedText: string;
    rationale: string;
  }, skipAutoBroadcast?: boolean) => {
    setCurrentDraft(data);
    setEditableText(data.formattedText);
    setEditableRationale(data.rationale);
    setBroadcastSuccess(false);
    setBroadcastError("");

    if (config.enableManualBroadcast !== false && !skipAutoBroadcast) {
      setTimeout(() => {
        executeAutoBroadcast(data);
      }, 50);
    }
  };

  // Automatic broadcast helper for custom compiler signals
  const executeAutoBroadcast = async (draftData: {
    assetClass: string;
    symbol: string;
    action: string;
    entry: string;
    tp1: string;
    tp2: string;
    tp3: string;
    sl: string;
    formattedText: string;
    rationale: string;
  }) => {
    if (!config.botToken || !config.chatId) {
      setBroadcastError("Please configure your Telegram Bot Token and Channel ID before auto-broadcasting.");
      return;
    }

    setIsBroadcasting(true);
    setBroadcastError("");
    setBroadcastSuccess(false);

    try {
      const response = await fetch("/api/telegram/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          botToken: config.botToken,
          chatId: config.chatId,
          text: draftData.formattedText,
        }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || "Failed to broadcast signal.");
      }

      // Record successful dispatch
      const newSignal: TradingSignal = {
        id: "sig_" + Date.now(),
        assetClass: draftData.assetClass || "Other",
        symbol: draftData.symbol || "CUSTOM",
        action: draftData.action || "BUY",
        entry: draftData.entry || "CMP",
        tp1: draftData.tp1 || "",
        tp2: draftData.tp2 || "",
        tp3: draftData.tp3 || "",
        sl: draftData.sl || "",
        userNotes: "Auto-Shared instantly after formulation",
        formattedText: draftData.formattedText,
        rationale: draftData.rationale,
        status: "ACTIVE",
        sentMessageId: data.messageId ? String(data.messageId) : null,
        botTokenUsed: config.botToken,
        chatIdUsed: config.chatId,
        chatTitle: data.chatTitle || config.chatTitle || "Telegram Channel",
        createdAt: new Date().toISOString(),
        updateHistory: [],
      };

      setSignals((prev) => {
        const updated = [newSignal, ...prev];
        localStorage.setItem(LOCAL_STORAGE_KEY_SIGNALS, JSON.stringify(updated));
        return updated;
      });
      setBroadcastSuccess(true);
      setLastBroadcastId(newSignal.id);
      setSelectedSignal(newSignal);
      setCurrentDraft(null); // Clear raw draft as it's sent & stored in signals history list!
    } catch (err: any) {
      setBroadcastError(err.message || "An issue occurred connecting to Telegram.");
    } finally {
      setIsBroadcasting(false);
    }
  };

  // Broadcast Draft over Express API API to Telegram
  const handleBroadcastSignal = async () => {
    if (!config.botToken || !config.chatId) {
      setBroadcastError("Please configure your Telegram Bot Token and Channel ID before broadcasting.");
      return;
    }

    if (!editableText) {
      setBroadcastError("There is no formatted signal content to broadcast yet.");
      return;
    }

    setIsBroadcasting(true);
    setBroadcastError("");
    setBroadcastSuccess(false);

    try {
      const response = await fetch("/api/telegram/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          botToken: config.botToken,
          chatId: config.chatId,
          text: editableText,
        }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || "Failed to broadcast signal.");
      }

      // Record successful dispatch
      const newSignal: TradingSignal = {
        id: "sig_" + Date.now(),
        assetClass: currentDraft?.assetClass || "Other",
        symbol: currentDraft?.symbol || "CUSTOM",
        action: currentDraft?.action || "BUY",
        entry: currentDraft?.entry || "CMP",
        tp1: currentDraft?.tp1 || "",
        tp2: currentDraft?.tp2 || "",
        tp3: currentDraft?.tp3 || "",
        sl: currentDraft?.sl || "",
        userNotes: currentDraft?.userNotes || "",
        formattedText: editableText,
        rationale: editableRationale,
        status: "ACTIVE",
        sentMessageId: data.messageId ? String(data.messageId) : null,
        botTokenUsed: config.botToken,
        chatIdUsed: config.chatId,
        chatTitle: data.chatTitle || config.chatTitle || "Telegram Channel",
        createdAt: new Date().toISOString(),
        updateHistory: [],
      };

      const updatedSignals = [newSignal, ...signals];
      persistSignals(updatedSignals);
      setBroadcastSuccess(true);
      setLastBroadcastId(newSignal.id);
      
      // Auto-select is useful for subsequent quick edits!
      setSelectedSignal(newSignal);

      // Flash tab or clear draft block state
      setCurrentDraft(null);
    } catch (err: any) {
      setBroadcastError(err.message || "An issue occurred connecting to Telegram.");
    } finally {
      setIsBroadcasting(false);
    }
  };

  // Direct post helper for auto scanner bot broadcasts
  const handlePostDirectTelegram = async (text: string) => {
    if (config.enableScannerBroadcast === false) {
      return { success: false, error: "Auto-Broadcasting from the scanner is turned OFF." };
    }

    if (!config.botToken || !config.chatId) {
      return { success: false, error: "Please configure your Telegram credentials first!" };
    }

    try {
      const response = await fetch("/api/telegram/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          botToken: config.botToken,
          chatId: config.chatId,
          text: text,
        }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || "Failed to broadcast signal.");
      }

      // Record successful dispatch
      const newSignal: TradingSignal = {
        id: "sig_" + Date.now(),
        assetClass: "Deriv Synthetic",
        symbol: currentDraft?.symbol || "Volatility Peak Index",
        action: currentDraft?.action || "UNDER 7",
        entry: currentDraft?.entry || "Digit Trigger",
        tp1: currentDraft?.tp1 || "UNDER 7",
        tp2: "",
        tp3: "",
        sl: currentDraft?.sl || "Confidence 90%+",
        userNotes: "Auto-Broadcasted by Volatility Scanner Bot",
        formattedText: text,
        rationale: editableRationale || "Algorithmic pattern matching.",
        status: "ACTIVE",
        sentMessageId: data.messageId ? String(data.messageId) : null,
        botTokenUsed: config.botToken,
        chatIdUsed: config.chatId,
        chatTitle: data.chatTitle || config.chatTitle || "Telegram Channel",
        createdAt: new Date().toISOString(),
        updateHistory: [],
      };

      // Ensure we have current signal lists
      setSignals((prev) => {
        const next = [newSignal, ...prev];
        localStorage.setItem(LOCAL_STORAGE_KEY_SIGNALS, JSON.stringify(next));
        return next;
      });
      
      setSelectedSignal(newSignal);

      return { success: true, messageId: data.messageId ? String(data.messageId) : "unknown" };
    } catch (err: any) {
      return { success: false, error: err.message || "Failed to post." };
    }
  };

  // Send an update (reply message on Telegram relative to the original broadcast message id)
  const handleSendSignalUpdate = async (updateType: "TP1" | "TP2" | "TP3" | "SL" | "CLOSED" | "CUSTOM") => {
    if (!selectedSignal || !selectedSignal.sentMessageId) {
      setUpdateError("This signal has no live message reference to reply to.");
      return;
    }

    const token = selectedSignal.botTokenUsed || config.botToken;
    const cid = selectedSignal.chatIdUsed || config.chatId;

    if (!token || !cid) {
      setUpdateError("Missing bot configuration or original room credentials.");
      return;
    }

    setSubmittingUpdate(true);
    setUpdateError("");

    let statusText = "";
    let updateLabel = "";
    let nextStatus: SignalStatus = selectedSignal.status;

    if (updateType === "TP1") {
      updateLabel = "🎯 TP 1 HIT";
      statusText = `<b>🎯 TAKE PROFIT 1 HIT!</b>\n\nAsset: <b>${selectedSignal.symbol}</b>\nSetup Status: <b>TP 1 Level (${selectedSignal.tp1})</b> met successfully! 📈 Securing gains and moving SL to Entry Zone.`;
      nextStatus = "TP1_HIT";
    } else if (updateType === "TP2") {
      updateLabel = "🎯 TP 2 HIT";
      statusText = `<b>🎯 TAKE PROFIT 2 HIT!</b>\n\nAsset: <b>${selectedSignal.symbol}</b>\nSetup Status: <b>TP 2 Level (${selectedSignal.tp2})</b> met beautifully!\n\n🚀 Let the rest run!`;
      nextStatus = "TP2_HIT";
    } else if (updateType === "TP3") {
      updateLabel = "🎯 TP 3 HIT";
      statusText = `<b>🎯 TAKE PROFIT 3 HIT (MAX DEPTH)!</b>\n\nAsset: <b>${selectedSignal.symbol}</b>\nSetup Status: <b>Final TP Target (${selectedSignal.tp3}) Achieved!</b>\n\n💰 Maximum return secured. Clear exit, position fully closed.`;
      nextStatus = "CLOSED";
    } else if (updateType === "SL") {
      updateLabel = "🛡️ SL HIT";
      statusText = `<b>🛡️ STOP LOSS TRIGGERED</b>\n\nAsset: <b>${selectedSignal.symbol}</b>\nSetup Status: Market reached the safety exit trigger <b>(${selectedSignal.sl})</b>. Trade closed in interest of capital preservation.`;
      nextStatus = "SL_HIT";
    } else if (updateType === "CLOSED") {
      updateLabel = "🚪 TRADE CLOSED";
      statusText = `<b>🚪 TRADE CLOSED MANUALLY</b>\n\nAsset: <b>${selectedSignal.symbol}</b>\nSetup Status: Position closed manually at the current rate. Clear remaining run balances.`;
      nextStatus = "CLOSED";
    } else {
      updateLabel = "📣 MANUAL UPDATE";
      if (!customUpdateText.trim()) {
        setUpdateError("Please specify what your custom update message is.");
        setSubmittingUpdate(false);
        return;
      }
      statusText = `<b>📣 UPDATE ON ${selectedSignal.symbol}:</b>\n\n${customUpdateText.trim()}`;
    }

    try {
      const response = await fetch("/api/telegram/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          botToken: token,
          chatId: cid,
          text: statusText,
          replyToMessageId: selectedSignal.sentMessageId,
        }),
      });

      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.error || "Failed send of reply update text.");
      }

      // Record successful update
      const newUpdate: SignalUpdate = {
        id: "upd_" + Date.now(),
        updateType: updateLabel,
        text: statusText,
        sentMessageId: String(data.messageId),
        timestamp: new Date().toISOString(),
      };

      const updatedSignals = signals.map((s) => {
        if (s.id === selectedSignal.id) {
          return {
            ...s,
            status: nextStatus,
            updateHistory: [...s.updateHistory, newUpdate],
          };
        }
        return s;
      });

      persistSignals(updatedSignals);
      const updatedSelected = updatedSignals.find((s) => s.id === selectedSignal.id);
      if (updatedSelected) {
        setSelectedSignal(updatedSelected);
      }
      
      setCustomUpdateText("");
    } catch (err: any) {
      setUpdateError(err.message || "Could not publish thread update to Telegram.");
    } finally {
      setSubmittingUpdate(false);
    }
  };

  const handleDeleteHistoryItem = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirm("Are you sure you want to remove this signal record from your local dashboard log? (This will not delete the Telegram post itself).")) {
      const filtered = signals.filter((s) => s.id !== id);
      persistSignals(filtered);
      if (selectedSignal?.id === id) {
        setSelectedSignal(null);
      }
    }
  };

  const getStatusColor = (status: SignalStatus) => {
    switch (status) {
      case "ACTIVE":
        return "bg-sky-500/15 text-sky-400 border border-sky-500/30";
      case "TP1_HIT":
        return "bg-amber-500/15 text-amber-300 border border-amber-500/35";
      case "TP2_HIT":
        return "bg-emerald-500/15 text-emerald-300 border border-emerald-500/35";
      case "TP3_HIT":
        return "bg-emerald-600/15 text-emerald-400 border border-emerald-500/40 animate-pulse";
      case "SL_HIT":
        return "bg-rose-500/15 text-rose-400 border border-rose-500/30";
      case "CLOSED":
        return "bg-slate-700/30 text-slate-400 border border-slate-700/40";
      default:
        return "bg-slate-700/10 text-slate-400";
    }
  };

  // Filter signals log
  const filteredSignalsList = signals.filter((s) => {
    if (filterStatus === "ALL") return true;
    if (filterStatus === "ACTIVE") return s.status === "ACTIVE" || s.status.includes("TP");
    if (filterStatus === "CLOSED") return s.status === "SL_HIT" || s.status === "CLOSED";
    return true;
  });

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-sky-500 selection:text-white" id="main-app-container">
      {/* Top Navigation Bar with branding and health report */}
      <header className="border-b border-slate-900 bg-slate-950/80 backdrop-blur-md sticky top-0 z-50 px-6 py-4" id="top-navbar">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-sky-600 to-indigo-600 flex items-center justify-center shadow-lg shadow-indigo-600/20" id="brand-logo-icon">
              <Share2 className="w-5 h-5 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-base font-bold tracking-tight text-white font-sans">Signal Broadcaster</h1>
                <span className="text-[10px] px-2 py-0.5 bg-slate-900 border border-slate-800 text-sky-400 rounded-full font-semibold">
                  v2.1
                </span>
              </div>
              <p className="text-[11px] text-slate-400">Secure trading alerts directly to your Telegram audiences</p>
            </div>
          </div>

          <div className="flex items-center gap-4">
            {/* Gemini Setup Indicator */}
            <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-900/60 border border-slate-850 rounded-lg text-xs" id="ai-engine-status-badge">
              <div className={`w-2 h-2 rounded-full ${aiConfigured ? "bg-emerald-500" : "bg-amber-400"}`}></div>
              <span className="text-slate-400 font-medium">Gemini 3.5 AI:</span>
              <span className={aiConfigured ? "text-emerald-400 font-semibold" : "text-amber-400 font-semibold"}>
                {aiConfigured ? "Secured" : "Incomplete Setup (Fallback used)"}
              </span>
            </div>

            <div className="flex bg-slate-900 p-1 rounded-xl border border-slate-850 gap-0.5" id="primary-view-toggles">
              <button
                onClick={() => setActiveTab("scanner")}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
                  activeTab === "scanner"
                    ? "bg-slate-800 text-white shadow-sm"
                    : "text-slate-400 hover:text-white"
                }`}
                type="button"
                id="tab-toggle-scanner"
              >
                <Cpu className="w-3.5 h-3.5 text-sky-450" />
                <span>Scanner Bot</span>
                <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-pulse shrink-0"></span>
              </button>
              <button
                onClick={() => setActiveTab("compose")}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
                  activeTab === "compose"
                    ? "bg-slate-800 text-white shadow-sm"
                    : "text-slate-400 hover:text-white"
                }`}
                type="button"
                id="tab-toggle-compose"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Composer</span>
              </button>
              <button
                onClick={() => setActiveTab("history")}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg transition-all cursor-pointer relative ${
                  activeTab === "history"
                    ? "bg-slate-800 text-white shadow-sm"
                    : "text-slate-400 hover:text-white"
                }`}
                type="button"
                id="tab-toggle-history"
              >
                <History className="w-3.5 h-3.5" />
                <span>Running feeds ({signals.length})</span>
                {signals.some((s) => s.status === "ACTIVE") && (
                  <span className="absolute -top-1 -right-1 w-2 h-2 bg-rose-500 rounded-full"></span>
                )}
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Dynamic Status bar showing active broadcast settings with toggles as requested by user */}
      <div className="bg-slate-900/60 border-b border-slate-900/80 py-3 px-6 font-sans backdrop-blur-sm shadow-inner" id="global-broadcast-sharing-status-bar">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4 text-xs">
          <div className="flex flex-wrap items-center gap-2 text-slate-400">
            <span className="flex items-center gap-1.5 text-sky-400">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-sky-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-sky-500"></span>
              </span>
              <span>Primary Telegram Feed:</span>
            </span>
            <code className="bg-slate-950 px-2.5 py-1 rounded text-sky-300 border border-slate-850 font-mono font-medium text-[11px]">
              {config.chatId || "-1002590400274"}
            </code>
            {config.isConnected && (
              <span className="bg-emerald-950/40 text-emerald-400 border border-emerald-950/80 px-2 py-0.5 rounded text-[10px]">
                Linked 🔗
              </span>
            )}
          </div>
          
          <div className="flex flex-col sm:flex-row flex-wrap items-center gap-3 sm:gap-6">
            {/* Toggle Option 1: Scanner Setup Alerts */}
            <div className="flex items-center gap-2.5">
              <span className="text-slate-300 font-medium">1. Volatility Scanner Live:</span>
              <button
                type="button"
                onClick={() => persistConfig({
                  ...config,
                  enableScannerBroadcast: config.enableScannerBroadcast === false ? true : false
                })}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold border cursor-pointer transition-all duration-150 transform active:scale-95 flex items-center gap-1.5 ${
                  config.enableScannerBroadcast !== false
                    ? "bg-emerald-950 border-emerald-800 text-emerald-300 shadow-md shadow-emerald-950/20"
                    : "bg-slate-900 border-slate-800 text-slate-500 hover:bg-slate-850 hover:text-slate-400"
                }`}
                id="header-toggle-scanner-share"
              >
                <div className={`w-1.5 h-1.5 rounded-full ${config.enableScannerBroadcast !== false ? "bg-emerald-400 animate-pulse" : "bg-slate-600"}`}></div>
                <span>{config.enableScannerBroadcast !== false ? "🟢 SHARING LIVE" : "🔴 OFF (DRAFTS)"}</span>
              </button>
            </div>

            {/* Toggle Option 2: Manual AI Form Alerts */}
            <div className="flex items-center gap-2.5 border-t sm:border-t-0 pt-2 sm:pt-0 border-slate-850 w-full sm:w-auto justify-between">
              <span className="text-slate-300 font-medium">2. AI Manual Composer:</span>
              <button
                type="button"
                onClick={() => persistConfig({
                  ...config,
                  enableManualBroadcast: config.enableManualBroadcast === false ? true : false
                })}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold border cursor-pointer transition-all duration-150 transform active:scale-95 flex items-center gap-1.5 ${
                  config.enableManualBroadcast !== false
                    ? "bg-emerald-950 border-emerald-800 text-emerald-300 shadow-md shadow-emerald-950/20"
                    : "bg-slate-900 border-slate-800 text-slate-500 hover:bg-slate-850 hover:text-slate-400"
                }`}
                id="header-toggle-manual-share"
              >
                <div className={`w-1.5 h-1.5 rounded-full ${config.enableManualBroadcast !== false ? "bg-emerald-400 animate-pulse" : "bg-slate-600"}`}></div>
                <span>{config.enableManualBroadcast !== false ? "🟢 AUTO-SHARE" : "🔴 OFF (REVIEW)"}</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Main Container Content */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 md:p-6 grid grid-cols-1 lg:grid-cols-12 gap-6" id="dashboard-main-content">
        
        {/* LEFT COLUMN (Control Panel / Forms / Parameters Settings) - spans 7 units on wide screens */}
        <div className="lg:col-span-7 space-y-6">
          {/* Always display connection setup to give immediate visual visibility */}
          <TelegramConfigPanel config={config} onChange={persistConfig} />

          <AnimatePresence mode="wait">
            {activeTab === "scanner" ? (
              <motion.div
                key="tab-scanner"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="space-y-6"
                id="scanner-section-block"
              >
                <VolatilityScanner 
                  onSignalGenerated={handleSignalGenerated}
                  telegramConfig={config}
                  aiConfigured={aiConfigured}
                  onPostDirectTelegram={handlePostDirectTelegram}
                />
              </motion.div>
            ) : activeTab === "compose" ? (
              <motion.div
                key="tab-compose"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="space-y-6"
                id="compose-section-block"
              >
                {/* Form to feed details */}
                <TradingSignalForm 
                  onSignalGenerated={handleSignalGenerated} 
                  aiConfigured={aiConfigured} 
                  autoShareEnabled={config.enableManualBroadcast !== false}
                  onAutoShareToggle={(val) => persistConfig({ ...config, enableManualBroadcast: val })}
                  telegramConfigChatId={config.chatId}
                />

                {/* Technical terminology rationale section if generated */}
                {currentDraft && editableRationale && (
                  <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-3.5 shadow-xl" id="scientific-rationale-block">
                    <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                      <div className="flex items-center gap-2">
                        <BookOpen className="w-4 h-4 text-emerald-400" />
                        <h3 className="text-sm font-semibold text-white">Technical Analysis Rationale</h3>
                      </div>
                      <span className="text-[10px] bg-emerald-950/50 border border-emerald-900/50 text-emerald-400 px-2 py-0.5 rounded-lg font-mono">Verified Theory</span>
                    </div>

                    <div className="space-y-3">
                      <p className="text-xs text-slate-400 leading-relaxed italic">
                        Use this generated knowledge summary as technical leverage to share with VIP users who require backing details:
                      </p>
                      <textarea
                        value={editableRationale}
                        onChange={(e) => setEditableRationale(e.target.value)}
                        className="w-full h-24 p-3 text-xs bg-slate-950 border border-slate-800 focus:border-emerald-500 rounded-xl text-slate-300 outline-none font-sans leading-relaxed resize-none"
                        placeholder="Rationale description details..."
                        id="textarea-rationale-editor"
                      />
                    </div>
                  </div>
                )}
              </motion.div>
            ) : (
              <motion.div
                key="tab-history"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="space-y-6"
                id="history-section-block"
              >
                {/* Active broadcasts with filters */}
                <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-6">
                  <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-slate-800/80 pb-4">
                    <div className="space-y-1">
                      <h3 className="text-sm font-semibold text-white">Signals Broadcast Registry</h3>
                      <p className="text-xs text-slate-400">Interact with previously sent signals to reply with TP/SL telemetry.</p>
                    </div>

                    <div className="flex bg-slate-950 p-1 border border-slate-850 rounded-xl text-xs" id="history-filter-pills">
                      {(["ALL", "ACTIVE", "CLOSED"] as const).map((filter) => (
                        <button
                          key={filter}
                          onClick={() => setFilterStatus(filter)}
                          className={`px-3 py-1 hover:text-white capitalize rounded-lg transition-all font-medium whitespace-nowrap cursor-pointer ${
                            filterStatus === filter
                              ? "bg-slate-800 text-white font-semibold"
                              : "text-slate-400"
                          }`}
                          id={`filter-btn-${filter}`}
                          type="button"
                        >
                          {filter === "ALL" ? "All Broadcasts" : filter === "ACTIVE" ? "Running / Open" : "Closed / Stopped"}
                        </button>
                      ))}
                    </div>
                  </div>

                  {filteredSignalsList.length === 0 ? (
                    <div className="text-center py-12 px-4 space-y-3 bg-slate-950/40 rounded-xl border border-slate-900" id="empty-history-placeholder">
                      <div className="w-12 h-12 rounded-full bg-slate-900 flex items-center justify-center mx-auto text-slate-600">
                        <History className="w-5 h-5" />
                      </div>
                      <div className="space-y-1">
                        <p className="text-slate-300 text-sm font-medium">No Broadcast Signals Found</p>
                        <p className="text-slate-500 text-xs">
                          {filterStatus === "ALL" 
                            ? "Complete your first signal composition in the Composer tab to list details."
                            : `No signals found under the '${filterStatus}' category.`
                          }
                        </p>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-3.5 divide-y divide-slate-850/50 max-h-[500px] overflow-y-auto pr-1" id="signals-history-log-scroll">
                      {filteredSignalsList.map((sig, idx) => {
                        const isItemSelected = selectedSignal?.id === sig.id;
                        return (
                          <div
                            key={sig.id}
                            onClick={() => setSelectedSignal(sig)}
                            className={`p-4 rounded-xl cursor-pointer transition-all ${
                              isItemSelected 
                                ? "bg-slate-850/80 border border-sky-500/30 shadow-md" 
                                : "hover:bg-slate-850/30 border border-transparent"
                            } ${idx > 0 ? "pt-4" : ""}`}
                            id={`history-item-${sig.id}`}
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div className="space-y-1">
                                <div className="flex items-center gap-2">
                                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-lg uppercase tracking-wider ${
                                    sig.action.includes("BUY") ? "bg-emerald-950 text-emerald-400" : "bg-rose-950/60 text-rose-400"
                                  }`}>
                                    {sig.action}
                                  </span>
                                  <h4 className="text-sm font-bold text-white font-mono tracking-wide">{sig.symbol}</h4>
                                  <span className="text-[10px] text-slate-500">&bull; {sig.assetClass}</span>
                                </div>
                                
                                <div className="text-xs text-slate-400 font-mono space-x-3 pt-0.5">
                                  <span>Entry: <b className="text-slate-200">{sig.entry || "CMP"}</b></span>
                                  {sig.tp1 && <span>TP1: <b className="text-slate-250">{sig.tp1}</b></span>}
                                  {sig.sl && <span>SL: <b className="text-rose-400">{sig.sl}</b></span>}
                                </div>

                                <div className="flex items-center gap-1.5 pt-2 text-[10px] text-slate-500">
                                  <Clock className="w-3 h-3 text-slate-600" />
                                  <span>{new Date(sig.createdAt).toLocaleString(undefined, { dateStyle: "short", timeStyle: "short" })}</span>
                                  {sig.chatTitle && (
                                    <>
                                      <span>&bull;</span>
                                      <span className="text-slate-400 max-w-[120px] truncate" title={sig.chatTitle}>{sig.chatTitle}</span>
                                    </>
                                  )}
                                  {sig.sentMessageId && (
                                    <>
                                      <span>&bull;</span>
                                      <span className="text-sky-500/80 font-mono">ID: {sig.sentMessageId}</span>
                                    </>
                                  )}
                                </div>
                              </div>

                              <div className="flex items-center gap-2 shrink-0">
                                <span className={`text-[10px] px-2 py-0.5 rounded-md font-semibold ${getStatusColor(sig.status)}`}>
                                  {sig.status.replace("_", " ")}
                                </span>
                                <button
                                  type="button"
                                  onClick={(e) => handleDeleteHistoryItem(sig.id, e)}
                                  className="p-1 text-slate-500 hover:text-rose-400 transition-colors"
                                  title="Remove from telemetry log"
                                  id={`btn-delete-sig-${sig.id}`}
                                >
                                  <X className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>


        {/* RIGHT COLUMN (Live Simulated Telegram Output & Message Controller) - spans 5 units */}
        <div className="lg:col-span-5 h-fit lg:sticky lg:top-24 space-y-6">
          
          {/* Telegram mock preview frame */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl shadow-xl overflow-hidden flex flex-col" id="telegram-mock-phone-frame">
            
            {/* Mock Header info */}
            <div className="bg-slate-850 px-4 py-3 border-b border-slate-800/80 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-full bg-gradient-to-r from-sky-500 to-sky-400 flex items-center justify-center font-bold text-white text-xs tracking-wider uppercase">
                  {(currentDraft?.symbol || selectedSignal?.symbol || "TG")[0]}
                </div>
                <div>
                  <div className="text-xs font-semibold text-white tracking-wide flex items-center gap-1.5">
                    <span>{config.chatId ? `${config.chatTitle || "Trading Channel"}` : "Unconfigured Channel"}</span>
                    {config.isConnected && <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>}
                  </div>
                  <div className="text-[10px] text-slate-400 font-mono">
                    {config.chatId ? `${config.chatId}` : "@waiting_for_coordinates"}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2 text-slate-400 text-xs">
                <div className="w-2.5 h-2.5 rounded-full border border-slate-700 bg-slate-900/60 text-slate-300 flex items-center justify-center font-bold text-[8px]">
                  i
                </div>
                <span className="text-[10px] uppercase font-bold text-slate-500">Live Preview</span>
              </div>
            </div>

            {/* Chat message thread simulation block */}
            <div className="bg-[#1b2430] p-4 min-h-[340px] max-h-[460px] overflow-y-auto space-y-4" style={{ backgroundImage: "linear-gradient(rgba(0,0,0,0.1), rgba(0,0,0,0.25))" }} id="telegram-mock-scroller">
              
              {/* If no draft and no active selection, show default instructions */}
              {!currentDraft && !selectedSignal && (
                <div className="h-full flex flex-col items-center justify-center text-center p-6 space-y-3.5 my-12" id="tele-preview-empty-state">
                  <div className="w-11 h-11 rounded-full bg-slate-900/85 border border-slate-800 flex items-center justify-center text-sky-400 shadow-md">
                    <MessageSquare className="w-5 h-5" />
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs font-semibold text-slate-200">No Signal Draft Composed</p>
                    <p className="text-[11px] text-slate-400 leading-relaxed max-w-xs">
                      Compose trading parameters on the left pane and hit <b>"AI Assist"</b> or <b>"Format Signal"</b> to simulate and tune rendering outputs.
                    </p>
                  </div>
                </div>
              )}

              {/* Displaying Current Draft being composed */}
              {currentDraft && (
                <div className="space-y-2 max-w-[88%]" id="visible-temp-draft-wrapper">
                  <div className="text-[9px] text-[#2ac1f6] font-semibold tracking-wider uppercase ml-1 flex items-center gap-1">
                    <span>Drafting Signal</span>
                    <span className="w-1 h-1 bg-[#2ac1f6] rounded-full animate-ping"></span>
                  </div>

                  <div className="bg-[#24303f] border border-slate-700/30 text-white rounded-2xl rounded-tl-sm p-3.5 text-xs font-normal shadow-sm leading-relaxed" style={{ wordBreak: "break-word" }}>
                    <div className="whitespace-pre-wrap select-text font-mono text-[11px] text-slate-100" dangerouslySetInnerHTML={{ __html: editableText }} />
                    <div className="mt-2.5 flex items-center justify-between text-[10px] text-slate-400 border-t border-slate-700/50 pt-2 font-mono">
                      <span>No message ID yet</span>
                      <span>{new Date().toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}</span>
                    </div>
                  </div>
                </div>
              )}

              {/* Displaying Live Selected Historic Signal & its update history threads */}
              {selectedSignal && (
                <div className="space-y-4" id="historic-active-selection-simulation">
                  
                  {/* Original message */}
                  <div className="space-y-1 max-w-[88%]">
                    <div className="text-[9px] text-emerald-400 font-semibold uppercase ml-1 flex items-center gap-1 font-mono">
                      <span>Original Dispatch</span>
                      <span className="text-slate-500 font-normal">&bull; Status: {selectedSignal.status}</span>
                    </div>

                    <div className="bg-[#24303f] border border-[#2b3a4c] text-white rounded-2xl rounded-tl-sm p-3.5 text-xs font-normal shadow" style={{ wordBreak: "break-word" }}>
                      <div className="whitespace-pre-wrap font-mono text-[11px]" dangerouslySetInnerHTML={{ __html: selectedSignal.formattedText }} />
                      <div className="mt-2 flex items-center justify-between text-[10px] text-slate-400 font-mono">
                        <span className="text-sky-400">✅ Transmitted to Telegram</span>
                        <span>{new Date(selectedSignal.createdAt).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}</span>
                      </div>
                    </div>
                  </div>

                  {/* Reply Updates thread history */}
                  {selectedSignal.updateHistory && selectedSignal.updateHistory.map((upd) => (
                    <div key={upd.id} className="space-y-1 max-w-[88%] ml-auto" id={`tg-update-bubble-${upd.id}`}>
                      <div className="text-[9px] text-amber-300 font-semibold uppercase mr-1 flex items-center justify-between font-mono">
                        <span></span>
                        <span className="flex items-center gap-1">
                          <span>{upd.updateType}</span>
                          <CornerDownRight className="w-2.5 h-2.5 text-slate-500" />
                        </span>
                      </div>

                      <div className="bg-[#1f2d3d] border border-amber-500/20 text-white rounded-2xl rounded-tr-sm p-3.5 text-xs shadow-sm leading-relaxed" style={{ wordBreak: "break-word" }}>
                        <div className="pl-3 border-l-2 border-[#2ac1f6] text-slate-400 text-[10px] mb-2 font-sans">
                          <div className="font-semibold text-slate-300">Replying to Signal: {selectedSignal.symbol}</div>
                          <div className="truncate">{selectedSignal.action} Entry {selectedSignal.entry || "CMP"}</div>
                        </div>

                        <div className="whitespace-pre-wrap font-mono text-[11px]" dangerouslySetInnerHTML={{ __html: upd.text }} />
                        <div className="mt-2 flex items-center justify-between text-[9px] text-slate-400 font-mono pt-1">
                          <span>⏱️ Telegram Msg ID: {upd.sentMessageId}</span>
                          <span>{new Date(upd.timestamp).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}</span>
                        </div>
                      </div>
                    </div>
                  ))}

                </div>
              )}
            </div>

            {/* Simulated Live controls under mock window */}
            <div className="bg-slate-950 p-4 border-t border-slate-900 space-y-4">
              
              {/* Compose mode action panel */}
              {currentDraft && (
                <div className="space-y-3" id="compose-draft-actions-widget">
                  <div className="space-y-1.5">
                    <label className="text-[10px] uppercase tracking-wider text-slate-400 font-bold font-sans">
                      Tune Message Layout Code (Telegram HTML)
                    </label>
                    <textarea
                      value={editableText}
                      onChange={(e) => setEditableText(e.target.value)}
                      className="w-full h-32 p-3 text-xs bg-slate-900 border border-slate-800 focus:border-sky-500 rounded-xl text-slate-200 font-mono outline-none resize-none leading-relaxed"
                      placeholder="Signal text HTML..."
                      id="textarea-draft-raw-html-editor"
                    />
                  </div>

                  {/* Broadcast Trigger to live channel */}
                  <div className="space-y-2">
                    <button
                      onClick={handleBroadcastSignal}
                      disabled={isBroadcasting || !config.botToken || !config.chatId}
                      className="w-full py-3 bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-800 disabled:text-slate-500 text-white text-xs font-bold rounded-xl flex items-center justify-center gap-2 cursor-pointer disabled:cursor-not-allowed shadow-lg shadow-emerald-600/10 transition-all font-sans"
                      id="btn-broadcast-to-telegram"
                      type="button"
                    >
                      {isBroadcasting ? (
                        <>
                          <svg className="animate-spin h-3.5 w-3.5 text-white" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                          </svg>
                          <span>Broadcasting to Live Feed...</span>
                        </>
                      ) : (
                        <>
                          <Send className="w-3.5 h-3.5" />
                          <span>Broadcast Signal to {config.chatId || "Channel"}</span>
                        </>
                      )}
                    </button>

                    {!config.isConnected && (
                      <p className="text-[10px] text-amber-400/80 text-center font-sans">
                        ⚠️ Please run the Connection Test first to ensure Admin rights before broadcasting.
                      </p>
                    )}
                  </div>
                </div>
              )}

              {/* Active signal live update actions panel (Reply thread) */}
              {selectedSignal && (
                <div className="space-y-3" id="active-signal-reply-thread-panel">
                  <div className="flex items-center justify-between pb-1.5 border-b border-slate-900">
                    <span className="text-[10.5px] uppercase tracking-wider text-slate-400 font-bold font-sans">
                      Active Telemetry Panel: {selectedSignal.symbol}
                    </span>
                    <button 
                      onClick={() => setSelectedSignal(null)}
                      className="text-[10.5px] text-slate-500 hover:text-white"
                      type="button"
                    >
                      Clear Focus
                    </button>
                  </div>

                  <div className="space-y-2">
                    <div className="text-[10px] text-slate-400">Quick Broadcast Status Update (Replies directly to thread):</div>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        onClick={() => handleSendSignalUpdate("TP1")}
                        disabled={submittingUpdate || !selectedSignal.tp1}
                        className="py-2 px-3 text-[10.5px] font-semibold bg-amber-500/10 hover:bg-amber-500/20 disabled:opacity-40 disabled:hover:bg-amber-500/10 text-amber-300 border border-amber-500/20 hover:border-amber-500/40 rounded-lg text-center transition-all cursor-pointer disabled:cursor-not-allowed"
                        id="btn-update-tp1"
                        type="button"
                      >
                        🎯 Send TP1 Hit ({selectedSignal.tp1 || "N/A"})
                      </button>

                      <button
                        onClick={() => handleSendSignalUpdate("TP2")}
                        disabled={submittingUpdate || !selectedSignal.tp2}
                        className="py-2 px-3 text-[10.5px] font-semibold bg-emerald-500/10 hover:bg-emerald-500/20 disabled:opacity-40 disabled:hover:bg-emerald-500/10 text-emerald-300 border border-emerald-500/20 hover:border-emerald-500/40 rounded-lg text-center transition-all cursor-pointer disabled:cursor-not-allowed"
                        id="btn-update-tp2"
                        type="button"
                      >
                        🎯 Send TP2 Hit ({selectedSignal.tp2 || "N/A"})
                      </button>

                      <button
                        onClick={() => handleSendSignalUpdate("TP3")}
                        disabled={submittingUpdate || !selectedSignal.tp3}
                        className="py-2 px-3 text-[10.5px] font-semibold bg-teal-500/10 hover:bg-teal-500/20 disabled:opacity-40 disabled:hover:bg-teal-500/10 text-teal-300 border border-teal-500/20 hover:border-teal-500/40 rounded-lg text-center transition-all cursor-pointer disabled:cursor-not-allowed"
                        id="btn-update-tp3"
                        type="button"
                      >
                        🎯 Send TP3 Hit ({selectedSignal.tp3 || "N/A"})
                      </button>

                      <button
                        onClick={() => handleSendSignalUpdate("SL")}
                        disabled={submittingUpdate || !selectedSignal.sl}
                        className="py-2 px-3 text-[10.5px] font-semibold bg-rose-500/10 hover:bg-rose-500/20 disabled:opacity-40 disabled:hover:bg-rose-500/10 text-rose-300 border border-rose-500/20 hover:border-rose-500/40 rounded-lg text-center transition-all cursor-pointer disabled:cursor-not-allowed"
                        id="btn-update-sl"
                        type="button"
                      >
                        🛡️ Send Stop Loss Hit ({selectedSignal.sl || "N/A"})
                      </button>
                    </div>

                    <div className="flex gap-2 pt-1 border-t border-slate-900 mt-2">
                      <button
                        onClick={() => handleSendSignalUpdate("CLOSED")}
                        disabled={submittingUpdate}
                        className="flex-1 py-1.5 text-[10.5px] font-medium bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg hover:text-white transition-all cursor-pointer"
                        id="btn-update-close-manually"
                        type="button"
                      >
                        🚪 Close position manually
                      </button>
                    </div>
                  </div>

                  {/* Custom reply update input field */}
                  <div className="space-y-1.5 pt-1.5 border-t border-slate-900">
                    <label className="text-[10px] text-slate-400">Custom Channel Update Announcement</label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={customUpdateText}
                        onChange={(e) => setCustomUpdateText(e.target.value)}
                        placeholder="e.g. Price is structural, raising stop loss to entry level..."
                        className="flex-1 px-3 py-1.5 text-xs bg-slate-900 border border-slate-800 focus:border-sky-500 rounded-xl text-slate-200 outline-none placeholder-slate-600 font-sans"
                        id="input-custom-announcement"
                      />
                      <button
                        onClick={() => handleSendSignalUpdate("CUSTOM")}
                        disabled={submittingUpdate || !customUpdateText.trim()}
                        className="px-3 py-1.5 bg-sky-600 hover:bg-sky-500 disabled:bg-slate-800 disabled:text-slate-650 text-white font-semibold text-xs rounded-xl cursor-pointer disabled:cursor-not-allowed transition-all"
                        id="btn-send-custom-announcement"
                        type="button"
                      >
                        {submittingUpdate ? "..." : "Send"}
                      </button>
                    </div>
                  </div>

                  {/* Error feedback for active updates */}
                  {updateError && (
                    <div className="bg-rose-950/20 text-rose-300 border border-rose-900/50 rounded-lg p-2.5 text-[11px]" id="err-feedback-update font-sans">
                      ⚠️ {updateError}
                    </div>
                  )}
                </div>
              )}

              {/* Feedbacks */}
              <AnimatePresence>
                {broadcastSuccess && (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0 }}
                    className="bg-emerald-950/40 border border-emerald-900/60 rounded-xl p-3 text-xs text-emerald-300 flex items-start gap-2.5"
                    id="broadcast-success-sticky-banner"
                  >
                    <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                    <div>
                      <div className="font-semibold">Signal Alert Transmitted!</div>
                      <p className="text-slate-400 text-[11px]">The setup is now completely live in your Telegram channel. Monitor and coordinate price targets anytime using the Registry.</p>
                    </div>
                  </motion.div>
                )}

                {broadcastError && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="bg-rose-950/30 border border-rose-900/50 rounded-xl p-3 text-xs text-rose-300 flex items-start gap-2.5 font-sans"
                    id="broadcast-error-sticky-banner"
                  >
                    <AlertTriangle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
                    <div>
                      <div className="font-semibold">Transmit Blocked</div>
                      <p className="text-slate-400 text-[11px] mt-0.5">{broadcastError}</p>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

            </div>

          </div>

          {/* Quick Disclaimer / Support note card */}
          <div className="bg-slate-900/50 border border-slate-850 rounded-xl p-4 flex gap-3 text-xs text-slate-400 font-sans" id="disclaimer-info-card">
            <Info className="w-4.5 h-4.5 text-sky-400 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <span className="font-semibold text-slate-300">Aesthetic Formatting Note</span>
              <p className="leading-relaxed">
                We generate premium, high-converting signals using direct <b>HTML tags</b> compatible with official Telegram API parse models (<code>{`<b>`}</code>, <code>{`<i>`}</code>, <code>{`<code>`}</code>). Do not mix markdown asterisks to prevent transmission parser errors.
              </p>
            </div>
          </div>

        </div>

      </main>

      {/* Footer copyright */}
      <footer className="border-t border-slate-900 py-6 px-6 text-center text-xs text-slate-500 bg-slate-950/50 mt-auto font-sans" id="app-footer">
        <p>&copy; 2026 Telegram Signal Broadcaster Systems &bull; Crafted with intelligent high-fidelity composition frameworks.</p>
      </footer>
    </div>
  );
}
