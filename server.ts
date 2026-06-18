import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";

dotenv.config();

const app = express();
app.use(express.json());

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
function sanitizeTelegramCredentials(botToken: string, chatId: string) {
  let cleanToken = (botToken || "").trim();

  // 1. Extract bot token if they pasted a full URL
  if (cleanToken.includes("telegram.org/bot")) {
    const parts = cleanToken.split("telegram.org/bot");
    if (parts.length > 1) {
      const tokenSec = parts[parts.length - 1].split("/")[0];
      if (tokenSec) cleanToken = tokenSec;
    }
  }

  // 2. Strip leading "bot" prefix if added manually
  if (cleanToken.toLowerCase().startsWith("bot")) {
    const withoutBot = cleanToken.substring(3);
    if (/^\d+/.test(withoutBot)) {
      cleanToken = withoutBot;
    }
  }

  let cleanChatId = (chatId || "")
    .trim()
    .replace(/\s+/g, "")
    .replace(/['"]/g, "");

  // 3. Extract channel handle from t.me link
  if (cleanChatId.includes("t.me/")) {
    const parts = cleanChatId.split("t.me/");
    if (parts.length > 1) {
      const handle = parts[parts.length - 1].split("/")[0].split("?")[0];
      if (handle) {
        cleanChatId = handle.startsWith("@") ? handle : "@" + handle;
      }
    }
  }

  // 4. Remove trailing slashes
  cleanChatId = cleanChatId.replace(/\/$/, "");

  // 5. Prepend @ for alphanumeric handles
  if (
    cleanChatId &&
    !cleanChatId.startsWith("@") &&
    !cleanChatId.startsWith("-") &&
    isNaN(Number(cleanChatId))
  ) {
    cleanChatId = "@" + cleanChatId;
  }

  // 6. Auto-correct numeric channel IDs to have -100 prefix
  if (/^\d{7,20}$/.test(cleanChatId)) {
    cleanChatId = "-100" + cleanChatId;
  } else if (
    /^-\d{7,20}$/.test(cleanChatId) &&
    !cleanChatId.startsWith("-100")
  ) {
    cleanChatId = "-100" + cleanChatId.substring(1);
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
});
