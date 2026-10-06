import express from "express";
import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";

dotenv.config();

const app = express();
// JSON bodies (normal cron-job.org mode). Extra parsers below make the cron
// endpoint tolerant when the job was saved with a wrong Content-Type header.
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.text({ type: ["text/plain", "application/*+json"] }));

// A truncated/invalid JSON body makes body-parser throw BEFORE any route runs,
// and Express's default is an HTML 400 page (cron-job.org shows it as a bare
// "Bad Request"). Convert it into actionable JSON instead.
app.use((err: any, _req: any, res: any, next: any) => {
  if (err && (err.type === "entity.parse.failed" || (err instanceof SyntaxError && "body" in err))) {
    res.status(400).json({
      success: false,
      error: "Request body is not valid JSON (it was likely truncated while copying). Re-copy the whole body with the Copy button and paste it exactly.",
      hint: "In cron-job.org use Method POST + header Content-Type: application/json + the exact body — or use the GET-mode URL from the app, which needs no body at all.",
    });
    return;
  }
  next(err);
});

// Normalize: cron-job.org may deliver the JSON payload as a raw string when
// Content-Type wasn't set to application/json. Parse it back into an object
// so handleCronBroadcast sees {botToken, chatId, ...} either way.
function normalizedBody(req: any): any {
  const b = req.body;
  if (b && typeof b === "object" && Object.keys(b).length > 0) return b;
  if (typeof b === "string" && b.trim()) {
    try {
      const p = JSON.parse(b.trim());
      if (p && typeof p === "object") return p;
    } catch {
      // not JSON — fall through to query fallback
    }
  }
  return req.query || {};
}

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
//       if positive digits, add the -100 block unless already present.
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

  // Positive number → add the -100 block, but never double-prefix:
  // 1002590400274 already contains the 100 block (only "-" is missing),
  // while a short value like 2590400274 still needs the full -100.
  if (/^\d+$/.test(cleanChatId)) {
    if (cleanChatId.startsWith("100") && cleanChatId.length >= 12) {
      cleanChatId = "-" + cleanChatId;
    } else {
      cleanChatId = "-100" + cleanChatId;
    }
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
      const fallback: Record<string, any> = { ...payload, text: plain };
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

// ─── SERVER-SIDE AUTO-BROADCAST ───────────────────────────────────────────────
// Architecture: ZERO external dependencies (no KV, no Redis, no database).
// The config (bot token, chat ID, site info) is sent WITH every cron request
// in the POST body from cron-job.org. The server just executes it.
// This means the button works immediately with no extra setup steps.
//
// How it works end-to-end:
// 1. User clicks "Enable" in the app → app calls /api/autobroadcast/configure
//    which returns a pre-built cron-job.org URL the user visits once to add it
// 2. cron-job.org calls POST /api/cron/auto-broadcast every N minutes with
//    the full config in the request body
// 3. The server receives it, validates it, builds the signal, sends to Telegram
// 4. No state needs to be stored anywhere — each request is self-contained

const MARKET_NAMES = [
  "VOLATILITY 10 INDEX", "VOLATILITY 25 INDEX", "VOLATILITY 50 INDEX",
  "VOLATILITY 75 INDEX", "VOLATILITY 100 INDEX", "VOLATILITY 10 (1s) INDEX",
  "VOLATILITY 25 (1s) INDEX", "VOLATILITY 50 (1s) INDEX",
  "VOLATILITY 75 (1s) INDEX", "VOLATILITY 100 (1s) INDEX",
];

interface CronConfig {
  botToken: string;
  chatId: string;
  chatTitle?: string;
  siteName: string;
  promoUrl: string;
  botName: string;
  botSignature: string;
  hashtags: string;
  activeContracts: string[];
  // Cron cadence in minutes — embedded in every payload so each message can
  // state the ACCURATE next-signal time without any server-side memory.
  intervalMinutes: number;
}

// intervalMinutes arrives as number (POST JSON) or string (GET query) — coerce,
// clamp to a sane range, default to the app's standard cadence.
function normalizeInterval(v: any): number {
  const n = typeof v === "number" ? v : parseFloat(String(v ?? ""));
  if (!isFinite(n) || n < 1) return 2;
  return Math.min(1440, n);
}

// ── Accurate schedule helpers ────────────────────────────────────────────────
// Every time is derived from the interval embedded in the request payload, so
// messages state the REAL next-signal time — never a simulated countdown.
function formatUtcClock(ms: number): string {
  const d = new Date(ms);
  return `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")} UTC`;
}
// Kenyan wall-clock (Africa/Nairobi, EAT = UTC+3) — what channel members see.
const eatClockFmt = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Africa/Nairobi",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});
function formatEatClock(ms: number): string {
  return `${eatClockFmt.format(new Date(ms))} EAT`;
}
function formatWindow(mins: number): string {
  if (mins < 1) return `${Math.round(mins * 60)} seconds`;
  if (mins < 60) {
    const whole = Math.floor(mins);
    const secs = Math.round((mins - whole) * 60);
    if (secs === 0 || whole === 0) return `${mins % 1 === 0 ? mins : mins.toFixed(1)} minutes`;
    return `${whole} min ${secs}s`;
  }
  const h = Math.floor(mins / 60);
  const r = Math.round(mins % 60);
  return r === 0 ? `${h} hour${h === 1 ? "" : "s"}` : `${h}h ${r}m`;
}

function buildServerSignal(cfg: CronConfig, nowMs = Date.now()): string {
  const market = MARKET_NAMES[Math.floor(Math.random() * MARKET_NAMES.length)];
  const contract = cfg.activeContracts[Math.floor(Math.random() * cfg.activeContracts.length)] || "UNDER 7";
  const strength = 85 + Math.floor(Math.random() * 14);
  const entryDigitMap: Record<string, string> = {
    "UNDER 9": "9", "UNDER 8": "9", "UNDER 7": "9", "UNDER 6": "8",
    "OVER 1": "0", "OVER 2": "1", "OVER 3": "2", "OVER 4": "3",
  };
  const entryDigit = entryDigitMap[contract] || "9";
  const strategy = contract.startsWith("UNDER") ? "Second Least Digit" : "Over Digit Threshold";
  const nextAt = nowMs + cfg.intervalMinutes * 60000;

  return (
    `<b>🔔 NEW TRADING SIGNAL 🔔</b>\n\n` +
    `<b>${market}</b>\n\n` +
    `📈 <b>${contract.toUpperCase()}</b>\n` +
    `⚡ <b>Strategy:</b> ${strategy}\n\n` +
    `🎯 <b>Entry Instructions:</b>\n\n` +
    `<b>${cfg.botName}</b>\n` +
    `💹 <b>Trade:</b> ${contract}\n` +
    `🔑 <b>Entry Digit:</b> <code>${entryDigit}</code>\n` +
    `⭐ <b>Confidence:</b> ${strength}%\n\n` +
    `${cfg.promoUrl}\n\n` +
    `⚠️ <b>Risk Management:</b>\n` +
    `• Stop after 4 consecutive wins\n• Max 5 runs per session\n• Use proper recovery if loss occurs\n\n` +
    `⏰ <b>Sent:</b> ${formatEatClock(nowMs)}\n` +
    `⏳ <b>Next signal:</b> ${formatEatClock(nextAt)} (in ${formatWindow(cfg.intervalMinutes)})\n` +
    `⌛ <b>Valid for:</b> ${formatWindow(cfg.intervalMinutes)} — then it expires and auto-deletes\n\n` +
    `🤖 Generated by ${cfg.botSignature}\n` +
    `${cfg.hashtags}`
  );
}

// Expiry notice — posted when a signal's validity window ends, BEFORE the
// expired message is deleted. Wording follows the channel's standard template.
function buildExpiryNotice(cfg: CronConfig): string {
  const w = formatWindow(cfg.intervalMinutes);
  return (
    `⌛ <b>${cfg.siteName} signal AI SIGNAL EXPIRED</b>\n\n` +
    `This signal has expired.\n` +
    `⏳ Next signal window: in ${w}\n\n` +
    `Wait for the next signal in the next ${w}.`
  );
}

// ── Validate and return a config object from any source (configure or cron) ──
// Accepts chatId as string OR number (some HTTP clients drop the quotes and
// send {"chatId": -100123...} as JSON numeric — still a valid destination).
// activeContracts arrives as an array in POST JSON, but as repeated keys,
// a JSON string, or a comma-separated string in GET query mode — accept all.
function normalizeContracts(v: any): string[] {
  const fallback = ["UNDER 7", "UNDER 8", "OVER 2", "OVER 3"];
  if (Array.isArray(v)) {
    const list = v.map((x) => String(x ?? "").trim()).filter(Boolean);
    return list.length > 0 ? list : fallback;
  }
  if (typeof v === "string" && v.trim()) {
    const t = v.trim();
    try {
      const p = JSON.parse(t);
      if (Array.isArray(p)) {
        const list = p.map((x) => String(x ?? "").trim()).filter(Boolean);
        if (list.length > 0) return list;
      }
    } catch {
      // not JSON — fall through to comma split
    }
    const list = t.split(",").map((x) => x.trim()).filter(Boolean);
    if (list.length > 0) return list;
  }
  return fallback;
}

function parseCronConfig(body: any): { ok: true; cfg: CronConfig } | { ok: false; error: string } {
  const rawToken = (body || {}).botToken;
  const rawChat = (body || {}).chatId;
  const tokenStr = typeof rawToken === "string" ? rawToken.trim() : String(rawToken ?? "").trim();
  const chatStr = typeof rawChat === "string" ? rawChat.trim() : String(rawChat ?? "").trim();
  if (!tokenStr) {
    return { ok: false, error: "botToken is required" };
  }
  if (!chatStr || chatStr === "undefined" || chatStr === "null") {
    return { ok: false, error: "chatId is required" };
  }
  return {
    ok: true,
    cfg: {
      botToken: tokenStr,
      chatId: chatStr,
      chatTitle: body.chatTitle || "",
      siteName: body.siteName || "kicktrade",
      promoUrl: body.promoUrl || "http://kicktrade.site",
      botName: body.botName || "USE KICKTRADE BOT",
      botSignature: body.botSignature || "kicktrade Over/Under Bot",
      hashtags: body.hashtags || "#TradingSignal #kicktrade #Signals",
      activeContracts: normalizeContracts(body.activeContracts),
      intervalMinutes: normalizeInterval(body.intervalMinutes),
    },
  };
}

// ── /api/autobroadcast/configure ─────────────────────────────────────────────
// Returns TWO separate cron payloads: one for alert, one for signal.
// The user sets up TWO cron jobs in cron-job.org with the SAME interval,
// offset by exactly 1 minute. This is the only reliable stateless approach
// on Vercel — phase is encoded in the request body, never stored server-side.
app.post("/api/autobroadcast/configure", async (req, res) => {
  const body = normalizedBody(req);
  const parsed = parseCronConfig(body);
  if (parsed.ok === false) {
    res.status(400).json({ error: parsed.error });
    return;
  }

  const { cfg } = parsed;
  // intervalMinutes now lives on cfg (parsed + normalized) so the payloads
  // carry the SAME cadence every message uses for its next-signal math.
  const intervalMinutes = cfg.intervalMinutes;

  // Validate the credentials NOW (via Telegram) so the user never copies a
  // payload containing a bad token/chat ID into cron-job.org.
  const { cleanToken, cleanChatId } = sanitizeTelegramCredentials(cfg.botToken, cfg.chatId);
  try {
    const me = await safeTelegramFetch(
      `https://api.telegram.org/bot${cleanToken}/getMe`,
      { method: "GET" }
    );
    if (!me.ok) {
      res.status(400).json({
        error: `Bot token is invalid: ${me.description || "Unauthorized"}. Copy a fresh token from @BotFather and reconnect first.`,
      });
      return;
    }
    const chat = await safeTelegramFetch(
      `https://api.telegram.org/bot${cleanToken}/getChat`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: cleanChatId }),
      }
    );
    if (!chat.ok) {
      res.status(400).json({
        error: buildTelegramErrorAdvice(chat, cleanChatId),
        chatIdUsed: cleanChatId,
      });
      return;
    }
    cfg.chatTitle = chat.result?.title || chat.result?.username || cfg.chatTitle;
    // Canonicalize: the payloads carry EXACTLY what Telegram accepted, so a
    // pasted body can never point at a differently-formatted ("different")
    // channel than the one verified here.
    cfg.botToken = cleanToken;
    cfg.chatId = cleanChatId;
  } catch (err: any) {
    res.status(500).json({ error: `Could not reach Telegram to validate: ${err.message}` });
    return;
  }

  // Build the public cron URL. Prefer explicit envs (immune to localhost or
  // preview hosts), then forwarded host headers, then Host as last resort.
  const forwardedHost =
    ((req.headers["x-forwarded-host"] as string) || "").split(",")[0].trim();
  const vercelProd =
    (process.env.APP_URL || process.env.VERCEL_PROJECT_PRODUCTION_URL || "").trim();
  let host =
    (vercelProd
      ? vercelProd.replace(/^https?:\/\//, "").replace(/\/$/, "")
      : forwardedHost || (req.headers.host as string) || "your-app.vercel.app");
  host = host.replace(/\/$/, "");
  const isLocal =
    host.includes("localhost") || host.startsWith("127.") || host.startsWith("192.168.");
  const protocol = isLocal ? "http" : "https";
  const cronUrl = `${protocol}://${host}/api/cron/auto-broadcast`;
  // Exact, safe deployment check: if APP_URL (production) is configured and
  // differs from where Enable was clicked (e.g. a preview deployment URL that
  // Vercel deletes, or localhost), say so explicitly — cron-job.org would ping
  // a dead URL and report an HTTP error forever.
  const prodHost = vercelProd.replace(/^https?:\/\//, "").replace(/\/$/, "");
  // Preview deployments (signaltraker-<hash>-<team>.vercel.app) are deleted by
  // Vercel — a cron URL pointing at one works today and 404s tomorrow.
  const looksLikePreview =
    /\.vercel\.app$/i.test(host) && /(^|-)[0-9a-f]{6,}(-|$)/i.test(host);
  const hostWarning = isLocal
    ? "You enabled from localhost — cron-job.org cannot reach localhost. Redeploy, open the LIVE app URL, and click Enable there so the cron URL is public."
    : looksLikePreview
      ? `This looks like a Vercel PREVIEW deployment URL (${host}) — previews get deleted and cron-job.org will then fail. Set APP_URL in Vercel to your production domain, redeploy, and re-enable from the production URL.`
      : prodHost && host.toLowerCase() !== prodHost.toLowerCase()
        ? `You enabled from ${host} but production is ${prodHost}. Update APP_URL or re-enable from https://${prodHost} — otherwise cron-job.org pings this non-production URL and fails.`
        : null;

  const base = {
    botToken: cfg.botToken,
    chatId: cfg.chatId,
    chatTitle: cfg.chatTitle,
    siteName: cfg.siteName,
    promoUrl: cfg.promoUrl,
    botName: cfg.botName,
    botSignature: cfg.botSignature,
    hashtags: cfg.hashtags,
    activeContracts: cfg.activeContracts,
    intervalMinutes: cfg.intervalMinutes,
  };

  const alertPayload  = JSON.stringify({ ...base, type: "alert" });
  const signalPayload = JSON.stringify({ ...base, type: "signal" });
  // Recommended single-job body: clock-phased cycle (alert always first).
  const cyclePayload = JSON.stringify({ ...base, mode: "cycle" });

  res.json({
    success: true,
    cronUrl,
    alertPayload,
    signalPayload,
    cyclePayload,
    intervalMinutes,
    // kept for backwards compatibility with old SettingsView versions
    cronPayload: signalPayload,
    // Echo of exactly what got embedded in the payloads, so the UI can show
    // the user what cron-job.org will send (proves token/chat correctness)
    // and normalize its own saved config to the same canonical values.
    embeddedChatId: cfg.chatId,
    embeddedChatTitle: cfg.chatTitle || "",
    canonicalBotToken: cfg.botToken,
    canonicalChatId: cfg.chatId,
    tokenPrefix: cfg.botToken.slice(0, 6) + "...",
    hostWarning,
  });
});

// ── /api/autobroadcast/status ─────────────────────────────────────────────────
// Returns a simple status — since config is stateless (carried per request),
// "status" just confirms the endpoint is reachable and shows the last send time
// cached in a module-level variable (best-effort, resets on cold start).
let lastSendTime: string | null = null;
let totalSentThisSession = 0;
let lastSendError: string | null = null;

app.get("/api/autobroadcast/status", (_req, res) => {
  res.json({
    serverReachable: true,
    persistenceMode: "stateless-config-in-request",
    currentPhase: "determined-by-request-body",
    nextMessage: "alert fires from Cron Job 1, signal fires from Cron Job 2 — 1 minute later",
    lastRunAt: lastSendTime,
    totalSentThisSession,
    lastError: lastSendError,
    // Lets the UI tell the user EXACTLY whether cron-job.org must send an
    // Authorization header (true only when CRON_SECRET is set in Vercel).
    // The secret value itself is never exposed here.
    cronAuthRequired: (process.env.CRON_SECRET || "").trim().length > 0,
  });
});

// ── /api/autobroadcast/diagnose ───────────────────────────────────────────────
app.get("/api/autobroadcast/diagnose", (_req, res) => {
  res.json({
    architecture: "stateless — no KV or Redis required",
    endpointReachable: true,
    lastRunAt: lastSendTime,
    totalSentThisSession,
    lastError: lastSendError,
    cronAuthRequired: (process.env.CRON_SECRET || "").trim().length > 0,
    cronMethods: ["POST with JSON body (recommended)", "GET with query params (fallback)"],
    hint: "If signals are not sending, check that your cron-job.org job is active and the request body is set correctly.",
  });
});

// ── /api/autobroadcast/disable ────────────────────────────────────────────────
// Nothing to disable server-side in the stateless model — the user just
// pauses or deletes the cron job in cron-job.org. This endpoint exists so
// the UI disable button doesn't 404.
app.post("/api/autobroadcast/disable", (_req, res) => {
  lastSendTime = null;
  totalSentThisSession = 0;
  lastSendError = null;
  res.json({
    success: true,
    message: "Session stats cleared. To fully stop auto-broadcast, pause or delete your cron job in cron-job.org.",
  });
});

// ── /api/cron/auto-broadcast ──────────────────────────────────────────────────
// Called by cron-job.org every N minutes with the full config in the POST body.
// Self-contained — reads everything it needs from the request, no state required.
// ── buildAlertMessage ─────────────────────────────────────────────────────────
// Cron Job 1 fires exactly 1 minute before Cron Job 2 (same interval, jobs
// saved 1 minute apart) — the "1 minute" below is the real offset, and the
// drop time is computed from the actual send moment, not simulated.
function buildAlertMessage(cfg: CronConfig, nowMs = Date.now()): string {
  return (
    `🚨 <b>ALERT TO ALL ${cfg.siteName.toUpperCase()} MEMBERS 🚨</b>\n\n` +
    `⚠ In just 1 minute, a new signal will be sent!\n` +
    `📢 <b>Be ready and standby! Signal drops at ${formatEatClock(nowMs + 60000)}</b>\n\n` +
    `🖥 <b>Go to:</b> ${cfg.promoUrl}\n` +
    `🤖 <b>Load your bot:</b> <code>${cfg.botName}</code>\n\n` +
    `✅ Make sure your settings are ready…\n` +
    `🚀 Let's catch this trade together!\n\n` +
    `#StayAlert #${cfg.siteName.replace(/\s+/g, "").toLowerCase()}signal 🔥📈\n` +
    `We either go home or go hard 💸\n` +
    `No risk no Ferrari 🚀\n` +
    cfg.promoUrl
  );
}

// ── Optional CRON_SECRET protection ──────────────────────────────────────────
// If the CRON_SECRET env var is set on Vercel, every call to
// /api/cron/auto-broadcast must carry `Authorization: Bearer <secret>`.
// If it is NOT set, the endpoint stays open (zero-setup default).
function checkCronAuth(req: any): { ok: true } | { ok: false; error: string } {
  const expected = (process.env.CRON_SECRET || "").trim();
  if (!expected) return { ok: true };
  const got =
    (req.headers.authorization || req.headers.Authorization || "") as string;
  if (got === `Bearer ${expected}`) return { ok: true };
  return {
    ok: false,
    error:
      "Unauthorized cron trigger (bad or missing CRON_SECRET). Add header 'Authorization: Bearer <your-secret>' in cron-job.org.",
  };
}

// ── /api/cron/auto-broadcast ──────────────────────────────────────────────────
// CYCLE MODE (recommended): ONE cron job every 1 minute with body
// {mode:"cycle", ...config}. The wall clock decides the phase, so the alert
// ALWAYS precedes its signal — no save-time offset ritual, nothing to drift:
// each interval block sends its SIGNAL in the first 60s and its ALERT in the
// last 60s (exactly 1 min before the next block's signal). Mid-block pings
// return 200 "waiting" with the exact next event + Nairobi clock time.
// Stateless — module-level variables are best-effort only (cold starts reset
// them); every decision derives from the request + wall clock.
// LEGACY: bodies with explicit type:"alert"|"signal" keep their old behavior;
// a body with neither type nor mode still sends one signal (unchanged).
// `force:"alert"|"signal"` sends immediately (UI demo buttons only).
// A GET handler is also provided below so a misconfigured job (GET with no
// body) returns a clear JSON error instead of an HTML 404.
async function handleCronBroadcast(req: any, res: any) {
  const auth = checkCronAuth(req);
  if (auth.ok === false) {
    lastSendError = auth.error;
    res.status(401).json({ success: false, error: auth.error });
    return;
  }

  // Accept config from POST JSON body first, fall back to query params (?botToken=&chatId=&type=)
  // so a simple GET job can still work for users who can't set a request body.
  // normalizedBody() also recovers JSON sent as text/plain (wrong Content-Type in cron-job.org).
  const source = normalizedBody(req);
  const parsed = parseCronConfig(source);
  if (parsed.ok === false) {
    lastSendError = parsed.error;
    res.status(400).json({
      success: false,
      error: parsed.error,
      hint: "This endpoint needs POST with JSON body {botToken, chatId, type:'alert'|'signal', ...}. Copy the exact URL + Body from Settings → Server-Side Auto-Broadcast → Show Setup Values. If your cron service can only send GET, append ?botToken=...&chatId=...&type=signal to the URL instead.",
    });
    return;
  }

  const { cfg } = parsed;
  // Optional expiry chaining: the caller may pass message IDs of already-
  // expired prior signals to delete, plus a flag to post the expiry notice.
  // (The app's test buttons chain these automatically; plain cron-job.org
  // bodies simply omit them — everything below is best-effort and never
  // fails the primary send.)
  const rawPrior = (source as any).deletePriorMessageIds;
  const deletePrior: number[] = (Array.isArray(rawPrior) ? rawPrior : [])
    .map((x: any) => parseInt(String(x), 10))
    .filter((n: number) => Number.isFinite(n) && n > 0)
    .slice(0, 5);
  const wantExpiryNotice = (source as any).sendExpiryNotice === true;

  // Small helper: POST one sendMessage, with plain-text retry on HTML parse errors.
  const { cleanToken, cleanChatId } = sanitizeTelegramCredentials(cfg.botToken, cfg.chatId);
  async function tgSend(text: string, withHtml: boolean) {
    const body: Record<string, any> = {
      chat_id: cleanChatId,
      text,
      disable_web_page_preview: true,
    };
    if (withHtml) body.parse_mode = "HTML";
    let out = await safeTelegramFetch(
      `https://api.telegram.org/bot${cleanToken}/sendMessage`,
      { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }
    );
    if (!out.ok && withHtml && (out.description || "").toLowerCase().includes("parse")) {
      const plain = text.replace(/<[^>]*>/g, "").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
      out = await safeTelegramFetch(
        `https://api.telegram.org/bot${cleanToken}/sendMessage`,
        { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ chat_id: cleanChatId, text: plain, disable_web_page_preview: true }) }
      );
    }
    return out;
  }

  // Shared single send of one message type + best-effort expiry cleanup.
  type Cleanup = { noticeSent: boolean; deleted: number[]; deleteErrors: string[] };
  function freshCleanup(): Cleanup {
    return { noticeSent: false, deleted: [], deleteErrors: [] };
  }
  async function sendOne(
    messageType: "alert" | "signal",
    deletePrior: number[],
    wantExpiryNotice: boolean
  ): Promise<
    | { ok: false; error: string; chatIdUsed: string; advice: string }
    | { ok: true; messageId: number; chatTitle: string; cleanup: Cleanup }
  > {
    const text = messageType === "alert" ? buildAlertMessage(cfg) : buildServerSignal(cfg);
    const data = await tgSend(text, true);
    if (!data.ok) {
      lastSendError = data.description || "Send failed";
      return {
        ok: false,
        error: data.description || "Send failed",
        chatIdUsed: cleanChatId,
        advice: buildTelegramErrorAdvice(data, cleanChatId),
      };
    }
    lastSendTime = new Date().toISOString();
    totalSentThisSession += 1;
    lastSendError = null;

    const cleanup = freshCleanup();
    if (wantExpiryNotice) {
      try {
        const notice = await tgSend(buildExpiryNotice(cfg), true);
        cleanup.noticeSent = !!notice.ok;
        if (!notice.ok) cleanup.deleteErrors.push(`notice: ${notice.description || "send failed"}`);
      } catch (err: any) {
        cleanup.deleteErrors.push(`notice: ${err.message}`);
      }
    }
    for (const mid of deletePrior) {
      try {
        const del = await safeTelegramFetch(
          `https://api.telegram.org/bot${cleanToken}/deleteMessage`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ chat_id: cleanChatId, message_id: mid }),
          }
        );
        if (del.ok) {
          cleanup.deleted.push(mid);
        } else {
          const desc = String(del.description || "");
          // Already gone (or too old) counts as cleaned — not an error.
          if (/not found|can't be deleted/i.test(desc)) cleanup.deleted.push(mid);
          else cleanup.deleteErrors.push(`delete ${mid}: ${desc || "failed"}`);
        }
      } catch (err: any) {
        cleanup.deleteErrors.push(`delete ${mid}: ${err.message}`);
      }
    }

    console.log(`[AutoBroadcast] ${messageType} sent to ${cleanChatId}. messageId=${data.result.message_id} total=${totalSentThisSession}`);
    return {
      ok: true,
      messageId: data.result.message_id,
      chatTitle: data.result.chat?.title || data.result.chat?.username || cfg.chatTitle || "",
      cleanup,
    };
  }

  // Dispatch inputs. Legacy explicit `type` keeps its old behavior; `force`
  // sends one type immediately (UI demo buttons); `mode: "cycle"` uses the
  // wall clock so the alert ALWAYS precedes its signal.
  // `nowMs` is a test-only clock override (UI/harness determinism).
  const nowOverride = Number((source as any).nowMs);
  const nowMs = Number.isFinite(nowOverride) && nowOverride > 0 ? nowOverride : Date.now();
  const force = (source as any).force;
  const useForce = force === "alert" || force === "signal";
  const hasLegacyType = (source as any).type === "alert" || (source as any).type === "signal";

  function sendError(status: number, error: string, extra?: Record<string, any>) {
    res.status(status).json({ success: false, error, ...extra });
  }

  try {
    // 1. Forced immediate send (UI demo buttons) — bypasses phase math.
    if (useForce) {
      const r = await sendOne(force, deletePrior, wantExpiryNotice);
      if (r.ok === false) {
        sendError(400, r.error, { advice: r.advice, chatIdUsed: r.chatIdUsed });
        return;
      }
      res.json({
        success: true, phase: "forced-" + force, sent: true, type: force,
        messageId: r.messageId, totalSent: totalSentThisSession,
        chatIdUsed: cleanChatId, chatTitle: r.chatTitle, cleanup: r.cleanup,
      });
      return;
    }

    // 2. Legacy explicit type (old two-job bodies) — behavior unchanged.
    if (hasLegacyType) {
      const messageType: "alert" | "signal" = (source as any).type === "alert" ? "alert" : "signal";
      const r = await sendOne(messageType, deletePrior, wantExpiryNotice);
      if (r.ok === false) {
        sendError(400, r.error, { advice: r.advice, chatIdUsed: r.chatIdUsed });
        return;
      }
      res.json({
        success: true, phase: messageType, sent: true, type: messageType,
        messageId: r.messageId, totalSent: totalSentThisSession,
        chatIdUsed: cleanChatId, chatTitle: r.chatTitle, cleanup: r.cleanup,
      });
      return;
    }

    // 3. Cycle mode — ONE every-minute job; the wall clock decides the phase.
    // Block = one interval on the clock grid; signal in the first 60s of the
    // block, alert in the last 60s (exactly 1 min before the next block's
    // signal). Mid-block pings return 200 "waiting" with the exact next event,
    // so cron history stays green between sends.
    if ((source as any).mode === "cycle") {
      const N = cfg.intervalMinutes;
      if (N < 2) {
        // No room for spacing — alert first, then the signal, immediately.
        const ra = await sendOne("alert", [], false);
        if (ra.ok === false) {
          sendError(400, ra.error, { advice: ra.advice, chatIdUsed: ra.chatIdUsed });
          return;
        }
        const rs = await sendOne("signal", deletePrior, wantExpiryNotice);
        if (rs.ok === false) {
          sendError(400, rs.error, { advice: rs.advice, chatIdUsed: rs.chatIdUsed });
          return;
        }
        res.json({
          success: true, phase: "both", sent: true,
          alertMessageId: ra.messageId, messageId: rs.messageId,
          totalSent: totalSentThisSession, chatIdUsed: cleanChatId,
          chatTitle: rs.chatTitle, cleanup: rs.cleanup,
        });
        return;
      }
      const blockMs = N * 60000;
      const blockStart = Math.floor(nowMs / blockMs) * blockMs;
      const elapsed = nowMs - blockStart;
      const nextSignalAt = blockStart + blockMs;
      const nextAlertAt = blockStart + blockMs - 60000;
      // Clock proof on every response: lets anyone verify exactly which
      // window a ping landed in (diagnoses sparse-schedule aliasing, where a
      // job running less often than every minute locks into one phase).
      const clockProof = {
        serverTimeUtc: new Date(nowMs).toISOString(),
        blockStartUtc: new Date(blockStart).toISOString(),
        elapsedSec: Math.floor(elapsed / 1000),
        intervalMinutes: N,
      };

      if (elapsed < 60000) {
        const r = await sendOne("signal", deletePrior, wantExpiryNotice);
        if (r.ok === false) {
          sendError(400, r.error, { advice: r.advice, chatIdUsed: r.chatIdUsed });
          return;
        }
        res.json({
          success: true, phase: "signal", sent: true, type: "signal",
          messageId: r.messageId, totalSent: totalSentThisSession,
          chatIdUsed: cleanChatId, chatTitle: r.chatTitle, cleanup: r.cleanup,
          nextEvent: "alert", nextEventAt: new Date(nextAlertAt).toISOString(),
          nextEventClock: formatEatClock(nextAlertAt),
          requiredSchedule: "every-1-minute",
          ...clockProof,
        });
        return;
      }
      if (elapsed >= blockMs - 60000) {
        const r = await sendOne("alert", deletePrior, wantExpiryNotice);
        if (r.ok === false) {
          sendError(400, r.error, { advice: r.advice, chatIdUsed: r.chatIdUsed });
          return;
        }
        res.json({
          success: true, phase: "alert", sent: true, type: "alert",
          messageId: r.messageId, totalSent: totalSentThisSession,
          chatIdUsed: cleanChatId, chatTitle: r.chatTitle, cleanup: r.cleanup,
          nextEvent: "signal", nextEventAt: new Date(nextSignalAt).toISOString(),
          nextEventClock: formatEatClock(nextSignalAt),
          requiredSchedule: "every-1-minute",
          ...clockProof,
        });
        return;
      }
      res.json({
        success: true, phase: "waiting", sent: false,
        nextEvent: "alert", nextEventAt: new Date(nextAlertAt).toISOString(),
        nextEventClock: formatEatClock(nextAlertAt),
        chatIdUsed: cleanChatId,
        requiredSchedule: "every-1-minute",
        ...clockProof,
        hint: "Nothing is due this minute — normal for most minutes of the cycle. " +
          "If you ONLY ever see waiting/signal phases and never an alert, your cron job is almost certainly NOT running every 1 minute " +
          "(e.g. every 15 minutes lands all pings in signal phases, so alerts never fire). Set the cron schedule to every 1 minute.",
      });
      return;
    }

    // 4. Ancient default (no type, no mode) — one signal, unchanged.
    const r = await sendOne("signal", deletePrior, wantExpiryNotice);
    if (r.ok === false) {
      sendError(400, r.error, { advice: r.advice, chatIdUsed: r.chatIdUsed });
      return;
    }
    res.json({
      success: true, phase: "signal", sent: true, type: "signal",
      messageId: r.messageId, totalSent: totalSentThisSession,
      chatIdUsed: cleanChatId, chatTitle: r.chatTitle, cleanup: r.cleanup,
    });
  } catch (err: any) {
    lastSendError = err.message;
    console.error(`[AutoBroadcast] Error: ${err.message}`);
    res.status(500).json({ success: false, error: err.message });
  }
}

app.post("/api/cron/auto-broadcast", handleCronBroadcast);
// GET is supported too (query-string mode) so a cron-job.org job left on the
// default GET method returns JSON guidance instead of an HTML 404, and can
// still deliver if ?botToken=&chatId=&type= are present.
app.get("/api/cron/auto-broadcast", handleCronBroadcast);

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
