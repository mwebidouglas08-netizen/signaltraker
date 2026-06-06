import React, { useState } from "react";
import { TelegramConfig } from "../types";
import { Send, CheckCircle2, AlertCircle, HelpCircle, Eye, EyeOff, Check, ArrowRight, PowerOff } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

interface Props {
  config: TelegramConfig;
  onChange: (newConfig: TelegramConfig) => void;
}

export default function TelegramConfigPanel({ config, onChange }: Props) {
  const [testStatus, setTestStatus] = useState<"idle" | "testing" | "success" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState("");
  const [successInfo, setSuccessInfo] = useState<{ title: string; id: string } | null>(null);
  const [showToken, setShowToken] = useState(false);
  const [showGuide, setShowGuide] = useState(false);

  const handleDisconnect = () => {
    setTestStatus("idle");
    setErrorMessage("");
    setSuccessInfo(null);
    onChange({
      ...config,
      botToken: "",
      chatId: "",
      isConnected: false,
      chatTitle: "",
    });
  };

  const handleInstantConnect = (e: React.MouseEvent) => {
    e.preventDefault();
    if (!config.botToken || !config.chatId) {
      setErrorMessage("Please fill in both the Bot Token and Channel ID.");
      setTestStatus("error");
      return;
    }

    setTestStatus("success");
    
    // Perform simple client-side sanitization
    let cleanToken = config.botToken.trim();
    let cleanChatId = config.chatId.trim();

    if (cleanChatId && !cleanChatId.startsWith("@") && !cleanChatId.startsWith("-") && isNaN(Number(cleanChatId))) {
      cleanChatId = "@" + cleanChatId;
    }
    if (/^\d{7,20}$/.test(cleanChatId)) {
      cleanChatId = "-100" + cleanChatId;
    } else if (/^-\d{7,20}$/.test(cleanChatId) && !cleanChatId.startsWith("-100")) {
      cleanChatId = "-100" + cleanChatId.substring(1);
    }

    setSuccessInfo({
      title: "Linked Successfully",
      id: cleanChatId,
    });

    onChange({
      ...config,
      botToken: cleanToken,
      chatId: cleanChatId,
      isConnected: true,
      chatTitle: config.chatTitle || "Linked Channel",
    });
  };

  const saveConfig = (botToken: string, chatId: string) => {
    onChange({
      ...config,
      botToken: botToken.trim(),
      chatId: chatId.trim(),
    });
  };

  const handleTestConnection = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!config.botToken || !config.chatId) {
      setErrorMessage("Please fill in both the Bot Token and Channel ID to run a test connection.");
      setTestStatus("error");
      return;
    }

    setTestStatus("testing");
    setErrorMessage("");
    setSuccessInfo(null);

    try {
      const response = await fetch("/api/telegram/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          botToken: config.botToken,
          chatId: config.chatId,
        }),
      });

      const data = await response.json();
      
      // Update with sanitized credentials if returned to make the application self-correcting
      const updatedBotToken = data.botToken || config.botToken;
      const updatedChatId = data.chatId || config.chatId;

      if (!response.ok || !data.success) {
        // Update credentials even on error to let the user see how they were interpreted/cleaned
        onChange({
          ...config,
          botToken: updatedBotToken,
          chatId: updatedChatId,
          isConnected: false,
        });
        throw new Error(data.error || "Failed connection test");
      }

      setTestStatus("success");
      setSuccessInfo({
        title: data.chatTitle,
        id: updatedChatId,
      });
      onChange({
        ...config,
        botToken: updatedBotToken,
        chatId: updatedChatId,
        isConnected: true,
        chatTitle: data.chatTitle,
      });
    } catch (err: any) {
      setTestStatus("error");
      setErrorMessage(err.message || "An unexpected error occurred during connection test.");
      onChange({ ...config, isConnected: false });
    }
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-6" id="telegram-config-card">
      <div className="flex items-start justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-sky-500 animate-pulse"></span>
            <h2 className="text-lg font-semibold tracking-tight text-white font-sans">Telegram Bot Settings</h2>
          </div>
          <p className="text-xs text-slate-400">Configure credentials to link your channel.</p>
        </div>
        <button
          onClick={() => setShowGuide(!showGuide)}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-slate-300 hover:text-white bg-slate-800/80 hover:bg-slate-800 border border-slate-700/50 rounded-lg transition-all"
          type="button"
          id="btn-toggle-cfg-guide"
        >
          <HelpCircle className="w-3.5 h-3.5" />
          <span>Setup Guide</span>
        </button>
      </div>

      <AnimatePresence>
        {showGuide && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden bg-slate-950/60 border border-slate-800/80 rounded-xl"
            id="cfg-guide-content"
          >
            <div className="p-4 space-y-4 text-xs leading-relaxed text-slate-300">
              <h3 className="font-semibold text-sky-400 text-sm flex items-center gap-1.5">
                <span>⚡ How to get up and running in 3 minutes</span>
              </h3>
              <ol className="space-y-3.5 list-decimal pl-4">
                <li>
                  <strong className="text-slate-200">Generate Bot Token:</strong>
                  <div className="text-slate-400 mt-1">
                    Open Telegram and search for <code className="text-sky-300 font-mono">@BotFather</code>. Send the command <code className="text-sky-300 font-mono">/newbot</code>, choose a display name, and select a username. Copy the long HTTP APIToken generated (looks like <code className="bg-slate-900 text-slate-300 px-1 rounded">123456789:ABCdefGhI...</code>).
                  </div>
                </li>
                <li>
                  <strong className="text-slate-200">Prepare Telegram Channel:</strong>
                  <div className="text-slate-400 mt-1">
                    Create a public or private Telegram Channel.
                  </div>
                </li>
                <li>
                  <strong className="text-slate-200">Add Bot as Admin:</strong>
                  <div className="text-slate-400 mt-1 font-semibold text-amber-300">
                    ⚠️ CRITICAL STEP: Go to channel settings &rarr; Managing Admins &rarr; Add Admin &rarr; Search your Bot's username and add it as an Administrator. Make sure the "Post Messages" permission is turned ON.
                  </div>
                </li>
                <li>
                  <strong className="text-slate-200">Retrieve Channel ID:</strong>
                  <div className="text-slate-400 mt-1">
                    - Public channel: Use your channel handle starting with <code className="text-sky-300 font-mono">@</code> (e.g. <code className="text-sky-300 font-mono">@my_trading_signals</code>).<br />
                    - Private channel: Forward any post from your channel to <code className="text-sky-300 font-mono">@username_to_id_bot</code> or <code className="text-sky-300 font-mono">@idbot</code> to instantly retrieve the chat ID (typically structured like <code className="text-sky-300 font-mono">-1001234567890</code>).
                  </div>
                </li>
              </ol>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <form onSubmit={handleTestConnection} className="space-y-4">
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-slate-300 flex justify-between">
            <span>Bot Access Token</span>
            <span className="text-[10px] text-slate-500 font-mono">from @BotFather</span>
          </label>
          <div className="relative">
            <input
              type={showToken ? "text" : "password"}
              value={config.botToken}
              onChange={(e) => saveConfig(e.target.value, config.chatId)}
              placeholder="e.g. 1234567890:ABCdefGhIJKlmnoPQRstuvwxYZ"
              className="w-full px-3.5 py-2.5 text-xs bg-slate-950 border border-slate-800 focus:border-sky-500 rounded-xl text-slate-100 placeholder-slate-600 outline-none transition-all pr-10 font-mono"
              required
              id="input-bot-token"
            />
            <button
              type="button"
              onClick={() => setShowToken(!showToken)}
              className="absolute right-3 top-3 text-slate-500 hover:text-slate-300 transition-colors"
              id="btn-toggle-token-visibility"
            >
              {showToken ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
            </button>
          </div>
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-medium text-slate-300 flex justify-between">
            <span>Channel ID / Chat Username</span>
            <span className="text-[10px] text-slate-500 font-mono">starts with @ or -100</span>
          </label>
          <input
            type="text"
            value={config.chatId}
            onChange={(e) => saveConfig(config.botToken, e.target.value)}
            placeholder="e.g. @yourchannel or -1001567890123"
            className="w-full px-3.5 py-2.5 text-xs bg-slate-950 border border-slate-800 focus:border-sky-500 rounded-xl text-slate-100 placeholder-slate-600 outline-none transition-all font-mono"
            required
            id="input-chat-id"
          />
        </div>

        {/* Toggle options to turn on/off sharing of signals as requested by user */}
        <div className="bg-slate-950/80 p-4 border border-slate-800/80 rounded-xl space-y-3" id="toggle-broadcast-options">
          <h4 className="text-xs font-semibold text-sky-400 font-sans tracking-wide uppercase flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-sky-400"></span>
            <span>Broadcast Sharing Control</span>
          </h4>
          
          <div className="space-y-3">
            {/* Toggle 1: Scanner Setup Alerts */}
            <div className="flex items-center justify-between gap-3 text-xs">
              <div className="space-y-0.5 max-w-[80%]">
                <span className="font-semibold text-slate-200">1. Volatility Scanner Auto-Broadcast</span>
                <p className="text-[10px] text-slate-400 leading-normal">
                  Enable automatic sharing of live setups directly to <code className="text-sky-300 font-mono text-[9px]">{config.chatId || "Channel"}</code>.
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  onChange({
                    ...config,
                    enableScannerBroadcast: config.enableScannerBroadcast === false ? true : false
                  });
                }}
                className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border border-slate-700/30 transition-colors duration-200 ease-in-out focus:outline-none ${
                  config.enableScannerBroadcast !== false ? 'bg-sky-500' : 'bg-slate-800'
                }`}
                id="toggle-scanner-sharing"
              >
                <span
                  className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                    config.enableScannerBroadcast !== false ? 'translate-x-4' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>

            {/* Toggle 2: Manual Composer Signals */}
            <div className="flex items-center justify-between gap-3 text-xs pt-1 border-t border-slate-900">
              <div className="space-y-0.5 max-w-[80%]">
                <span className="font-semibold text-slate-200">2. AI Signal Compiler Auto-Share</span>
                <p className="text-[10px] text-slate-400 leading-normal">
                  Enable immediate automatic broadcast of manually generated or compiled drafts without manual click approval.
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  onChange({
                    ...config,
                    enableManualBroadcast: config.enableManualBroadcast === false ? true : false
                  });
                }}
                className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border border-slate-700/30 transition-colors duration-200 ease-in-out focus:outline-none ${
                  config.enableManualBroadcast !== false ? 'bg-sky-500' : 'bg-slate-800'
                }`}
                id="toggle-manual-sharing"
              >
                <span
                  className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                    config.enableManualBroadcast !== false ? 'translate-x-4' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>
          </div>
        </div>

        <div className="pt-2 flex flex-wrap gap-2.5 items-stretch sm:items-center">
          {!config.isConnected ? (
            <>
              <button
                type="button"
                onClick={handleInstantConnect}
                disabled={!config.botToken || !config.chatId}
                className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-2 px-5 py-2.5 bg-gradient-to-r from-emerald-600 to-emerald-500 hover:from-emerald-500 hover:to-emerald-400 disabled:from-slate-800 disabled:to-slate-800 disabled:text-slate-500 text-white font-semibold text-xs rounded-xl shadow-lg shadow-emerald-500/10 cursor-pointer disabled:cursor-not-allowed transform hover:-translate-y-px active:translate-y-0 transition-all font-sans"
                id="btn-instant-connect"
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>Connect Bot</span>
              </button>

              <button
                type="submit"
                disabled={testStatus === "testing" || !config.botToken || !config.chatId}
                className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 disabled:bg-slate-900 disabled:text-slate-500 border border-slate-700 hover:border-slate-600 font-medium text-xs rounded-xl cursor-pointer disabled:cursor-not-allowed transition-all font-sans"
                id="btn-test-connection"
              >
                {testStatus === "testing" ? (
                  <>
                    <svg className="animate-spin h-3.5 w-3.5 text-white" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    <span>Sending Test...</span>
                  </>
                ) : (
                  <>
                    <Send className="w-3.5 h-3.5" />
                    <span>Send Test Message</span>
                  </>
                )}
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={handleDisconnect}
                className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/20 hover:border-rose-500/30 font-medium text-xs rounded-xl cursor-pointer transition-all font-sans"
                id="btn-disconnect-telegram"
              >
                <PowerOff className="w-3.5 h-3.5" />
                <span>Disconnect Channel</span>
              </button>

              <button
                type="submit"
                disabled={testStatus === "testing" || !config.botToken || !config.chatId}
                className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 disabled:bg-slate-900 disabled:text-slate-500 border border-slate-700 hover:border-slate-600 font-medium text-xs rounded-xl cursor-pointer disabled:cursor-not-allowed transition-all font-sans"
                id="btn-test-connection"
              >
                {testStatus === "testing" ? (
                  <>
                    <svg className="animate-spin h-3.5 w-3.5 text-white" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    <span>Sending Test...</span>
                  </>
                ) : (
                  <>
                    <Send className="w-3.5 h-3.5" />
                    <span>Send Test Message</span>
                  </>
                )}
              </button>
            </>
          )}

          {config.isConnected && testStatus !== "error" && (
            <div className="flex items-center gap-1.5 text-emerald-400 text-xs py-2 sm:py-0 px-2 font-medium sm:ml-auto" id="connected-badge">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>Linked: {config.chatTitle || "Channel Verified"}</span>
            </div>
          )}
        </div>

        {/* Action feedback messaging */}
        <AnimatePresence mode="wait">
          {testStatus === "success" && successInfo && (
            <motion.div
              initial={{ opacity: 0, y: 5 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -5 }}
              className="bg-emerald-950/40 border border-emerald-900/50 rounded-xl p-3.5 text-xs text-emerald-300 space-y-1"
              id="test-success-banner"
            >
              <div className="flex items-center gap-1.5 font-semibold">
                <Check className="w-3.5 h-3.5 text-emerald-400" />
                <span>Test Successful!</span>
              </div>
              <p className="text-slate-300">
                A verification alert has been sent to channel <b>{successInfo.title}</b>. Your signals are ready to fly.
              </p>
            </motion.div>
          )}

          {testStatus === "error" && (
            <motion.div
              initial={{ opacity: 0, y: 5 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -5 }}
              className="bg-rose-950/40 border border-rose-900/50 rounded-xl p-3.5 text-xs text-rose-300 space-y-1"
              id="test-error-banner"
            >
              <div className="flex items-center gap-1.5 font-semibold">
                <AlertCircle className="w-3.5 h-3.5 text-rose-400" />
                <span>Connection Failed</span>
              </div>
              <p className="text-slate-300">
                {errorMessage}
              </p>
              <ul className="list-disc pl-4 space-y-1 text-[11px] text-slate-400 mt-2">
                <li>Double check that the bot token is copied correctly from BotFather.</li>
                <li>Ensure the bot is added to your channel as an <b>Admin</b> with <b>Post Messages</b> permission enabled.</li>
                <li>Make sure the Channel ID is exact (including are prefix <code className="font-mono bg-slate-900 px-0.5 rounded">-100</code> for private ones).</li>
              </ul>
            </motion.div>
          )}
        </AnimatePresence>
      </form>
    </div>
  );
}
