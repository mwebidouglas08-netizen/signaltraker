import React, { useState, useEffect } from "react";
import { 
  Sparkles, 
  Coins, 
  ArrowRight, 
  ShieldAlert, 
  HelpCircle, 
  Laptop, 
  Landmark, 
  Radio, 
  BellRing, 
  RefreshCw, 
  Megaphone, 
  Hourglass, 
  CheckSquare, 
  Save, 
  Trash2, 
  FolderSync,
  Calendar,
  AlertCircle,
  Navigation,
  ChevronDown,
  Check,
  Bell,
  RotateCcw,
  FileText,
  CheckCircle2
} from "lucide-react";

interface Props {
  onSignalGenerated: (signalData: {
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
  }, skipAutoBroadcast?: boolean) => void;
  aiConfigured: boolean;
  autoShareEnabled: boolean;
  onAutoShareToggle: (value: boolean) => void;
  telegramConfigChatId?: string;
  onPostDirectTelegram?: (text: string) => Promise<{ success: boolean; messageId?: string; error?: string }>;
  loadedTemplate?: any | null;
  onClearLoadedTemplate?: () => void;
}

export default function TradingSignalForm({ 
  onSignalGenerated, 
  aiConfigured,
  autoShareEnabled,
  onAutoShareToggle,
  telegramConfigChatId,
  onPostDirectTelegram,
  loadedTemplate,
  onClearLoadedTemplate
}: Props) {
  // Toggle tab: "classic" vs "deriv" vs "sequence"
  const [formMode, setFormMode] = useState<"classic" | "deriv" | "sequence" >("deriv");

  // Load template effect
  useEffect(() => {
    if (loadedTemplate) {
      if (loadedTemplate.type?.includes("Digit") || loadedTemplate.type?.includes("Synthetic") || loadedTemplate.type?.includes("Derivative")) {
        setFormMode("deriv");
        setDerivSymbol(loadedTemplate.symbol || "");
        setDerivAction(loadedTemplate.action || "");
        setDerivStrategy(loadedTemplate.strategy || "");
        setDerivRiskManagement(loadedTemplate.notes || "");
      } else {
        setFormMode("classic");
        setAssetClass(loadedTemplate.type || "Forex");
        setSymbol(loadedTemplate.symbol || "");
        setAction(loadedTemplate.action || "BUY");
        setUserNotes(loadedTemplate.notes || "");
        setEntry("CMP");
      }
      if (onClearLoadedTemplate) {
        onClearLoadedTemplate();
      }
    }
  }, [loadedTemplate]);

  // --- COMMON OR CLASSIC MODE STATE ---
  const [assetClass, setAssetClass] = useState("Forex");
  const [symbol, setSymbol] = useState("GBPUSD");
  const [action, setAction] = useState("BUY");
  const [entry, setEntry] = useState("");
  const [tp1, setTp1] = useState("");
  const [tp2, setTp2] = useState("");
  const [tp3, setTp3] = useState("");
  const [sl, setSl] = useState("");
  const [userNotes, setUserNotes] = useState("");
  const [sentiment, setSentiment] = useState("Moderate");

  // --- DERIV SYNTHETIC DIGIT MODE STATE ---
  const [derivSymbol, setDerivSymbol] = useState("VOLATILITY 100 (1s) INDEX");
  const [derivAction, setDerivAction] = useState("UNDER 7");
  const [derivStrategy, setDerivStrategy] = useState("Second Least Digit");
  const [derivTicks, setDerivTicks] = useState("1ticks");
  // ── Persisted site config — read from localStorage so changes survive reloads ──
  const savedSite = (() => {
    try { return JSON.parse(localStorage.getItem("signal_site_config") || "{}"); } catch { return {}; }
  })();

  const [derivBotName, setDerivBotName] = useState<string>(savedSite.botName || "USE SNIPPER KILLER BOT");
  const [derivEntryDigit, setDerivEntryDigit] = useState("9");
  const [derivConfidence, setDerivConfidence] = useState("85%");
  const [derivPromoUrl, setDerivPromoUrl] = useState<string>(savedSite.promoUrl || "http://kicktrade.site");

  const [linkedSiteUrl, setLinkedSiteUrl] = useState<string>(savedSite.promoUrl || "http://kicktrade.site");
  const [detectedSiteName, setDetectedSiteName] = useState<string>(savedSite.siteName || "kicktrade");
  const [detectedBots, setDetectedBots] = useState<string[]>(savedSite.bots || []);
  const [siteDetecting, setSiteDetecting] = useState(false);
  const [siteDetectError, setSiteDetectError] = useState("");
  const [siteDetectSuccess, setSiteDetectSuccess] = useState(savedSite.siteName ? `✅ Using: "${savedSite.siteName}"` : "");
  const [showBotPicker, setShowBotPicker] = useState(false);

  // Persist site config to localStorage whenever key fields change
  const persistSiteConfig = (updates: Record<string, any>) => {
    try {
      const current = JSON.parse(localStorage.getItem("signal_site_config") || "{}");
      localStorage.setItem("signal_site_config", JSON.stringify({ ...current, ...updates }));
    } catch {}
  };

  const handleDetectSite = async () => {
    if (!linkedSiteUrl.trim()) {
      setSiteDetectError("Please enter a site URL first.");
      return;
    }
    setSiteDetecting(true);
    setSiteDetectError("");
    setSiteDetectSuccess("");
    setShowBotPicker(false);

    try {
      const response = await fetch("/api/site/detect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ siteUrl: linkedSiteUrl.trim() }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || "Failed to detect site.");
      }

      const siteName = data.siteName || linkedSiteUrl;
      const siteUrl = data.siteUrl;
      const bots: string[] = data.bots && data.bots.length > 0
        ? data.bots
        : [];

      const safeName = siteName.replace(/[^A-Za-z0-9\s]/g, "").trim();
      const newSignature = `${siteName} Signal Bot`;
      const newHashtags = `#TradingSignal #${safeName.replace(/\s+/g, "")} #Signals`;
      const newBotName = bots.length === 1
        ? `USE ${bots[0].toUpperCase()}`
        : bots.length > 1
          ? derivBotName // keep current until user picks
          : `USE ${safeName.toUpperCase().slice(0, 20)} BOT`;

      // Update all related state
      setDetectedSiteName(siteName);
      setDetectedBots(bots);
      setDerivPromoUrl(siteUrl);
      setDerivBotSignature(newSignature);
      setDerivHashtags(newHashtags);

      // Persist everything to localStorage so it survives page reloads
      persistSiteConfig({
        siteName,
        promoUrl: siteUrl,
        bots,
        botSignature: newSignature,
        hashtags: newHashtags,
        botName: bots.length === 1 ? `USE ${bots[0].toUpperCase()}` : derivBotName,
      });

      if (bots.length === 1) {
        const autoBot = `USE ${bots[0].toUpperCase()}`;
        setDerivBotName(autoBot);
        persistSiteConfig({ botName: autoBot });
        setSiteDetectSuccess(`✅ Site: "${siteName}" — bot "${bots[0]}" auto-selected.`);
      } else if (bots.length > 1) {
        setShowBotPicker(true);
        setSiteDetectSuccess(`✅ Site: "${siteName}" — ${bots.length} bots found. Pick one below.`);
      } else {
        setDerivBotName(newBotName);
        persistSiteConfig({ botName: newBotName });
        setSiteDetectSuccess(`✅ Site: "${siteName}" detected. No specific bots found — using generated name.`);
      }
    } catch (err: any) {
      setSiteDetectError(err.message || "Detection failed. Check the URL and try again.");
    } finally {
      setSiteDetecting(false);
    }
  };
  const [derivRiskManagement, setDerivRiskManagement] = useState(
    "• Stop after 4 consecutive wins\n• Max 5 runs per session\n• Use proper recovery if loss occurs"
  );
  const [derivBotSignature, setDerivBotSignature] = useState<string>(savedSite.botSignature || "kicktrade Over/Under Bot");
  const [derivHashtags, setDerivHashtags] = useState<string>(savedSite.hashtags || "#TradingSignal #kicktrade #Signals");

  // --- OPTION 3: ALERT SEQUENCE MODE STATE ---
  const [seqSymbol, setSeqSymbol] = useState("VOLATILITY 100 INDEX");
  const [seqAction, setSeqAction] = useState("UNDER 7");
  const [seqStrategy, setSeqStrategy] = useState("Second Least Digit");
  const [seqPreSignal, setSeqPreSignal] = useState(
    `🚨 <b>STANDBY ALERT TO MEMBERS</b> 🚨\n` +
    `━━━━━━━━━━━━━━━━━━━━━━\n` +
    `⏳ <b>Preparing</b> an upcoming trade setup on <b>VOLATILITY 100 INDEX</b>.\n` +
    `📢 <b>Bot Settings:</b> Second Least Digit Pattern\n` +
    `⚡ <i>Standby and prepare your balance! We either go home or go hard. No risk no Ferrari!</i>`
  );
  const [seqActiveSignal, setSeqActiveSignal] = useState(
    `🔔 <b>ACTIVE TRADING SETUP BROADCAST</b> 🔔\n` +
    `━━━━━━━━━━━━━━━━━━━━━━\n` +
    `📈 <b>Asset:</b> VOLATILITY 100 INDEX\n` +
    `📊 <b>Contract:</b> UNDER 7\n` +
    `⚡ <b>Strategy:</b> Second Least Digit\n\n` +
    `🎯 Entry trigger active! Execute with correct risk models.`
  );
  const [seqPostSignal, setSeqPostSignal] = useState(
    `⌛ <b>COOLDOWN & NEXT READY</b> ⌛\n` +
    `━━━━━━━━━━━━━━━━━━━━━━\n` +
    `✅ Previous alert sequence for <b>VOLATILITY 100 INDEX</b> is finalized!\n` +
    `📡 <i>Entering temporary cooldown. Relax and prepare.</i>\n\n` +
    `🔔 <b>Stay tuned!</b> We are already scanning for the next alert signal opportunity.`
  );

  const [transPreStatus, setTransPreStatus] = useState<"idle" | "sending" | "success" | "error">("idle");
  const [transActiveStatus, setTransActiveStatus] = useState<"idle" | "sending" | "success" | "error">("idle");
  const [transPostStatus, setTransPostStatus] = useState<"idle" | "sending" | "success" | "error">("idle");
  const [seqError, setSeqError] = useState("");

  // --- INLINE TEMPLATE/BLUEPRINT SAVE STATE ---
  const [showSaveTemplateForm, setShowSaveTemplateForm] = useState(false);
  const [saveTemplateName, setSaveTemplateName] = useState("");
  const [saveTemplateFeedback, setSaveTemplateFeedback] = useState("");

  // --- HQ SCREENSHOT DRAFT SEQUENCER STATE ---
  const [hqSignalName, setHqSignalName] = useState(() => {
    return localStorage.getItem("hq_signal_name") || "Volatility 100 Index Breaker Alert";
  });
  const [hqSignalType, setHqSignalType] = useState(() => {
    return localStorage.getItem("hq_signal_type") || "Derivative Digit Contract";
  });
  const [hqDescription, setHqDescription] = useState(() => {
    return localStorage.getItem("hq_description") || "High-speed digit patterns scanning under digit 7 with multi-barrier resistance breakout confirmation.";
  });
  const [hqPriority, setHqPriority] = useState(() => {
    return localStorage.getItem("hq_priority") || "High";
  });

  // Lead Alert (Column 1)
  const [hqLeadTrigger, setHqLeadTrigger] = useState(() => {
    return localStorage.getItem("hq_lead_trigger") || "Tick oscillation patterns print consecutive digits above 8 for 4 ticks, triggering standby condition.";
  });
  const [hqLeadAddInfo, setHqLeadAddInfo] = useState(() => {
    return localStorage.getItem("hq_lead_add_info") || "Prepare binary account balance and confirm bot server ping is under 40ms.";
  });
  const [hqLeadChannels, setHqLeadChannels] = useState(() => {
    return localStorage.getItem("hq_lead_channels") || "Telegram VIP Feed";
  });
  const [hqLeadRecipients, setHqLeadRecipients] = useState(() => {
    return localStorage.getItem("hq_lead_recipients") || "@zeta_vip_members, #volatility-feed";
  });

  // Current Signal (Column 2)
  const [hqCurrentTrigger, setHqCurrentTrigger] = useState(() => {
    return localStorage.getItem("hq_current_trigger") || "Active Setup Triggered: Digit 9 prints on last tick. Contract UNDER 7 active.";
  });
  const [hqCurrentAddInfo, setHqCurrentAddInfo] = useState(() => {
    return localStorage.getItem("hq_current_add_info") || "Martingale multiplier v2 activated. Maximum target depth set to 3 recovery steps.";
  });
  const [hqCurrentChannels, setHqCurrentChannels] = useState(() => {
    return localStorage.getItem("hq_current_channels") || "Telegram Main Channel";
  });
  const [hqCurrentRecipients, setHqCurrentRecipients] = useState(() => {
    return localStorage.getItem("hq_current_recipients") || "@signals_feed, #members-dashboard";
  });

  // Alert Going to be Sent (Column 3)
  const [hqGoingTrigger, setHqGoingTrigger] = useState(() => {
    return localStorage.getItem("hq_going_trigger") || "Final session cooldown alert and performance metrics overview.";
  });
  const [hqGoingAddInfo, setHqGoingAddInfo] = useState(() => {
    return localStorage.getItem("hq_going_add_info") || "Total gain for sequence block is stable. Standby for next system scan cycle.";
  });
  const [hqGoingSendTime, setHqGoingSendTime] = useState(() => {
    return localStorage.getItem("hq_going_send_time") || "2026-06-07T14:30";
  });
  const [hqGoingChannels, setHqGoingChannels] = useState(() => {
    return localStorage.getItem("hq_going_channels") || "Telegram Main Channel, Discord Feed";
  });
  const [hqGoingRecipients, setHqGoingRecipients] = useState(() => {
    return localStorage.getItem("hq_going_recipients") || "@signals_feed, #cooldown_tracker";
  });

  // General Settings Optional
  const [hqTags, setHqTags] = useState(() => {
    return localStorage.getItem("hq_tags") || "deriv, volatility100, second_least_digit, zeta";
  });
  const [hqNotes, setHqNotes] = useState(() => {
    return localStorage.getItem("hq_notes") || "Always monitor the base index on Deriv SmartTrader before starting the automatic bot loop.";
  });

  const [saveSuccessMessage, setSaveSuccessMessage] = useState("");

  // --- PRESET SYSTEM FOR OPTION 3 ---
  const defaultPresets: { id: string; name: string; symbol: string; action: string; strategy: string; preSignal: string; activeSignal: string; postSignal: string; }[] = [
    {
      id: "default-zeta",
      name: "Mr Zetuzetu Volatility Setup 📈",
      symbol: "VOLATILITY 100 INDEX",
      action: "UNDER 7",
      strategy: "Second Least Digit",
      preSignal: 
        `🚨 <b>STANDBY ALERT TO MEMBERS</b> 🚨\n` +
        `━━━━━━━━━━━━━━━━━━━━━━\n` +
        `⏳ <b>Preparing</b> an upcoming trade setup on <b>VOLATILITY 100 INDEX</b>.\n` +
        `📢 <b>Bot Settings:</b> Second Least Digit Pattern\n` +
        `⚡ <i>Standby and prepare your balance! We either go home or go hard. No risk no Ferrari!</i>`,
      activeSignal:
        `🔔 <b>ACTIVE TRADING SETUP BROADCAST</b> 🔔\n` +
        `━━━━━━━━━━━━━━━━━━━━━━\n` +
        `📈 <b>Asset:</b> VOLATILITY 100 INDEX\n` +
        `📊 <b>Contract:</b> UNDER 7\n` +
        `⚡ <b>Strategy:</b> Second Least Digit\n\n` +
        `🎯 Entry trigger active! Execute with correct risk models.`,
      postSignal:
        `⌛ <b>COOLDOWN & NEXT READY</b> ⌛\n` +
        `━━━━━━━━━━━━━━━━━━━━━━\n` +
        `✅ Previous alert sequence for <b>VOLATILITY 100 INDEX</b> is finalized!\n` +
        `📡 <i>Entering temporary cooldown. Relax and prepare.</i>\n\n` +
        `🔔 <b>Stay tuned!</b> We are already scanning for the next alert signal opportunity.`
    },
    {
      id: "crash-boom-sniper",
      name: "Crash / Boom Sniper Config 🎯",
      symbol: "CRASH 1000 INDEX",
      action: "SELL (SPIKE SNIPER)",
      strategy: "Stochastic Overbought Bounce",
      preSignal: 
        `🚨 <b>CRASH/BOOM SPIKE WARNING</b> 🚨\n` +
        `━━━━━━━━━━━━━━━━━━━━━━\n` +
        `⚠️ <b>Spike Area Approaching</b> on <b>CRASH 1000 INDEX</b>!\n` +
        `🤖 <b>Setup:</b> Extreme Overbought Cluster on M1 Chart\n` +
        `🚀 Standby to open your terminal. Prepare for massive spikes!`,
      activeSignal:
        `🔔 <b>LIVE SPIKE ALERTER ACTIVE</b> 🔔\n` +
        `━━━━━━━━━━━━━━━━━━━━━━\n` +
        `📈 <b>Asset:</b> CRASH 1000 INDEX\n` +
        `📊 <b>Contract:</b> SELL SPIKE\n` +
        `⚡ <b>Strategy:</b> Stochastic Overbought Cascade\n\n` +
        `🎯 Keep Martingale ready for max 3 steps. Execute NOW!`,
      postSignal:
        `⌛ <b>SPIKE EVENT CLOSED</b> ⌛\n` +
        `━━━━━━━━━━━━━━━━━━━━━━\n` +
        `✅ Setup is finished. Profit secured or stop level reached.\n` +
        `📡 We are waiting for the next Stochastic consolidation cycle.`
    },
    {
      id: "forex-gold-breakout",
      name: "Gold/FX Standby Breakout 🏅",
      symbol: "XAUUSD (GOLD)",
      action: "BUY BREAKOUT",
      strategy: "London Session Range Breakout",
      preSignal: 
        `🚨 <b>GOLD LONDON SESSION STANDBY</b> 🚨\n` +
        `━━━━━━━━━━━━━━━━━━━━━━\n` +
        `⏳ <b>Gold (XAUUSD)</b> is consolidating tightly near resistance.\n` +
        `📢 <b>Upcoming Breakout Signal</b> is drafting! Standby.`,
      activeSignal:
        `🔔 <b>GOLD ENTRY ACTIVE (TRIGGERED)</b> 🔔\n` +
        `━━━━━━━━━━━━━━━━━━━━━━\n` +
        `📈 <b>Asset:</b> XAUUSD (GOLD)\n` +
        `📊 <b>Contract:</b> BUY ABOVE RESISTANCE\n` +
        `⚡ <b>Strategy:</b> London Session Range Breakout\n\n` +
        `🎯 Entry active! Keep SL below yesterday's low.`,
      postSignal:
        `⌛ <b>GOLD INTRADAY COOLDOWN</b> ⌛\n` +
        `━━━━━━━━━━━━━━━━━━━━━━\n` +
        `✅ London session breakout cycle for GOLD is completed.\n` +
        `📡 Resting and scanning for New York Open. Stay safe!`
    }
  ];

  const [presets, setPresets] = useState(() => {
    const saved = localStorage.getItem("seq_presets");
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        return defaultPresets;
      }
    }
    return defaultPresets;
  });

  const [selectedPresetId, setSelectedPresetId] = useState("default-zeta");
  const [newPresetName, setNewPresetName] = useState("");

  const handleSelectPreset = (id: string) => {
    setSelectedPresetId(id);
    const found = presets.find((p: any) => p.id === id);
    if (found) {
      setSeqSymbol(found.symbol);
      setSeqAction(found.action);
      setSeqStrategy(found.strategy);
      setSeqPreSignal(found.preSignal);
      setSeqActiveSignal(found.activeSignal);
      setSeqPostSignal(found.postSignal);
    }
  };

  const handleCreatePreset = () => {
    if (!newPresetName.trim()) {
      setSeqError("Please enter a name for your custom preset.");
      return;
    }
    const newId = "preset-" + Date.now();
    const newPreset = {
      id: newId,
      name: `${newPresetName.trim()} 💾`,
      symbol: seqSymbol,
      action: seqAction,
      strategy: seqStrategy,
      preSignal: seqPreSignal,
      activeSignal: seqActiveSignal,
      postSignal: seqPostSignal,
    };
    const updated = [newPreset, ...presets];
    setPresets(updated);
    localStorage.setItem("seq_presets", JSON.stringify(updated));
    setSelectedPresetId(newId);
    setNewPresetName("");
    setSeqError("");
  };

  const handleDeletePreset = (id: string) => {
    if (id === "default-zeta" || id === "crash-boom-sniper" || id === "forex-gold-breakout") {
      setSeqError("Cannot delete default system presets.");
      return;
    }
    const updated = presets.filter((p: any) => p.id !== id);
    setPresets(updated);
    localStorage.setItem("seq_presets", JSON.stringify(updated));
    if (selectedPresetId === id) {
      setTimeout(() => handleSelectPreset("default-zeta"), 50);
    }
    setSeqError("");
  };

  const handleSaveHqDraft = () => {
    localStorage.setItem("hq_signal_name", hqSignalName);
    localStorage.setItem("hq_signal_type", hqSignalType);
    localStorage.setItem("hq_description", hqDescription);
    localStorage.setItem("hq_priority", hqPriority);

    localStorage.setItem("hq_lead_trigger", hqLeadTrigger);
    localStorage.setItem("hq_lead_add_info", hqLeadAddInfo);
    localStorage.setItem("hq_lead_channels", hqLeadChannels);
    localStorage.setItem("hq_lead_recipients", hqLeadRecipients);

    localStorage.setItem("hq_current_trigger", hqCurrentTrigger);
    localStorage.setItem("hq_current_add_info", hqCurrentAddInfo);
    localStorage.setItem("hq_current_channels", hqCurrentChannels);
    localStorage.setItem("hq_current_recipients", hqCurrentRecipients);

    localStorage.setItem("hq_going_trigger", hqGoingTrigger);
    localStorage.setItem("hq_going_add_info", hqGoingAddInfo);
    localStorage.setItem("hq_going_send_time", hqGoingSendTime);
    localStorage.setItem("hq_going_channels", hqGoingChannels);
    localStorage.setItem("hq_going_recipients", hqGoingRecipients);

    localStorage.setItem("hq_tags", hqTags);
    localStorage.setItem("hq_notes", hqNotes);

    setSaveSuccessMessage("Draft Sequencer Settings Saved Successfully! 💾");
    
    // Compile and notify compose panel so they can see preview/emit too!
    const compiledMessage = 
      `🚨 <b>DRAFT SEQUENCE: ${hqSignalName.toUpperCase()}</b> 🚨\n` +
      `📌 <b>Type:</b> ${hqSignalType} (Priority: ${hqPriority})\n` +
      `📝 <i>${hqDescription}</i>\n` +
      `━━━━━━━━━━━━━━━━━━━━━━\n\n` +
      `🟢 <b>1. LEAD WARNING (Early Alert)</b>\n` +
      `• <b>Trigger:</b> ${hqLeadTrigger}\n` +
      `• <b>Info:</b> ${hqLeadAddInfo}\n` +
      `• <b>Channels:</b> ${hqLeadChannels}\n\n` +
      `🔵 <b>2. ACTIVE SIGNAL (Live Play)</b>\n` +
      `• <b>Setup:</b> ${hqCurrentTrigger}\n` +
      `• <b>Info:</b> ${hqCurrentAddInfo}\n` +
      `• <b>Channels:</b> ${hqCurrentChannels}\n\n` +
      `🟠 <b>3. TARGET TRANSMIT (Scheduled)</b>\n` +
      `• <b>Condition:</b> ${hqGoingTrigger}\n` +
      `• <b>Info:</b> ${hqGoingAddInfo}\n` +
      `• <b>Release Time:</b> ${hqGoingSendTime} UTC\n` +
      `• <b>Channels:</b> ${hqGoingChannels}\n` +
      `━━━━━━━━━━━━━━━━━━━━━━\n` +
      `🏷️ <b>Tags:</b> ${hqTags}\n` +
      `💡 <b>Notes:</b> ${hqNotes}`;

    onSignalGenerated({
      assetClass: "Sequencer Blueprint",
      symbol: hqSignalName,
      action: "SEQUENCE ALERT",
      entry: "Visual Sequencer",
      tp1: "Lead Warning",
      tp2: "Active",
      tp3: "Scheduled Alert",
      sl: hqPriority,
      formattedText: compiledMessage,
      rationale: `Multi-stage structured signal drafted and persisted. Lead Setup: ${hqLeadTrigger}. Current Setup: ${hqCurrentTrigger}. Scheduled Setup: ${hqGoingTrigger}. Notes: ${hqNotes}`,
    }, true /* skipAutoBroadcast = true is key so the user can verify first! */);

    setTimeout(() => {
      setSaveSuccessMessage("");
    }, 4000);
  };

  const handleCancelHqDraft = () => {
    if (confirm("Are you sure you want to reset current draft edits? This will restore baseline examples.")) {
      setHqSignalName("Volatility 100 Index Breaker Alert");
      setHqSignalType("Derivative Digit Contract");
      setHqDescription("High-speed digit patterns scanning under digit 7 with multi-barrier resistance breakout confirmation.");
      setHqPriority("High");

      setHqLeadTrigger("Tick oscillation patterns print consecutive digits above 8 for 4 ticks, triggering standby condition.");
      setHqLeadAddInfo("Prepare binary account balance and confirm bot server ping is under 40ms.");
      setHqLeadChannels("Telegram VIP Feed");
      setHqLeadRecipients("@zeta_vip_members, #volatility-feed");

      setHqCurrentTrigger("Active Setup Triggered: Digit 9 prints on last tick. Contract UNDER 7 active.");
      setHqCurrentAddInfo("Martingale multiplier v2 activated. Maximum target depth set to 3 recovery steps.");
      setHqCurrentChannels("Telegram Main Channel");
      setHqCurrentRecipients("@signals_feed, #members-dashboard");

      setHqGoingTrigger("Final session cooldown alert and performance metrics overview.");
      setHqGoingAddInfo("Total gain for sequence block is stable. Standby for next system scan cycle.");
      setHqGoingSendTime("2026-06-07T14:30");
      setHqGoingChannels("Telegram Main Channel, Discord Feed");
      setHqGoingRecipients("@signals_feed, #cooldown_tracker");

      setHqTags("deriv, volatility100, second_least_digit, zeta");
      setHqNotes("Always monitor the base index on Deriv SmartTrader before starting the automatic bot loop.");

      // Also clean storage immediately
      localStorage.removeItem("hq_signal_name");
      localStorage.removeItem("hq_signal_type");
      localStorage.removeItem("hq_description");
      localStorage.removeItem("hq_priority");
      localStorage.removeItem("hq_lead_trigger");
      localStorage.removeItem("hq_lead_add_info");
      localStorage.removeItem("hq_lead_channels");
      localStorage.removeItem("hq_lead_recipients");
      localStorage.removeItem("hq_current_trigger");
      localStorage.removeItem("hq_current_add_info");
      localStorage.removeItem("hq_current_channels");
      localStorage.removeItem("hq_current_recipients");
      localStorage.removeItem("hq_going_trigger");
      localStorage.removeItem("hq_going_add_info");
      localStorage.removeItem("hq_going_send_time");
      localStorage.removeItem("hq_going_channels");
      localStorage.removeItem("hq_going_recipients");
      localStorage.removeItem("hq_tags");
      localStorage.removeItem("hq_notes");

      setSaveSuccessMessage("Draft settings successfully restored to base guides.");
      setTimeout(() => setSaveSuccessMessage(""), 3000);
    }
  };

  const handleOpenSaveTemplate = () => {
    if (formMode === "deriv") {
      setSaveTemplateName(`${derivSymbol.replace(" INDEX", "")} ${derivAction} [Digit ${derivEntryDigit}]`);
    } else {
      setSaveTemplateName(`${symbol} ${action} Setup`);
    }
    setSaveTemplateFeedback("");
    setShowSaveTemplateForm(true);
  };

  const handleConfirmSaveTemplate = () => {
    if (!saveTemplateName.trim()) {
      setSaveTemplateFeedback("Please enter a valid blueprint name.");
      return;
    }

    try {
      const STORAGE_KEY_BLUEPRINTS = "broadcaster_blueprints";
      const savedStr = localStorage.getItem(STORAGE_KEY_BLUEPRINTS);
      let list = [];
      if (savedStr) {
        try {
          list = JSON.parse(savedStr);
        } catch (e) {
          list = [];
        }
      }

      const newBlueprint = {
        id: "blueprint_" + Date.now(),
        name: saveTemplateName.trim(),
        type: formMode === "deriv" ? "Derivative Digit Contract" : (assetClass === "Crypto" ? "Crypto Breakout Pair" : (assetClass === "Synthetic" ? "Synthetic Index Spot" : "Forex Major Pair")),
        symbol: (formMode === "deriv" ? derivSymbol : symbol).trim().toUpperCase(),
        action: (formMode === "deriv" ? derivAction : action).trim().toUpperCase(),
        strategy: formMode === "deriv" ? derivStrategy : `Risk Model: ${sentiment}`,
        notes: (formMode === "deriv" ? derivRiskManagement : userNotes) || "Sourced from custom Signal Builder draft."
      };

      list = [newBlueprint, ...list];
      localStorage.setItem(STORAGE_KEY_BLUEPRINTS, JSON.stringify(list));

      setSaveTemplateFeedback("Blueprint saved successfully! Check 'Blueprints & Templates' tab. 💾");
      setTimeout(() => {
        setShowSaveTemplateForm(false);
      }, 2500);
    } catch (err) {
      setSaveTemplateFeedback("Error saving blueprint.");
    }
  };

  const handleRecompileSequence = () => {
    const promoLine = derivPromoUrl ? `\n🖥️ ${derivPromoUrl}` : "";
    setSeqPreSignal(
      `🚨 <b>STANDBY ALERT TO MEMBERS</b> 🚨\n` +
      `━━━━━━━━━━━━━━━━━━━━━━\n` +
      `⏳ <b>Preparing</b> an upcoming trade setup on <b>${seqSymbol.toUpperCase()}</b>.\n` +
      `📢 <b>Bot Settings:</b> ${seqStrategy}\n` +
      `⚡ <i>Standby and prepare your balance! We either go home or go hard. No risk no Ferrari!</i>${promoLine}`
    );
    setSeqActiveSignal(
      `🔔 <b>ACTIVE TRADING SETUP BROADCAST</b> 🔔\n` +
      `━━━━━━━━━━━━━━━━━━━━━━\n` +
      `📈 <b>Asset:</b> ${seqSymbol.toUpperCase()}\n` +
      `📊 <b>Contract:</b> ${seqAction.toUpperCase()}\n` +
      `⚡ <b>Strategy:</b> ${seqStrategy}\n\n` +
      `🎯 Entry trigger active! Execute with correct risk models.${promoLine}`
    );
    setSeqPostSignal(
      `⌛ <b>COOLDOWN & NEXT READY</b> ⌛\n` +
      `━━━━━━━━━━━━━━━━━━━━━━\n` +
      `✅ Previous alert sequence for <b>${seqSymbol.toUpperCase()}</b> is finalized!\n` +
      `📡 <i>Entering temporary cooldown. Relax and prepare.</i>\n\n` +
      `🔔 <b>Stay tuned!</b> We are already scanning for the next alert signal opportunity.`
    );
  };

  const handleTransmitDirect = async (text: string, type: "pre" | "active" | "post") => {
    if (!onPostDirectTelegram) {
      setSeqError("Direct Telegram poster is not currently configured by App dashboard.");
      return;
    }
    
    setSeqError("");
    if (type === "pre") setTransPreStatus("sending");
    else if (type === "active") setTransActiveStatus("sending");
    else setTransPostStatus("sending");

    try {
      const res = await onPostDirectTelegram(text);
      if (res.success) {
        if (type === "pre") {
          setTransPreStatus("success");
          setTimeout(() => setTransPreStatus("idle"), 3000);
        } else if (type === "active") {
          setTransActiveStatus("success");
          setTimeout(() => setTransActiveStatus("idle"), 3000);
        } else {
          setTransPostStatus("success");
          setTimeout(() => setTransPostStatus("idle"), 3000);
        }
      } else {
        throw new Error(res.error || "Failed raw dispatch connection request.");
      }
    } catch (e: any) {
      setSeqError(e.message || "Failed to broadcast signal to Telegram.");
      if (type === "pre") setTransPreStatus("error");
      else if (type === "active") setTransActiveStatus("error");
      else setTransPostStatus("error");
    }
  };

  const handleLoadAsDraft = (text: string, type: "pre" | "active" | "post") => {
    let titleType = type === "pre" ? "Prep Alert" : type === "active" ? "Active Alert" : "Next Alert";
    onSignalGenerated({
      assetClass: "Sequence Alert",
      symbol: seqSymbol,
      action: seqAction,
      entry: "Sequence " + titleType,
      tp1: "",
      tp2: "",
      tp3: "",
      sl: "",
      formattedText: text,
      rationale: `Sequence alert component loaded from sequencer tab: [${titleType}] on ${seqSymbol}.`,
    }, true /* skipAutoBroadcast = true is critical here so they can review/edit before casting! */);
  };

  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState("");

  const handleManualFormat = () => {
    if (formMode === "deriv") {
      // Create exact format as requested for Deriv Digits
      let html = `<b>🔔 NEW TRADING SIGNAL 🔔</b>\n\n`;
      html += `<b>${derivSymbol.toUpperCase()}</b>\n\n`;
      html += `📈 <b>${derivAction.toUpperCase()}</b>\n`;
      html += `⚡ <b>Strategy:</b> ${derivStrategy}\n\n`;
      html += `📊 <b>Market Analysis (${derivTicks})</b>\n`;
      html += `━━━━━━━━━\n`;
      html += `🎯 <b>Entry Instructions:</b>\n\n`;
      html += `<b>${derivBotName.toUpperCase()}</b>\n`;
      html += `💹 <b>Trade:</b> ${derivAction}\n`;
      html += `🔑 <b>Entry Digit:</b> <code>${derivEntryDigit}</code>\n`;
      html += `⭐ <b>Confidence:</b> ${derivConfidence}\n\n`;
      if (derivPromoUrl) {
         html += `${derivPromoUrl}\n\n`;
      }
      html += `📈 <b>Session Stats:</b>\n\n`;
      html += `⚠️ <b>Risk Management:</b>\n`;
      html += `${derivRiskManagement}\n\n`;
      
      const now = new Date();
      // Format like: "6/4/26, 6:20:07 PM UTC"
      const timeStr = `${now.getMonth() + 1}/${now.getDate()}/${String(now.getFullYear()).substring(2)}, ${now.toLocaleTimeString("en-US")} UTC`;
      html += `⏰ <b>Time:</b> ${timeStr}\n\n`;
      html += `🤖 Generated by ${derivBotSignature}\n`;
      html += `${derivHashtags}`;

      const textNotes = userNotes || `Deriv digit contract on ${derivSymbol} using ${derivStrategy}. Duration: ${derivTicks}.`;

      onSignalGenerated({
        assetClass: "Deriv Synthetic",
        symbol: derivSymbol,
        action: derivAction,
        entry: `Digit ${derivEntryDigit}`,
        tp1: `LDP: ${derivAction}`,
        tp2: "",
        tp3: "",
        sl: `Confidence: ${derivConfidence}`,
        formattedText: html,
        rationale: `<b>Under/Over Contract Logic:</b> This synthetic contract leverages digit pattern frequency on ${derivSymbol} across ${derivTicks}. Specifically executing a custom contract based on '${derivStrategy}' when digit trigger '${derivEntryDigit}' prints on tick history. Optimal execution requires automated triggers like '${derivBotName}' with confidence predicted at ${derivConfidence}. Notes: ${textNotes}`,
      });
    } else {
      // Classic mode manual formatting
      const directionEmoji = action.includes("BUY") ? "🟢 BUY" : "🔴 SELL";
      const titleDir = action.toUpperCase();

      let html = `<b>📣 NEW TRADING SIGNAL: ${symbol.toUpperCase()}</b>\n`;
      html += `━━━━━━━━━━━━━━━━━━━━━━\n`;
      html += `<b>Direction:</b> ${directionEmoji} [${titleDir}]\n`;
      html += `<b>Entry Zone:</b> ${entry ? `<code>${entry}</code>` : "Current Market Price"}\n\n`;

      if (tp1) html += `🎯 <b>Take Profit 1:</b> <code>${tp1}</code>\n`;
      if (tp2) html += `🎯 <b>Take Profit 2:</b> <code>${tp2}</code>\n`;
      if (tp3) html += `🎯 <b>Take Profit 3:</b> <code>${tp3}</code>\n`;
      if (sl) html += `\n🛡️ <b>Stop Loss:</b> <code>${sl}</code>\n`;

      if (userNotes) {
        html += `\n📝 <b>Analysis Brief:</b>\n<i>${userNotes}</i>\n`;
      }

      html += `━━━━━━━━━━━━━━━━━━━━━━\n`;
      html += `⚠️ <i>Trade with proper risk controls only! Risk sentiment: ${sentiment}</i>`;

      const simpleRationale = userNotes || `Technical setup configured for a ${action} trade on ${symbol.toUpperCase()} entering near ${entry || "current rates"} with Risk model: ${sentiment}.`;

      onSignalGenerated({
        assetClass,
        symbol: symbol.toUpperCase(),
        action,
        entry,
        tp1,
        tp2,
        tp3,
        sl,
        formattedText: html,
        rationale: simpleRationale,
      });
    }
  };

  const handleGeminiFormat = async (e: React.FormEvent) => {
    e.preventDefault();
    setGenerating(true);
    setGenError("");

    try {
      let bodyData: Record<string, any> = {};

      if (formMode === "deriv") {
        bodyData = {
          assetClass: "Deriv Synthetic",
          symbol: derivSymbol.toUpperCase(),
          action: derivAction,
          entry: `Digit ${derivEntryDigit}`,
          sl: `Confidence: ${derivConfidence}`,
          userNotes,
          sentiment,
          isDerivStyle: true,
          strategyName: derivStrategy,
          ticksCount: derivTicks,
          botName: derivBotName,
          entryDigit: derivEntryDigit,
          confidence: derivConfidence,
          promoUrl: derivPromoUrl,
          riskGuidelines: derivRiskManagement,
          botSignature: derivBotSignature,
          hashtags: derivHashtags,
        };
      } else {
        bodyData = {
          assetClass,
          symbol: symbol.toUpperCase(),
          action,
          entry,
          tp: [tp1, tp2, tp3].filter(Boolean),
          sl,
          userNotes,
          sentiment,
          isDerivStyle: false,
        };
      }

      const response = await fetch("/api/gemini/generate-signal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(bodyData),
      });

      const data = await response.json();
      if (!response.ok || data.error) {
        throw new Error(data.error || "Generation payload failed.");
      }

      if (formMode === "deriv") {
        onSignalGenerated({
          assetClass: "Deriv Synthetic",
          symbol: derivSymbol.toUpperCase(),
          action: derivAction,
          entry: `Digit ${derivEntryDigit}`,
          tp1: derivAction,
          tp2: "",
          tp3: "",
          sl: `Confidence: ${derivConfidence}`,
          formattedText: data.signal,
          rationale: data.rationale,
        });
      } else {
        onSignalGenerated({
          assetClass,
          symbol: symbol.toUpperCase(),
          action,
          entry,
          tp1,
          tp2,
          tp3,
          sl,
          formattedText: data.signal,
          rationale: data.rationale,
        });
      }
    } catch (err: any) {
      setGenError(err.message || "Failed to generate design composition using Gemini AI. Using format engine fallback.");
      handleManualFormat();
    } finally {
      setGenerating(false);
    }
  };

  const loadExample = (type: "deriv_under" | "deriv_odds" | "forex" | "crypto") => {
    if (type === "deriv_under") {
      setFormMode("deriv");
      setDerivSymbol("VOLATILITY 100 (1s) INDEX");
      setDerivAction("UNDER 7");
      setDerivStrategy("Second Least Digit");
      setDerivTicks("1ticks");
      setDerivEntryDigit("9");
      setDerivConfidence("85%");
      setDerivRiskManagement("• Stop after 4 consecutive wins\n• Max 5 runs per session\n• Use proper recovery if loss occurs");
      // NOTE: bot name, promo URL, signature, hashtags are NOT reset here —
      // they come from the linked site config the user set via Detect Site.
    } else if (type === "deriv_odds") {
      setFormMode("deriv");
      setDerivSymbol("VOLATILITY 75 INDEX");
      setDerivAction("OVER 5");
      setDerivStrategy("Tick Oscillator Breakout");
      setDerivTicks("5ticks");
      setDerivEntryDigit("2");
      setDerivConfidence("92%");
      setDerivRiskManagement("• Target maximum 3 sessions per day\n• Set stake at 1% of total bank capital\n• Pause immediately on trade loss");
    } else if (type === "crypto") {
      setFormMode("classic");
      setAssetClass("Crypto");
      setSymbol("BTCUSD");
      setAction("BUY LIMIT");
      setEntry("67400");
      setTp1("68900");
      setTp2("70200");
      setTp3("72000");
      setSl("66100");
      setUserNotes("4h RSI showing strong oversold divergence. Support trendline holds firmly.");
      setSentiment("Aggressive");
    } else {
      setFormMode("classic");
      setAssetClass("Forex");
      setSymbol("GBPUSD");
      setAction("SELL");
      setEntry("1.2650");
      setTp1("1.2590");
      setTp2("1.2520");
      setTp3("1.2450");
      setSl("1.2715");
      setUserNotes("Double top reversal pattern on Daily chart. UK CPI news expected to be cooler.");
      setSentiment("Moderate");
    }
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-6 animate-fade-in" id="signal-builder-card">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800/80 pb-4">
        <div className="space-y-1">
          <h2 className="text-lg font-semibold tracking-tight text-white font-sans flex items-center gap-2">
            <Coins className="w-5 h-5 text-sky-450" />
            <span>Signal Builder Studio</span>
          </h2>
          <p className="text-xs text-slate-400">Select model layout guidelines and feed signal metrics.</p>
        </div>

        {/* Preset list */}
        <div className="flex flex-wrap items-center gap-2" id="preset-buttons">
          <span className="text-[10px] uppercase tracking-wider text-slate-500 font-bold font-sans">Template presets:</span>
          {formMode === "deriv" ? (
            <>
              <button
                type="button"
                onClick={() => loadExample("deriv_under")}
                className="text-[10px] px-2.5 py-1.5 bg-sky-950/40 border border-sky-900/60 text-sky-300 rounded-lg hover:text-white transition-all cursor-pointer"
              >
                Deriv Under 7
              </button>
              <button
                type="button"
                onClick={() => loadExample("deriv_odds")}
                className="text-[10px] px-2.5 py-1.5 bg-slate-850 text-slate-350 border border-slate-800 hover:border-slate-700/60 rounded-lg hover:text-white transition-all cursor-pointer"
              >
                Deriv Over 5
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={() => loadExample("forex")}
                className="text-[10px] px-2.5 py-1.5 bg-slate-850 text-slate-350 border border-slate-800 hover:border-slate-700/60 rounded-lg hover:text-white transition-all cursor-pointer animate-fade-in"
              >
                Forex standard
              </button>
              <button
                type="button"
                onClick={() => loadExample("crypto")}
                className="text-[10px] px-2.5 py-1.5 bg-slate-850 text-slate-350 border border-slate-800 hover:border-slate-700/60 rounded-lg hover:text-white transition-all cursor-pointer"
              >
                Crypto standard
              </button>
            </>
          )}
        </div>
      </div>

      {/* Signal Type Selector (Tabs) */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 bg-slate-950 p-1.5 border border-slate-850 rounded-xl" id="profile-selector-tabs">
        <button
          type="button"
          onClick={() => {
            setFormMode("deriv");
            // Default Deriv options loaded
            setDerivSymbol("VOLATILITY 100 (1s) INDEX");
            setDerivAction("UNDER 7");
          }}
          className={`py-2 px-3 text-xs font-semibold rounded-lg flex items-center justify-center gap-2 transition-all cursor-pointer ${
            formMode === "deriv"
              ? "bg-slate-800 text-white shadow"
              : "text-slate-400 hover:text-slate-200"
          }`}
          id="btn-choose-deriv-mode"
        >
          <Laptop className="w-3.5 h-3.5" />
          <span>Deriv Synthetic (Digits)</span>
        </button>

        <button
          type="button"
          onClick={() => {
            setFormMode("classic");
          }}
          className={`py-2 px-3 text-xs font-semibold rounded-lg flex items-center justify-center gap-2 transition-all cursor-pointer ${
            formMode === "classic"
              ? "bg-slate-800 text-white shadow"
              : "text-slate-400 hover:text-slate-200"
          }`}
          id="btn-choose-classic-mode"
        >
          <Landmark className="w-3.5 h-3.5" />
          <span>Forex & Crypto (MT4)</span>
        </button>

        <button
          type="button"
          onClick={() => {
            setFormMode("sequence");
          }}
          className={`py-2 px-3 text-xs font-semibold rounded-lg flex items-center justify-center gap-2 transition-all cursor-pointer ${
            formMode === "sequence"
              ? "bg-emerald-950 text-emerald-300 border border-emerald-900/40 shadow shadow-emerald-950/20"
              : "text-slate-400 hover:text-slate-200"
          }`}
          id="btn-choose-sequence-mode"
        >
          <Radio className="w-3.5 h-3.5 text-emerald-450 animate-pulse" />
          <span>Alert Sequences (Option 3)</span>
        </button>
      </div>

      <form onSubmit={handleGeminiFormat} className="space-y-4">
        {formMode === "deriv" ? (
          /* DERIV ACTIVE FORM FIELD CODES */
          <div className="space-y-4" id="deriv-form-fields">
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Asset Index Name */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-300">Volatility Index Asset</label>
                <select
                  value={derivSymbol}
                  onChange={(e) => setDerivSymbol(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-slate-950 border border-slate-800 focus:border-sky-500 rounded-xl text-slate-300 focus:text-white outline-none transition-all cursor-pointer"
                  id="deriv-symbol-select"
                >
                  <option value="VOLATILITY 100 (1s) INDEX">Volatility 100 (1s) Index</option>
                  <option value="VOLATILITY 100 INDEX">Volatility 100 Index</option>
                  <option value="VOLATILITY 75 (1s) INDEX">Volatility 75 (1s) Index</option>
                  <option value="VOLATILITY 75 INDEX">Volatility 75 Index</option>
                  <option value="VOLATILITY 50 INDEX">Volatility 50 Index</option>
                  <option value="VOLATILITY 25 INDEX">Volatility 25 Index</option>
                  <option value="VOLATILITY 10 INDEX">Volatility 10 Index</option>
                  <option value="JUMP 100 INDEX">Jump 100 Index</option>
                  <option value="JUMP 50 INDEX">Jump 50 Index</option>
                  <option value="BEAR MARKET INDEX">Bear Market Index</option>
                  <option value="BULL MARKET INDEX">Bull Market Index</option>
                </select>
                <div className="pt-1">
                  <input
                    type="text"
                    value={derivSymbol}
                    onChange={(e) => setDerivSymbol(e.target.value)}
                    placeholder="Or type custom synthetic name..."
                    className="w-full px-3 py-1.5 text-[11px] bg-slate-950 border border-slate-800 focus:border-sky-500 rounded-lg text-slate-300 font-mono"
                    id="deriv-symbol-custom-input"
                  />
                </div>
              </div>

              {/* Trade action Contract */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-300">Trade / Contract Type</label>
                <input
                  type="text"
                  value={derivAction}
                  onChange={(e) => setDerivAction(e.target.value)}
                  placeholder="e.g. UNDER 7, OVER 5, MATCHES 9, DIFFERS 2"
                  className="w-full px-3 py-2.5 text-xs bg-slate-950 border border-slate-800 focus:border-sky-500 rounded-xl text-slate-100 placeholder-slate-650 outline-none font-bold text-sky-400 font-mono tracking-wider"
                  required
                  id="deriv-action-input"
                />
                <span className="text-[10px] text-slate-500 block">Typical formats: UNDER 7, OVER 5, MATCHES 9, DIFFERS 0</span>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Strategy Name */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-300">Strategy Name</label>
                <input
                  type="text"
                  value={derivStrategy}
                  onChange={(e) => setDerivStrategy(e.target.value)}
                  placeholder="e.g. Second Least Digit"
                  className="w-full px-3 py-2 text-xs bg-slate-950 border border-slate-800 focus:border-sky-500 rounded-xl text-slate-100 placeholder-slate-650 outline-none"
                  id="deriv-strategy-input"
                />
              </div>

              {/* Ticks Duration */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-300">Ticks Duration</label>
                <select
                  value={derivTicks}
                  onChange={(e) => setDerivTicks(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-slate-950 border border-slate-800 focus:border-sky-500 rounded-xl text-slate-300 focus:text-white outline-none transition-all cursor-pointer font-mono"
                  id="deriv-ticks-select"
                >
                  <option value="1ticks">1 Ticks</option>
                  <option value="2ticks">2 Ticks</option>
                  <option value="3ticks">3 Ticks</option>
                  <option value="5ticks">5 Ticks</option>
                  <option value="10ticks">10 Ticks</option>
                </select>
              </div>

              {/* Trigger Entry Digit */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-300">Key Trigger Entry Digit</label>
                <input
                  type="text"
                  value={derivEntryDigit}
                  onChange={(e) => setDerivEntryDigit(e.target.value)}
                  placeholder="e.g. 9"
                  className="w-full px-3 py-2 text-xs bg-slate-950 border border-slate-800 focus:border-sky-500 rounded-xl text-slate-100 placeholder-slate-650 outline-none font-mono text-center"
                  id="deriv-entry-digit-input"
                />
              </div>
            </div>

            {/* ── Site Link & Auto-Detection ── */}
            <div className="bg-slate-950/80 border border-sky-900/30 rounded-xl p-4 space-y-3" id="site-detection-block">
              <div className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-sky-500 animate-pulse"></span>
                <span className="text-xs font-semibold text-sky-400">Linked Trading Site</span>
                <span className="text-[10px] text-slate-500">— paste your site URL to auto-detect its name and available bots</span>
              </div>

              <div className="flex gap-2">
                <input
                  type="url"
                  value={linkedSiteUrl}
                  onChange={(e) => { setLinkedSiteUrl(e.target.value); setSiteDetectError(""); setSiteDetectSuccess(""); persistSiteConfig({ promoUrl: e.target.value }); }}
                  placeholder="e.g. https://yoursite.com"
                  className="flex-1 px-3 py-2 text-xs bg-slate-900 border border-slate-800 focus:border-sky-500 rounded-xl text-sky-300 placeholder-slate-600 outline-none font-mono"
                  id="input-linked-site-url"
                />
                <button
                  type="button"
                  onClick={handleDetectSite}
                  disabled={siteDetecting || !linkedSiteUrl.trim()}
                  className="flex items-center gap-1.5 px-4 py-2 bg-sky-600 hover:bg-sky-500 disabled:bg-slate-800 disabled:text-slate-500 text-white text-xs font-semibold rounded-xl transition-all cursor-pointer disabled:cursor-not-allowed shrink-0"
                  id="btn-detect-site"
                >
                  {siteDetecting ? (
                    <svg className="animate-spin h-3.5 w-3.5" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"/>
                    </svg>
                  ) : (
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
                  )}
                  <span>{siteDetecting ? "Detecting..." : "Detect Site"}</span>
                </button>
              </div>

              {siteDetectError && (
                <p className="text-[11px] text-rose-400 flex items-center gap-1">
                  <svg className="w-3 h-3 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                  {siteDetectError}
                </p>
              )}

              {siteDetectSuccess && (
                <p className="text-[11px] text-emerald-400 font-medium">{siteDetectSuccess}</p>
              )}

              {/* Bot picker dropdown when multiple bots detected */}
              {showBotPicker && detectedBots.length > 1 && (
                <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden" id="bot-picker-dropdown">
                  <div className="px-3 py-2 border-b border-slate-800 text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
                    {detectedBots.length} Bots detected on <span className="text-sky-400">{detectedSiteName}</span> — select one:
                  </div>
                  <div className="divide-y divide-slate-900 max-h-40 overflow-y-auto">
                    {detectedBots.map((bot, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => {
                          const selected = `USE ${bot.toUpperCase()}`;
                          setDerivBotName(selected);
                          persistSiteConfig({ botName: selected });
                          setShowBotPicker(false);
                          setSiteDetectSuccess(`✅ Bot selected: "${bot}" from ${detectedSiteName}`);
                        }}
                        className="w-full text-left px-3 py-2.5 hover:bg-slate-800/60 transition-colors group"
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-yellow-300 font-semibold group-hover:text-white">{bot}</span>
                          <span className="text-[9px] text-slate-500 group-hover:text-slate-300">SELECT →</span>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {detectedSiteName && siteDetectSuccess && (
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[10px] text-slate-500">Site:</span>
                  <span className="text-[10px] font-semibold text-white bg-slate-800 px-2 py-0.5 rounded">{detectedSiteName}</span>
                  {detectedBots.length > 0 && (
                    <>
                      <span className="text-[10px] text-slate-500">Active Bot:</span>
                      <span className="text-[10px] font-semibold text-yellow-300 bg-slate-800 px-2 py-0.5 rounded font-mono">{derivBotName}</span>
                    </>
                  )}
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Snipper Bot recommendation code */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-300">Execution Bot System</label>
                <input
                  type="text"
                  value={derivBotName}
                  onChange={(e) => { setDerivBotName(e.target.value); persistSiteConfig({ botName: e.target.value }); }}
                  placeholder="e.g. USE SNIPPER KILLER BOT"
                  className="w-full px-3 py-2 text-xs bg-slate-950 border border-slate-800 focus:border-sky-500 rounded-xl text-slate-100 placeholder-slate-650 outline-none font-semibold text-yellow-300"
                  id="deriv-bot-name-input"
                />
              </div>

              {/* Confidence rate */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-300">Historical Confidence %</label>
                <input
                  type="text"
                  value={derivConfidence}
                  onChange={(e) => setDerivConfidence(e.target.value)}
                  placeholder="e.g. 85%"
                  className="w-full px-3 py-2 text-xs bg-slate-950 border border-slate-800 focus:border-sky-500 rounded-xl text-emerald-400 placeholder-slate-650 outline-none text-center font-bold"
                  id="deriv-confidence-input"
                />
              </div>

              {/* Redirection url */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-300">Promotional Site / Redirect link</label>
                <input
                  type="url"
                  value={derivPromoUrl}
                  onChange={(e) => { setDerivPromoUrl(e.target.value); persistSiteConfig({ promoUrl: e.target.value }); }}
                  placeholder="e.g. https://yoursite.com"
                  className="w-full px-3 py-2 text-xs bg-slate-950 border border-slate-800 focus:border-sky-500 rounded-xl text-slate-350 placeholder-slate-650 outline-none font-mono"
                  id="deriv-promo-url-input"
                />
              </div>
            </div>

            {/* Risk Management multiline */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-slate-300">Risk Management Guidelines (Lines)</label>
              <textarea
                value={derivRiskManagement}
                onChange={(e) => setDerivRiskManagement(e.target.value)}
                rows={3}
                placeholder="• Stop after 4 consecutive wins..."
                className="w-full p-3 text-xs bg-slate-950 border border-slate-800 focus:border-sky-500 rounded-xl text-amber-300 font-mono outline-none resize-none"
                id="deriv-risk-instructions"
              />
            </div>

            {/* Signature & Hashtags */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-300">Footer Signature Brand</label>
                <input
                  type="text"
                  value={derivBotSignature}
                  onChange={(e) => { setDerivBotSignature(e.target.value); persistSiteConfig({ botSignature: e.target.value }); }}
                  placeholder="e.g. MySite Over/Under Bot"
                  className="w-full px-3 py-2 text-xs bg-slate-950 border border-slate-800 focus:border-sky-500 rounded-xl text-slate-100 outline-none"
                  id="deriv-signature-input"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-300">Social Channel Hashtags</label>
                <input
                  type="text"
                  value={derivHashtags}
                  onChange={(e) => { setDerivHashtags(e.target.value); persistSiteConfig({ hashtags: e.target.value }); }}
                  placeholder="#TradingSignal #Deriv #OverUnder"
                  className="w-full px-3 py-2 text-xs bg-slate-950 border border-slate-800 focus:border-sky-500 rounded-xl text-slate-405 placeholder-slate-650 outline-none font-mono"
                  id="deriv-hashtags-input"
                />
              </div>
            </div>

          </div>
        ) : formMode === "classic" ? (
          /* CLASSIC FOREX / CRYPTO FORM FIELDS */
          <div className="space-y-4 animate-fade-in" id="classic-form-fields">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Asset Category */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-300">Asset Class</label>
                <select
                  value={assetClass}
                  onChange={(e) => setAssetClass(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-slate-950 border border-slate-800 focus:border-sky-500 rounded-xl text-slate-300 focus:text-white outline-none transition-all cursor-pointer"
                  id="select-asset-class"
                >
                  <option value="Forex">Forex</option>
                  <option value="Crypto">Crypto</option>
                  <option value="Stocks">Stocks / Equities</option>
                  <option value="Indices">Indices (US30, NAS100)</option>
                  <option value="Commodities">Commodities (GOLD, OIL)</option>
                </select>
              </div>

              {/* Symbol */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-300">Asset Symbol</label>
                <input
                  type="text"
                  value={symbol}
                  onChange={(e) => setSymbol(e.target.value)}
                  placeholder="e.g. EURUSD, BTCUSD, XAUUSD"
                  className="w-full px-3 py-2 text-xs bg-slate-950 border border-slate-800 focus:border-sky-500 rounded-xl text-slate-100 placeholder-slate-650 outline-none uppercase font-mono tracking-wider"
                  required
                  id="input-asset-symbol"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Order Type */}
              <div className="space-y-1.5 font-sans">
                <label className="text-xs font-medium text-slate-300">Direction / Order Type</label>
                <select
                  value={action}
                  onChange={(e) => setAction(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-slate-950 border border-slate-800 focus:border-sky-500 rounded-xl text-slate-300 focus:text-white outline-none transition-all cursor-pointer"
                  id="select-direction-action"
                >
                  <option value="BUY">BUY (Market execution)</option>
                  <option value="SELL">SELL (Market execution)</option>
                  <option value="BUY LIMIT">BUY LIMIT</option>
                  <option value="SELL LIMIT">SELL LIMIT</option>
                  <option value="BUY STOP">BUY STOP</option>
                  <option value="SELL STOP">SELL STOP</option>
                </select>
              </div>

              {/* Entry price */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-300">Entry Price Zone</label>
                <input
                  type="text"
                  value={entry}
                  onChange={(e) => setEntry(e.target.value)}
                  placeholder="e.g. 1.0925 (or current rate)"
                  className="w-full px-3 py-2 text-xs bg-slate-950 border border-slate-800 focus:border-sky-500 rounded-xl text-slate-100 placeholder-slate-650 font-mono outline-none override-id"
                  id="input-entry-price"
                />
              </div>

              {/* Risk Sentiment model */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-300">Risk Profile</label>
                <select
                  value={sentiment}
                  onChange={(e) => setSentiment(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-slate-950 border border-slate-800 focus:border-sky-500 rounded-xl text-slate-300 focus:text-white outline-none transition-all cursor-pointer"
                  id="select-risk-sentiment"
                >
                  <option value="Conservative">Conservative (Low RR)</option>
                  <option value="Moderate">Moderate (Std 1:2 RR)</option>
                  <option value="Aggressive">Aggressive (High leverage)</option>
                </select>
              </div>
            </div>

            {/* Take profit threshold grid */}
            <div className="bg-slate-950/60 p-4 border border-slate-850 rounded-xl space-y-3.5">
              <div className="text-xs font-medium text-slate-200">Take Profit Thresholds</div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="space-y-1">
                  <label className="text-[10px] uppercase font-semibold text-slate-500 font-sans">Take Profit 1</label>
                  <input
                     type="text"
                     value={tp1}
                     onChange={(e) => setTp1(e.target.value)}
                     placeholder="Target TP 1"
                     className="w-full px-3 py-1.5 text-xs bg-slate-900 border border-slate-800 focus:border-sky-500 rounded-lg text-emerald-400 placeholder-slate-650 font-mono text-center outline-none"
                     id="input-tp1"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] uppercase font-semibold text-slate-500 font-sans">Take Profit 2 (Optional)</label>
                  <input
                     type="text"
                     value={tp2}
                     onChange={(e) => setTp2(e.target.value)}
                     placeholder="Target TP 2"
                     className="w-full px-3 py-1.5 text-xs bg-slate-900 border border-slate-800 focus:border-sky-500 rounded-lg text-emerald-400 placeholder-slate-650 font-mono text-center outline-none"
                     id="input-tp2"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] uppercase font-semibold text-slate-500 font-sans">Take Profit 3 (Optional)</label>
                  <input
                     type="text"
                     value={tp3}
                     onChange={(e) => setTp3(e.target.value)}
                     placeholder="Target TP 3"
                     className="w-full px-3 py-1.5 text-xs bg-slate-900 border border-slate-800 focus:border-sky-500 rounded-lg text-emerald-400 placeholder-slate-650 font-mono text-center outline-none"
                     id="input-tp3"
                  />
                </div>
              </div>
            </div>

            {/* Stop Loss & Technical brief */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="space-y-1.5 md:col-span-1">
                <label className="text-xs font-medium text-slate-300">Stop Loss (SL)</label>
                <input
                  type="text"
                  value={sl}
                  onChange={(e) => setSl(e.target.value)}
                  placeholder="Stop level"
                  className="w-full px-3 py-2 text-xs bg-slate-950 border border-slate-800 focus:border-sky-500 rounded-xl text-rose-400 placeholder-slate-650 font-mono text-center outline-none"
                  id="input-stop-loss"
                />
              </div>

              <div className="space-y-1.5 md:col-span-3">
                <label className="text-xs font-medium text-slate-300">Technical Brief Notes</label>
                <input
                  type="text"
                  value={userNotes}
                  onChange={(e) => setUserNotes(e.target.value)}
                  placeholder="e.g. Double bottom on 4H chart, RSI trend breakout"
                  className="w-full px-3 py-2 text-xs bg-slate-950 border border-slate-800 focus:border-sky-500 rounded-xl text-slate-100 placeholder-slate-650 outline-none"
                  id="input-technical-brief-notes"
                />
              </div>
            </div>
          </div>
        ) : (
          /* SEQUENCE ALERTS MODE (OPTION 3) - DRAFT SIGNAL & ALERTS HIGH FIDELITY WIZARD */
          <div className="space-y-6 animate-fade-in text-sans" id="sequence-form-fields">
            
            {/* Breadcrumb & Screen Headers */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-850 pb-4">
              <div className="space-y-1">
                <nav className="text-[10px] font-semibold text-slate-500 flex items-center gap-1 uppercase tracking-wider font-mono">
                  <span>Signals</span>
                  <span>/</span>
                  <span className="text-sky-400">Draft Signal</span>
                </nav>
                <h3 className="text-base font-bold text-white tracking-tight flex items-center gap-1.5">
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-sky-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-sky-500"></span>
                  </span>
                  <span>Draft Signal & Alerts</span>
                </h3>
              </div>

              {/* Action Buttons to Cancel & Save */}
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleCancelHqDraft}
                  className="px-3.5 py-1.5 bg-slate-900 hover:bg-slate-850 hover:text-white border border-slate-800 text-slate-400 text-xs font-semibold rounded-lg transition-all cursor-pointer flex items-center gap-1.5"
                  id="btn-hq-cancel-draft"
                >
                  <RotateCcw className="w-3.5 h-3.5 text-slate-500" />
                  <span>Cancel</span>
                </button>
                <button
                  type="button"
                  onClick={handleSaveHqDraft}
                  className="px-4 py-1.5 bg-gradient-to-r from-sky-500 to-indigo-600 hover:from-sky-400 hover:to-indigo-500 text-white text-xs font-semibold rounded-lg shadow-md shadow-sky-500/10 hover:shadow-sky-500/20 transition-all cursor-pointer flex items-center gap-1.5"
                  id="btn-hq-save-draft"
                >
                  <Save className="w-3.5 h-3.5 text-sky-100" />
                  <span>Save Draft</span>
                </button>
              </div>
            </div>

            {/* Success flash notifications */}
            {saveSuccessMessage && (
              <div className="bg-emerald-950/40 text-emerald-300 border border-emerald-900/50 rounded-xl p-3.5 text-xs flex items-center gap-2.5 animate-bounce-short" id="save-success-banner">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                <span className="font-semibold">{saveSuccessMessage}</span>
              </div>
            )}

            {/* 1. Signal Information Card */}
            <div className="bg-slate-950 p-5 border border-slate-850 rounded-xl space-y-4">
              <div className="flex items-center gap-2 border-b border-slate-900 pb-2.5">
                <FileText className="w-4 h-4 text-sky-400 font-bold" />
                <span className="text-xs font-semibold text-slate-200">1. Signal General Information</span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-slate-350 flex items-center gap-1">
                    <span>Signal Name</span>
                    <span className="text-rose-500 font-bold">*</span>
                  </label>
                  <input
                    type="text"
                    value={hqSignalName}
                    onChange={(e) => setHqSignalName(e.target.value)}
                    placeholder="e.g. Volatility 100 Index Breaker Alert"
                    className="w-full px-3 py-2 text-xs bg-slate-900 border border-slate-800 focus:border-sky-500 focus:bg-slate-900/80 rounded-lg text-slate-100 placeholder-slate-650 outline-none"
                    id="hq-signal-name"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-slate-350 flex items-center gap-1">
                    <span>Signal Type</span>
                    <span className="text-rose-500 font-bold">*</span>
                  </label>
                  <select
                    value={hqSignalType}
                    onChange={(e) => setHqSignalType(e.target.value)}
                    className="w-full px-3 py-2 text-xs bg-slate-900 border border-slate-800 focus:border-sky-500 focus:bg-slate-900/80 rounded-lg text-slate-300 focus:text-white outline-none cursor-pointer"
                    id="hq-signal-type"
                  >
                    <option value="Derivative Digit Contract">Derivative Digit Contract</option>
                    <option value="Forex Major Pair">Forex Major Pair</option>
                    <option value="Crypto Breakout Pair">Crypto Breakout Pair</option>
                    <option value="Synthetic Index Spot">Synthetic Index Spot</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-12 gap-4 pt-1">
                <div className="space-y-1.5 md:col-span-9">
                  <label className="text-xs font-medium text-slate-355 flex items-center gap-1">
                    <span>Description Details</span>
                  </label>
                  <textarea
                    rows={2}
                    value={hqDescription}
                    onChange={(e) => setHqDescription(e.target.value)}
                    placeholder="Describe session expectations, key index support lines, and risk factors..."
                    className="w-full px-3 py-2 text-xs bg-slate-900 border border-slate-800 focus:border-sky-500 focus:bg-slate-900/80 rounded-lg text-slate-200 placeholder-slate-650 outline-none resize-none leading-relaxed"
                    id="hq-description"
                  />
                </div>

                <div className="space-y-1.5 md:col-span-3">
                  <label className="text-xs font-medium text-slate-355 flex items-center gap-1">
                    <span>Priority Level</span>
                    <span className="text-rose-500 font-bold">*</span>
                  </label>
                  <div className="relative">
                    <select
                      value={hqPriority}
                      onChange={(e) => setHqPriority(e.target.value)}
                      className="w-full px-3 py-2 text-xs bg-slate-900 border border-slate-800 focus:border-sky-500 focus:bg-slate-900/80 rounded-lg text-slate-300 focus:text-white outline-none cursor-pointer appearance-none"
                      id="hq-priority"
                    >
                      <option value="High">⚠️ High Priority</option>
                      <option value="Medium">⚡ Medium Priority</option>
                      <option value="Low">🌱 Low Priority</option>
                    </select>
                    <div className="absolute inset-y-0 right-3 flex items-center pointer-events-none text-slate-400">
                      <ChevronDown className="w-3.5 h-3.5" />
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* 3-Column Bento Grid of Alerts/Activities */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
              
              {/* Column 1: Lead Alert (Early Warning) */}
              <div className="bg-slate-950/80 border border-emerald-900/30 rounded-xl p-4.5 space-y-4 hover:border-emerald-900/60 transition-all flex flex-col justify-between">
                <div className="space-y-3.5">
                  <div className="flex items-start gap-2.5 border-b border-slate-900 pb-3">
                    <div className="p-2 bg-emerald-950/50 border border-emerald-900/40 rounded-lg text-emerald-400 shrink-0">
                      <Bell className="w-4 h-4" />
                    </div>
                    <div>
                      <h4 className="text-xs font-bold text-slate-200">Lead Alert (Early Warning)</h4>
                      <p className="text-[10px] text-slate-450 leading-tight">Early warning indicators and preparatory signals</p>
                    </div>
                  </div>

                  <div className="space-y-3 font-sans">
                    <div className="space-y-1">
                      <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1">
                        <span>Trigger Condition</span>
                        <span className="text-rose-500">*</span>
                      </label>
                      <textarea
                        rows={3}
                        value={hqLeadTrigger}
                        onChange={(e) => setHqLeadTrigger(e.target.value)}
                        placeholder="Condition criteria..."
                        className="w-full p-2.5 text-xs bg-slate-900 border border-slate-800 focus:border-emerald-500 rounded-lg text-slate-200 placeholder-slate-650 outline-none font-mono resize-none leading-relaxed"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Additional Information</label>
                      <input
                        type="text"
                        value={hqLeadAddInfo}
                        onChange={(e) => setHqLeadAddInfo(e.target.value)}
                        placeholder="e.g. Server response check"
                        className="w-full px-2.5 py-1.5 text-xs bg-slate-900 border border-slate-800 focus:border-emerald-500 rounded-lg text-slate-250 placeholder-slate-650 outline-none"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1">
                        <span>Notification Channels</span>
                        <span className="text-rose-500">*</span>
                      </label>
                      <input
                        type="text"
                        value={hqLeadChannels}
                        onChange={(e) => setHqLeadChannels(e.target.value)}
                        placeholder="Channels list..."
                        className="w-full px-2.5 py-1.5 text-xs bg-slate-900 border border-slate-800 focus:border-emerald-500 rounded-lg text-slate-250 placeholder-slate-650 outline-none"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1">
                        <span>Recipients</span>
                        <span className="text-rose-500">*</span>
                      </label>
                      <input
                        type="text"
                        value={hqLeadRecipients}
                        onChange={(e) => setHqLeadRecipients(e.target.value)}
                        placeholder="Subscribers handles..."
                        className="w-full px-2.5 py-1.5 text-xs bg-slate-900 border border-slate-800 focus:border-emerald-500 rounded-lg text-slate-200 placeholder-slate-650 outline-none font-mono"
                      />
                    </div>
                  </div>
                </div>

                <div className="pt-4 border-t border-slate-900/85 mt-2 flex flex-col gap-1.5">
                  <button
                    type="button"
                    onClick={() => {
                      const compiled = 
                        `🚨 <b>LEAD EARLY WARNING: ${hqSignalName}</b> 🚨\n` +
                        `• <b>Setup Trigger:</b> ${hqLeadTrigger}\n` +
                        `• <b>Priority:</b> ${hqPriority}\n` +
                        `• <b>Guidance:</b> ${hqLeadAddInfo}\n` +
                        `• <b>Target Pool:</b> ${hqLeadRecipients}\n\n` +
                        `📢 Standby on channels [${hqLeadChannels}]!`;
                      handleTransmitDirect(compiled, "pre");
                    }}
                    disabled={transPreStatus === "sending"}
                    className="w-full py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-[10px] font-bold rounded-lg transition-all disabled:opacity-40 cursor-pointer flex items-center justify-center gap-1"
                  >
                    <Sparkles className="w-3 h-3 text-amber-350 fill-amber-350/10" />
                    <span>
                      {transPreStatus === "sending" ? "Sending... ⏳" : transPreStatus === "success" ? "Sent Successfully! 🟢" : "Transmit Lead Setup ⚡"}
                    </span>
                  </button>
                </div>
              </div>

              {/* Column 2: Current Signal */}
              <div className="bg-slate-950/80 border border-sky-900/30 rounded-xl p-4.5 space-y-4 hover:border-sky-900/60 transition-all flex flex-col justify-between">
                <div className="space-y-3.5">
                  <div className="flex items-start gap-2.5 border-b border-slate-900 pb-3">
                    <div className="p-2 bg-sky-950/50 border border-sky-900/40 rounded-lg text-sky-450 shrink-0">
                      <Radio className="w-4 h-4 animate-pulse" />
                    </div>
                    <div>
                      <h4 className="text-xs font-bold text-slate-200">Current Signal</h4>
                      <p className="text-[10px] text-slate-450 leading-tight">Live alert for active real-time setup triggers</p>
                    </div>
                  </div>

                  <div className="space-y-3 font-sans">
                    <div className="space-y-1">
                      <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1">
                        <span>Trigger Condition</span>
                        <span className="text-rose-500">*</span>
                      </label>
                      <textarea
                        rows={3}
                        value={hqCurrentTrigger}
                        onChange={(e) => setHqCurrentTrigger(e.target.value)}
                        placeholder="e.g. UNDER 7 active contract limits"
                        className="w-full p-2.5 text-xs bg-slate-900 border border-slate-800 focus:border-sky-500 rounded-lg text-slate-200 placeholder-slate-650 outline-none font-mono resize-none leading-relaxed"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Additional Information</label>
                      <input
                        type="text"
                        value={hqCurrentAddInfo}
                        onChange={(e) => setHqCurrentAddInfo(e.target.value)}
                        placeholder="e.g. Martingale steps v2 activated"
                        className="w-full px-2.5 py-1.5 text-xs bg-slate-900 border border-slate-800 focus:border-sky-500 rounded-lg text-slate-250 placeholder-slate-650 outline-none"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1">
                        <span>Notification Channels</span>
                        <span className="text-rose-500">*</span>
                      </label>
                      <input
                        type="text"
                        value={hqCurrentChannels}
                        onChange={(e) => setHqCurrentChannels(e.target.value)}
                        placeholder="Telegram Channels..."
                        className="w-full px-2.5 py-1.5 text-xs bg-slate-900 border border-slate-800 focus:border-sky-500 rounded-lg text-slate-250 placeholder-slate-650 outline-none"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1">
                        <span>Recipients</span>
                        <span className="text-rose-500">*</span>
                      </label>
                      <input
                        type="text"
                        value={hqCurrentRecipients}
                        onChange={(e) => setHqCurrentRecipients(e.target.value)}
                        placeholder="Target feed lists..."
                        className="w-full px-2.5 py-1.5 text-xs bg-slate-900 border border-slate-800 focus:border-sky-500 rounded-lg text-slate-200 placeholder-slate-650 outline-none font-mono"
                      />
                    </div>
                  </div>
                </div>

                <div className="pt-4 border-t border-slate-900/85 mt-2 flex flex-col gap-1.5">
                  <button
                    type="button"
                    onClick={() => {
                      const compiled = 
                        `🔔 <b>ACTIVE PLAY TRIGGERED: ${hqSignalName}</b> 🔔\n` +
                        `• <b>Setup Status:</b> ${hqCurrentTrigger}\n` +
                        `• <b>Active Parameters:</b> UNDER 7 Contract\n` +
                        `• <b>Action Rate:</b> ${hqCurrentAddInfo}\n` +
                        `• <b>Members Feed:</b> ${hqCurrentRecipients}\n\n` +
                        `📈 <i>Execute with strict trade risk control metrics!</i>`;
                      handleTransmitDirect(compiled, "active");
                    }}
                    disabled={transActiveStatus === "sending"}
                    className="w-full py-1.5 bg-sky-600 hover:bg-sky-500 text-white text-[10px] font-bold rounded-lg transition-all disabled:opacity-40 cursor-pointer flex items-center justify-center gap-1"
                  >
                    <Sparkles className="w-3 h-3 text-amber-350 fill-amber-350/10" />
                    <span>
                      {transActiveStatus === "sending" ? "Transmitting... ⏳" : transActiveStatus === "success" ? "Transmitted! 🟢" : "Transmit Live Setup ⚡"}
                    </span>
                  </button>
                </div>
              </div>

              {/* Column 3: Alert (Going to be Sent) */}
              <div className="bg-slate-950/80 border border-amber-900/30 rounded-xl p-4.5 space-y-4 hover:border-amber-900/60 transition-all flex flex-col justify-between">
                <div className="space-y-3.5">
                  <div className="flex items-start gap-2.5 border-b border-slate-900 pb-3">
                    <div className="p-2 bg-amber-950/40 border border-amber-900/45 rounded-lg text-amber-400 shrink-0">
                      <Navigation className="w-4 h-4 rotate-45" />
                    </div>
                    <div>
                      <h4 className="text-xs font-bold text-slate-200">Alert (Going to be Sent)</h4>
                      <p className="text-[10px] text-slate-450 leading-tight">Cooldown release status and scheduled dispatch alerts</p>
                    </div>
                  </div>

                  <div className="space-y-3 font-sans">
                    <div className="space-y-1">
                      <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1">
                        <span>Trigger Condition</span>
                        <span className="text-rose-500">*</span>
                      </label>
                      <textarea
                        rows={3}
                        value={hqGoingTrigger}
                        onChange={(e) => setHqGoingTrigger(e.target.value)}
                        placeholder="Final session wrapup..."
                        className="w-full p-2.5 text-xs bg-slate-900 border border-slate-800 focus:border-amber-500 rounded-lg text-slate-200 placeholder-slate-650 outline-none font-mono resize-none leading-relaxed"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Additional Information </label>
                      <input
                        type="text"
                        value={hqGoingAddInfo}
                        onChange={(e) => setHqGoingAddInfo(e.target.value)}
                        placeholder="e.g. Session gains secured"
                        className="w-full px-2.5 py-1.5 text-xs bg-slate-900 border border-slate-800 focus:border-amber-500 rounded-lg text-slate-250 placeholder-slate-650 outline-none"
                      />
                    </div>

                    {/* Rich date time picker with custom symbol style */}
                    <div className="space-y-1">
                      <label className="text-[10px] font-semibold text-slate-450 uppercase tracking-wider flex items-center gap-1">
                        <Calendar className="w-3 h-3 text-amber-500" />
                        <span>Send Alert Scheduling</span>
                      </label>
                      <input
                        type="datetime-local"
                        value={hqGoingSendTime}
                        onChange={(e) => setHqGoingSendTime(e.target.value)}
                        className="w-full px-2.5 py-1.5 text-xs bg-slate-900 border border-slate-800 focus:border-amber-500 rounded-lg text-amber-400 outline-none cursor-pointer font-mono"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1">
                        <span>Notification Channels</span>
                        <span className="text-rose-500">*</span>
                      </label>
                      <input
                        type="text"
                        value={hqGoingChannels}
                        onChange={(e) => setHqGoingChannels(e.target.value)}
                        placeholder="Release channel lists"
                        className="w-full px-2.5 py-1.5 text-xs bg-slate-900 border border-slate-800 focus:border-amber-500 rounded-lg text-slate-250 placeholder-slate-650 outline-none"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1">
                        <span>Recipients</span>
                        <span className="text-rose-500">*</span>
                      </label>
                      <input
                        type="text"
                        value={hqGoingRecipients}
                        onChange={(e) => setHqGoingRecipients(e.target.value)}
                        placeholder="@members-telegram..."
                        className="w-full px-2.5 py-1.5 text-xs bg-slate-900 border border-slate-800 focus:border-amber-500 rounded-lg text-slate-200 placeholder-slate-650 outline-none font-mono"
                      />
                    </div>
                  </div>
                </div>

                <div className="pt-4 border-t border-slate-900/85 mt-2 flex flex-col gap-1.5">
                  <button
                    type="button"
                    onClick={() => {
                      const compiled = 
                        `⌛ <b>COOLDOWN NOTICE: Next Alert Setup</b> ⌛\n` +
                        `• <b>Final Setup Event:</b> ${hqGoingTrigger}\n` +
                        `• <b>Performance status:</b> ${hqGoingAddInfo}\n` +
                        `• <b>Expected release:</b> ${hqGoingSendTime} UTC (Coordinated Time)\n\n` +
                        `📡 <i>We are preparing the next automatic loop setup. Stay alert!</i>`;
                      handleTransmitDirect(compiled, "post");
                    }}
                    disabled={transPostStatus === "sending"}
                    className="w-full py-1.5 bg-amber-600 hover:bg-amber-500 text-white text-[10px] font-bold rounded-lg transition-all disabled:opacity-40 cursor-pointer flex items-center justify-center gap-1"
                  >
                    <Sparkles className="w-3 h-3 text-amber-300 fill-amber-300/10" />
                    <span>
                      {transPostStatus === "sending" ? "Transmitting... ⏳" : transPostStatus === "success" ? "Transmitted! 🟢" : "Transmit Cooldown Setup ⚡"}
                    </span>
                  </button>
                </div>
              </div>

            </div>

            {/* General Settings Card */}
            <div className="bg-slate-950 p-5 border border-slate-850 rounded-xl space-y-4">
              <div className="flex items-center gap-2 border-b border-slate-900 pb-2.5">
                <HelpCircle className="w-4 h-4 text-sky-450" />
                <span className="text-xs font-semibold text-slate-200">General Settings & Metadata Indicators (Optional)</span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-slate-350">Sequence Tags</label>
                  <input
                    type="text"
                    value={hqTags}
                    onChange={(e) => setHqTags(e.target.value)}
                    placeholder="e.g. deriv, volatility100, second_least_digit"
                    className="w-full px-3 py-2 text-xs bg-slate-900 border border-slate-800 focus:border-sky-500 rounded-lg text-slate-100 placeholder-slate-650 font-mono outline-none"
                    id="hq-tags"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-slate-350">Operator Sequence Notes</label>
                  <textarea
                    rows={1}
                    value={hqNotes}
                    onChange={(e) => setHqNotes(e.target.value)}
                    placeholder="Internal reference pointers for session operations..."
                    className="w-full px-3 py-2 text-xs bg-slate-900 border border-slate-800 focus:border-sky-500 rounded-lg text-slate-200 placeholder-slate-650 outline-none resize-none leading-relaxed"
                    id="hq-notes"
                  />
                </div>
              </div>
            </div>

            {/* Sizable Footer Synchronize & Save Blueprint controller */}
            <div className="p-4 bg-slate-950 rounded-xl border border-slate-900/90 flex flex-col sm:flex-row items-center justify-between gap-4 font-sans">
              <div className="flex items-center gap-2 text-xs text-slate-400">
                <span className="w-2 h-2 rounded-full bg-sky-500 animate-pulse"></span>
                <span>Active configuration drafted above automatically saves to cache & updates the simulated Telegram window when saved.</span>
              </div>
              <div className="flex items-center gap-3 w-full sm:w-auto">
                <button
                  type="button"
                  onClick={handleCancelHqDraft}
                  className="flex-1 sm:flex-initial px-4 py-2 text-xs font-bold text-slate-400 hover:text-white bg-slate-900 border border-slate-800 rounded-lg hover:border-slate-700 transition-all cursor-pointer"
                >
                  Restore Baseline
                </button>
                <button
                  type="button"
                  onClick={handleSaveHqDraft}
                  className="flex-1 sm:flex-initial px-5 py-2 text-xs font-bold bg-gradient-to-r from-sky-500 to-indigo-600 hover:from-sky-400 hover:to-indigo-500 text-white rounded-lg shadow-lg shadow-sky-500/10 cursor-pointer duration-150 transform active:translate-y-px"
                >
                  Compile & Save Draft
                </button>
              </div>
            </div>

          </div>
        )}

        {genError && formMode !== "sequence" && (
          <div className="bg-rose-950/30 text-rose-300 border border-rose-900/50 rounded-xl p-3 text-xs flex items-center gap-2" id="builder-error-div">
            <ShieldAlert className="w-4 h-4 text-rose-400 shrink-0" />
            <span>{genError}</span>
          </div>
        )}

        {/* Telegram Auto-Share Dispatcher Options */}
        {formMode !== "sequence" && (
          <div className="bg-slate-950 p-4 border border-slate-850/60 rounded-xl space-y-2.5" id="auto-broadcast-manual-config">
            <div className="flex justify-between items-center text-xs">
              <span className="text-slate-300 font-medium font-sans">Telegram Share Dispatch Mode</span>
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded border font-mono ${
                autoShareEnabled 
                  ? "bg-emerald-950/40 text-emerald-300 border-emerald-900/40" 
                  : "bg-slate-900 text-slate-500 border-slate-800"
              }`}>
                {autoShareEnabled ? "INSTANT DISPATCH ON BUILD" : "MANUAL REVIEW POSTS"}
              </span>
            </div>
            <p className="text-[10px] text-slate-500 leading-snug">
              Send formulated trading setups automatically to channel <code>{telegramConfigChatId || "Telegram"}</code> as soon as you compile or AI-drafts them.
            </p>
            
            <div className="grid grid-cols-2 gap-2 pt-0.5 font-sans">
              <button
                type="button"
                onClick={() => onAutoShareToggle(false)}
                className={`py-1.5 px-3 text-[10px] font-bold rounded-lg transition-all cursor-pointer text-center ${
                  !autoShareEnabled
                    ? "bg-slate-800 text-white border border-slate-700/60"
                    : "bg-slate-900/50 text-slate-450 border border-slate-850/60 hover:bg-slate-800/30"
                }`}
                id="btn-manual-review-only"
              >
                Draft & Manual Review
              </button>
              <button
                type="button"
                onClick={() => onAutoShareToggle(true)}
                className={`py-1.5 px-3 text-[10px] font-bold rounded-lg transition-all cursor-pointer text-center ${
                  autoShareEnabled
                    ? "bg-emerald-950/60 text-emerald-300 border border-emerald-900/40"
                    : "bg-slate-900/50 text-slate-455 border border-slate-850/60 hover:bg-slate-800/30"
                }`}
                id="btn-auto-share-instantly"
              >
                Auto-Share Instantly ⚡
              </button>
            </div>
          </div>
        )}

        {/* Inline save blueprint/template input block */}
        {showSaveTemplateForm && formMode !== "sequence" && (
          <div className="bg-slate-950 p-4 border border-sky-905/30 rounded-xl space-y-3.5 animate-fade-in" id="save-template-inline-card">
            <div className="flex items-center gap-2 text-xs font-semibold text-slate-200">
              <Save className="w-4 h-4 text-sky-400" />
              <span>Save Current Setup as Template Blueprint</span>
            </div>
            <p className="text-[10px] text-slate-400 leading-normal">
              Save the current symbol, strategy, and options to your local template blueprints so they can be loaded instantly in the future from the <b>"Blueprints & Templates"</b> tab.
            </p>
            
            <div className="space-y-1.5 font-sans">
              <label className="text-[10px] uppercase font-bold text-slate-500 block">Blueprint Name</label>
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                <input
                  type="text"
                  value={saveTemplateName}
                  onChange={(e) => setSaveTemplateName(e.target.value)}
                  placeholder="e.g. Volatility 100 System"
                  className="flex-1 px-3 py-2 text-xs bg-slate-900 border border-slate-800 focus:border-sky-500 rounded-lg text-white placeholder-slate-650 outline-none"
                  id="input-inline-save-template-name"
                />
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={handleConfirmSaveTemplate}
                    className="px-4 py-2 bg-gradient-to-r from-sky-500 to-indigo-600 hover:from-sky-450 hover:to-indigo-550 text-white text-xs font-bold rounded-lg transition-all cursor-pointer shadow"
                    id="btn-inline-save-template-confirm"
                  >
                    Confirm Save
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowSaveTemplateForm(false)}
                    className="px-3.5 py-2 bg-slate-900 hover:bg-slate-850 hover:text-white border border-slate-800 text-slate-400 text-xs font-bold rounded-lg transition-all cursor-pointer"
                    id="btn-inline-save-template-cancel"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>

            {saveTemplateFeedback && (
              <p className="text-[10.5px] text-teal-400 font-semibold font-sans mt-1">
                {saveTemplateFeedback}
              </p>
            )}
          </div>
        )}

        {/* Action controllers */}
        {formMode !== "sequence" && (
          <div className="flex flex-col xl:flex-row items-stretch xl:items-center gap-3 pt-3 border-t border-slate-800/60 font-sans">
            <button
              type="submit"
              disabled={generating}
              className="flex-1 bg-gradient-to-r from-sky-500 via-sky-600 to-indigo-600 hover:from-sky-400 hover:to-indigo-500 disabled:from-slate-800 disabled:to-slate-800 disabled:text-slate-500 text-white font-semibold text-xs py-3 px-5 rounded-xl flex items-center justify-center gap-2 shadow-lg shadow-sky-500/10 cursor-pointer disabled:cursor-not-allowed transform hover:-translate-y-px active:translate-y-0 transition-all font-sans"
              id="btn-gemini-draft-signal"
            >
              {generating ? (
                <>
                  <svg className="animate-spin h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  <span>AI is formulating signal message...</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4 text-amber-300 fill-amber-300/20" />
                  <span>AI Assist: Draft Signal & Rationale</span>
                </>
              )}
            </button>

            <button
              type="button"
              onClick={handleManualFormat}
              disabled={generating}
              className="px-4 py-3 text-xs border border-slate-850 hover:bg-slate-800/50 disabled:border-slate-850/45 disabled:text-slate-650 disabled:hover:bg-transparent text-slate-350 hover:text-white rounded-xl transition-all cursor-pointer font-sans"
              id="btn-manual-format-signal"
            >
              Compiler Mode (Format Instantly)
            </button>

            <button
              type="button"
              onClick={handleOpenSaveTemplate}
              disabled={generating}
              className="px-4 py-3 text-xs bg-slate-950 border border-slate-800 hover:border-slate-700 hover:text-white hover:bg-slate-900 text-sky-400 rounded-xl transition-all cursor-pointer font-sans flex items-center justify-center gap-1.5"
              id="btn-save-draft-as-blueprint"
            >
              <Save className="w-3.5 h-3.5 text-sky-400" />
              <span>Save as Blueprint Template 💾</span>
            </button>
          </div>
        )}
      </form>
    </div>
  );
}
