import React, { useState, useEffect } from "react";
import {
  Settings,
  Volume2,
  Activity,
  ShieldAlert,
  Server,
  PowerOff,
  Power,
  RefreshCw,
  Clock,
  CheckCircle2,
  Info,
  Copy,
  Check,
} from "lucide-react";
import TelegramConfigPanel from "./TelegramConfigPanel";
import { TelegramConfig } from "../types";

interface Props {
  config: TelegramConfig;
  onChange: (cfg: TelegramConfig) => void;
  aiConfigured: boolean;
}

interface ServerStatus {
  serverReachable?: boolean;
  lastRunAt?: string | null;
  totalSentThisSession?: number;
  lastError?: string | null;
  persistenceMode?: string;
}

interface CronSetup {
  cronUrl: string;
  cronPayload: string;
  intervalMinutes: number;
  instructions: string[];
}

function getSiteConfigLocal() {
  try {
    const cfg = JSON.parse(localStorage.getItem("signal_site_config") || "{}");
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

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = () => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };
  return (
    <button
      type="button"
      onClick={handleCopy}
      className="flex items-center gap-1 px-2 py-1 text-[10px] bg-slate-800 hover:bg-slate-700 text-slate-300 rounded transition-all shrink-0"
    >
      {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
      {copied ? "Copied!" : "Copy"}
    </button>
  );
}

export default function SettingsView({ config, onChange, aiConfigured }: Props) {
  const handleToggleScanner = () =>
    onChange({ ...config, enableScannerBroadcast: config.enableScannerBroadcast === false ? true : false });
  const handleToggleManual = () =>
    onChange({ ...config, enableManualBroadcast: config.enableManualBroadcast === false ? true : false });

  // ── Server-side auto-broadcast state ────────────────────────────────────────
  const [serverStatus, setServerStatus] = useState<ServerStatus | null>(null);
  const [serverLoading, setServerLoading] = useState(false);
  const [serverError, setServerError] = useState("");
  const [cronSetup, setCronSetup] = useState<CronSetup | null>(null);
  const [intervalMinutes, setIntervalMinutes] = useState(2);
  const [isEnabled, setIsEnabled] = useState(() => {
    return localStorage.getItem("server_broadcast_enabled") === "true";
  });

  const fetchStatus = async () => {
    try {
      const res = await fetch("/api/autobroadcast/status");
      if (!res.ok) return;
      const data = await res.json();
      setServerStatus(data);
    } catch {}
  };

  useEffect(() => {
    fetchStatus();
    const t = setInterval(fetchStatus, 20000);
    return () => clearInterval(t);
  }, []);

  // ── Enable: call configure, get back the cron setup instructions ────────────
  const handleEnable = async () => {
    if (!config.botToken || !config.chatId) {
      setServerError("Please connect your Bot Token and Channel ID first (in the Telegram settings above).");
      return;
    }

    setServerLoading(true);
    setServerError("");
    setCronSetup(null);

    try {
      const siteCfg = getSiteConfigLocal();
      const res = await fetch("/api/autobroadcast/configure", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          botToken: config.botToken,
          chatId: config.chatId,
          chatTitle: config.chatTitle || "",
          siteName: siteCfg.siteName,
          promoUrl: siteCfg.promoUrl,
          botName: siteCfg.botName,
          botSignature: siteCfg.botSignature,
          hashtags: siteCfg.hashtags,
          activeContracts: ["UNDER 7", "UNDER 8", "OVER 2", "OVER 3"],
          intervalMinutes,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Configuration failed.");
      }

      setCronSetup({
        cronUrl: data.cronUrl,
        cronPayload: data.cronPayload,
        intervalMinutes: data.intervalMinutes,
        instructions: data.instructions,
      });

      setIsEnabled(true);
      localStorage.setItem("server_broadcast_enabled", "true");
      localStorage.setItem("server_broadcast_cron_url", data.cronUrl);
      localStorage.setItem("server_broadcast_cron_payload", data.cronPayload);
    } catch (err: any) {
      setServerError(err.message || "Enable failed.");
    } finally {
      setServerLoading(false);
    }
  };

  // ── Disable: clear local state and call disable endpoint ───────────────────
  const handleDisable = async () => {
    setServerLoading(true);
    setServerError("");
    try {
      await fetch("/api/autobroadcast/disable", { method: "POST" });
      setIsEnabled(false);
      setCronSetup(null);
      localStorage.removeItem("server_broadcast_enabled");
      localStorage.removeItem("server_broadcast_cron_url");
      localStorage.removeItem("server_broadcast_cron_payload");
      await fetchStatus();
    } catch (err: any) {
      setServerError(err.message || "Disable failed.");
    } finally {
      setServerLoading(false);
    }
  };

  // Restore saved cron setup from localStorage on mount
  useEffect(() => {
    const savedUrl = localStorage.getItem("server_broadcast_cron_url");
    const savedPayload = localStorage.getItem("server_broadcast_cron_payload");
    if (savedUrl && savedPayload && localStorage.getItem("server_broadcast_enabled") === "true") {
      setCronSetup({
        cronUrl: savedUrl,
        cronPayload: savedPayload,
        intervalMinutes,
        instructions: [],
      });
    }
  }, []);

  const spinnerSVG = (
    <svg className="animate-spin h-3.5 w-3.5" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
    </svg>
  );

  return (
    <div className="space-y-6 animate-fade-in" id="settings-view-panel">
      {/* Header */}
      <div className="border-b border-slate-800 pb-4">
        <h3 className="text-base font-bold text-white tracking-tight flex items-center gap-2">
          <Settings className="w-5 h-5 text-sky-400" />
          System Settings & Coordination Control
        </h3>
        <p className="text-xs text-slate-400 mt-0.5">Manage Telegram credentials, server broadcasting, and system health.</p>
      </div>

      {/* Telegram connection */}
      <div className="bg-slate-950 p-2.5 rounded-2xl border border-slate-900 shadow-xl overflow-hidden">
        <TelegramConfigPanel config={config} onChange={onChange} />
      </div>

      {/* ── Server-Side Auto-Broadcast ── */}
      <div className="bg-slate-950 border border-emerald-900/30 rounded-2xl p-5 space-y-4" id="server-autobroadcast-panel">
        <div className="flex items-center gap-2 border-b border-slate-900 pb-2.5">
          <Server className="w-4 h-4 text-emerald-400" />
          <span className="text-xs font-bold text-white uppercase tracking-wider">Server-Side Auto-Broadcast</span>
          <span className={`ml-auto text-[9px] font-bold px-2 py-0.5 rounded-full uppercase ${isEnabled ? "bg-emerald-900/60 text-emerald-300 border border-emerald-800" : "bg-slate-800 text-slate-500 border border-slate-700"}`}>
            {isEnabled ? "● Active" : "○ Inactive"}
          </span>
        </div>

        <p className="text-[11px] text-slate-400 leading-relaxed">
          Signals keep sending even after you <b className="text-amber-300">log out or close the app</b> — as long as{" "}
          <a href="https://cron-job.org" target="_blank" rel="noreferrer" className="text-sky-400 underline">cron-job.org</a>{" "}
          is pinging your server. No database or paid plan required. Click <b className="text-emerald-400">Enable</b> to get
          the exact setup values — then add them to cron-job.org once and you're done permanently.
        </p>

        {/* Status bar */}
        <div className="flex items-center justify-between p-3 bg-slate-900/50 border border-slate-800 rounded-xl">
          <div className="flex items-center gap-2">
            <span className={`w-2.5 h-2.5 rounded-full ${isEnabled ? "bg-emerald-400 animate-pulse" : "bg-slate-600"}`} />
            <div>
              <p className="text-xs font-semibold text-slate-200">
                {isEnabled ? "🟢 Server broadcasting enabled" : "🔴 Only sends while app is open"}
              </p>
              {serverStatus?.lastRunAt && (
                <p className="text-[10px] text-slate-500 mt-0.5">
                  Last signal: {new Date(serverStatus.lastRunAt).toLocaleTimeString()} · Total this session: {serverStatus.totalSentThisSession ?? 0}
                </p>
              )}
            </div>
          </div>
          <button type="button" onClick={fetchStatus} title="Refresh" className="p-1.5 text-slate-500 hover:text-slate-300 transition-colors">
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Interval selector (only when not yet enabled) */}
        {!isEnabled && (
          <div className="flex items-center gap-3">
            <label className="text-[11px] text-slate-400 whitespace-nowrap">Send every</label>
            <input
              type="number"
              min={1}
              step={0.5}
              value={intervalMinutes}
              onChange={(e) => setIntervalMinutes(Math.max(1, Number(e.target.value) || 2))}
              className="w-20 px-2 py-1.5 text-xs bg-slate-900 border border-slate-800 focus:border-emerald-500 rounded-lg text-slate-100 outline-none"
            />
            <span className="text-[11px] text-slate-400">minutes</span>
          </div>
        )}

        {/* Error banner */}
        {serverError && (
          <div className="flex items-start gap-1.5 text-[11px] text-rose-400 bg-rose-950/30 border border-rose-900/40 rounded-lg p-2.5">
            <ShieldAlert className="w-3.5 h-3.5 shrink-0 mt-0.5" />
            <span>{serverError}</span>
          </div>
        )}

        {/* Last error from server */}
        {serverStatus?.lastError && (
          <div className="flex items-start gap-1.5 text-[11px] text-amber-400 bg-amber-950/30 border border-amber-900/40 rounded-lg p-2.5">
            <ShieldAlert className="w-3.5 h-3.5 shrink-0 mt-0.5" />
            <span>Last send error: {serverStatus.lastError}</span>
          </div>
        )}

        {/* ── cron-job.org setup panel ── */}
        {isEnabled && cronSetup && (
          <div className="bg-slate-900/60 border border-emerald-900/30 rounded-xl p-4 space-y-4">
            <div className="flex items-center gap-1.5">
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              <span className="text-xs font-bold text-emerald-300">Configuration ready — complete the 3 steps below once</span>
            </div>

            <div className="space-y-3 text-[11px]">
              <div className="space-y-1">
                <p className="text-slate-300 font-semibold">Step 1 — Go to{" "}
                  <a href="https://cron-job.org" target="_blank" rel="noreferrer" className="text-sky-400 underline">cron-job.org</a>
                  {" "}→ free account → Create cronjob
                </p>
              </div>

              <div className="space-y-1">
                <p className="text-slate-300 font-semibold">Step 2 — Set the URL:</p>
                <div className="flex items-center gap-2 bg-slate-950 border border-slate-700 rounded-lg px-3 py-2">
                  <code className="text-emerald-300 text-[10px] break-all flex-1">{cronSetup.cronUrl}</code>
                  <CopyButton text={cronSetup.cronUrl} />
                </div>
              </div>

              <div className="space-y-1">
                <p className="text-slate-300 font-semibold">Step 3 — Under <b>Advanced → Request body</b>, paste this JSON exactly:</p>
                <div className="flex items-start gap-2 bg-slate-950 border border-slate-700 rounded-lg px-3 py-2">
                  <code className="text-sky-300 text-[9.5px] break-all flex-1 font-mono leading-relaxed">
                    {cronSetup.cronPayload}
                  </code>
                  <CopyButton text={cronSetup.cronPayload} />
                </div>
                <p className="text-slate-500 text-[10px]">Also set the Content-Type header to: <code className="bg-slate-900 px-1 rounded">application/json</code></p>
              </div>

              <div className="bg-sky-950/30 border border-sky-900/30 rounded-lg p-2.5 flex items-start gap-1.5">
                <Info className="w-3.5 h-3.5 text-sky-400 shrink-0 mt-0.5" />
                <p className="text-sky-200">
                  Set the schedule to <b>every 1 minute</b>. Once saved, cron-job.org pings your server every minute 24/7 — completely independent of your browser or login state. That's it!
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Action buttons */}
        <div className="flex justify-end pt-1">
          {!isEnabled ? (
            <button
              type="button"
              onClick={handleEnable}
              disabled={serverLoading || !config.botToken || !config.chatId}
              className="flex items-center gap-2 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-800 disabled:text-slate-500 text-white text-xs font-bold rounded-xl transition-all cursor-pointer disabled:cursor-not-allowed"
              id="btn-enable-server-broadcast"
            >
              {serverLoading ? spinnerSVG : <Power className="w-3.5 h-3.5" />}
              {serverLoading ? "Enabling..." : "Enable Server-Side Broadcasting"}
            </button>
          ) : (
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => {
                  const u = localStorage.getItem("server_broadcast_cron_url");
                  const p = localStorage.getItem("server_broadcast_cron_payload");
                  if (u && p) setCronSetup({ cronUrl: u, cronPayload: p, intervalMinutes, instructions: [] });
                }}
                className="flex items-center gap-1.5 px-3 py-2 text-xs text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-xl transition-all"
              >
                <Info className="w-3.5 h-3.5" />
                Show Setup Values
              </button>
              <button
                type="button"
                onClick={handleDisable}
                disabled={serverLoading}
                className="flex items-center gap-2 px-4 py-2.5 bg-rose-600 hover:bg-rose-500 disabled:bg-slate-800 text-white text-xs font-bold rounded-xl transition-all cursor-pointer"
                id="btn-disable-server-broadcast"
              >
                {serverLoading ? spinnerSVG : <PowerOff className="w-3.5 h-3.5" />}
                {serverLoading ? "Stopping..." : "Stop Auto-Broadcast"}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Browser-side preferences */}
      <div className="bg-slate-950 border border-slate-800 rounded-2xl p-5 space-y-4">
        <div className="flex items-center gap-2 border-b border-slate-900 pb-2.5">
          <Activity className="w-4 h-4 text-sky-400" />
          <span className="text-xs font-bold text-white uppercase tracking-wider">Browser-Side Broadcasting</span>
        </div>
        <p className="text-[10.5px] text-slate-500">
          These apply only while the app is open in your browser. For sending after logout, use the server-side panel above.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="p-4 bg-slate-900/40 border border-slate-800 rounded-xl flex flex-col justify-between gap-3">
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-200">Volatility Scanner Auto-Broadcast</span>
                <span className={`w-2 h-2 rounded-full ${config.enableScannerBroadcast !== false ? "bg-emerald-400 animate-pulse" : "bg-slate-600"}`} />
              </div>
              <p className="text-[10.5px] text-slate-400 leading-relaxed">
                Automatically broadcasts scanner-detected digit setups to your Telegram channel while the app is open.
              </p>
            </div>
            <div className="flex justify-end">
              <button
                type="button"
                onClick={handleToggleScanner}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold border cursor-pointer transition-all ${config.enableScannerBroadcast !== false ? "bg-emerald-950/60 border-emerald-800 text-emerald-300" : "bg-slate-900 border-slate-700 text-slate-500"}`}
              >
                {config.enableScannerBroadcast !== false ? "🟢 Live" : "🔴 Off"}
              </button>
            </div>
          </div>

          <div className="p-4 bg-slate-900/40 border border-slate-800 rounded-xl flex flex-col justify-between gap-3">
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-200">AI Signal Compiler Auto-Share</span>
                <span className={`w-2 h-2 rounded-full ${config.enableManualBroadcast !== false ? "bg-emerald-400 animate-pulse" : "bg-slate-600"}`} />
              </div>
              <p className="text-[10.5px] text-slate-400 leading-relaxed">
                Instantly sends compiled signal drafts without requiring manual approval on every signal.
              </p>
            </div>
            <div className="flex justify-end">
              <button
                type="button"
                onClick={handleToggleManual}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold border cursor-pointer transition-all ${config.enableManualBroadcast !== false ? "bg-emerald-950/60 border-emerald-800 text-emerald-300" : "bg-slate-900 border-slate-700 text-slate-500"}`}
              >
                {config.enableManualBroadcast !== false ? "🟢 Auto" : "🔴 Manual"}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* System health */}
      <div className="bg-slate-950 border border-slate-800 rounded-2xl p-5 space-y-3">
        <div className="flex items-center gap-2 border-b border-slate-900 pb-2.5">
          <Volume2 className="w-4 h-4 text-amber-500" />
          <span className="text-xs font-bold text-white uppercase tracking-wider">System Health</span>
        </div>

        <div className="flex items-center justify-between p-2.5 bg-slate-900/40 border border-slate-800 rounded-xl">
          <div>
            <span className="text-xs font-semibold text-slate-200">Gemini AI</span>
            <p className="text-[10px] text-slate-500">Signal rationale generation</p>
          </div>
          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-lg border uppercase ${aiConfigured ? "bg-emerald-950/40 text-emerald-400 border-emerald-900" : "bg-amber-950/30 text-amber-500 border-amber-900"}`}>
            {aiConfigured ? "Active" : "Fallback mode"}
          </span>
        </div>

        <div className="flex items-center justify-between p-2.5 bg-slate-900/40 border border-slate-800 rounded-xl">
          <div>
            <span className="text-xs font-semibold text-slate-200">Telegram Bot</span>
            <p className="text-[10px] text-slate-500">Broadcast credentials</p>
          </div>
          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-lg border uppercase ${config.botToken ? "bg-emerald-950/40 text-emerald-400 border-emerald-900" : "bg-rose-950/30 text-rose-400 border-rose-900"}`}>
            {config.botToken ? "Configured" : "Not set"}
          </span>
        </div>

        {serverStatus?.lastRunAt && (
          <div className="flex items-center gap-2 p-2.5 bg-slate-900/40 border border-slate-800 rounded-xl">
            <Clock className="w-3.5 h-3.5 text-sky-400 shrink-0" />
            <div>
              <span className="text-xs font-semibold text-slate-200">Last server signal</span>
              <p className="text-[10px] text-slate-500">{new Date(serverStatus.lastRunAt).toLocaleString()} · {serverStatus.totalSentThisSession ?? 0} sent this session</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
