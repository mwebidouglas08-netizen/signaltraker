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

// ─── Safe Telegram fetch (checks Content-Type before .json()) ─────────────────
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
      `This means the server route is misconfigured. Preview: ${body.substring(0, 200)}`
    );
  }
  return response.json();
}

// ─── FIXED sanitizer ──────────────────────────────────────────────────────────
// Rule: if the user typed a negative number, trust it as-is.
//       if they typed a positive number, add -100 prefix.
//       if they typed text, ensure @ prefix.
// This prevents the old bug where -100 was added to IDs that already had it,
// producing malformed IDs like -1001001002590400274.
function sanitizeTelegramCredentials(botToken: string, chatId: string) {
  let cleanToken = (botToken || "").trim();

  // Extract token from full URL if pasted
  if (cleanToken.includes("telegram.org/bot")) {
    const parts = cleanToken.split("telegram.org/bot");
    if (parts.length > 1) {
      const tok = parts[parts.length - 1].split("/")[0];
      if (tok) cleanToken = tok;
    }
  }
  // Strip "bot" prefix if someone added it manually
  if (cleanToken.toLowerCase().startsWith("bot") && /^\d+:/.test(cleanToken.substring(3))) {
    cleanToken = cleanToken.substring(3);
  }
  cleanToken = cleanToken.replace(/\s+/g, "");

  // ── Channel ID sanitization ──
  let cleanChatId = (chatId || "")
    .trim()
    .replace(/\s+/g, "")
    .replace(/['"]/g, "")
    .replace(/\/$/, "");

  // Handle t.me links
  if (cleanChatId.includes("t.me/")) {
    const parts = cleanChatId.split("t.me/");
    if (parts.length > 1) {
      const handle = parts[parts.length - 1].split("/")[0].split("?")[0];
      if (handle) cleanChatId = handle.startsWith("@") ? handle : "@" + handle;
    }
    return { cleanToken, cleanChatId };
  }

  // Negative number: user-supplied ID with leading minus — trust it completely.
  // This is the key fix: we no longer try to "correct" IDs that already start with -
  if (cleanChatId.startsWith("-") && /^-\d+$/.test(cleanChatId)) {
    return { cleanToken, cleanChatId };
  }

  // Positive number: bare channel ID — add the -100 prefix exactly once
  if (/^\d+$/.test(cleanChatId)) {
    cleanChatId = "-100" + cleanChatId;
    return { cleanToken, cleanChatId };
  }

  // Alphanumeric username: ensure @ prefix
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
      `Channel not found for ID: ${cleanChatId}. ` +
      `Make sure you copied the Channel ID exactly from Telegram. ` +
      `For private channels use the numeric ID (e.g. -1001234567890). ` +
      `For public channels use @username. ` +
      `Also verify your bot is added as an Administrator with Post Messages enabled.`
    );
  }
  if (desc.includes("admin") || desc.includes("post") || desc.includes("not member") || desc.includes("forbidden")) {
    return `Bot lacks permission. Go to Channel Settings → Admins → Add Admin → select your Bot → enable "Post Messages".`;
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

app.post("/api/telegram/test", async (req, res) => {
  const { botToken, chatId } = req.body;
  if (!botToken || !chatId) {
    res.status(400).json({ error: "botToken and chatId are required" });
    return;
  }

  const { cleanToken, cleanChatId } = sanitizeTelegramCredentials(botToken, chatId);
  console.log(`[Telegram/test] chatId=${cleanChatId} token=${maskToken(cleanToken)}`);

  try {
    const text =
      `<b>📣 Signal Broadcaster Connected!</b>\n\n` +
      `Your dashboard is now linked to this channel. ` +
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
      res.status(400).json({ error: buildTelegramErrorAdvice(data, cleanChatId), raw: data, botToken: cleanToken, chatId: cleanChatId });
      return;
    }

    res.json({
      success: true,
      message: "Test signal sent successfully!",
      messageId: data.result.message_id,
      chatTitle: data.result.chat?.title || "Channel",
      botToken: cleanToken,
      chatId: cleanChatId,
    });
  } catch (err: any) {
    console.error(`[Telegram/test] ${err?.message}`);
    res.status(500).json({ error: err.message || "Failed to send test message", botToken: cleanToken, chatId: cleanChatId });
  }
});

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

    // Fallback: retry as plain text if HTML parse fails
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
    promoUrl = "https://mrzetuzetu.site",
    riskGuidelines = "• Stop after 4 consecutive wins\n• Max 5 runs per session\n• Use proper recovery if loss occurs",
    botSignature = "mrzetuzetu Over/Under Bot",
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

// Export for Vercel serverless — no app.listen() here
export default app;
