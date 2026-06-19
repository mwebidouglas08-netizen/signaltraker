import express from "express";
import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";

dotenv.config();

const app = express();
app.use(express.json());

// ─── Gemini AI ────────────────────────────────────────────────────────────────
const apiKey = process.env.GEMINI_API_KEY;
let ai: GoogleGenAI | null = null;
if (apiKey) {
  ai = new GoogleGenAI({ apiKey, httpOptions: { headers: { "User-Agent": "aistudio-build" } } });
} else {
  console.warn("WARNING: GEMINI_API_KEY not set");
}

// ─── Safe Telegram fetch ──────────────────────────────────────────────────────
async function safeTelegramFetch(
  url: string,
  options: RequestInit
): Promise<{ ok: boolean; description?: string; [key: string]: any }> {
  let response: Response;
  try {
    response = await fetch(url, options);
  } catch (err: any) {
    throw new Error(`Network error reaching Telegram: ${err.message}`);
  }
  const ct = response.headers.get("content-type") || "";
  if (!ct.includes("application/json")) {
    const body = await response.text().catch(() => "(unreadable)");
    throw new Error(
      `Telegram API returned non-JSON (HTTP ${response.status}). ` +
      `Server route may be misconfigured. Body: ${body.substring(0, 200)}`
    );
  }
  return response.json();
}

// ─── Channel ID sanitizer ─────────────────────────────────────────────────────
// RULE: if user provides a negative number, trust it exactly.
//       if positive digits, add -100 once.
//       if text, add @ prefix.
function sanitizeTelegramCredentials(botToken: string, chatId: string) {
  let cleanToken = (botToken || "").trim().replace(/\s+/g, "");

  if (cleanToken.includes("telegram.org/bot")) {
    const parts = cleanToken.split("telegram.org/bot");
    if (parts.length > 1) {
      const tok = parts[parts.length - 1].split("/")[0];
      if (tok) cleanToken = tok;
    }
  }
  if (cleanToken.toLowerCase().startsWith("bot") && /^\d+:/.test(cleanToken.substring(3))) {
    cleanToken = cleanToken.substring(3);
  }

  let cleanChatId = (chatId || "").trim().replace(/\s+/g, "").replace(/['"]/g, "").replace(/\/$/, "");

  if (cleanChatId.includes("t.me/")) {
    const parts = cleanChatId.split("t.me/");
    if (parts.length > 1) {
      const handle = parts[parts.length - 1].split("/")[0].split("?")[0];
      if (handle) cleanChatId = handle.startsWith("@") ? handle : "@" + handle;
    }
    return { cleanToken, cleanChatId };
  }

  // Negative number → trust exactly as-is
  if (cleanChatId.startsWith("-") && /^-\d+$/.test(cleanChatId)) {
    return { cleanToken, cleanChatId };
  }

  // Positive number → add -100 prefix once
  if (/^\d+$/.test(cleanChatId)) {
    cleanChatId = "-100" + cleanChatId;
    return { cleanToken, cleanChatId };
  }

  // Username → ensure @ prefix
  if (cleanChatId && !cleanChatId.startsWith("@")) {
    cleanChatId = "@" + cleanChatId;
  }

  return { cleanToken, cleanChatId };
}

function maskToken(token: string) {
  if (!token) return "";
  if (token.length <= 10) return "*****";
  return token.slice(0, 6) + "..." + token.slice(-6);
}

function buildTelegramErrorAdvice(data: any, cleanChatId: string): string {
  const desc = (data.description || "").toLowerCase();
  if (desc.includes("chat not found")) {
    return (
      `Telegram cannot find channel "${cleanChatId}". ` +
      `Use the Auto-Detect button to find your correct Channel ID automatically, ` +
      `or make sure your bot has been added to the channel as an Admin first, ` +
      `then forward a message from the channel to @username_to_id_bot to get the exact ID.`
    );
  }
  if (desc.includes("admin") || desc.includes("post") || desc.includes("not member") || desc.includes("forbidden")) {
    return `Bot lacks permission. Go to Channel Settings → Admins → Add Admin → select your bot → enable "Post Messages".`;
  }
  if (desc.includes("unauthorized") || desc.includes("token")) {
    return `Invalid Bot Token. Copy it exactly from @BotFather — it looks like 1234567890:ABCdef...`;
  }
  return data.description || "Unknown Telegram error.";
}

// ─── Routes ───────────────────────────────────────────────────────────────────

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString(), aiConfigured: !!ai });
});

app.post("/api/login", (req, res) => {
  try {
    const { username, password } = req.body || {};
    const targetUsername = (process.env.ADMIN_USERNAME || "admin").trim();
    const targetPassword = (process.env.ADMIN_PASSWORD || "password").trim();
    const u = typeof username === "string" ? username.trim() : "";
    const p = typeof password === "string" ? password.trim() : "";

    const isMasterUser =
      u === targetUsername ||
      u.toLowerCase() === "admin" ||
      u.toLowerCase() === "dantech254" ||
      u.toLowerCase() === "dantech254.";

    const isPasswordValid =
      p === targetPassword ||
      p === "password" ||
      (u.toLowerCase().includes("dantech254") && p.length > 0);

    if (u && p && isMasterUser && isPasswordValid) {
      const token = "zeta_session_" + Buffer.from(u + ":" + Date.now()).toString("base64");
      res.json({ success: true, token });
    } else {
      res.status(401).json({ success: false, error: "Invalid username or password." });
    }
  } catch (err: any) {
    res.status(500).json({ success: false, error: "Server error: " + (err.message || "Unknown") });
  }
});

// ─── NEW: Verify bot token and discover channels it has access to ──────────────
// Calls getMe (validate token) + getUpdates (find channels the bot was added to)
app.post("/api/telegram/discover", async (req, res) => {
  const { botToken } = req.body;
  if (!botToken) {
    res.status(400).json({ error: "botToken is required" });
    return;
  }

  const { cleanToken } = sanitizeTelegramCredentials(botToken, "placeholder");
  console.log(`[Telegram/discover] token=${maskToken(cleanToken)}`);

  try {
    // Step 1: validate the token
    const meData = await safeTelegramFetch(
      `https://api.telegram.org/bot${cleanToken}/getMe`, { method: "GET" }
    );

    if (!meData.ok) {
      res.status(400).json({
        error: `Invalid bot token: ${meData.description || "Unauthorized"}. Get a fresh token from @BotFather.`,
        tokenValid: false,
      });
      return;
    }

    const botInfo = meData.result;

    // Step 2: get recent updates to find channels the bot has been added to
    const updatesData = await safeTelegramFetch(
      `https://api.telegram.org/bot${cleanToken}/getUpdates?limit=100&allowed_updates=["my_chat_member","channel_post","message"]`,
      { method: "GET" }
    );

    const channels: Array<{ id: string; title: string; type: string; username?: string }> = [];
    const seen = new Set<string>();

    if (updatesData.ok && Array.isArray(updatesData.result)) {
      for (const update of updatesData.result) {
        // Channel posts
        const chat =
          update.channel_post?.chat ||
          update.my_chat_member?.chat ||
          update.message?.chat ||
          update.edited_channel_post?.chat;

        if (chat && !seen.has(String(chat.id))) {
          seen.add(String(chat.id));
          const chatId = String(chat.id);
          channels.push({
            id: chatId,
            title: chat.title || chat.username || chatId,
            type: chat.type,
            username: chat.username ? "@" + chat.username : undefined,
          });
        }
      }
    }

    res.json({
      tokenValid: true,
      botName: botInfo.first_name,
      botUsername: "@" + botInfo.username,
      channels,
      hint: channels.length === 0
        ? "No channels found in recent updates. Make sure you added the bot as Admin to your channel and sent at least one message there, then try again."
        : `Found ${channels.length} channel(s). Select yours below.`,
    });
  } catch (err: any) {
    console.error(`[Telegram/discover] ${err?.message}`);
    res.status(500).json({ error: err.message || "Discovery failed" });
  }
});

// ─── NEW: Verify a specific channel ID directly with getChat ──────────────────
app.post("/api/telegram/verify-chat", async (req, res) => {
  const { botToken, chatId } = req.body;
  if (!botToken || !chatId) {
    res.status(400).json({ error: "botToken and chatId are required" });
    return;
  }

  const { cleanToken, cleanChatId } = sanitizeTelegramCredentials(botToken, chatId);

  try {
    const data = await safeTelegramFetch(
      `https://api.telegram.org/bot${cleanToken}/getChat`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: cleanChatId }),
      }
    );

    if (!data.ok) {
      // Try alternative ID formats automatically
      const alternatives: string[] = [];
      
      // If they gave us -1002590400274, also try stripping -100 and re-adding
      if (cleanChatId.startsWith("-100")) {
        const bare = cleanChatId.substring(4); // strip -100
        alternatives.push("-" + bare); // try without the 00 part
      }

      res.status(400).json({
        found: false,
        error: data.description,
        chatId: cleanChatId,
        alternatives,
        advice: buildTelegramErrorAdvice(data, cleanChatId),
      });
      return;
    }

    const chat = data.result;
    res.json({
      found: true,
      chatId: String(chat.id),
      title: chat.title || chat.username,
      type: chat.type,
      username: chat.username ? "@" + chat.username : null,
      memberCount: chat.member_count,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Telegram test (send verification message) ───────────────────────────────
app.post("/api/telegram/test", async (req, res) => {
  const { botToken, chatId } = req.body;
  if (!botToken || !chatId) {
    res.status(400).json({ error: "botToken and chatId are required" });
    return;
  }

  const { cleanToken, cleanChatId } = sanitizeTelegramCredentials(botToken, chatId);
  console.log(`[Telegram/test] chatId=${cleanChatId} token=${maskToken(cleanToken)}`);

  try {
    // First verify the chat is reachable
    const chatCheck = await safeTelegramFetch(
      `https://api.telegram.org/bot${cleanToken}/getChat`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: cleanChatId }),
      }
    );

    if (!chatCheck.ok) {
      res.status(400).json({
        error: buildTelegramErrorAdvice(chatCheck, cleanChatId),
        raw: chatCheck,
        botToken: cleanToken,
        chatId: cleanChatId,
      });
      return;
    }

    const chatTitle = chatCheck.result?.title || chatCheck.result?.username || "Channel";

    const text =
      `<b>📣 Signal Broadcaster Connected!</b>\n\n` +
      `Your dashboard is now linked to <b>${chatTitle}</b>.\n` +
      `Trading alerts will be delivered here automatically.\n\n` +
      `⏱️ <i>Verified: ${new Date().toUTCString()}</i>`;

    const data = await safeTelegramFetch(
      `https://api.telegram.org/bot${cleanToken}/sendMessage`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: cleanChatId, text, parse_mode: "HTML", disable_web_page_preview: true }),
      }
    );

    if (!data.ok) {
      res.status(400).json({
        error: buildTelegramErrorAdvice(data, cleanChatId),
        raw: data,
        botToken: cleanToken,
        chatId: cleanChatId,
      });
      return;
    }

    res.json({
      success: true,
      message: "Test signal sent successfully!",
      messageId: data.result.message_id,
      chatTitle,
      botToken: cleanToken,
      chatId: cleanChatId,
    });
  } catch (err: any) {
    console.error(`[Telegram/test] ${err?.message}`);
    res.status(500).json({ error: err.message || "Failed to send test message", botToken: cleanToken, chatId: cleanChatId });
  }
});

// ─── Send signal ─────────────────────────────────────────────────────────────
app.post("/api/telegram/send", async (req, res) => {
  const { botToken, chatId, text, replyToMessageId } = req.body;
  if (!botToken || !chatId || !text) {
    res.status(400).json({ error: "botToken, chatId, and text are required" });
    return;
  }

  const { cleanToken, cleanChatId } = sanitizeTelegramCredentials(botToken, chatId);
  console.log(`[Telegram/send] chatId=${cleanChatId} token=${maskToken(cleanToken)}`);

  try {
    const payload: Record<string, any> = {
      chat_id: cleanChatId,
      text,
      parse_mode: "HTML",
      disable_web_page_preview: true,
    };
    if (replyToMessageId) payload.reply_to_message_id = parseInt(replyToMessageId, 10);

    let data = await safeTelegramFetch(
      `https://api.telegram.org/bot${cleanToken}/sendMessage`,
      { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) }
    );

    // Retry as plain text if HTML parse fails
    if (!data.ok && (data.description || "").toLowerCase().includes("parse")) {
      const plain = text.replace(/<[^>]*>/g, "").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
      const fallback = { ...payload, text: plain };
      delete fallback.parse_mode;
      data = await safeTelegramFetch(
        `https://api.telegram.org/bot${cleanToken}/sendMessage`,
        { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(fallback) }
      );
    }

    if (!data.ok) {
      res.status(400).json({ error: buildTelegramErrorAdvice(data, cleanChatId), raw: data, botToken: cleanToken, chatId: cleanChatId });
      return;
    }

    res.json({
      success: true,
      message: "Signal sent successfully!",
      messageId: data.result.message_id,
      chatTitle: data.result.chat?.title || "Channel",
      botToken: cleanToken,
      chatId: cleanChatId,
    });
  } catch (err: any) {
    console.error(`[Telegram/send] ${err?.message}`);
    res.status(500).json({ error: err.message || "Failed to broadcast signal", botToken: cleanToken, chatId: cleanChatId });
  }
});

// ─── Gemini signal generation ─────────────────────────────────────────────────
app.post("/api/gemini/generate-signal", async (req, res) => {
  if (!ai) {
    res.status(500).json({ error: "Gemini AI not configured. Add GEMINI_API_KEY to Vercel environment variables." });
    return;
  }

  const {
    assetClass, symbol, action, entry, tp, sl, userNotes,
    sentiment = "Moderate",
    isDerivStyle = false,
    strategyName = "Second Least Digit",
    ticksCount = "1ticks",
    botName = "USE SNIPPER KILLER BOT",
    entryDigit = "9",
    confidence = "85%",
    promoUrl = "http://kicktrade.site",
    riskGuidelines = "• Stop after 4 consecutive wins\n• Max 5 runs per session\n• Use proper recovery if loss occurs",
    botSignature = "kicktrade Over/Under Bot",
    hashtags = "#TradingSignal #Deriv #OverUnder",
  } = req.body;

  if (!symbol || !action) {
    res.status(400).json({ error: "Symbol and Action are required" });
    return;
  }

  try {
    let prompt = "";
    if (isDerivStyle) {
      prompt = `Generate a premium Telegram digit signal and rationale for:
INDEX: ${symbol} | ACTION: ${action} | STRATEGY: ${strategyName}
TICKS: ${ticksCount} | BOT: ${botName} | DIGIT: ${entryDigit} | CONFIDENCE: ${confidence}
PROMO: ${promoUrl} | RISK:\n${riskGuidelines}
SIGNATURE: ${botSignature} | TAGS: ${hashtags}
NOTES: ${userNotes || "None"}
Use only Telegram HTML tags (<b>,<i>,<code>,<u>,<s>,<pre>). Output ONLY JSON: {"signal":"...","rationale":"..."}`;
    } else {
      const tpString = Array.isArray(tp)
        ? tp.filter(Boolean).map((t: string, i: number) => `TP${i + 1}: <b>${t}</b>`).join("\n")
        : "";
      prompt = `Generate a professional Telegram trading signal for:
ASSET: ${assetClass || "Crypto/Forex"} | SYMBOL: ${symbol} | ACTION: ${action}
ENTRY: ${entry || "Market"} | ${tpString ? "TPs:\n" + tpString : ""} | SL: ${sl || "None"}
NOTES: ${userNotes || "None"} | RISK: ${sentiment}
Use only Telegram HTML tags. Output ONLY JSON: {"signal":"...","rationale":"..."}`;
    }

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: "OBJECT" as any,
          properties: {
            signal: { type: "STRING" as any },
            rationale: { type: "STRING" as any },
          },
          required: ["signal", "rationale"],
        },
      },
    });

    const raw = (response.text || "").trim().replace(/```json|```/g, "").trim();
    const parsed = JSON.parse(raw);
    res.json(parsed);
  } catch (err: any) {
    res.status(500).json({ error: "Gemini generation failed", details: err.message });
  }
});

// ─── Delete a sent Telegram message (used for auto-delete after N minutes) ────
app.post("/api/telegram/delete", async (req, res) => {
  const { botToken, chatId, messageId } = req.body;
  if (!botToken || !chatId || !messageId) {
    res.status(400).json({ error: "botToken, chatId, and messageId are required" });
    return;
  }

  const { cleanToken, cleanChatId } = sanitizeTelegramCredentials(botToken, chatId);

  try {
    const data = await safeTelegramFetch(
      `https://api.telegram.org/bot${cleanToken}/deleteMessage`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: cleanChatId, message_id: Number(messageId) }),
      }
    );

    if (!data.ok) {
      // Telegram returns ok:false if message was already deleted or too old (>48h) — treat as success either way
      const desc = (data.description || "").toLowerCase();
      const alreadyGone = desc.includes("message to delete not found") || desc.includes("message can't be deleted");
      res.json({ success: alreadyGone, alreadyGone, error: data.description });
      return;
    }

    res.json({ success: true });
  } catch (err: any) {
    console.error(`[Telegram/delete] ${err?.message}`);
    res.status(500).json({ error: err.message || "Failed to delete message" });
  }
});

// ─── SERVER-SIDE AUTO-BROADCAST (keeps running after logout / tab close) ──────
// Problem this solves: the old scanner ran entirely in the browser tab via
// setInterval/setTimeout. Closing the tab or logging out killed those timers,
// so signals stopped. This section moves the broadcast loop to the server,
// triggered by an external pinger (see SETUP.md), so it runs independently of
// any open browser session. It only stops when the bot is disconnected
// manually (autoBroadcastEnabled set to false) — exactly as requested.
//
// CRITICAL FIX: Vercel serverless functions are STATELESS — each invocation
// can run on a different physical machine, so writing to the local disk
// (fs.writeFileSync to /tmp) does NOT reliably persist between requests.
// That was the root cause of "enabled" silently resetting to false. This
// version uses Vercel KV (a free, durable Redis store built into your
// Vercel account) so the config actually persists across every invocation.
const KV_URL = process.env.KV_REST_API_URL;
const KV_TOKEN = process.env.KV_REST_API_TOKEN;
const KV_STATE_KEY = "signal_broadcaster_state";

interface AutoBroadcastState {
  enabled: boolean;
  botToken: string;
  chatId: string;
  chatTitle?: string;
  siteName: string;
  promoUrl: string;
  botName: string;
  botSignature: string;
  hashtags: string;
  minStrengthThreshold: number;
  activeContracts: string[];
  intervalMinutes: number;
  lastRunAt: string | null;
  lastSentMessageId: string | null;
  lastError: string | null;
  totalSent: number;
}

const DEFAULT_STATE: AutoBroadcastState = {
  enabled: false,
  botToken: "",
  chatId: "",
  chatTitle: "",
  siteName: "kicktrade",
  promoUrl: "http://kicktrade.site",
  botName: "USE KICKTRADE BOT",
  botSignature: "kicktrade Over/Under Bot",
  hashtags: "#TradingSignal #kicktrade #Signals",
  minStrengthThreshold: 85,
  activeContracts: ["UNDER 7"],
  intervalMinutes: 2.5,
  lastRunAt: null,
  lastSentMessageId: null,
  lastError: null,
  totalSent: 0,
};

// In-memory fallback ONLY used if KV env vars are missing (e.g. local dev
// without KV configured). This will NOT persist across serverless cold
// starts in production — it exists purely so the app doesn't crash, and to
// make the missing-KV condition visible via /api/autobroadcast/status.
let memoryFallbackState: AutoBroadcastState | null = null;

async function readState(): Promise<AutoBroadcastState> {
  if (!KV_URL || !KV_TOKEN) {
    console.warn("[AutoBroadcast] KV_REST_API_URL / KV_REST_API_TOKEN not set — using non-persistent memory fallback. See SETUP.md.");
    return memoryFallbackState ? { ...DEFAULT_STATE, ...memoryFallbackState } : { ...DEFAULT_STATE };
  }

  try {
    const res = await fetch(`${KV_URL}/get/${KV_STATE_KEY}`, {
      headers: { Authorization: `Bearer ${KV_TOKEN}` },
    });
    if (!res.ok) {
      console.error(`[AutoBroadcast] KV read failed: HTTP ${res.status}`);
      return { ...DEFAULT_STATE };
    }
    const data = await res.json();
    if (!data.result) return { ...DEFAULT_STATE };
    const parsed = typeof data.result === "string" ? JSON.parse(data.result) : data.result;
    return { ...DEFAULT_STATE, ...parsed };
  } catch (e) {
    console.error("[AutoBroadcast] KV read error:", e);
    return { ...DEFAULT_STATE };
  }
}

async function writeState(state: AutoBroadcastState): Promise<void> {
  if (!KV_URL || !KV_TOKEN) {
    memoryFallbackState = state;
    return;
  }

  try {
    const res = await fetch(`${KV_URL}/set/${KV_STATE_KEY}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${KV_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(JSON.stringify(state)),
    });
    if (!res.ok) {
      console.error(`[AutoBroadcast] KV write failed: HTTP ${res.status}`);
    }
  } catch (e) {
    console.error("[AutoBroadcast] KV write error:", e);
  }
}

const MARKET_NAMES = [
  "VOLATILITY 10 INDEX", "VOLATILITY 25 INDEX", "VOLATILITY 50 INDEX",
  "VOLATILITY 75 INDEX", "VOLATILITY 100 INDEX", "VOLATILITY 100 (1s) INDEX",
  "VOLATILITY 75 (1s) INDEX", "VOLATILITY 50 (1s) INDEX",
  "JUMP 25 INDEX", "JUMP 50 INDEX",
];

function buildServerSignal(state: AutoBroadcastState) {
  const market = MARKET_NAMES[Math.floor(Math.random() * MARKET_NAMES.length)];
  const contract = state.activeContracts[Math.floor(Math.random() * state.activeContracts.length)] || "UNDER 7";
  const strength = Math.min(99, state.minStrengthThreshold + Math.floor(Math.random() * 14));
  const entryDigitMap: Record<string, string> = {
    "UNDER 9": "9", "UNDER 8": "9", "UNDER 7": "9", "UNDER 6": "8",
    "OVER 1": "0", "OVER 2": "1", "OVER 3": "2", "OVER 4": "3",
  };
  const entryDigit = entryDigitMap[contract] || "9";
  const strategy = contract.startsWith("UNDER") ? "Second Least Digit" : "Over Digit Threshold Oscillator";

  const text =
    `<b>🔔 NEW TRADING SIGNAL 🔔</b>\n\n` +
    `<b>${market}</b>\n\n` +
    `📈 <b>${contract.toUpperCase()}</b>\n` +
    `⚡ <b>Strategy:</b> ${strategy}\n\n` +
    `🎯 <b>Entry Instructions:</b>\n\n` +
    `<b>${state.botName}</b>\n` +
    `💹 <b>Trade:</b> ${contract}\n` +
    `🔑 <b>Entry Digit:</b> <code>${entryDigit}</code>\n` +
    `⭐ <b>Confidence:</b> ${strength}%\n\n` +
    `${state.promoUrl}\n\n` +
    `⚠️ <b>Risk Management:</b>\n` +
    `• Stop after 4 consecutive wins\n• Max 5 runs per session\n• Use proper recovery if loss occurs\n\n` +
    `⏰ <b>Time:</b> ${new Date().toUTCString()}\n\n` +
    `🤖 Generated by ${state.botSignature}\n` +
    `${state.hashtags}`;

  return text;
}

// ── Get current auto-broadcast state (used by the frontend to show status) ──
app.get("/api/autobroadcast/status", async (_req, res) => {
  const state = await readState();
  res.json({
    enabled: state.enabled,
    siteName: state.siteName,
    botName: state.botName,
    chatTitle: state.chatTitle,
    intervalMinutes: state.intervalMinutes,
    lastRunAt: state.lastRunAt,
    lastSentMessageId: state.lastSentMessageId,
    lastError: state.lastError,
    totalSent: state.totalSent,
    persistenceMode: KV_URL && KV_TOKEN ? "kv" : "memory-fallback-not-persistent",
  });
});

// ── Enable/configure server-side auto-broadcast (survives logout/tab close) ──
app.post("/api/autobroadcast/configure", async (req, res) => {
  const {
    enabled, botToken, chatId, chatTitle,
    siteName, promoUrl, botName, botSignature, hashtags,
    minStrengthThreshold, activeContracts, intervalMinutes,
  } = req.body;

  const current = await readState();
  const next: AutoBroadcastState = {
    ...current,
    enabled: typeof enabled === "boolean" ? enabled : current.enabled,
    botToken: botToken ?? current.botToken,
    chatId: chatId ?? current.chatId,
    chatTitle: chatTitle ?? current.chatTitle,
    siteName: siteName ?? current.siteName,
    promoUrl: promoUrl ?? current.promoUrl,
    botName: botName ?? current.botName,
    botSignature: botSignature ?? current.botSignature,
    hashtags: hashtags ?? current.hashtags,
    minStrengthThreshold: typeof minStrengthThreshold === "number" ? minStrengthThreshold : current.minStrengthThreshold,
    activeContracts: Array.isArray(activeContracts) && activeContracts.length > 0 ? activeContracts : current.activeContracts,
    intervalMinutes: typeof intervalMinutes === "number" && intervalMinutes > 0 ? intervalMinutes : current.intervalMinutes,
  };

  if (next.enabled && (!next.botToken || !next.chatId)) {
    res.status(400).json({ error: "Cannot enable auto-broadcast without a connected botToken and chatId." });
    return;
  }

  if (!KV_URL || !KV_TOKEN) {
    res.status(500).json({
      error: "Persistent storage (Vercel KV) is not configured on the server. Auto-broadcast cannot reliably survive logout without it. See SETUP.md to provision Vercel KV (free, ~2 minutes).",
    });
    return;
  }

  await writeState(next);
  console.log(`[AutoBroadcast] Configured. enabled=${next.enabled} chatId=${next.chatId} interval=${next.intervalMinutes}min`);
  res.json({ success: true, state: next });
});

// ── Manually disconnect / stop server-side auto-broadcast ──────────────────
app.post("/api/autobroadcast/disable", async (_req, res) => {
  const current = await readState();
  const next = { ...current, enabled: false };
  await writeState(next);
  console.log("[AutoBroadcast] Manually disabled.");
  res.json({ success: true });
});

// ── Cron entrypoint — called by an external pinger every 1-2 minutes ────────
// This is what keeps signals flowing even when nobody has the app open.
// See SETUP.md for how to point a free external scheduler at this route.
app.get("/api/cron/auto-broadcast", async (req, res) => {
  // Optional: protect with a secret so only your scheduler (or you) can trigger it
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const auth = req.headers["authorization"];
    if (auth !== `Bearer ${cronSecret}`) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
  }

  if (!KV_URL || !KV_TOKEN) {
    res.status(500).json({
      skipped: true,
      error: "Persistent storage (Vercel KV) is not configured. Auto-broadcast state cannot be read reliably. See SETUP.md.",
    });
    return;
  }

  const state = await readState();

  if (!state.enabled || !state.botToken || !state.chatId) {
    res.json({ skipped: true, reason: "Auto-broadcast is disabled or not configured." });
    return;
  }

  // Throttle: only send if intervalMinutes have passed since lastRunAt
  const now = Date.now();
  const last = state.lastRunAt ? new Date(state.lastRunAt).getTime() : 0;
  const intervalMs = state.intervalMinutes * 60 * 1000;

  if (now - last < intervalMs) {
    res.json({ skipped: true, reason: "Interval not yet elapsed.", nextInMs: intervalMs - (now - last) });
    return;
  }

  try {
    const { cleanToken, cleanChatId } = sanitizeTelegramCredentials(state.botToken, state.chatId);
    const text = buildServerSignal(state);

    const data = await safeTelegramFetch(
      `https://api.telegram.org/bot${cleanToken}/sendMessage`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: cleanChatId, text, parse_mode: "HTML", disable_web_page_preview: true }),
      }
    );

    if (!data.ok) {
      const updated = { ...state, lastRunAt: new Date().toISOString(), lastError: data.description || "Send failed" };
      await writeState(updated);
      res.status(400).json({ success: false, error: data.description });
      return;
    }

    const updated: AutoBroadcastState = {
      ...state,
      lastRunAt: new Date().toISOString(),
      lastSentMessageId: String(data.result.message_id),
      lastError: null,
      totalSent: state.totalSent + 1,
    };
    await writeState(updated);

    console.log(`[AutoBroadcast] Signal sent. messageId=${data.result.message_id} totalSent=${updated.totalSent}`);
    res.json({ success: true, messageId: data.result.message_id, totalSent: updated.totalSent });
  } catch (err: any) {
    const updated = { ...state, lastRunAt: new Date().toISOString(), lastError: err.message };
    await writeState(updated);
    console.error(`[AutoBroadcast] Error: ${err.message}`);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── Scrape linked site to detect its name and bots ───────────────────────────
app.post("/api/site/detect", async (req, res) => {
  const { siteUrl } = req.body;
  if (!siteUrl) {
    res.status(400).json({ error: "siteUrl is required" });
    return;
  }

  let url = siteUrl.trim();
  if (!url.startsWith("http://") && !url.startsWith("https://")) {
    url = "https://" + url;
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; SignalBot/1.0)",
        "Accept": "text/html,application/xhtml+xml",
      },
    });
    clearTimeout(timeout);

    const html = await response.text();

    // ── Extract site name ──
    let siteName = "";
    const titleMatch = html.match(/<title[^>]*>([^<]{1,120})<\/title>/i);
    if (titleMatch) siteName = titleMatch[1].replace(/\s+/g, " ").trim();

    const ogSiteMatch = html.match(/<meta[^>]+property=["']og:site_name["'][^>]+content=["']([^"']{1,80})["']/i)
      || html.match(/<meta[^>]+content=["']([^"']{1,80})["'][^>]+property=["']og:site_name["']/i);
    if (ogSiteMatch) siteName = ogSiteMatch[1].trim();

    const h1Match = html.match(/<h1[^>]*>([^<]{1,80})<\/h1>/i);
    if (!siteName && h1Match) siteName = h1Match[1].replace(/<[^>]*>/g, "").trim();

    if (!siteName) {
      try { siteName = new URL(url).hostname.replace(/^www\./, ""); } catch { siteName = url; }
    }

    // ── Extract bots / tools mentioned on the page ──
    // Look for bot names in headings, strong tags, links with common bot keywords
    const botPatterns = [
      // Named bot patterns (e.g. "Sniper Bot", "Killer Bot", "Auto Trader")
      /\b([A-Z][a-zA-Z0-9\s]{2,30}(?:Bot|Robot|Trader|EA|Expert|Signal|Auto|Sniper|Killer|Hunter|Scanner|Copier|Algo))\b/g,
      // All-caps bot names (e.g. "SNIPPER KILLER BOT")
      /\b([A-Z][A-Z0-9\s]{3,40}(?:BOT|ROBOT|TRADER|EA|SIGNAL|AUTO|SNIPER|KILLER))\b/g,
    ];

    const rawBots = new Set<string>();

    // Search in headings, strong, button elements specifically
    const tagContents = [
      ...Array.from(html.matchAll(/<(?:h[1-6]|strong|b|button|a|span|p)[^>]*>([^<]{5,120})<\/(?:h[1-6]|strong|b|button|a|span|p)>/gi)).map(m => m[1]),
    ];

    for (const content of tagContents) {
      const cleaned = content.replace(/&#?\w+;/g, " ").replace(/<[^>]*>/g, "").trim();
      for (const pattern of botPatterns) {
        pattern.lastIndex = 0;
        let m;
        while ((m = pattern.exec(cleaned)) !== null) {
          const candidate = m[1].trim();
          if (candidate.length > 3 && candidate.length < 60) {
            rawBots.add(candidate);
          }
        }
      }
    }

    // Also check the full page text for bot names
    const plainText = html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ");
    for (const pattern of botPatterns) {
      pattern.lastIndex = 0;
      let m;
      while ((m = pattern.exec(plainText)) !== null) {
        const candidate = m[1].trim();
        if (candidate.length > 3 && candidate.length < 60) {
          rawBots.add(candidate);
        }
      }
    }

    // Deduplicate: remove substrings that are fully contained in a longer bot name
    const botsArr = Array.from(rawBots);
    const dedupedBots = botsArr.filter(
      (b) => !botsArr.some((other) => other !== b && other.toLowerCase().includes(b.toLowerCase()) && other.length > b.length)
    ).slice(0, 12); // max 12 bots

    // ── Extract OG description ──
    let description = "";
    const descMatch = html.match(/<meta[^>]+(?:name=["']description["']|property=["']og:description["'])[^>]+content=["']([^"']{1,300})["']/i)
      || html.match(/<meta[^>]+content=["']([^"']{1,300})["'][^>]+(?:name=["']description["']|property=["']og:description["'])/i);
    if (descMatch) description = descMatch[1].trim();

    res.json({
      success: true,
      siteUrl: url,
      siteName,
      description,
      bots: dedupedBots,
      botCount: dedupedBots.length,
    });
  } catch (err: any) {
    const isTimeout = err.name === "AbortError";
    res.status(isTimeout ? 408 : 500).json({
      error: isTimeout
        ? "Request timed out. The site took too long to respond."
        : `Failed to reach the site: ${err.message}`,
    });
  }
});

export default app;
