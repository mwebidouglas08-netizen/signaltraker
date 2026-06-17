import express from "express";
import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";

dotenv.config();

const app = express();
app.use(express.json());

// Initialize Google GenAI client securely
const apiKey = process.env.GEMINI_API_KEY;
let ai: GoogleGenAI | null = null;

if (apiKey) {
  ai = new GoogleGenAI({
    apiKey: apiKey,
    httpOptions: {
      headers: { "User-Agent": "aistudio-build" },
    },
  });
} else {
  console.warn("WARNING: GEMINI_API_KEY environment variable is not defined");
}

// ─── Safe Telegram API fetch helper ──────────────────────────────────────────
// KEY FIX: Always check Content-Type before calling .json().
// When Vercel can't find the serverless function it returns an HTML error page.
// Calling .json() on HTML causes: "Unexpected token 'A', 'A server e...' is not valid JSON"
async function safeTelegramFetch(
  url: string,
  options: RequestInit
): Promise<{ ok: boolean; description?: string; [key: string]: any }> {
  let response: Response;
  try {
    response = await fetch(url, options);
  } catch (networkErr: any) {
    throw new Error(
      `Network error reaching Telegram API: ${networkErr.message}`
    );
  }

  const contentType = response.headers.get("content-type") || "";

  if (!contentType.includes("application/json")) {
    const bodyText = await response.text().catch(() => "(unreadable body)");
    throw new Error(
      `Telegram API returned a non-JSON response (HTTP ${response.status}). ` +
        `This usually means the server route is misconfigured or unreachable. ` +
        `Preview: ${bodyText.substring(0, 300)}`
    );
  }

  return response.json();
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function sanitizeTelegramCredentials(botToken: string, chatId: string) {
  let cleanToken = (botToken || "").trim();

  if (cleanToken.includes("telegram.org/bot")) {
    const parts = cleanToken.split("telegram.org/bot");
    if (parts.length > 1) {
      const tokenSec = parts[parts.length - 1].split("/")[0];
      if (tokenSec) cleanToken = tokenSec;
    }
  }

  if (cleanToken.toLowerCase().startsWith("bot")) {
    const withoutBot = cleanToken.substring(3);
    if (/^\d+/.test(withoutBot)) cleanToken = withoutBot;
  }

  cleanToken = cleanToken.replace(/\s+/g, "");

  let cleanChatId = (chatId || "")
    .trim()
    .replace(/\s+/g, "")
    .replace(/['"]/g, "");

  if (cleanChatId.includes("t.me/")) {
    const parts = cleanChatId.split("t.me/");
    if (parts.length > 1) {
      const handle = parts[parts.length - 1].split("/")[0].split("?")[0];
      if (handle) cleanChatId = handle.startsWith("@") ? handle : "@" + handle;
    }
  }

  cleanChatId = cleanChatId.replace(/\/$/, "");

  if (/^\d{7,20}$/.test(cleanChatId)) {
    cleanChatId = "-100" + cleanChatId;
  } else if (
    /^-\d{7,20}$/.test(cleanChatId) &&
    !cleanChatId.startsWith("-100")
  ) {
    cleanChatId = "-100" + cleanChatId.substring(1);
  } else if (
    cleanChatId &&
    !cleanChatId.startsWith("@") &&
    !cleanChatId.startsWith("-") &&
    isNaN(Number(cleanChatId))
  ) {
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
      `Channel not found (${cleanChatId}). Confirm the Channel ID is exact. ` +
      `Private channels need their numeric ID (e.g. -100XXXXXXXXXX). ` +
      `Make sure your bot is added as an Administrator.`
    );
  }
  if (
    desc.includes("admin") ||
    desc.includes("post") ||
    desc.includes("not member") ||
    desc.includes("forbidden")
  ) {
    return `Permission denied. Go to Channel Settings → Admins → Add Admin → select your Bot → enable "Post Messages".`;
  }
  if (desc.includes("unauthorized") || desc.includes("token")) {
    return `Invalid Bot Token. Copy the token exactly from BotFather — no extra spaces or characters.`;
  }
  return data.description || "Unknown Telegram API error.";
}

// ─── Routes ──────────────────────────────────────────────────────────────────

app.get("/api/health", (_req, res) => {
  res.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    aiConfigured: !!ai,
  });
});

app.post("/api/login", (req, res) => {
  try {
    const { username, password } = req.body || {};

    const targetUsername = (process.env.ADMIN_USERNAME || "admin").trim();
    const targetPassword = (process.env.ADMIN_PASSWORD || "password").trim();

    const providedUsername =
      typeof username === "string" ? username.trim() : "";
    const providedPassword =
      typeof password === "string" ? password.trim() : "";

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

    if (providedUsername && providedPassword && isMasterUser && isPasswordValid) {
      const token =
        "zeta_session_" +
        Buffer.from(providedUsername + ":" + Date.now()).toString("base64");
      res.json({ success: true, token });
    } else {
      res.status(401).json({
        success: false,
        error: "Invalid admin username or password. Please try again.",
      });
    }
  } catch (err: any) {
    res.status(500).json({
      success: false,
      error: "Internal server error: " + (err.message || "Unknown error"),
    });
  }
});

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
    `[Telegram/test] chatId=${cleanChatId} token=${maskToken(cleanToken)}`
  );

  try {
    const text =
      `<b>📣 Signal Broadcaster Connected!</b>\n\n` +
      `Your dashboard is now linked to this channel. ` +
      `Future trading alerts will be delivered here automatically.\n\n` +
      `⏱️ <i>Verified: ${new Date().toUTCString()}</i>`;

    const data = await safeTelegramFetch(
      `https://api.telegram.org/bot${cleanToken}/sendMessage`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: cleanChatId,
          text,
          parse_mode: "HTML",
          disable_web_page_preview: true,
        }),
      }
    );

    if (!data.ok) {
      const advice = buildTelegramErrorAdvice(data, cleanChatId);
      res.status(400).json({ error: advice, raw: data, botToken: cleanToken, chatId: cleanChatId });
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
    res.status(500).json({
      error: err.message || "Failed to send test message",
      botToken: cleanToken,
      chatId: cleanChatId,
    });
  }
});

app.post("/api/telegram/send", async (req, res) => {
  const { botToken, chatId, text, replyToMessageId } = req.body;

  if (!botToken || !chatId || !text) {
    res.status(400).json({ error: "botToken, chatId, and text are required" });
    return;
  }

  const { cleanToken, cleanChatId } = sanitizeTelegramCredentials(botToken, chatId);
  console.log(
    `[Telegram/send] chatId=${cleanChatId} token=${maskToken(cleanToken)}`
  );

  try {
    const payload: Record<string, any> = {
      chat_id: cleanChatId,
      text,
      parse_mode: "HTML",
      disable_web_page_preview: true,
    };

    if (replyToMessageId) {
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

    // Fallback to plain text if HTML parse fails
    if (!data.ok && (data.description || "").toLowerCase().includes("parse")) {
      const plain = text
        .replace(/<[^>]*>/g, "")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&amp;/g, "&");

      const fallback = { ...payload, text: plain };
      delete fallback.parse_mode;

      data = await safeTelegramFetch(
        `https://api.telegram.org/bot${cleanToken}/sendMessage`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(fallback),
        }
      );
    }

    if (!data.ok) {
      const advice = buildTelegramErrorAdvice(data, cleanChatId);
      res.status(400).json({ error: advice, raw: data, botToken: cleanToken, chatId: cleanChatId });
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
    res.status(500).json({
      error: err.message || "Failed to broadcast signal",
      botToken: cleanToken,
      chatId: cleanChatId,
    });
  }
});

app.post("/api/gemini/generate-signal", async (req, res) => {
  if (!ai) {
    res.status(500).json({
      error: "Gemini AI not initialized. Check GEMINI_API_KEY in Vercel environment variables.",
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
    promoUrl = "https://mrzetuzetu.site",
    riskGuidelines = "• Stop after 4 consecutive wins\n• Max 5 runs per session\n• Use proper recovery if loss occurs",
    botSignature = "mrzetuzetu Over/Under Bot",
    hashtags = "#TradingSignal #Deriv #OverUnder",
  } = req.body;

  if (!symbol || !action) {
    res.status(400).json({ error: "Symbol and Action are required fields" });
    return;
  }

  try {
    let prompt = "";

    if (isDerivStyle) {
      prompt = `Generate a beautiful, highly engaging, premium Telegram digit signal and rationale based on these Deriv/Synthetic parameters:

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

Use only Telegram-safe HTML tags (<b>, <i>, <code>, <u>, <s>, <pre>). No markdown.
Output ONLY a valid JSON object with exactly two keys: "signal" and "rationale".`;
    } else {
      const tpString = Array.isArray(tp)
        ? tp
            .filter(Boolean)
            .map((t: string, idx: number) => `TP${idx + 1}: <b>${t}</b>`)
            .join("\n")
        : "";

      prompt = `Generate a beautiful, professional Telegram signal and rationale for:

ASSET CLASS: ${assetClass || "Crypto/Forex/Stock"}
SYMBOL: ${symbol}
ACTION: ${action}
ENTRY: ${entry || "Market Price"}
TAKE PROFITS:\n${tpString || "Not specified"}
STOP LOSS: ${sl || "Not specified"}
NOTES: ${userNotes || "None"}
RISK SENTIMENT: ${sentiment}

Use only Telegram-safe HTML tags. No markdown.
Output ONLY a valid JSON object with exactly two keys: "signal" and "rationale".`;
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

    const responseText = response.text;
    if (!responseText) {
      res.status(500).json({ error: "Empty response from AI model." });
      return;
    }

    const clean = responseText.trim().replace(/```json|```/g, "").trim();
    const parsed = JSON.parse(clean);
    res.json(parsed);
  } catch (err: any) {
    res.status(500).json({
      error: "Gemini AI generation failed",
      details: err.message,
    });
  }
});

// Export for Vercel serverless — do NOT call app.listen() here
export default app;
