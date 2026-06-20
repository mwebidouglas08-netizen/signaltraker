import React, { useState, useEffect } from "react";
import {
  Settings,
  Volume2,
  BellRing,
  Sparkles,
  CheckCircle2,
  Info,
  Activity,
  ShieldAlert,
  Server,
  PowerOff,
  Power,
  RefreshCw,
  Clock,
} from "lucide-react";
import TelegramConfigPanel from "./TelegramConfigPanel";
import { TelegramConfig } from "../types";

interface Props {
  config: TelegramConfig;
  onChange: (cfg: TelegramConfig) => void;
  aiConfigured: boolean;
}

interface AutoBroadcastStatus {
  enabled: boolean;
  siteName?: string;
  botName?: string;
  chatTitle?: string;
  intervalMinutes?: number;
  lastRunAt?: string | null;
  lastSentMessageId?: string | null;
  lastError?: string | null;
  totalSent?: number;
  persistenceMode?: string;
}

function getSiteConfigLocal() {
  try {
    const raw = localStorage.getItem("signal_site_config");
    const cfg = raw ? JSON.parse(raw) : {};
    return {
      siteName: cfg.siteName || "kicktrade",
      promoUrl: cfg.promoUrl || "http://kicktrade.site",
      botName: cfg.botName || "USE KICKTRADE BOT",
      botSignature: cfg.botSignature || "kicktrade Over/Under Bot",
      hashtags: cfg.hashtags || "#TradingSignal #kicktrade #Signals",
    };
  } catch {
    return {
      siteName: "kicktrade",
      promoUrl: "http://kicktrade.site",
      botName: "USE KICKTRADE BOT",
      botSignature: "kicktrade Over/Under Bot",
      hashtags: "#TradingSignal #kicktrade #Signals",
    };
  }
}

export default function SettingsView({ config, onChange, aiConfigured }: Props) {
  const handleToggleScanner = () => {
    onChange({
      ...config,
      enableScannerBroadcast: config.enableScannerBroadcast === false ? true : false,
    });
  };

  const handleToggleManual = () => {
    onChange({
      ...config,
      enableManualBroadcast: config.enableManualBroadcast === false ? true : false,
    });
  };

  // ── Server-side persistent auto-broadcast ──────────────────────────────────
  // This keeps sending signals even after the user logs out or closes the tab.
  // It only stops when manually disconnected here.
  const [serverStatus, setServerStatus] = useState<AutoBroadcastStatus | null>(null);
  const [serverLoading, setServerLoading] = useState(false);
  const [serverActionError, setServerActionError] = useState("");
  const [intervalMinutes, setIntervalMinutes] = useState(2.5);

  const fetchStatus = async () => {
    try {
      const res = await fetch("/api/autobroadcast/status");
      const ct = res.headers.get("content-type") || "";
      if (!ct.includes("application/json")) return;
      const data = await res.json();
      setServerStatus(data);
      if (data.intervalMinutes) setIntervalMinutes(data.intervalMinutes);
    } catch (err) {
      console.error("Failed to fetch auto-broadcast status:", err);
    }
  };

  useEffect(() => {
    fetchStatus();
    const poll = setInterval(fetchStatus, 15000); // refresh every 15s
    return () => clearInterval(poll);
  }, []);

  const handleEnableServerBroadcast = async () => {
    if (!config.botToken || !config.chatId) {
      setServerActionError("Connect your Bot Token and Channel ID first (above) before enabling server-side broadcasting.");
      return;
    }

    setServerLoading(true);
    setServerActionError("");

    try {
      const siteCfg = getSiteConfigLocal();
      const res = await fetch("/api/autobroadcast/configure", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          enabled: true,
          botToken: config.botToken,
          chatId: config.chatId,
          chatTitle: config.chatTitle,
          siteName: siteCfg.siteName,
          promoUrl: siteCfg.promoUrl,
          botName: siteCfg.botName,
          botSignature: siteCfg.botSignature,
          hashtags: siteCfg.hashtags,
          intervalMinutes,
          activeContracts: ["UNDER 7", "UNDER 8", "OVER 2", "OVER 3"],
          minStrengthThreshold: 85,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Failed to enable server-side broadcasting.");
      }

      await fetchStatus();
    } catch (err: any) {
      setServerActionError(err.message || "Failed to enable.");
    } finally {
      setServerLoading(false);
    }
  };

  const handleDisableServerBroadcast = async () => {
    setServerLoading(true);
    setServerActionError("");
    try {
      const res = await fetch("/api/autobroadcast/disable", { method: "POST" });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Failed to disable.");
      }
      await fetchStatus();
    } catch (err: any) {
      setServerActionError(err.message || "Failed to disable.");
    } finally {
      setServerLoading(false);
    }
  };

  const isServerActive = serverStatus?.enabled === true;

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

      {/* ── Server-Side Persistent Auto-Broadcast ── */}
      <div className="bg-slate-950 border border-emerald-900/30 rounded-2xl p-5 space-y-4" id="server-autobroadcast-panel">
        <div className="flex items-center gap-2 border-b border-slate-900 pb-2.5">
          <Server className="w-4 h-4 text-emerald-400" />
          <span className="text-xs font-bold text-slate-205 uppercase tracking-wider">Server-Side Auto-Broadcast (Runs 24/7)</span>
        </div>

        <p className="text-[11px] text-slate-400 leading-relaxed">
          By default, signal broadcasting runs inside your browser tab and <b className="text-amber-400">stops when you log out or close the app</b>.
          Enable this to move broadcasting to the server — signals keep sending automatically around the clock, even while your device is off or disconnected.
          It only stops if you click <b className="text-rose-400">Disconnect</b> below or disconnect your Telegram bot.
        </p>

        {serverStatus?.persistenceMode === "memory-fallback-not-persistent" && (
          <div className="flex items-start gap-1.5 text-[10.5px] text-rose-300 bg-rose-950/30 border border-rose-900/40 rounded-lg p-2.5">
            <ShieldAlert className="w-3.5 h-3.5 shrink-0 mt-0.5" />
            <span>
              <b>⚠️ Storage not configured yet.</b> The server is using temporary memory that resets between requests, so "enabled" will not actually
              stay on. Complete <b>Step 1</b> below (Vercel KV) before enabling — this is required, not optional.
            </span>
          </div>
        )}

        <div className="space-y-2">
          <div className="flex items-start gap-1.5 text-[10.5px] text-sky-300 bg-sky-950/30 border border-sky-900/40 rounded-lg p-2.5">
            <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
            <span>
              <b>Step 1 — Persistent storage (required, ~3 min):</b> Vercel's old "KV" dashboard option was discontinued.
              Instead, go to{" "}
              <a href="https://vercel.com/marketplace/upstash" target="_blank" rel="noreferrer" className="underline text-sky-200">
                vercel.com/marketplace/upstash
              </a>{" "}
              → <b>Install</b> → choose <b>Redis</b> → let Vercel manage it for you → connect it to this project → <b>Redeploy</b>.
              Then verify at{" "}
              <code className="bg-slate-900 px-1 rounded font-mono">/api/autobroadcast/diagnose</code> that{" "}
              <code className="bg-slate-900 px-1 rounded font-mono">willUsePersistentStorage</code> is <code className="bg-slate-900 px-1 rounded font-mono">true</code>.
              Without this step, the server forgets that auto-broadcast is enabled almost immediately — this is the #1 cause of signals stopping.
            </span>
          </div>

          <div className="flex items-start gap-1.5 text-[10.5px] text-sky-300 bg-sky-950/30 border border-sky-900/40 rounded-lg p-2.5">
            <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
            <span>
              <b>Step 2 — External pinger (required):</b> Go to{" "}
              <a href="https://cron-job.org" target="_blank" rel="noreferrer" className="underline text-sky-200">cron-job.org</a>{" "}
              (free, no card needed) → create an account → add a new cron job with URL{" "}
              <code className="bg-slate-900 px-1 rounded font-mono">https://your-app.vercel.app/api/cron/auto-broadcast</code>{" "}
              set to run every 1 minute. This pings your server reliably within seconds — unlike GitHub Actions schedules, which can be delayed by 15–60+ minutes
              and are sometimes skipped entirely.
            </span>
          </div>
        </div>

        <div className="flex items-center justify-between gap-3 p-3 bg-slate-900/40 border border-slate-850 rounded-xl">
          <div className="flex items-center gap-2">
            <span className={`w-2.5 h-2.5 rounded-full ${isServerActive ? "bg-emerald-400 animate-pulse" : "bg-slate-600"}`}></span>
            <div>
              <p className="text-xs font-bold text-slate-200">
                {isServerActive ? "🟢 Running on Server — sends even when you're logged out" : "🔴 Not Active — only sends while this app is open"}
              </p>
              {isServerActive && serverStatus?.chatTitle && (
                <p className="text-[10px] text-slate-500 mt-0.5">Broadcasting to: {serverStatus.chatTitle}</p>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={fetchStatus}
            title="Refresh status"
            className="p-1.5 text-slate-500 hover:text-slate-300 transition-colors"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
        </div>

        {!isServerActive && (
          <div className="flex items-center gap-2">
            <label className="text-[11px] text-slate-400 whitespace-nowrap">Send every</label>
            <input
              type="number"
              min={0.5}
              step={0.5}
              value={intervalMinutes}
              onChange={(e) => setIntervalMinutes(Number(e.target.value) || 2.5)}
              className="w-20 px-2 py-1.5 text-xs bg-slate-900 border border-slate-800 focus:border-emerald-500 rounded-lg text-slate-100 outline-none"
            />
            <span className="text-[11px] text-slate-400">minutes</span>
          </div>
        )}

        {serverActionError && (
          <div className="flex items-start gap-1.5 text-[11px] text-rose-400 bg-rose-950/30 border border-rose-900/40 rounded-lg p-2.5">
            <ShieldAlert className="w-3.5 h-3.5 shrink-0 mt-0.5" />
            <span>{serverActionError}</span>
          </div>
        )}

        {isServerActive && serverStatus?.lastError && (
          <div className="flex items-start gap-1.5 text-[11px] text-amber-400 bg-amber-950/30 border border-amber-900/40 rounded-lg p-2.5">
            <ShieldAlert className="w-3.5 h-3.5 shrink-0 mt-0.5" />
            <span>Last attempt had an issue: {serverStatus.lastError}</span>
          </div>
        )}

        {isServerActive && (
          <div className="grid grid-cols-2 gap-2 text-[10.5px]">
            <div className="bg-slate-900/40 border border-slate-850 rounded-lg p-2.5 flex items-center gap-2">
              <Clock className="w-3.5 h-3.5 text-sky-400 shrink-0" />
              <div>
                <p className="text-slate-500">Last sent</p>
                <p className="text-slate-200 font-semibold">
                  {serverStatus.lastRunAt ? new Date(serverStatus.lastRunAt).toLocaleTimeString() : "Not yet"}
                </p>
              </div>
            </div>
            <div className="bg-slate-900/40 border border-slate-850 rounded-lg p-2.5 flex items-center gap-2">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
              <div>
                <p className="text-slate-500">Total sent</p>
                <p className="text-slate-200 font-semibold">{serverStatus.totalSent ?? 0}</p>
              </div>
            </div>
          </div>
        )}

        <div className="flex justify-end pt-1">
          {!isServerActive ? (
            <button
              type="button"
              onClick={handleEnableServerBroadcast}
              disabled={serverLoading || !config.botToken || !config.chatId}
              className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-800 disabled:text-slate-500 text-white text-xs font-bold rounded-xl transition-all cursor-pointer disabled:cursor-not-allowed"
              id="btn-enable-server-broadcast"
            >
              <Power className="w-3.5 h-3.5" />
              {serverLoading ? "Enabling..." : "Enable Server-Side Broadcasting"}
            </button>
          ) : (
            <button
              type="button"
              onClick={handleDisableServerBroadcast}
              disabled={serverLoading}
              className="flex items-center gap-2 px-4 py-2 bg-rose-600 hover:bg-rose-500 disabled:bg-slate-800 text-white text-xs font-bold rounded-xl transition-all cursor-pointer disabled:cursor-not-allowed"
              id="btn-disable-server-broadcast"
            >
              <PowerOff className="w-3.5 h-3.5" />
              {serverLoading ? "Disconnecting..." : "Disconnect (Stop Auto-Broadcast)"}
            </button>
          )}
        </div>
      </div>

      {/* Sharing Toggles Configuration */}
      <div className="bg-slate-950 border border-slate-850 rounded-2xl p-5 space-y-4">
        <div className="flex items-center gap-2 border-b border-slate-900 pb-2.5">
          <Activity className="w-4 h-4 text-sky-455" />
          <span className="text-xs font-bold text-slate-205 uppercase tracking-wider">Browser-Side Broadcasting Preferences</span>
        </div>
        <p className="text-[10.5px] text-slate-500 -mt-2">
          These only apply while you have the app open in your browser. For broadcasting that continues after logout, use the server-side panel above.
        </p>

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
