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
  alertPayload: string;
  signalPayload: string;
  intervalMinutes: number;
  embeddedChatId?: string;
  embeddedChatTitle?: string;
  tokenPrefix?: string;
  hostWarning?: string | null;
}

// Parse a stored payload to prove what cron-job.org will actually send.
// Returns the embedded botToken/chatId (or nulls if the JSON is corrupt).
function inspectPayload(payload: string): { botToken: string; chatId: string; msgType: string } {
  try {
    const p = JSON.parse(payload);
    return {
      botToken: typeof p.botToken === "string" ? p.botToken : "",
      chatId: typeof p.chatId === "string" ? p.chatId : String(p.chatId ?? ""),
      msgType: typeof p.type === "string" ? p.type : "?",
    };
  } catch {
    return { botToken: "", chatId: "", msgType: "?" };
  }
}

function maskTokenFull(token: string): string {
  if (!token) return "(missing!)";
  if (token.length <= 12) return "*****" + token.slice(-4);
  return token.slice(0, 6) + "..." + token.slice(-4) + ` (${token.length} chars)`;
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
  const [cronTestLoading, setCronTestLoading] = useState(false);
  const [cronTestResult, setCronTestResult] = useState<string | null>(null);
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
        alertPayload: data.alertPayload,
        signalPayload: data.signalPayload,
        intervalMinutes: data.intervalMinutes,
        embeddedChatId: data.embeddedChatId,
        embeddedChatTitle: data.embeddedChatTitle,
        tokenPrefix: data.tokenPrefix,
        hostWarning: data.hostWarning || null,
      });
      if (data.hostWarning) {
        setServerError(data.hostWarning);
      }

      // Normalize the app's saved Telegram config to the canonical values
      // Telegram verified (prevents manual sends going to a differently-
      // formatted "other" channel than the cron bodies use).
      if (data.canonicalChatId || data.canonicalBotToken) {
        onChange({
          ...config,
          botToken: data.canonicalBotToken || config.botToken,
          chatId: data.canonicalChatId || config.chatId,
          chatTitle: data.embeddedChatTitle || config.chatTitle,
          isConnected: true,
        });
      }

      setIsEnabled(true);
      localStorage.setItem("server_broadcast_enabled", "true");
      localStorage.setItem("server_broadcast_cron_url", data.cronUrl);
      localStorage.setItem("server_broadcast_alert_payload", data.alertPayload);
      localStorage.setItem("server_broadcast_signal_payload", data.signalPayload);
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
      setCronTestResult(null);
      localStorage.removeItem("server_broadcast_enabled");
      localStorage.removeItem("server_broadcast_cron_url");
      localStorage.removeItem("server_broadcast_alert_payload");
      localStorage.removeItem("server_broadcast_signal_payload");
      localStorage.removeItem("server_broadcast_cron_payload");
      await fetchStatus();
    } catch (err: any) {
      setServerError(err.message || "Disable failed.");
    } finally {
      setServerLoading(false);
    }
  };

  // ── Test the EXACT saved payload against the cron endpoint ─────────────────
  // This performs the same POST cron-job.org will perform, so a success here
  // proves the copied URL + body are correct before touching cron-job.org.
  const handleCronTest = async (which: "alert" | "signal") => {
    if (!cronSetup) return;
    setCronTestLoading(true);
    setCronTestResult(null);
    setServerError("");
    try {
      const payload = which === "alert" ? cronSetup.alertPayload : cronSetup.signalPayload;
      const res = await fetch(cronSetup.cronUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: payload,
      });
      const ct = res.headers.get("content-type") || "";
      const data = ct.includes("application/json") ? await res.json() : { error: await res.text() };
      if (!res.ok || (data as any).success === false) {
        throw new Error((data as any).error || (data as any).hint || `Test failed (HTTP ${res.status}).`);
      }
      setCronTestResult(`✅ ${which} test delivered to "${(data as any).chatTitle || (data as any).chatIdUsed || "channel"}" (${(data as any).chatIdUsed || "id unknown"}, messageId ${(data as any).messageId}). Your copied values are correct — now paste them into cron-job.org.`);
      fetchStatus();
    } catch (err: any) {
      setCronTestResult(`❌ ${which} test failed: ${err.message || "unknown error"}`);
    } finally {
      setCronTestLoading(false);
    }
  };

  // Restore saved cron setup from localStorage on mount
  useEffect(() => {
    const savedUrl = localStorage.getItem("server_broadcast_cron_url");
    const savedAlert = localStorage.getItem("server_broadcast_alert_payload");
    const savedSignal = localStorage.getItem("server_broadcast_signal_payload");
    if (savedUrl && savedAlert && savedSignal && localStorage.getItem("server_broadcast_enabled") === "true") {
      setCronSetup({
        cronUrl: savedUrl,
        alertPayload: savedAlert,
        signalPayload: savedSignal,
        intervalMinutes,
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
        {isEnabled && cronSetup && (() => {
          const sig = inspectPayload(cronSetup.signalPayload);
          const al = inspectPayload(cronSetup.alertPayload);
          const payloadChat = sig.chatId || al.chatId;
          const payloadToken = sig.botToken || al.botToken;
          const tokenMatches =
            !!payloadToken && !!config.botToken && payloadToken.trim() === config.botToken.trim();
          const chatMatches =
            !!payloadChat && !!config.chatId && payloadChat.trim() === config.chatId.trim();
          const isStale = !tokenMatches || !chatMatches;
          return (
          <div className="bg-slate-900/60 border border-emerald-900/30 rounded-xl p-4 space-y-4">
            <div className="flex items-center gap-1.5">
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              <span className="text-xs font-bold text-emerald-300">Set up 2 cron jobs — takes 3 minutes, works forever</span>
            </div>

            <div className="bg-sky-950/30 border border-sky-900/30 rounded-lg p-2.5 flex items-start gap-1.5">
              <Info className="w-3.5 h-3.5 text-sky-400 shrink-0 mt-0.5" />
              <p className="text-[10.5px] text-sky-200">
                Go to <a href="https://cron-job.org" target="_blank" rel="noreferrer" className="underline font-bold">cron-job.org</a> → free account → create <b>2 separate cron jobs</b> below. Same URL, same interval — different bodies, 1 minute apart. Alert always fires 1 min before signal, at any interval.
              </p>
            </div>

            {/* ── What cron-job.org will actually send (proves the copy is right) ── */}
            <div className="bg-slate-950/70 border border-slate-700 rounded-lg p-3 space-y-1.5">
              <p className="text-[10.5px] font-bold text-slate-200">🔍 Embedded in your copied bodies (auto-checked):</p>
              <p className="text-[10px] text-slate-400 font-mono break-all">
                Chat ID in body: <b className="text-emerald-300">{payloadChat || "(missing!)"}</b>
                {" · "}Now in app: <b className="text-sky-300">{config.chatId || "(empty)"}</b>
                {" "}{chatMatches ? "✅ match" : "⚠️ DIFFERENT — re-enable below"}
              </p>
              <p className="text-[10px] text-slate-400 font-mono break-all">
                Token in body: <b className="text-emerald-300">{maskTokenFull(payloadToken)}</b>
                {" "}{tokenMatches ? "✅ match" : "⚠️ DIFFERENT — re-enable below"}
              </p>
              {cronSetup.embeddedChatTitle && (
                <p className="text-[10px] text-slate-400">
                  Verified channel at enable time: <b className="text-slate-200">{cronSetup.embeddedChatTitle}</b>
                </p>
              )}
              {isStale && (
                <p className="text-[10.5px] text-amber-300 bg-amber-950/30 border border-amber-900/40 rounded-lg p-2">
                  ⚠️ You changed your Bot Token or Channel ID <b>after</b> clicking Enable, so the bodies below are stale.
                  Click <b>Stop Auto-Broadcast</b>, then <b>Enable</b> again to regenerate them — otherwise cron-job.org keeps sending to the old values.
                </p>
              )}
            </div>

            <div className="space-y-1.5">
              <p className="text-[10.5px] font-bold text-slate-300">Both cron jobs — same URL (exact copy):</p>
              <div className="flex items-center gap-2 bg-slate-950 border border-slate-700 rounded-lg px-3 py-2">
                <code className="text-emerald-300 text-[10px] break-all flex-1">{cronSetup.cronUrl}</code>
                <CopyButton text={cronSetup.cronUrl} />
              </div>
              {cronSetup.cronUrl.includes("localhost") && (
                <p className="text-[10.5px] text-rose-300 bg-rose-950/30 border border-rose-900/40 rounded-lg p-2">
                  ❌ This URL is localhost — cron-job.org can never reach it. Deploy to Vercel, open the LIVE URL, and Enable there.
                </p>
              )}
            </div>

            <div className="bg-amber-950/20 border border-amber-900/30 rounded-xl p-3 space-y-2">
              <p className="text-[11px] font-bold text-amber-300">🔔 Cron Job 1 — Alert (fires first)</p>
              <p className="text-[10px] text-slate-400">Schedule: your interval (e.g. every 2 min) · Method: POST · Request body: Custom · Content-Type: application/json · Body = below EXACTLY (must contain "type":"alert")</p>
              <div className="flex items-start gap-2 bg-slate-950 border border-slate-700 rounded-lg px-2 py-2">
                <code className="text-amber-200 text-[9px] break-all flex-1 font-mono leading-relaxed">{cronSetup.alertPayload}</code>
                <CopyButton text={cronSetup.alertPayload} />
              </div>
              <button
                type="button"
                onClick={() => handleCronTest("alert")}
                disabled={cronTestLoading}
                className="px-3 py-1.5 text-[10px] font-bold bg-amber-600 hover:bg-amber-500 disabled:bg-slate-700 text-white rounded-lg transition-all"
              >
                {cronTestLoading ? "Testing..." : "▶ Test-send this exact alert now"}
              </button>
            </div>

            <div className="bg-emerald-950/20 border border-emerald-900/30 rounded-xl p-3 space-y-2">
              <p className="text-[11px] font-bold text-emerald-300">📈 Cron Job 2 — Signal (fires 1 min after alert)</p>
              <p className="text-[10px] text-slate-400">Schedule: same interval, <b className="text-white">started/saved 1 minute after Cron Job 1</b> · Method: POST · Request body: Custom · Content-Type: application/json · Body = below EXACTLY (must contain "type":"signal")</p>
              <div className="flex items-start gap-2 bg-slate-950 border border-slate-700 rounded-lg px-2 py-2">
                <code className="text-emerald-200 text-[9px] break-all flex-1 font-mono leading-relaxed">{cronSetup.signalPayload}</code>
                <CopyButton text={cronSetup.signalPayload} />
              </div>
              <button
                type="button"
                onClick={() => handleCronTest("signal")}
                disabled={cronTestLoading}
                className="px-3 py-1.5 text-[10px] font-bold bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-700 text-white rounded-lg transition-all"
              >
                {cronTestLoading ? "Testing..." : "▶ Test-send this exact signal now"}
              </button>
            </div>

            {cronTestResult && (
              <p className="text-[10.5px] bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-slate-200">{cronTestResult}</p>
            )}

            <p className="text-[10px] text-slate-500">
              <b className="text-slate-300">Tip:</b> Create and save Cron Job 1 first. Wait exactly 1 minute, then create and save Cron Job 2. They will naturally be offset by 1 minute forever.
              If a test-send fails, fix what it says (usually bot-not-admin or wrong ID) and click Enable again for fresh bodies.
            </p>
          </div>
          );
        })()}

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
                  const a = localStorage.getItem("server_broadcast_alert_payload");
                  const s = localStorage.getItem("server_broadcast_signal_payload");
                  if (u && a && s) setCronSetup({ cronUrl: u, alertPayload: a, signalPayload: s, intervalMinutes });
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
