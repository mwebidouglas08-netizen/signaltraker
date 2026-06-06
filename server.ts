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
    
    // Ensure we handle trimmed comparisons safely and set fallback defaults
    const targetUsername = (process.env.ADMIN_USERNAME || "admin").trim();
    const targetPassword = (process.env.ADMIN_PASSWORD || "password").trim();

    const providedUsername = typeof username === "string" ? username.trim() : "";
    const providedPassword = typeof password === "string" ? password.trim() : "";

    console.log(`[Auth API] Login attempt for user: "${providedUsername}"`);

    if (providedUsername && providedPassword && providedUsername === targetUsername && providedPassword === targetPassword) {
      // Use buffer safely for encoding
      const sessionString = providedUsername + ":" + Date.now();
      const generatedToken = "zeta_session_" + Buffer.from(sessionString).toString("base64");
      
      console.log(`[Auth API] Successful authentication for user: "${providedUsername}"`);
      res.json({
        success: true,
        token: generatedToken
      });
    } else {
      console.warn(`[Auth API] Failed authentication attempt. Active config expects: "${targetUsername}"`);
      res.status(401).json({
        success: false,
        error: "Invalid admin username or password. Please try again."
      });
    }
  } catch (err: any) {
    console.error("[Auth API] Critical failure in /api/login endpoint:", err);
    res.status(500).json({
      success: false,
      error: "Internal server authentication error: " + (err.message || "Unknown error")
    });
  }
});

// Helper to sanitize Telegram bot credentials and channel identifiers
function sanitizeTelegramCredentials(botToken: string, chatId: string) {
  let cleanToken = (botToken || "").trim();
  
  // 1. Extract bot token if they pasted a full URL (e.g., https://api.telegram.org/botTOKEN/something)
  if (cleanToken.includes("telegram.org/bot")) {
    const parts = cleanToken.split("telegram.org/bot");
    if (parts.length > 1) {
      const tokenSec = parts[parts.length - 1].split("/")[0];
      if (tokenSec) cleanToken = tokenSec;
    }
  }

  // 2. Strip leading "bot" prefix if it was added manually (e.g. bot123456:abc...)
  if (cleanToken.toLowerCase().startsWith("bot")) {
    const withoutBot = cleanToken.substring(3);
    // Bot tokens always start with the bot's numeric ID (e.g., 123456:ABC)
    if (/^\d+/.test(withoutBot)) {
      cleanToken = withoutBot;
    }
  }

  // Clear spaces and outer details
  let cleanChatId = (chatId || "").trim().replace(/\s+/g, "").replace(/['"]/g, "");

  // 3. Extract channel handle if they pasted a t.me Link (e.g., https://t.me/my_channel)
  if (cleanChatId.includes("t.me/")) {
    const parts = cleanChatId.split("t.me/");
    if (parts.length > 1) {
      const handle = parts[parts.length - 1].split("/")[0].split("?")[0];
      if (handle) {
        cleanChatId = handle.startsWith("@") ? handle : "@" + handle;
      }
    }
  }

  // 4. Ensure trailing slashes are removed
  cleanChatId = cleanChatId.replace(/\/$/, "");

  // 5. If it is an alphanumeric handle and does not start with @ or - (for private channels), prepend @
  if (cleanChatId && !cleanChatId.startsWith("@") && !cleanChatId.startsWith("-") && isNaN(Number(cleanChatId))) {
    cleanChatId = "@" + cleanChatId;
  }

  // 6. Support numeric channel IDs of any typical length (7 to 20 digits) and auto-correct them to have the standard -100 prefix:
  // Option A: purely positive digits (e.g., "2590400274" -> "-1002590400274")
  if (/^\d{7,20}$/.test(cleanChatId)) {
    cleanChatId = "-100" + cleanChatId;
  }
  // Option B: negative digits starting with '-' but not already ending/starting with '-100' (e.g., "-2590400274" -> "-1002590400274")
  else if (/^-\d{7,20}$/.test(cleanChatId) && !cleanChatId.startsWith("-100")) {
    cleanChatId = "-100" + cleanChatId.substring(1);
  }

  return { cleanToken, cleanChatId };
}

// 2. Telegram connection test endpoint
app.post("/api/telegram/test", async (req, res) => {
  const { botToken, chatId } = req.body;

  if (!botToken || !chatId) {
    res.status(400).json({ error: "botToken and chatId are required" });
    return;
  }

  const { cleanToken, cleanChatId } = sanitizeTelegramCredentials(botToken, chatId);

  try {
    const formattedText = `<b>📣 Signal Broadcaster Connected!</b>\n\nYour dashboard is now successfully hooked to this channel. Future trading alerts will appear here formatted with professional layouts.\n\n⏱️ <i>Time: ${new Date().toUTCString()}</i>`;

    const response = await fetch(`https://api.telegram.org/bot${cleanToken}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: cleanChatId,
        text: formattedText,
        parse_mode: "HTML",
        disable_web_page_preview: true,
      }),
    });

    const data = await response.json();

    if (!data.ok) {
      // Build an actionable, user-friendly debug message based on Telegram API error types
      let advice = data.description || "Unknown Telegram response.";
      const desc = (data.description || "").toLowerCase();

      if (desc.includes("chat not found")) {
        advice = `Channel not found (${cleanChatId}). Confirm that the Channel ID is exact. If it is a private channel, make sure you used its numeric ID (e.g. -100XXXXX) rather than an invite link, and verify that your bot has been added as an Administrator.`;
      } else if (desc.includes("admin") || desc.includes("post") || desc.includes("not member") || desc.includes("forbidden")) {
        advice = `Privilege issue! Please go to your Channel Settings -> Managers / Admins -> Add Admin, and designate your Bot as an admin with "Post Messages" permission enabled.`;
      } else if (desc.includes("unauthorized") || desc.includes("token")) {
        advice = `Incorrect Bot Access Token. Double-check your BotFather token input value.`;
      }

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
    res.status(500).json({
      error: "Failed to send test message to Telegram",
      details: err.message,
      botToken: cleanToken,
      chatId: cleanChatId,
    });
  }
});

// 3. Send Signal to Telegram Channel (Broadcast or Reply)
app.post("/api/telegram/send", async (req, res) => {
  const { botToken, chatId, text, replyToMessageId } = req.body;

  if (!botToken || !chatId || !text) {
    res.status(400).json({ error: "botToken, chatId, and text are required" });
    return;
  }

  const { cleanToken, cleanChatId } = sanitizeTelegramCredentials(botToken, chatId);

  try {
    const payload: Record<string, any> = {
      chat_id: cleanChatId,
      text: text,
      parse_mode: "HTML",
      disable_web_page_preview: true,
    };

    if (replyToMessageId) {
      // Modern interactive replies use reply_parameters
      payload.reply_parameters = { message_id: parseInt(replyToMessageId, 10) };
      // Legacy reply property for safety
      payload.reply_to_message_id = parseInt(replyToMessageId, 10);
    }

    let response = await fetch(`https://api.telegram.org/bot${cleanToken}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    let data = await response.json();

    // If HTML parsing fails due to unescaped characters or malformed tags generated by AI, 
    // automatically fall back to stripped plain-text to guarantee the signal never drops!
    if (!data.ok && (data.description || "").toLowerCase().includes("parse")) {
      console.warn("Telegram HTML parsing error encountered. Retrying with stripped plain-text content...");
      
      const plainText = text
        .replace(/<[^>]*>/g, "") // Strip HTML tags
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&amp;/g, "&");

      const fallbackPayload: Record<string, any> = { ...payload };
      fallbackPayload.text = plainText;
      delete fallbackPayload.parse_mode;

      response = await fetch(`https://api.telegram.org/bot${cleanToken}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(fallbackPayload),
      });
      data = await response.json();
    }

    if (!data.ok) {
      // Build an actionable, user-friendly debug message based on Telegram API error types
      let advice = data.description || "Unknown Telegram response.";
      const desc = (data.description || "").toLowerCase();

      if (desc.includes("chat not found")) {
        advice = `Channel ID/Chat not found (${cleanChatId}). Ensure the channel ID exists, and CRITICAL: please add the Bot as an Admin to your Channel config first so Telegram lets it trace the room!`;
      } else if (desc.includes("admin") || desc.includes("post") || desc.includes("not member") || desc.includes("forbidden")) {
        advice = `Admin privilege issue! Please open Telegram Channel -> Managing Admins, and authorize your Bot with "Post Messages" permission.`;
      } else if (desc.includes("unauthorized") || desc.includes("token")) {
        advice = `Unauthorized Bot Token. Review the Bot Token in settings and copy the full exact line from @BotFather.`;
      } else if (desc.includes("blocked") || desc.includes("deactivated")) {
        advice = `The bot is blocked or deactivated by the channel owner, or the channel was removed.`;
      }

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
    res.status(500).json({
      error: "Failed to broadcast signal to Telegram",
      details: err.message,
      botToken: cleanToken,
      chatId: cleanChatId,
    });
  }
});

// 4. Generate Signal and Technical Rationale with Gemini
app.post("/api/gemini/generate-signal", async (req, res) => {
  if (!ai) {
    res.status(500).json({
      error: "Gemini AI is not initialized. Please verify your GEMINI_API_KEY settings.",
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
    // Deriv synthetic / Digit-specific fields
    isDerivStyle = false,
    strategyName = "Second Least Digit",
    ticksCount = "1ticks",
    botName = "USE SNIPPER KILLER BOT",
    entryDigit = "9",
    confidence = "85%",
    promoUrl = "https://mrzetuzetu.site",
    riskGuidelines = "• Stop after 4 consecutive wins\n• Max 5 runs per session\n• Use proper recovery if loss occurs",
    botSignature = "mrzetuzetu Over/Under Bot",
    hashtags = "#TradingSignal #Deriv #OverUnder"
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

INDEX / ASSET SYMBOL: ${symbol} (e.g. VOLATILITY 100 (1s) INDEX)
CONTRACT ACTION: ${action} (e.g. UNDER 7 or OVER 5)
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
Use high-quality relevant emojis (like 📊, ⚡, 🔔, 📈, 📉, 🎯, 🔑, ⭐, ⚠️, ⏰, 🤖) to style the paragraphs.

Output format: Please output a valid JSON object with exactly two keys: "signal" and "rationale".

In "signal": A complete, ready-to-broadcast Telegram message formatted EXACTLY with structural fields like:
"
🔔 <b>NEW TRADING SIGNAL</b> 🔔

<b>${symbol.toUpperCase()}</b>

📈 <b>${action.toUpperCase()}</b>
⚡ <b>Strategy:</b> ${strategyName}

📊 <b>Market Analysis (${ticksCount})</b>
━━━━━━━━━━━━━━━━━━━━━━
🎯 <b>Entry Instructions:</b>

${botName.toUpperCase()}
💹 <b>Trade:</b> ${action}
🔑 <b>Entry Digit:</b> <code>${entryDigit}</code>
⭐ <b>Confidence:</b> ${confidence}

${promoUrl}

⚠️ <b>Risk Management:</b>
${riskGuidelines}

⏰ <b>Time:</b> <i>[Generate current localized simulated time or relative duration]</i>

🤖 Generated by ${botSignature}
${hashtags}
"

In "rationale": A detailed technical analysis paragraph explaining the mathematical rationale of this digit contract strategy (e.g. why the strategy works, the statistical likelihood, digit frequency patterns, relative ticks cycle support) written with professional binary options/synthetics vocabulary. Keep it around 100-150 words.
`;
    } else {
      const tpString = Array.isArray(tp) ? tp.filter(Boolean).map((t, idx) => `TP${idx + 1}: <b>${t}</b>`).join("\n") : "";
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

Your output must contain exactly TWO separate sections, carefully formatted using safe HTML tags that Telegram supports (supported tags: <b>, <i>, <code>, <u>, <s>, <pre>). Do not use markdown syntax in your text.
Use plenty of relevant high-quality emojis (like 📈, 📉, 🟢, 🔴, 🎯, 🚀, 🛡️, 📊, ⚡) to represent elements clearly. Keep the visual density high, balanced, and premium.

Output format: Please output a valid JSON object with exactly two keys: "signal" and "rationale".

In "signal": A complete, ready-to-broadcast Telegram message with beautiful layouts:
- Header indicating the direction (e.g. <b>🔵 LONG / BUY</b> or <b>🔴 SHORT / SELL</b>)
- Symbol (bolded) with currency or index flag/identifier
- Entry zones, TP Targets, and Stop Loss
- A quick premium risk disclaimer.

In "rationale": A detailed technical analysis paragraph explaining the scientific setup (e.g., support/resistance, RSI indicator flags, SMA zones, patterns like double bottoms or bull flags, volume flow) based on the notes or typical technical setups for this asset, written with professional trading terminology (approx. 100-150 words). This will assist the sender in sharing the analysis behind the trade.
`;
    }

    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash",
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
              description: "Professional technical rationale analyzing the setup.",
            },
          },
          required: ["signal", "rationale"],
        },
      },
    });

    const responseText = response.text;
    if (!responseText) {
      res.status(500).json({ error: "Failed to generate content from AI model." });
      return;
    }

    const payload = JSON.parse(responseText.trim());
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
    console.log("Starting server in DEVELOPMENT mode with Vite HMR middleware...");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    console.log("Starting server in PRODUCTION mode with static file bundle serving...");
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running and listening internally on http://0.0.0.0:${PORT}`);
  });
};

setupServer().catch((error) => {
  console.error("Failed to start full-stack server middleware:", error);
});
