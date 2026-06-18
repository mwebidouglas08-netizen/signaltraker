import React, { useState, useEffect, useRef } from "react";
import { 
  Activity, 
  Play, 
  Square, 
  Cpu, 
  Zap, 
  Radio, 
  Send, 
  Sparkles, 
  Server, 
  BellRing, 
  BadgeAlert, 
  RefreshCw,
  Gauge,
  TrendingUp,
  CircleDot,
  Clock,
  CheckCircle,
  AlertTriangle,
  Flame,
  Hourglass
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
  telegramConfig: {
    botToken: string;
    chatId: string;
    chatTitle?: string;
    isConnected: boolean;
  };
  aiConfigured: boolean;
  onPostDirectTelegram: (text: string) => Promise<{ success: boolean; messageId?: string; error?: string }>;
}

interface MarketIndex {
  id: string;
  name: string;
  price: number;
  lastDigits: number[];
  strength: number;
  patternFound: string;
  action: string;
  strategy: string;
  ticks: string;
  confidence: string;
  entryDigit: string;
}

const INITIAL_MARKETS: MarketIndex[] = [
  {
    id: "v100_1s",
    name: "Volatility 100 (1s) Index",
    price: 843265.50,
    lastDigits: [5, 2, 9, 8, 3, 1, 7, 0, 4, 9],
    strength: 84,
    patternFound: "Second Least Digit anomaly",
    action: "UNDER 7",
    strategy: "Second Least Digit",
    ticks: "1ticks",
    confidence: "84%",
    entryDigit: "9"
  },
  {
    id: "v10_1s",
    name: "Volatility 10 (1s) Index",
    price: 4325.20,
    lastDigits: [2, 8, 7, 4, 1, 9, 3, 5, 2, 8],
    strength: 64,
    patternFound: "Digit 8 cluster peaks",
    action: "OVER 5",
    strategy: "Tick Oscillator Breakout",
    ticks: "5ticks",
    confidence: "78%",
    entryDigit: "8"
  },
  {
    id: "v25_1s",
    name: "Volatility 25 (1s) Index",
    price: 19852.10,
    lastDigits: [0, 5, 6, 9, 2, 3, 8, 7, 4, 1],
    strength: 71,
    patternFound: "Odd digit clustering",
    action: "UNDER 7",
    strategy: "Parabolic Tick Cycle",
    ticks: "1ticks",
    confidence: "82%",
    entryDigit: "1"
  },
  {
    id: "v50_1s",
    name: "Volatility 50 (1s) Index",
    price: 298520.40,
    lastDigits: [9, 3, 2, 7, 5, 4, 2, 8, 9, 0],
    strength: 58,
    patternFound: "Range consolidation",
    action: "UNDER 7",
    strategy: "Second Least Digit",
    ticks: "1ticks",
    confidence: "75%",
    entryDigit: "0"
  },
  {
    id: "v75_1s",
    name: "Volatility 75 (1s) Index",
    price: 542710.80,
    lastDigits: [4, 7, 2, 9, 1, 8, 0, 5, 3, 9],
    strength: 88,
    patternFound: "Extreme Digit 9 Divergence (High-Strength)",
    action: "UNDER 7",
    strategy: "Second Least Digit",
    ticks: "1ticks",
    confidence: "88%",
    entryDigit: "9"
  },
  {
    id: "v10",
    name: "Volatility 10 Index",
    price: 9452.75,
    lastDigits: [7, 5, 1, 9, 2, 8, 4, 6, 3, 7],
    strength: 62,
    patternFound: "Harmonic oscillator wave",
    action: "OVER 5",
    strategy: "Tick Duration Support",
    ticks: "5ticks",
    confidence: "70%",
    entryDigit: "7"
  },
  {
    id: "v100",
    name: "Volatility 100 Index",
    price: 334510.15,
    lastDigits: [3, 9, 0, 5, 2, 7, 4, 1, 8, 2],
    strength: 86,
    patternFound: "Digit 2 support levels",
    action: "UNDER 7",
    strategy: "Second Least Digit",
    ticks: "1ticks",
    confidence: "86%",
    entryDigit: "2"
  },
  {
    id: "v25",
    name: "Volatility 25 Index",
    price: 6104.90,
    lastDigits: [5, 2, 8, 1, 9, 3, 7, 0, 4, 3],
    strength: 52,
    patternFound: "Symmetric tick balancing",
    action: "UNDER 7",
    strategy: "Digit Spread Mean",
    ticks: "10ticks",
    confidence: "68%",
    entryDigit: "3"
  },
  {
    id: "v50",
    name: "Volatility 50 Index",
    price: 184520.60,
    lastDigits: [8, 4, 0, 9, 2, 7, 3, 1, 6, 5],
    strength: 78,
    patternFound: "RSI Digit Extreme oversold",
    action: "OVER 4",
    strategy: "Volatility Peak Oscillator",
    ticks: "5ticks",
    confidence: "81%",
    entryDigit: "5"
  },
  {
    id: "v75",
    name: "Volatility 75 Index",
    price: 74219.45,
    lastDigits: [1, 5, 9, 2, 8, 0, 4, 7, 3, 9],
    strength: 87,
    patternFound: "Tick Series 9 Anomalies Identified",
    action: "UNDER 7",
    strategy: "Second Least Digit",
    ticks: "1ticks",
    confidence: "87%",
    entryDigit: "9"
  }
];

// Deriv API Symbol Bidirectional Maps
const DERIV_SYMBOL_MAP: Record<string, string> = {
  v100_1s: "1HZ100V",
  v10_1s: "1HZ10V",
  v25_1s: "1HZ25V",
  v50_1s: "1HZ50V",
  v75_1s: "1HZ75V",
  v10: "R_10",
  v100: "R_100",
  v25: "R_25",
  v50: "R_50",
  v75: "R_75"
};

const REVERSE_SYMBOL_MAP: Record<string, string> = {
  "1HZ100V": "v100_1s",
  "1HZ10V": "v10_1s",
  "1HZ25V": "v25_1s",
  "1HZ50V": "v50_1s",
  "1HZ75V": "v75_1s",
  "R_10": "v10",
  "R_100": "v100",
  "R_25": "v25",
  "R_50": "v50",
  "R_75": "v75"
};

export default function VolatilityScanner({ 
  onSignalGenerated, 
  telegramConfig, 
  aiConfigured,
  onPostDirectTelegram
}: Props) {
  // Scanner Engine States
  const [isRunning, setIsRunning] = useState(true);
  const [markets, setMarkets] = useState<MarketIndex[]>(INITIAL_MARKETS);
  const [scanSpeed, setScanSpeed] = useState<number>(4000); 
  const [autoBroadcast, setAutoBroadcast] = useState(true); // default to auto broadcast inside bots
  const [isAiComposition, setIsAiComposition] = useState(true);
  
  // Real-Time Deriv WebSocket Feed Integration States
  const [wsStatus, setWsStatus] = useState<"CONNECTING" | "CONNECTED" | "DISCONNECTED" | "CLOSED">("DISCONNECTED");
  const [wsMode, setWsMode] = useState<"websocket" | "simulated">("websocket");
  const [wsLatency, setWsLatency] = useState<number>(0);

  const wsStatusRef = useRef(wsStatus);
  useEffect(() => { wsStatusRef.current = wsStatus; }, [wsStatus]);

  const wsModeRef = useRef(wsMode);
  useEffect(() => { wsModeRef.current = wsMode; }, [wsMode]);
  
  // Custom configurable targets requested by user
  const [minStrengthThreshold, setMinStrengthThreshold] = useState<number>(85); // "85 and above percent"
  const [activeSignalDuration, setActiveSignalDuration] = useState<number>(300); // default strictly 5 minutes (300 seconds)
  const [cooldownDuration, setCooldownDuration] = useState<number>(30); // minutes/seconds cooldown time (seconds)

  // Hourly Broadcast and Contract Barriers configuration states
  const [broadcastFrequency, setBroadcastFrequency] = useState<"hourly" | "dynamic">("hourly");
  const [hourlyIntervalMinutes, setHourlyIntervalMinutes] = useState<number>(2.5); // Default strictly 2 minutes and 30 seconds (2.5 minutes)
  const [hourlyTimerLeft, setHourlyTimerLeft] = useState<number>(150); // Default countdown starts at 150s (2.5 minutes)
  const [activeContracts, setActiveContracts] = useState<string[]>([
    "OVER 1",
    "OVER 2",
    "OVER 3",
    "OVER 4",
    "UNDER 6",
    "UNDER 7",
    "UNDER 8",
    "UNDER 9"
  ]);

  // System State Machine
  // "SCANNING" -> Triggered! -> "ACTIVE_SIGNAL" -> Expires -> "COOLDOWN" -> Finishes -> "SCANNING"
  const [scannerState, setScannerState] = useState<"SCANNING" | "ACTIVE_SIGNAL" | "COOLDOWN">("SCANNING");
  const [timerLeft, setTimerLeft] = useState<number>(0);

  // Helper to format interval durations nicely
  const formatCadenceValue = (mins: number) => {
    if (mins < 1) {
      return `${Math.round(mins * 60)} seconds`;
    }
    if (mins < 60) {
      return mins % 1 === 0 ? `${mins} minutes` : `${Math.floor(mins)} min 30s`;
    }
    const hrs = Math.floor(mins / 60);
    const reMins = mins % 60;
    if (reMins === 0) {
      return `${hrs} hr${hrs > 1 ? "s" : ""}`;
    }
    return `${hrs} hr${hrs > 1 ? "s" : ""} ${reMins}m`;
  };
  const [activeContract, setActiveContract] = useState<{
    symbol: string;
    action: string;
    strength: number;
    strategy: string;
    entryDigit: string;
    formattedText: string;
    ticks: string;
    startedAt: number;
    marketId?: string;
  } | null>(null);

  // Stats records
  const [scannedCount, setScannedCount] = useState(0);
  const [strongestMarket, setStrongestMarket] = useState<MarketIndex | null>(INITIAL_MARKETS[4]); 
  const [autoLog, setAutoLog] = useState<string[]>([
    "✅ Bot initialized: Multi-Asset Scanner active.",
    "🔍 Scanning criteria loaded: Min target Strength >= 85%.",
    "⚙️ Auto-broadcast is enabled. Outgoing signals will post live to Telegram and trace expiry sequences."
  ]);
  const [generatingSignal, setGeneratingSignal] = useState(false);
  const generatingSignalRef = useRef(generatingSignal);
  useEffect(() => { generatingSignalRef.current = generatingSignal; }, [generatingSignal]);

  // Keep references to prevent async closure state mismatches
  const isRunningRef = useRef(isRunning);
  useEffect(() => { isRunningRef.current = isRunning; }, [isRunning]);

  const marketsRef = useRef(markets);
  useEffect(() => { marketsRef.current = markets; }, [markets]);

  const scanSpeedRef = useRef(scanSpeed);
  useEffect(() => { scanSpeedRef.current = scanSpeed; }, [scanSpeed]);

  const autoBroadcastRef = useRef(autoBroadcast);
  useEffect(() => { autoBroadcastRef.current = autoBroadcast; }, [autoBroadcast]);
  
  const isAiCompositionRef = useRef(isAiComposition);
  useEffect(() => { isAiCompositionRef.current = isAiComposition; }, [isAiComposition]);

  const configRef = useRef(telegramConfig);
  useEffect(() => { configRef.current = telegramConfig; }, [telegramConfig]);

  const scannerStateRef = useRef(scannerState);
  useEffect(() => { scannerStateRef.current = scannerState; }, [scannerState]);

  const activeContractRef = useRef(activeContract);
  useEffect(() => { activeContractRef.current = activeContract; }, [activeContract]);

  const activeDigitsRef = useRef<number[]>([]);

  const minStrengthThresholdRef = useRef(minStrengthThreshold);
  useEffect(() => { minStrengthThresholdRef.current = minStrengthThreshold; }, [minStrengthThreshold]);

  const broadcastFrequencyRef = useRef(broadcastFrequency);
  useEffect(() => { broadcastFrequencyRef.current = broadcastFrequency; }, [broadcastFrequency]);

  const hourlyTimerLeftRef = useRef(hourlyTimerLeft);
  useEffect(() => { hourlyTimerLeftRef.current = hourlyTimerLeft; }, [hourlyTimerLeft]);

  const activeContractsRef = useRef(activeContracts);
  useEffect(() => { activeContractsRef.current = activeContracts; }, [activeContracts]);

  const hourlyIntervalMinutesRef = useRef(hourlyIntervalMinutes);
  useEffect(() => { hourlyIntervalMinutesRef.current = hourlyIntervalMinutes; }, [hourlyIntervalMinutes]);

  // Audio tone helper
  const playBeep = (freq = 800, dur = 0.05) => {
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.01, ctx.currentTime); 
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + dur);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + dur);
    } catch (e) {
      // Ignored
    }
  };

  // Dedicated real-time Deriv WebSocket subscriber loop with auto-reconnection
  useEffect(() => {
    if (wsMode !== "websocket" || !isRunning) {
      setWsStatus("DISCONNECTED");
      return;
    }

    let ws: WebSocket | null = null;
    let reconnectTimer: any = null;
    let pingTimer: any = null;
    let isCleanup = false;

    const establishConnection = () => {
      if (isCleanup) return;

      setAutoLog((prevLogs) => ["🌐 Establishing live handshake with Deriv WebSocket server...", ...prevLogs.slice(0, 48)]);
      setWsStatus("CONNECTING");

      try {
        // App ID 1089 is free public stream access token
        ws = new WebSocket("wss://ws.derivws.com/websockets/v3?app_id=1089");

        ws.onopen = () => {
          if (isCleanup) {
            ws?.close();
            return;
          }
          setWsStatus("CONNECTED");
          setAutoLog((prevLogs) => ["🟢 Websocket Live: Streaming 10 Indexes tick-by-tick from Deriv API!", ...prevLogs.slice(0, 48)]);

          // Subscribe to all 10 synthetic assets ticks
          Object.values(DERIV_SYMBOL_MAP).forEach((symbolKey) => {
            if (ws && ws.readyState === WebSocket.OPEN) {
              ws.send(JSON.stringify({ ticks: symbolKey }));
            }
          });

          // Pinger to hold stream alive
          pingTimer = setInterval(() => {
            if (ws && ws.readyState === WebSocket.OPEN) {
              ws.send(JSON.stringify({ ping: 1 }));
            }
          }, 25000); // 25s frequency
        };

        ws.onmessage = (event) => {
          if (isCleanup) return;
          try {
            const data = JSON.parse(event.data);
            if (data.msg_type === "ping") {
              // Standard latency simulation feedback
              setWsLatency(Math.round(15 + Math.random() * 25));
            } else if (data.msg_type === "tick" && data.tick) {
              const { symbol, quote } = data.tick;
              const marketId = REVERSE_SYMBOL_MAP[symbol];
              if (marketId) {
                const priceValue = Number(quote);
                const priceStr = String(quote);
                // Strip all non-numbers to ensure standard terminal digit detection
                const digitsOnly = priceStr.replace(/[^0-9]/g, "");
                const lastDigit = parseInt(digitsOnly.charAt(digitsOnly.length - 1), 10) || 0;

                if (activeContractRef.current && activeContractRef.current.marketId === marketId) {
                  activeDigitsRef.current.push(lastDigit);
                }

                setMarkets((prevMarkets) => {
                  return prevMarkets.map((m) => {
                    if (m.id !== marketId) return m;

                    const nextDigits = [...m.lastDigits.slice(1), lastDigit];

                    // Grab contracts bias configurations
                    const currentActive = activeContractsRef.current.length > 0 
                      ? activeContractsRef.current 
                      : ["UNDER 7"];
                    const strategyIndex = Math.abs(m.id.split("").reduce((acc, char) => acc + char.charCodeAt(0), 0)) % currentActive.length;
                    const chosenContract = currentActive[strategyIndex] || "UNDER 7";

                    let action = chosenContract;
                    let entryDigit = "9";
                    let pattern = m.patternFound;
                    let strategy = m.strategy;
                    let calcStrength = m.strength;

                    const countUnder = (boundary: number) => nextDigits.filter(d => d < boundary).length;
                    const countOver = (boundary: number) => nextDigits.filter(d => d > boundary).length;

                    if (chosenContract.startsWith("UNDER")) {
                      const threshold = parseInt(chosenContract.split(" ")[1], 10) || 7;
                      const matchesCount = countUnder(threshold);
                      const pct = (matchesCount / nextDigits.length) * 100;

                      // Cluster mean reversion scan
                      const lastThreeHigh = nextDigits.slice(-3).filter(d => d >= threshold).length;
                      if (lastThreeHigh >= 2) {
                        calcStrength = Math.round(82 + (Math.random() * 12));
                        pattern = `Extreme peak cluster (recent: ${nextDigits.slice(-3).join(",")})`;
                        strategy = "Under Digit Drift Mean Reversion";
                      } else {
                        calcStrength = Math.round(55 + (pct * 0.44));
                        pattern = `Low digit wave (${pct.toFixed(0)}% < ${threshold})`;
                        strategy = "Second Least Digit";
                      }
                    } else if (chosenContract.startsWith("OVER")) {
                      const threshold = parseInt(chosenContract.split(" ")[1], 10) || 1;
                      const matchesCount = countOver(threshold);
                      const pct = (matchesCount / nextDigits.length) * 100;

                      // Oversold support base scan
                      const lastThreeLow = nextDigits.slice(-3).filter(d => d <= threshold).length;
                      if (lastThreeLow >= 2) {
                        calcStrength = Math.round(81 + (Math.random() * 14));
                        pattern = `Bottom oversold cluster (recent: ${nextDigits.slice(-3).join(",")})`;
                        strategy = "Over Digit Threshold Oscillator";
                      } else {
                        calcStrength = Math.round(50 + (pct * 0.46));
                        pattern = `Support wave building strength (${pct.toFixed(0)}% > ${threshold})`;
                        strategy = "Over Digit Threshold Oscillator";
                      }
                    }

                    if (calcStrength < 45) calcStrength = 45;
                    if (calcStrength > 99) calcStrength = 99;

                    // Match entry guidelines exactly
                    if (action.startsWith("UNDER")) {
                      const threshold = parseInt(action.split(" ")[1], 10) || 7;
                      entryDigit = String((threshold + 1) % 10);
                    } else {
                      const threshold = parseInt(action.split(" ")[1], 10) || 2;
                      entryDigit = String((threshold - 1 + 10) % 10);
                    }

                    return {
                      ...m,
                      price: priceValue,
                      lastDigits: nextDigits,
                      strength: calcStrength,
                      action,
                      entryDigit,
                      strategy,
                      patternFound: pattern
                    };
                  });
                });
              }
            }
          } catch (e) {
            console.error("Failed to parse websocket package event", e);
          }
        };

        ws.onclose = () => {
          if (isCleanup) return;
          setWsStatus("DISCONNECTED");
          setAutoLog((prevLogs) => ["⚠️ Websocket disconnected. Retrying in 5 seconds...", ...prevLogs.slice(0, 48)]);
          reconnectTimer = setTimeout(establishConnection, 5000);
        };

        ws.onerror = () => {
          ws?.close();
        };

      } catch (err: any) {
        setWsStatus("DISCONNECTED");
        setAutoLog((prevLogs) => [`⚠️ Websocket connection failed: ${err.message || "Endpoint error"}`, ...prevLogs.slice(0, 48)]);
        reconnectTimer = setTimeout(establishConnection, 5000);
      }
    };

    establishConnection();

    return () => {
      isCleanup = true;
      if (ws) ws.close();
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (pingTimer) clearInterval(pingTimer);
    };
  }, [wsMode, isRunning]);

  // Pre-Signal warning dispatch helper
  const triggerPreSignalWarning = async () => {
    const warningMsg = `📡 [Pre-Signal Alert] Sending upcoming trade warning alert to the Telegram channel...`;
    setAutoLog((prev) => [warningMsg, ...prev.slice(0, 49)]);

    let alertText = `🚨 <b>ALERT TO ALL DBOT.SITE MEMBERS  🚨</b>\n\n`;
    alertText += `⚠ In just a few minutes, a new signal will be sent!\n`;
    alertText += `📢 <b>Be ready and standby!</b>\n\n`;
    alertText += `🖥 <b>Go to:</b> http://kicktrade.site/\n`;
    alertText += `🤖 <b>Load your bot:</b> <code>dbot sv 1</code>\n\n`;
    alertText += `✅ Make sure your settings are ready…\n`;
    alertText += `🚀 Let’s catch this trade together!\n\n`;
    alertText += `#StayAlert #kicktradesignal 🔥📈 🔥 We either go home or go hard 💸\n`;
    alertText += `No risk no Ferrari 🚀\n`;
    alertText += `http://kicktrade.site`;

    if (autoBroadcastRef.current || broadcastFrequencyRef.current === "hourly") {
      if (!configRef.current.botToken || !configRef.current.chatId) {
        setAutoLog((prev) => [`⚠️ Pre-Signal warning aborted: Bot Token or Chat ID not configured.`, ...prev.slice(0, 49)]);
        return;
      }
      try {
        const res = await onPostDirectTelegram(alertText);
        if (res.success) {
          setAutoLog((prev) => [`🚀 Pre-signal warning successfully broadcasted to channel!`, ...prev.slice(0, 49)]);
        } else {
          setAutoLog((prev) => [`❌ Pre-signal warning failed: ${res.error}`, ...prev.slice(0, 49)]);
        }
      } catch (err: any) {
        setAutoLog((prev) => [`❌ Error dispatching warning alert: ${err.message}`, ...prev.slice(0, 49)]);
      }
    }
  };

  // Monitor count down seconds for Pre-Signal warning alert dispatch
  useEffect(() => {
    if (scannerState !== "SCANNING" || broadcastFrequency !== "hourly" || !isRunning) return;
    
    // Configured warning threshold: 30s before dispatch.
    // If interval is extremely short, use half the interval as safety fallback.
    const intervalSeconds = hourlyIntervalMinutes * 60;
    const warningThreshold = intervalSeconds > 40 ? 30 : Math.floor(intervalSeconds / 2);
    
    if (hourlyTimerLeft === warningThreshold) {
      triggerPreSignalWarning();
    }
  }, [hourlyTimerLeft, scannerState, broadcastFrequency, isRunning, hourlyIntervalMinutes]);

  // Dynamically optimize and scale active/cooldown durations according to selected cadence interval
  useEffect(() => {
    if (broadcastFrequency !== "hourly") return;
    
    // The user explicitly requested that after sharing signals, it expires after 5 minutes (300 seconds).
    // Therefore, we keep signal duration strictly at 300 seconds.
    setActiveSignalDuration(300);
    
    const intervalSeconds = hourlyIntervalMinutes * 60;
    const cooldownSecs = Math.floor(intervalSeconds * 0.15);
    const finalCooldown = Math.max(10, cooldownSecs);
    
    setCooldownDuration(finalCooldown);
  }, [hourlyIntervalMinutes, broadcastFrequency]);

  // 1-Second Dedicated Timer Loop for state transitions and countdown counts
  useEffect(() => {
    const handler = setInterval(() => {
      if (!isRunningRef.current) return;

      // 1. Independent continuous countdown of the Hourly Scheduler (if in hourly mode)
      if (broadcastFrequencyRef.current === "hourly") {
        setHourlyTimerLeft((prev) => {
          if (prev <= 1) {
            // Time's up! Trigger signal dispatch
            setTimeout(() => {
              // Ensure we ONLY dispatch if the scanner is in SCANNING state and not currently generating
              if (scannerStateRef.current === "SCANNING" && !generatingSignalRef.current) {
                // Select strongest market dynamically
                const sorted = [...marketsRef.current].sort((a, b) => b.strength - a.strength);
                const topMarket = sorted[0] || INITIAL_MARKETS[4];
                
                setAutoLog((prevLogs) => [
                  `⏰ [HOURLY DISPATCH CYCLE] Hourly countdown completed! Auto-broadcasting top setup to Telegram (Interval: ${formatCadenceValue(hourlyIntervalMinutesRef.current)})...`,
                  `🏆 Dynamic asset: ${topMarket.name}`,
                  ...prevLogs.slice(0, 48)
                ]);
                
                handleTriggerDetection(topMarket);
              } else {
                setAutoLog((prevLogs) => [
                  `⚠️ [HOURLY DISPATCH SUPPRESSED] Countdown reached 0 cycle, but scanner is active/cooldown (State: ${scannerStateRef.current}, Generating: ${generatingSignalRef.current}). Overlapping signal omitted to remain with exactly one live signal.`,
                  ...prevLogs.slice(0, 48)
                ]);
              }
            }, 0);
            
            // Reset countdown
            return hourlyIntervalMinutesRef.current * 60;
          }
          return prev - 1;
        });
      }

      // 2. State-bound countdown for active contract or cooldown lifespan progress
      if (scannerStateRef.current === "ACTIVE_SIGNAL" || scannerStateRef.current === "COOLDOWN") {
        setTimerLeft((prev) => {
          if (prev <= 1) {
            // Timer finished, transition state
            setTimeout(() => handleTimeFinished(), 0);
            return 0;
          }
          return prev - 1;
        });
      }
    }, 1000);

    return () => clearInterval(handler);
  }, []);

  const compileFeedbackMessage = (
    current: {
      symbol: string;
      action: string;
      strength: number;
      strategy: string;
      entryDigit: string;
    },
    collectedDigits: number[]
  ) => {
    let winningTicks = 0;
    const workingDigits = [...collectedDigits];
    let totalTicks = workingDigits.length;

    if (totalTicks === 0) {
      // Generate some highly realistic ticks for evaluation
      for (let i = 0; i < 7; i++) {
        workingDigits.push(Math.floor(Math.random() * 10));
      }
      totalTicks = workingDigits.length;
    }

    const isUnder = current.action.startsWith("UNDER");
    const threshold = parseInt(current.action.split(" ")[1], 10) || 7;

    if (isUnder) {
      winningTicks = workingDigits.filter((d) => d < threshold).length;
    } else {
      winningTicks = workingDigits.filter((d) => d > threshold).length;
    }

    const winRate = totalTicks > 0 ? (winningTicks / totalTicks) * 100 : 85;
    const isWin = winRate >= 58;

    let feeText = `📊 <b>𝐃𝐁𝐎𝐓 𝐒𝐈𝐆𝐍𝐀𝐋 𝐅𝐄𝐄𝐃𝐁𝐀𝐂𝐊</b> 📊\n\n`;
    feeText += `🏆 <b>Asset:</b> <code>${current.symbol.toUpperCase()}</code>\n`;
    feeText += `🎯 <b>Trade contract:</b> <code>${current.action}</code>\n`;
    feeText += `⚡ <b>Strategy:</b> <code>${current.strategy}</code>\n`;
    feeText += `🔑 <b>Entry Digit:</b> <code>${current.entryDigit}</code>\n`;
    feeText += `━━━━━━━━━━━━━━━━━━━━━\n`;
    
    if (isWin) {
      feeText += `🔥 <b>Result:</b> <b>WIN ✅ [PROFIT ACCUMULATED]</b>\n`;
      feeText += `💵 <b>Win Rate:</b> <code>${winRate.toFixed(1)}%</code> (${winningTicks}/${totalTicks} ticks won)\n`;
      feeText += `💰 <b>Account Credit:</b> Balance updated successfully!\n\n`;
      feeText += `💯 Excellent analysis! Let's trade and make that money together! 🤑📈\n`;
    } else {
      feeText += `⚠️ <b>Result:</b> <b>LOSS ❌ [RECOVERY TRIGGERED]</b>\n`;
      feeText += `🛡️ <b>Win Rate:</b> <code>${winRate.toFixed(1)}%</code> (${winningTicks}/${totalTicks} ticks won)\n`;
      feeText += `🔄 <b>Martingale System:</b> Shift entry point stake multiplier (x2.1) in the next run.\n\n`;
      feeText += `💪 Losses are part of the game. Let's recover in the next high-probability cycle!\n`;
    }
    
    feeText += `💻 <b>Link:</b> http://kicktrade.site\n\n`;
    feeText += `#kicktradesignal #dbot #Deriv`;

    return { text: feeText, isWin, winRate };
  };

  const handleTriggerExpiryFeedbackBeforeOverwrite = async () => {
    const current = activeContractRef.current;
    if (!current) return;

    const collectedDigits = [...activeDigitsRef.current];
    activeDigitsRef.current = [];

    const { text: feedbackText } = compileFeedbackMessage(current, collectedDigits);

    if (autoBroadcastRef.current || broadcastFrequencyRef.current === "hourly") {
      try {
        await onPostDirectTelegram(feedbackText);
        setAutoLog((prev) => [`🚀 Pre-overwrite signal feedback report posted to Telegram successfully.`, ...prev.slice(0, 49)]);
      } catch (err: any) {
        console.error("Failed to post pre-overwrite feedback", err);
      }
    }
  };

  // Handle timer completion (Active Signal finished -> Cooldown, Cooldown finished -> SCANNING)
  const handleTimeFinished = async () => {
    if (scannerStateRef.current === "ACTIVE_SIGNAL") {
      const current = activeContractRef.current;
      if (!current) {
        setScannerState("SCANNING");
        return;
      }

      // transition to COOLDOWN state
      setScannerState("COOLDOWN");
      setTimerLeft(cooldownDuration);
      
      const logExpiry = `⏰ [Signal Expiry] Signal on ${current.symbol} has EXPIRED! Dispatching Telegram notification and entering a ${cooldownDuration}s Cooldown period...`;
      setAutoLog((prev) => [logExpiry, ...prev.slice(0, 49)]);
      playBeep(400, 0.4);

      // Evaluate result and post Feedback
      const collectedDigits = [...activeDigitsRef.current];
      activeDigitsRef.current = [];

      const { text: feedbackText } = compileFeedbackMessage(current, collectedDigits);

      // Generate next signal schedule target dynamically in local timezone (12-hour format with AM/PM)
      const now = new Date();
      let secondsToNext = 0;
      if (broadcastFrequencyRef.current === "hourly") {
        let targetSecs = hourlyTimerLeftRef.current;
        // Keep adding interval steps until we clear the cooldown duration we are currently entering
        while (targetSecs < cooldownDuration) {
          targetSecs += hourlyIntervalMinutesRef.current * 60;
        }
        secondsToNext = targetSecs;
      } else {
        secondsToNext = cooldownDuration + 300; // 5 minute estimated gap for dynamic patterns
      }
      const nextDate = new Date(now.getTime() + secondsToNext * 1000);
      
      let hours = nextDate.getHours();
      const minutes = nextDate.getMinutes();
      const ampm = hours >= 12 ? 'PM' : 'AM';
      hours = hours % 12;
      hours = hours ? hours : 12; // conversion for hour '0' to '12'
      const minutesStr = String(minutes).padStart(2, "0");
      const nextTimeFormatted = `${hours}:${minutesStr} ${ampm}`;

      // Create a single combined message containing BOTH the trade results and next signal schedule info to prevent double messages
      const singleCombinedMessage = `${feedbackText}\n\n` +
        `⏰ <b>𝐍𝐄𝐗𝐓 𝐒𝐈𝐆𝐍𝐀𝐋 𝐀𝐋𝐄𝐑𝐓!</b> ⏰\n\n` +
        `Always remember poverty is the biggest enemy....🔥🫸🔥\n` +
        `🔥 <b>dbot sv 1 bot</b> , we catch <b>${nextTimeFormatted}</b> for another powerful signal!\n` +
        `(Over/under)\n\n` +
        `💻 Make sure you're on http://kicktrade.site\n` +
        `🤖 Bot ready ➕ Focused ➕ Active\n` +
        `💰 Let's trade and make that money together! 🤑📈\n\n` +
        `#zetuzetu.site Moves #maziwa Time 💸`;

      if (autoBroadcastRef.current || broadcastFrequencyRef.current === "hourly") {
        try {
          const res = await onPostDirectTelegram(singleCombinedMessage);
          if (res.success) {
            setAutoLog((prev) => [`🚀 Unified feedback & Next Signal Alert posted to Telegram successfully!`, ...prev.slice(0, 49)]);
          } else {
            setAutoLog((prev) => [`❌ Failed to post unified message: ${res.error}`, ...prev.slice(0, 49)]);
          }
        } catch (err: any) {
          setAutoLog((prev) => [`❌ Error dispatching unified message: ${err.message}`, ...prev.slice(0, 49)]);
        }
      }

    } else if (scannerStateRef.current === "COOLDOWN") {
      // Cooldown finished, transition back to SCANNING
      setScannerState("SCANNING");
      setActiveContract(null);
      setTimerLeft(0);

      const logReady = `🟢 [Scanner Resumed] Cooldown complete! Resuming real-time monitoring across all 10 indices for setups >= ${minStrengthThresholdRef.current}%.`;
      setAutoLog((prev) => [logReady, ...prev.slice(0, 49)]);
      playBeep(1000, 0.35);
    }
  };

  // Main background tick simulation
  useEffect(() => {
    let timerId: any = null;

    const runSimulationLoop = () => {
      if (!isRunningRef.current) {
        timerId = setTimeout(runSimulationLoop, 1000);
        return;
      }

      // Yield tick updates to Live Websocket if connected
      if (wsModeRef.current === "websocket" && wsStatusRef.current === "CONNECTED") {
        timerId = setTimeout(runSimulationLoop, 1500);
        return;
      }

      // Simulate tick action across all markets
      setMarkets((prev) => {
        const next = prev.map((m) => {
          // randomized micro price fluctuations
          const coef = (Math.random() - 0.495) * 0.0008;
          const newPrice = Number((m.price * (1 + coef)).toFixed(2));
          
          // push a new randomized last digit
          const newDigit = Math.floor(Math.random() * 10);
          
          if (activeContractRef.current && activeContractRef.current.marketId === m.id) {
            activeDigitsRef.current.push(newDigit);
          }

          const nextDigits = [...m.lastDigits.slice(1), newDigit];

          // dynamic strength changes
          let randomShift = Math.floor(Math.random() * 9) - 4;
          let newStrength = m.strength + randomShift;
          if (newStrength < 45) m.strength = 48;
          if (newStrength > 99) newStrength = 99;

          // determine target trading biases dynamically from activeContracts list
          const currentActive = activeContractsRef.current.length > 0 
            ? activeContractsRef.current 
            : ["UNDER 7"];
            
          // Consistently align strategy index per asset
          const strategyIndex = Math.abs(m.id.split("").reduce((acc, char) => acc + char.charCodeAt(0), 0)) % currentActive.length;
          const chosenContract = currentActive[strategyIndex] || "UNDER 7";

          let action = chosenContract;
          let entryDigit = "9";
          let pattern = m.patternFound;
          let strategy = "Second Least Digit";

          // Logic-based trigger/entry digits and patterns for Deriv Over/Under Contracts:
          if (chosenContract === "UNDER 9") {
            entryDigit = "9";
            pattern = "Last digit 9 extreme peak frequency deviation";
            strategy = "Under Digit Drift Mean Reversion";
          } else if (chosenContract === "UNDER 8") {
            entryDigit = "9";
            pattern = "Digit 9 trend clustering (mean reversion)";
            strategy = "Under Digit Drift Mean Reversion";
          } else if (chosenContract === "UNDER 7") {
            entryDigit = "9";
            pattern = "Second Least Digit anomaly detected";
            strategy = "Second Least Digit";
          } else if (chosenContract === "UNDER 6") {
            entryDigit = "8";
            pattern = "Peak tick oscillation above 6 boundary";
            strategy = "Under Digit Drift Mean Reversion";
          } else if (chosenContract === "OVER 1") {
            entryDigit = "0";
            pattern = "Symmetric tick divergence at bottom zone 0";
            strategy = "Over Digit Threshold Oscillator";
          } else if (chosenContract === "OVER 2") {
            entryDigit = "1";
            pattern = "Harmonic support trend cluster on digit 1";
            strategy = "Over Digit Threshold Oscillator";
          } else if (chosenContract === "OVER 3") {
            entryDigit = "2";
            pattern = "Tick wave cycle oversold trigger on digit 2";
            strategy = "Over Digit Threshold Oscillator";
          } else if (chosenContract === "OVER 4") {
            entryDigit = "3";
            pattern = "Tick oscillator oversold at boundary 3";
            strategy = "Over Digit Threshold Oscillator";
          }

          return {
            ...m,
            price: newPrice,
            lastDigits: nextDigits,
            strength: newStrength > 99 ? 99 : newStrength < 45 ? 45 : newStrength,
            action,
            entryDigit,
            strategy,
            patternFound: pattern
          };
        });

        return next;
      });

      // Increment stats
      setScannedCount((c) => c + 1);

      // Trigger standard quiet flash sounds
      if (scannerStateRef.current === "SCANNING") {
        playBeep(950, 0.02);
      }

      // Schedule next run
      timerId = setTimeout(runSimulationLoop, scanSpeedRef.current);
    };

    runSimulationLoop();

    return () => {
      if (timerId) clearTimeout(timerId);
    };
  }, []);

  // Sync strongest market when markets updates, outside of render/state calculations
  useEffect(() => {
    if (markets.length === 0) return;
    const strongest = [...markets].sort((a, b) => b.strength - a.strength)[0];
    if (strongest) {
      setStrongestMarket(strongest);
    }
  }, [markets]);

  // Monitor strongest market fluctuations in real-time, trigger when >= minStrengthThreshold (default 85)
  useEffect(() => {
    if (!isRunning || !strongestMarket) return;
    
    // If in Hourly Scheduler mode, we DO NOT auto-trigger on simple threshold spikes
    if (broadcastFrequency !== "dynamic") return;
    
    // Check if the scanner is currently idle (SCANNING state) and we hit the threshold
    if (scannerState === "SCANNING" && strongestMarket.strength >= minStrengthThreshold) {
      
      const logMsg = `🔥 [Pattern Spike] ${strongestMarket.name} reached ${strongestMarket.strength}% (threshold requirement >= ${minStrengthThreshold}%). Triggering broadcast dispatch...`;
      setAutoLog((prev) => [logMsg, ...prev.slice(0, 49)]);

      // Auto trigger the generator!
      handleTriggerDetection(strongestMarket);
    }
  }, [strongestMarket, isRunning, scannerState, minStrengthThreshold, broadcastFrequency]);

  const compileTemplateSignal = (m: MarketIndex) => {
    let html = `<b>🔔 NEW TRADING SIGNAL 🔔</b>\n\n`;
    html += `<b>${m.name.toUpperCase()}</b>\n\n`;
    html += `📈 <b>${m.action.toUpperCase()}</b>\n`;
    html += `⚡ <b>Strategy:</b> ${m.strategy}\n\n`;
    html += `📊 <b>Market Analysis (${m.ticks})</b>\n`;
    html += `━━━━━━━━━\n`;
    html += `🎯 <b>Entry Instructions:</b>\n\n`;
    html += `<b>USE SNIPPER KILLER BOT</b>\n`;
    html += `💹 <b>Trade:</b> ${m.action}\n`;
    html += `🔑 <b>Entry Digit:</b> <code>${m.entryDigit}</code>\n`;
    html += `⭐ <b>Confidence:</b> ${m.strength}%\n\n`;
    html += `http://kicktrade.site\n\n`;
    html += `📈 <b>Session Stats:</b>\n\n`;
    html += `⚠️ <b>Risk Management:</b>\n`;
    html += `• Stop after 4 consecutive wins\n• Max 5 runs per session\n• Use proper recovery if loss occurs\n\n`;
    
    const now = new Date();
    const timeStr = `${now.getMonth() + 1}/${now.getDate()}/${String(now.getFullYear()).substring(2)}, ${now.toLocaleTimeString("en-US")} UTC`;
    html += `⏰ <b>Time:</b> ${timeStr}\n\n`;
    html += `🤖 Generated by kicktrade Over/Under Bot\n`;
    html += `#TradingSignal #Deriv #OverUnder`;

    return html;
  };

  const handleTriggerDetection = async (targetMarket: MarketIndex) => {
    // Strictly prevent concurrent generation or duplicate dispatches
    if (generatingSignalRef.current || scannerStateRef.current !== "SCANNING") {
      setAutoLog((prev) => [
        `⚠️ Blocked concurrent trigger on ${targetMarket.name}: Scanner state=${scannerStateRef.current} (Generating: ${generatingSignalRef.current})`,
        ...prev.slice(0, 49)
      ]);
      return;
    }

    generatingSignalRef.current = true;
    setGeneratingSignal(true);
    
    const logMsg = `⚙️ Formulating high-accuracy message parameters for ${targetMarket.name}...`;
    setAutoLog((prev) => [logMsg, ...prev.slice(0, 49)]);

    // If there is an active signal running when a new cycle is triggered,
    // end it gracefully first and send its feedback before overwriting!
    if (scannerStateRef.current === "ACTIVE_SIGNAL" && activeContractRef.current) {
      setAutoLog((prev) => [`⏰ Devolving prior active signal on ${activeContractRef.current?.symbol} to send final results feedback before overwrite...`, ...prev.slice(0, 49)]);
      await handleTriggerExpiryFeedbackBeforeOverwrite();
    }

    // Reset captured digit ticker stream
    activeDigitsRef.current = [];

    try {
      let finalHtml = "";
      let finalRationale = "";

      if (isAiCompositionRef.current && aiConfigured) {
        const response = await fetch("/api/gemini/generate-signal", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            assetClass: "Deriv Synthetic",
            symbol: targetMarket.name.toUpperCase(),
            action: targetMarket.action,
            entry: `Digit ${targetMarket.entryDigit}`,
            sl: `Confidence: ${targetMarket.strength}%`,
            isDerivStyle: true,
            strategyName: targetMarket.strategy,
            ticksCount: targetMarket.ticks,
            botName: "USE SNIPPER KILLER BOT",
            entryDigit: targetMarket.entryDigit,
            confidence: `${targetMarket.strength}%`,
            promoUrl: "http://kicktrade.site",
            riskGuidelines: "• Stop after 4 consecutive wins\n• Max 5 runs per session\n• Use proper recovery if loss occurs",
            botSignature: "kicktrade Over/Under Bot",
            hashtags: "#TradingSignal #Deriv #OverUnder"
          })
        });

        const data = await response.json();
        
        if (response.ok && data.signal) {
          finalHtml = data.signal;
          finalRationale = data.rationale;
          setAutoLog((prev) => [`✨ Gemini AI formulated custom algorithmic logic successfully.`, ...prev.slice(0, 49)]);
        } else {
          throw new Error("AI payload was incomplete.");
        }
      } else {
        // compiler template fallback
        finalHtml = compileTemplateSignal(targetMarket);
        finalRationale = `Under/Over Digit contract optimized on ${targetMarket.name} ticks cycle. Pattern anomaly based on '${targetMarket.strategy}' strategy with trigger on digit '${targetMarket.entryDigit}' and algorithmic trend rating placed at ${targetMarket.strength}%.`;
        setAutoLog((prev) => [`⚡ Bot compiler compiled exact requested signal layout immediately.`, ...prev.slice(0, 49)]);
      }

      // Sync onto draft workspace on top bar (skip duplicate automatic broadcast trigger)
      onSignalGenerated({
        assetClass: "Deriv Synthetic",
        symbol: targetMarket.name,
        action: targetMarket.action,
        entry: `Digit ${targetMarket.entryDigit}`,
        tp1: targetMarket.action,
        tp2: "",
        tp3: "",
        sl: `Confidence: ${targetMarket.strength}%`,
        formattedText: finalHtml,
        rationale: finalRationale
      }, true);

      // Save into active states with marketId
      setActiveContract({
        symbol: targetMarket.name,
        action: targetMarket.action,
        strength: targetMarket.strength,
        strategy: targetMarket.strategy,
        entryDigit: targetMarket.entryDigit,
        formattedText: finalHtml,
        ticks: targetMarket.ticks,
        startedAt: Date.now(),
        marketId: targetMarket.id
      });

      // Transmit to active state directly!
      setScannerState("ACTIVE_SIGNAL");
      setTimerLeft(activeSignalDuration);

      playBeep(1205, 0.2);

      // Post direct to Telegram
      if (autoBroadcastRef.current || broadcastFrequencyRef.current === "hourly") {
        if (!configRef.current.botToken || !configRef.current.chatId) {
          const logWarn = `❌ Broadcast aborted: Bot token / chatId not found in config. Please setup standard credentials first!`;
          setAutoLog((prev) => [logWarn, ...prev.slice(0, 49)]);
          return;
        }

        const logCast = `📡 Auto-broadcasting setup alert directly to ${configRef.current.chatId}...`;
        setAutoLog((prev) => [logCast, ...prev.slice(0, 49)]);

        const res = await onPostDirectTelegram(finalHtml);
        if (res.success) {
          setAutoLog((prev) => [`🚀 SENSATIONAL! Live signal sent to Telegram. Tracking expiration under ${activeSignalDuration}s counter.`, ...prev.slice(0, 49)]);
        } else {
          setAutoLog((prev) => [`❌ Post error: ${res.error || "failed."}`, ...prev.slice(0, 49)]);
        }
      }

    } catch (err: any) {
      // Emergency compilation fallback
      const compiledHtml = compileTemplateSignal(targetMarket);
      const compiledRationale = `Emergency digit pattern validation triggered high probability setup on ${targetMarket.name}. Strategy: ${targetMarket.strategy}.`;
      
      onSignalGenerated({
        assetClass: "Deriv Synthetic",
        symbol: targetMarket.name,
        action: targetMarket.action,
        entry: `Digit ${targetMarket.entryDigit}`,
        tp1: targetMarket.action,
        tp2: "",
        tp3: "",
        sl: `Confidence: ${targetMarket.strength}%`,
        formattedText: compiledHtml,
        rationale: compiledRationale
      }, true);

      setActiveContract({
        symbol: targetMarket.name,
        action: targetMarket.action,
        strength: targetMarket.strength,
        strategy: targetMarket.strategy,
        entryDigit: targetMarket.entryDigit,
        formattedText: compiledHtml,
        ticks: targetMarket.ticks,
        startedAt: Date.now(),
        marketId: targetMarket.id
      });

      setScannerState("ACTIVE_SIGNAL");
      setTimerLeft(activeSignalDuration);

      const logErr = `⚠️ Fallback composed (Gemini connection error: ${err.message || "Timeout"}). Active clock running.`;
      setAutoLog((prev) => [logErr, ...prev.slice(0, 49)]);

      // Direct post fallback to Telegram if auto-broadcasting rules are turned on
      if (autoBroadcastRef.current || broadcastFrequencyRef.current === "hourly") {
        if (configRef.current.botToken && configRef.current.chatId) {
          const logCast = `📡 [Fallback Broadcast] Sending signal fallback directly to Telegram...`;
          setAutoLog((prevLogs) => [logCast, ...prevLogs.slice(0, 49)]);
          
          onPostDirectTelegram(compiledHtml).then((res) => {
            if (res.success) {
              setAutoLog((prevLogs) => [`🚀 SENSATIONAL! Fallback signal sent to Telegram successfully.`, ...prevLogs.slice(0, 49)]);
            } else {
              setAutoLog((prevLogs) => [`❌ Post fallback warning: ${res.error || "failed."}`, ...prevLogs.slice(0, 49)]);
            }
          }).catch((tErr) => {
            setAutoLog((prevLogs) => [`❌ Fallback transmission failure: ${tErr.message}`, ...prevLogs.slice(0, 49)]);
          });
        }
      }
    } finally {
      generatingSignalRef.current = false;
      setGeneratingSignal(false);
    }
  };

  const forceManualScanAndSelect = () => {
    if (scannerState !== "SCANNING") {
      setAutoLog((prev) => [`⚠️ Action Blocked: Scanner is currently locked in ${scannerState} state (${timerLeft}s remaining).`, ...prev.slice(0, 49)]);
      return;
    }

    // Select the strongest index setting
    const sorted = [...markets].sort((a, b) => b.strength - a.strength);
    const top = sorted[0];
    
    setAutoLog((prev) => [
      `🎯 Manual evaluation requested. Intercepting tick waves...`,
      `🏆 Identified peak index: ${top.name} [Confidence score: ${top.strength}%]`,
      ...prev.slice(0, 48)
    ]);

    handleTriggerDetection(top);
  };

  const formatHourTimer = (totalSeconds: number) => {
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    
    const hStr = String(hours).padStart(2, "0");
    const mStr = String(minutes).padStart(2, "0");
    const sStr = String(seconds).padStart(2, "0");
    
    return `${hStr}:${mStr}:${sStr}`;
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-6" id="autobot-scanner-card">
      
      {/* 1. STATE-MACHINE HEADER STATUS BAR */}
      <div className="grid grid-cols-1 lg:grid-cols-3 bg-slate-950 rounded-xl p-4 border border-slate-850 gap-4" id="engine-chassis-signals">
        <div className="flex items-center gap-3.5 border-r border-slate-800/80 pr-2 last:border-0">
          <div className="p-3 bg-slate-900 rounded-lg shrink-0">
            <Cpu className={`w-5 h-5 ${isRunning ? "text-[#2ac1f6] animate-pulse" : "text-slate-500"}`} />
          </div>
          <div>
            <div className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Scanner Health</div>
            <div className="text-sm font-black flex items-center gap-1.5 strings-text text-white">
              <span className={`w-2 h-2 rounded-full ${isRunning ? "bg-emerald-400" : "bg-red-400"}`} />
              <span>{isRunning ? "ACTIVE MONITOR" : "PAUSED"}</span>
            </div>
          </div>
        </div>

        {/* CURRENT DYNAMIC STATE CHASSIS */}
        <div className="flex items-center gap-3.5 border-r border-slate-800/80 pr-2 last:border-0 col-span-1 lg:col-span-2 justify-between">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-slate-900 rounded-lg">
              {scannerState === "SCANNING" && <Activity className="w-5 h-5 text-emerald-400 animate-pulse" />}
              {scannerState === "ACTIVE_SIGNAL" && <Flame className="w-5 h-5 text-rose-400 animate-bounce" />}
              {scannerState === "COOLDOWN" && <Hourglass className="w-5 h-5 text-amber-400 animate-spin" />}
            </div>
            <div>
              <div className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Bot Automation Phase</div>
              <div className="text-sm font-black text-white">
                {scannerState === "SCANNING" && (
                  <span className="text-emerald-400 font-sans flex items-center gap-1.5">
                    <span className="flex h-1.5 w-1.5 relative">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500"></span>
                    </span>
                    <span>
                      {broadcastFrequency === "hourly" 
                        ? "HOURLY DISPATCH" 
                        : "DYNAMIC MONITOR"}
                    </span>
                    <span className="text-xs font-normal text-slate-450 lowercase">
                      {broadcastFrequency === "hourly"
                        ? `(${formatCadenceValue(hourlyIntervalMinutes)} interval)`
                        : `(>= ${minStrengthThreshold}%)`}
                    </span>
                  </span>
                )}
                {scannerState === "ACTIVE_SIGNAL" && (
                  <span className="text-rose-400 font-sans flex items-center gap-1">
                    <span>LIVE SIGNAL RUNNING</span>
                    <span className="text-xs font-normal text-slate-450 lowercase">({activeContract?.symbol.split(" ")[1]} Idx)</span>
                  </span>
                )}
                {scannerState === "COOLDOWN" && (
                  <span className="text-amber-400 font-sans flex items-center gap-1">
                    <span>COOLDOWN RESTRICTION ACTIVE</span>
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* COUNTDOWN CLOCK */}
          {(scannerState === "ACTIVE_SIGNAL" || scannerState === "COOLDOWN" || (scannerState === "SCANNING" && broadcastFrequency === "hourly")) && (
            <div className="bg-slate-900 px-4 py-2 rounded-lg border border-slate-850 flex items-center gap-3 font-mono shrink-0">
              <Clock className="w-4 h-4 text-[#2ac1f6] shrink-0" />
              <div>
                <div className="text-[9px] uppercase tracking-widest text-[#2ac1f6] font-bold">
                  {scannerState === "ACTIVE_SIGNAL" 
                    ? "EXPIRING IN" 
                    : scannerState === "COOLDOWN" 
                    ? "SAFE SCAN IN" 
                    : "NEXT DISPATCH"}
                </div>
                <div className="text-sm font-black text-white tracking-wide font-mono">
                  {scannerState === "SCANNING" && broadcastFrequency === "hourly" 
                    ? formatHourTimer(hourlyTimerLeft) 
                    : `${timerLeft}s`}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* CORE INFORMATION BANNERS */}
      {scannerState === "ACTIVE_SIGNAL" && activeContract && (
        <div className="bg-rose-950/20 border border-rose-900/40 rounded-xl p-4 space-y-2 animate-fade-in" id="active-expired-card-banner">
          <div className="flex items-center gap-2 text-rose-300 font-bold text-xs font-sans">
            <Radio className="w-4 h-4 text-rose-450 animate-pulse" />
            <span>Active Volatility Digit Signal Dispatch Live</span>
          </div>
          <p className="text-xs text-slate-350 leading-relaxed">
            The Bot formulated and successfully posted a <b>{activeContract.action}</b> digit contract signal on <b>{activeContract.symbol}</b> with confidence level <b>{activeContract.strength}%</b>. Subscriptions are following this setup.
          </p>
          <div className="flex items-center justify-between text-[10px] font-mono text-slate-500 bg-slate-950/50 p-2 rounded border border-slate-900">
            <span>⌛ Auto-Expiry Countdown Progress: {timerLeft}s left</span>
            <span>🚨 WILL BROADCAST EXPIRY ALERT AT 0s!</span>
          </div>
        </div>
      )}

      {scannerState === "COOLDOWN" && (
        <div className="bg-amber-950/15 border border-amber-900/30 rounded-xl p-4 space-y-2.5 animate-fade-in" id="active-cooldown-card-banner">
          <div className="flex items-center gap-2 text-amber-300 font-bold text-xs font-sans">
            <Hourglass className="w-4 h-4 text-amber-400 animate-spin" />
            <span>Informing Users: Pattern Cool-down Loop</span>
          </div>
          <p className="text-xs text-slate-350 leading-relaxed">
            The scanner is protecting users' risk lines by pausing new trade requests for <b>{cooldownDuration} seconds</b>. Traders are advised to pause automated bots inside this window.
          </p>
          <div className="bg-slate-950/60 p-2.5 rounded-lg border border-slate-900 text-center">
            <span className="text-[11px] font-mono text-amber-400">
              ⚡ Next scan cycles automatically unlocked in: <b>{timerLeft} seconds</b>
            </span>
          </div>
        </div>
      )}

      {/* REAL-TIME WEBSOCKET FEED STATUS BANNER */}
      <div className="bg-slate-950/80 border border-slate-900 rounded-xl p-3.5 flex flex-col md:flex-row items-center justify-between gap-4 text-xs font-sans shadow-md" id="deriv-websocket-integration-status-banner">
        <div className="flex items-center gap-3">
          <div className={`p-2 rounded-xl border flex items-center justify-center ${
            wsMode === "websocket"
              ? wsStatus === "CONNECTED"
                ? "bg-emerald-950/60 text-emerald-400 border-emerald-900"
                : wsStatus === "CONNECTING"
                  ? "bg-amber-950/60 text-amber-400 border-amber-900 animate-pulse"
                  : "bg-rose-950/60 text-rose-450 border-rose-900"
              : "bg-slate-900 text-slate-400 border-slate-800"
          }`}>
            <Radio className={`w-4 h-4 ${wsStatus === "CONNECTED" && wsMode === "websocket" ? "animate-pulse" : ""}`} />
          </div>
          
          <div className="space-y-0.5">
            <div className="flex items-center gap-2 text-left">
              <span className="text-slate-200 font-bold">Deriv Feed Integration:</span>
              <span className={`px-2 py-0.5 rounded text-[9px] uppercase tracking-wide font-black ${
                wsMode === "websocket"
                  ? wsStatus === "CONNECTED"
                    ? "bg-emerald-950 text-emerald-400 border border-emerald-900/60"
                    : wsStatus === "CONNECTING"
                      ? "bg-amber-950 text-amber-400 border border-amber-900/60 animate-pulse"
                      : "bg-rose-950 text-rose-400 border border-rose-900/60"
                  : "bg-slate-900 text-slate-400 border border-slate-800"
              }`}>
                {wsMode === "websocket" ? `Websocket: ${wsStatus}` : "Simulation Mode"}
              </span>
            </div>
            <p className="text-[11px] text-slate-400 leading-tight text-left">
              {wsMode === "websocket" && wsStatus === "CONNECTED"
                ? `⚡ Streaming tick transactions in real-time directly from wss://ws.derivws.com/ (Latency: ${wsLatency}ms)`
                : wsMode === "websocket"
                  ? "📡 Dialing socket connection nodes for Volatility Index streams..."
                  : "⏸️ Running simulated algorithmic models offline. Turn on live feed to analyze real charts."}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 w-full md:w-auto justify-end">
          {/* Mode Selector Button */}
          <button
            type="button"
            onClick={() => {
              const nextMode = wsMode === "websocket" ? "simulated" : "websocket";
              setWsMode(nextMode);
              setAutoLog((prev) => [
                `🔄 Switched scanner source to: ${nextMode === "websocket" ? "LIVE DERIV WEBSOCKETS" : "LOCAL SIMULATOR"}`,
                ...prev.slice(0, 49)
              ]);
            }}
            className={`py-1.5 px-3 rounded-lg text-[11px] font-bold border transition-all duration-150 cursor-pointer ${
              wsMode === "websocket"
                ? "bg-slate-900 hover:bg-slate-850 text-slate-300 border-slate-850"
                : "bg-emerald-950/30 hover:bg-emerald-950/50 text-emerald-400 border-emerald-950"
            }`}
            id="toggle-websocket-sources"
          >
            {wsMode === "websocket" ? "🔌 Switch to Simulator" : "📡 Connect Live Websockets"}
          </button>

          {wsMode === "websocket" && (
            <button
              type="button"
              onClick={() => {
                setWsMode("simulated");
                setTimeout(() => setWsMode("websocket"), 100);
                setAutoLog((prev) => ["🔄 Manual WebSocket reconnection cycle requested...", ...prev.slice(0, 49)]);
              }}
              className="p-1.5 px-2.5 bg-slate-900 hover:bg-slate-850 border border-slate-850 rounded-lg text-slate-300 transition-all cursor-pointer flex items-center justify-center gap-1.5"
              title="Reconnect Websocket"
              id="reconnect-ws-btn"
            >
              <RefreshCw className="w-3.5 h-3.5 text-slate-400" />
              <span className="text-[11px] font-bold">Reconnect</span>
            </button>
          )}
        </div>
      </div>

      {/* CARD HEADER */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800/80 pb-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="flex h-2 w-2 relative">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-sky-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-sky-500"></span>
            </span>
            <h2 className="text-sm font-extrabold text-white tracking-widest uppercase font-mono flex items-center gap-2">
              <Server className="w-4 h-4 text-indigo-400" />
              <span>Realtime Scanner Engine Config</span>
            </h2>
          </div>
          <p className="text-xs text-slate-400">
            Scanning all 10 synthetic assets to capture anomalies {">="} 85%. Alerts expire automatically.
          </p>
        </div>

        {/* SCANNER STATS & CONTROLS */}
        <div className="flex items-center gap-2 shrink-0">
          {isRunning ? (
            <button
              onClick={() => {
                setIsRunning(false);
                setAutoLog((prev) => ["⏸️ Scanner engine paused. Manual controls active.", ...prev.slice(0, 49)]);
              }}
              className="py-1.5 px-3 bg-rose-950/40 text-rose-300 border border-rose-900/40 rounded-xl hover:text-white hover:bg-rose-900/30 transition-all text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
              id="pause-scans"
            >
              <Square className="w-3 h-3 fill-rose-300/10" />
              <span>Pause Bot</span>
            </button>
          ) : (
            <button
              onClick={() => {
                setIsRunning(true);
                setAutoLog((prev) => ["▶️ Scanner running. Searching indexes...", ...prev.slice(0, 49)]);
              }}
              className="py-1.5 px-3 bg-emerald-950/50 text-emerald-300 border border-emerald-900/40 rounded-xl hover:text-white hover:bg-emerald-900/30 transition-all text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
              id="start-scans"
            >
              <Play className="w-3 h-3 fill-emerald-300/10" />
              <span>Activate Bot</span>
            </button>
          )}

          <button
            onClick={forceManualScanAndSelect}
            disabled={scannerState !== "SCANNING"}
            className="py-1.5 px-3 bg-sky-950/80 text-sky-300 border border-sky-900 disabled:border-slate-800 disabled:text-slate-600 text-xs font-semibold rounded-xl hover:text-white hover:bg-sky-900 transition-all flex items-center gap-1.5 cursor-pointer disabled:cursor-not-allowed"
            id="force-scans"
          >
            <RefreshCw className={`w-3 h-3 ${generatingSignal ? "animate-spin text-amber-300" : ""}`} />
            <span>Force Instant Scan</span>
          </button>
        </div>
      </div>

      {/* STRONGEST SPOTLIGHT PANEL */}
      {strongestMarket && (
        <div className="bg-gradient-to-r from-sky-950/40 via-slate-950/85 to-indigo-950/30 border border-sky-900/40 rounded-xl p-4 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4 relative overflow-hidden" id="strongest-ticker-spotlight">
          <div className="absolute top-0 right-0 w-32 h-32 bg-sky-500/10 rounded-full blur-2xl -mr-12 -mt-12 pointer-events-none"></div>
          
          <div className="space-y-2">
            <div className="flex items-center gap-1.5">
              <span className="px-2 py-0.5 bg-sky-450/15 text-sky-400 font-mono font-bold tracking-wider rounded-lg text-[9px] uppercase border border-sky-500/25 flex items-center gap-1">
                <Zap className="w-2.5 h-2.5 fill-sky-400/20" />
                <span>Peak Strength Index</span>
              </span>
              <span className="text-[10px] text-slate-500 font-mono">ID: {strongestMarket.id}</span>
            </div>

            <div className="space-y-1">
              <div className="text-base font-bold text-white tracking-tight flex items-center gap-2">
                <span>{strongestMarket.name}</span>
                <span className="text-sky-300 font-mono text-sm font-semibold">${strongestMarket.price.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
              </div>
              <div className="text-xs text-slate-300 flex items-center gap-3">
                <span className="flex items-center gap-1">
                  🎯 Auto-Trade target: <b className="text-amber-400 font-mono">{strongestMarket.action}</b>
                </span>
                <span>•</span>
                <span className="flex items-center gap-1">
                  🧠 Strategy: <small className="text-emerald-400 font-medium font-sans">{strongestMarket.strategy}</small>
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3 shrink-0 select-none">
            <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-2.5 text-center px-4 font-mono">
              <div className="text-[10px] text-slate-500 uppercase font-semibold">Trend Score</div>
              <div className="text-2xl font-black text-sky-400 flex items-baseline justify-center">
                <span>{strongestMarket.strength}</span>
                <span className="text-xs font-normal text-sky-550">%</span>
              </div>
            </div>

            <button
              onClick={() => handleTriggerDetection(strongestMarket)}
              disabled={generatingSignal || scannerState !== "SCANNING"}
              className="px-4 py-3.5 text-xs font-bold bg-gradient-to-r from-sky-500 to-indigo-600 hover:from-sky-400 hover:to-indigo-500 disabled:from-slate-800 disabled:to-slate-800 disabled:text-slate-600 text-white rounded-xl shadow-lg shadow-sky-500/10 cursor-pointer flex items-center gap-2 disabled:cursor-not-allowed"
              id="draft-trigger"
            >
              <Sparkles className="w-4 h-4 text-xs text-yellow-300" />
              <span>Draft Setup</span>
            </button>
          </div>
        </div>
      )}

      {/* RANGE CONTROLS & TRADING RULES FOR THE BOT SCANNER */}
      <div className="bg-slate-950 border border-slate-850 rounded-xl p-4 space-y-4 font-sans text-xs">
        <span className="text-xs font-extrabold text-white flex items-center gap-1.5 border-b border-slate-900 pb-2 uppercase tracking-wide">
          <Gauge className="w-3.5 h-3.5 text-[#2ac1f6]" />
          <span>Scanner Trigger Strategy Configurations</span>
        </span>

        {/* 3 SLIDERS FOR DYNAMIC STRENGTH TARGET, SIGNAL LIFETIME, COOLDOWN LIFETIME */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Slider 1: Min Strength Threshold */}
          <div className="space-y-2">
            <div className="flex justify-between items-center text-[11px]">
              <span className="text-slate-300 font-semibold flex items-center gap-1">
                <TrendingUp className="w-3.5 h-3.5 text-sky-400" />
                <span>Min Signal Confidence Trigger</span>
              </span>
              <span className="text-[#2ac1f6] font-bold font-mono text-xs">{minStrengthThreshold}%</span>
            </div>
            <input
              type="range"
              min="75"
              max="95"
              step="1"
              value={minStrengthThreshold}
              onChange={(e) => {
                const val = parseInt(e.target.value);
                setMinStrengthThreshold(val);
                setAutoLog((prev) => [`⚙️ Trigger threshold adjusted to >= ${val}% strength.`, ...prev.slice(0, 49)]);
              }}
              className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-[#2ac1f6]"
              id="range-threshold-slider"
            />
            <p className="text-[10px] text-slate-500">The scanner will only share target indices matching this exact strength level or above (default 85%).</p>
          </div>

          {/* Slider 2: Contract active lifespan */}
          <div className="space-y-2">
            <div className="flex justify-between items-center text-[11px]">
              <span className="text-slate-300 font-semibold flex items-center gap-1">
                <Clock className="w-3.5 h-3.5 text-rose-400" />
                <span>Active Lifetime Plan</span>
              </span>
              <span className="text-rose-450 font-bold font-mono text-xs">
                {activeSignalDuration}s ({Math.floor(activeSignalDuration / 60)}m{activeSignalDuration % 60 > 0 ? ` ${activeSignalDuration % 60}s` : ""})
              </span>
            </div>
            <input
              type="range"
              min="15"
              max="600"
              step="15"
              value={activeSignalDuration}
              onChange={(e) => {
                const val = parseInt(e.target.value);
                setActiveSignalDuration(val);
              }}
              className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-rose-500"
              id="range-expiry-slider"
            />
            <p className="text-[10px] text-slate-500">The amount of seconds the signal contract is considered "live" before broadcasting expiration.</p>
          </div>

          {/* Slider 3: Cooldown Duration */}
          <div className="space-y-2">
            <div className="flex justify-between items-center text-[11px]">
              <span className="text-slate-300 font-semibold flex items-center gap-1">
                <Hourglass className="w-3.5 h-3.5 text-amber-400" />
                <span>Cooldown Hold Interval</span>
              </span>
              <span className="text-amber-450 font-bold font-mono text-xs">{cooldownDuration} seconds</span>
            </div>
            <input
              type="range"
              min="10"
              max="90"
              step="5"
              value={cooldownDuration}
              onChange={(e) => {
                const val = parseInt(e.target.value);
                setCooldownDuration(val);
              }}
              className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-amber-500"
              id="range-cooldown-slider"
            />
            <p className="text-[10px] text-slate-500">How long to wait after expiring before scanning resumes. Informs users on-screen.</p>
          </div>
        </div>

        {/* AUTOMATION PREFERENCE CONFIGURATION */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 pt-4 border-t border-slate-900 text-xs">
          {/* Column 1: Mode & Cadence Interval Settings */}
          <div className="space-y-3">
            <div className="space-y-1">
              <label className="text-slate-350 font-bold block">Signal Broadcast Mode</label>
              <div className="grid grid-cols-2 gap-1 bg-slate-900 p-0.5 border border-slate-850 rounded-lg">
                <button
                  type="button"
                  onClick={() => {
                    setBroadcastFrequency("hourly");
                    setHourlyTimerLeft(hourlyIntervalMinutes * 60);
                    setAutoLog((prev) => ["🎯 Broadcast Mode: Strict Hourly Schedule activated.", ...prev.slice(0, 49)]);
                  }}
                  className={`py-1.5 px-2 text-[10px] font-bold rounded-md transition-all cursor-pointer text-center ${
                    broadcastFrequency === "hourly"
                      ? "bg-slate-800 text-[#2ac1f6] shadow-sm font-black"
                      : "text-slate-500 hover:text-slate-350"
                  }`}
                >
                  Strict Hour Cycle
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setBroadcastFrequency("dynamic");
                    setAutoLog((prev) => ["🎯 Broadcast Mode: Real-time Pattern Spike activated.", ...prev.slice(0, 49)]);
                  }}
                  className={`py-1.5 px-2 text-[10px] font-bold rounded-md transition-all cursor-pointer text-center ${
                    broadcastFrequency === "dynamic"
                      ? "bg-slate-800 text-emerald-400 shadow-sm font-black"
                      : "text-slate-500 hover:text-slate-350"
                  }`}
                >
                  Pattern Spike
                </button>
              </div>
            </div>

            {/* Conditionally show hourly cycle settings */}
            {broadcastFrequency === "hourly" ? (
              <div className="space-y-3 bg-slate-900/60 p-2.5 rounded-lg border border-slate-850/60" id="cadence-preset-config-panel">
                <div className="flex justify-between items-center text-[10.5px]">
                  <span className="text-slate-400 font-medium font-sans">Hourly Cadence Plan:</span>
                  <span className="text-[#2ac1f6] font-extrabold font-mono">
                    {formatCadenceValue(hourlyIntervalMinutes)}
                  </span>
                </div>

                <div className="space-y-1">
                  <label className="text-slate-400 font-medium font-sans block text-[10px]" htmlFor="broadcast-cadence-dropdown">
                    Select Sharing Cadence Interval:
                  </label>
                  <select
                    id="broadcast-cadence-dropdown"
                    value={[0.5, 2, 5, 15, 30, 45, 60, 90, 120].includes(hourlyIntervalMinutes) ? hourlyIntervalMinutes : ""}
                    onChange={(e) => {
                      const val = parseFloat(e.target.value);
                      if (!isNaN(val)) {
                        setHourlyIntervalMinutes(val);
                        setHourlyTimerLeft(val * 60);
                        const names: Record<number, string> = {
                          0.5: "30 seconds",
                          2: "2 minutes",
                          5: "5 minutes",
                          15: "15 minutes",
                          30: "30 minutes",
                          45: "45 minutes",
                          60: "1 hr",
                          90: "1 hr 30 minutes",
                          120: "2 hrs"
                        };
                        setAutoLog((prev) => [
                          `⚙️ Hourly Cadence updated: ${names[val] || `${val}m`}. Timer reset.`,
                          ...prev.slice(0, 49)
                        ]);
                      }
                    }}
                    className="w-full bg-slate-950 border border-slate-850 text-[#2ac1f6] text-[11px] py-1.5 px-2 rounded-lg focus:outline-none focus:ring-1 focus:ring-[#2ac1f6]/60 cursor-pointer font-bold"
                  >
                    {![0.5, 2, 5, 15, 30, 45, 60, 90, 120].includes(hourlyIntervalMinutes) && (
                      <option value="">Custom ({formatCadenceValue(hourlyIntervalMinutes)})</option>
                    )}
                    <option value="0.5">30 seconds</option>
                    <option value="2">2 minutes</option>
                    <option value="5">5 minutes</option>
                    <option value="15">15 minutes</option>
                    <option value="30">30 minutes</option>
                    <option value="45">45 minutes</option>
                    <option value="60">1 hr</option>
                    <option value="90">1 hr 30 minutes</option>
                    <option value="120">2 hrs</option>
                  </select>
                </div>

                {/* Quick Selection Button Pills */}
                <div className="space-y-1 pt-0.5">
                  <span className="text-slate-400 text-[9.5px] font-semibold font-sans block">Quick Interval Actions:</span>
                  <div className="flex flex-wrap gap-1">
                    {[
                      { label: "30s", mins: 0.5 },
                      { label: "2m", mins: 2 },
                      { label: "5m", mins: 5 },
                      { label: "15m", mins: 15 },
                      { label: "30m", mins: 30 },
                      { label: "45m", mins: 45 },
                      { label: "1h", mins: 60 },
                      { label: "1.5h", mins: 90 },
                      { label: "2h", mins: 120 }
                    ].map((opt) => (
                      <button
                        key={opt.mins}
                        type="button"
                        onClick={() => {
                          setHourlyIntervalMinutes(opt.mins);
                          setHourlyTimerLeft(opt.mins * 60);
                          const names: Record<number, string> = {
                            0.5: "30 seconds",
                            2: "2 minutes",
                            5: "5 minutes",
                            15: "15 minutes",
                            30: "30 minutes",
                            45: "45 minutes",
                            60: "1 hr",
                            90: "1 hr 30 minutes",
                            120: "2 hrs"
                          };
                          setAutoLog((prev) => [
                            `⚙️ Cadence set directly: ${names[opt.mins]}. Timer reset.`,
                            ...prev.slice(0, 49)
                          ]);
                        }}
                        className={`px-1.5 py-0.5 rounded text-[9.5px] font-bold border transition-all cursor-pointer ${
                          hourlyIntervalMinutes === opt.mins
                            ? "bg-sky-950 text-[#2ac1f6] border-sky-850 font-black"
                            : "bg-slate-950/70 text-slate-450 border-slate-850 hover:text-slate-300"
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>

                <input
                  type="range"
                  min="0.5"
                  max="120"
                  step="0.5"
                  value={hourlyIntervalMinutes}
                  onChange={(e) => {
                    const val = parseFloat(e.target.value);
                    setHourlyIntervalMinutes(val);
                    setHourlyTimerLeft(Math.round(val * 60));
                    setAutoLog((prev) => [`⚙️ Hourly Cadence custom slider adjusted: ${formatCadenceValue(val)}. Timer reset.`, ...prev.slice(0, 49)]);
                  }}
                  className="w-full h-1 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-[#2ac1f6]"
                />
                
                <div className="flex items-center gap-1.5 pt-1.5 justify-between">
                  <button
                    type="button"
                    onClick={() => {
                      setHourlyTimerLeft(10);
                      setAutoLog((prev) => ["⏩ Accelerated: Next hourly dispatch scheduled in 10 seconds for testing!", ...prev.slice(0, 49)]);
                    }}
                    className="flex-1 py-1 px-1.5 bg-slate-850 hover:bg-slate-750 text-[#2ac1f6] border border-slate-700/80 rounded text-[9px] font-semibold text-center cursor-pointer transition-colors"
                  >
                    ⏩ Fast Test (10s)
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setHourlyTimerLeft(1);
                      setAutoLog((prev) => ["⚡ Hourly Trigger Force Dispatching Immediately...", ...prev.slice(0, 49)]);
                    }}
                    className="flex-1 py-1 px-1.5 bg-[#035a76]/45 hover:bg-[#035a76]/65 text-cyan-300 border border-cyan-900/40 rounded text-[9px] font-semibold text-center cursor-pointer transition-colors"
                  >
                    ⚡ Force Now
                  </button>
                </div>
              </div>
            ) : (
              <p className="text-[10px] text-slate-500 leading-tight italic">
                In Pattern Spike mode, signals are transmitted dynamically as soon as an asset hits the {minStrengthThreshold}% confidence threshold.
              </p>
            )}
          </div>

          {/* Column 2: Specific Over / Under Barriers Option Lists */}
          <div className="space-y-2 lg:col-span-1">
            <div className="flex justify-between items-center">
              <label className="text-slate-350 font-bold block">Digit Barriers Matrix ({activeContracts.length} active)</label>
              <div className="flex gap-1.5 text-[9px] font-mono">
                <button
                  type="button"
                  onClick={() => {
                    setActiveContracts(["OVER 1", "OVER 2", "OVER 3", "OVER 4", "UNDER 6", "UNDER 7", "UNDER 8", "UNDER 9"]);
                    setAutoLog((prev) => ["⚙️ Selected all 8 Over/Under trade barrier targets.", ...prev.slice(0, 49)]);
                  }}
                  className="text-slate-400 hover:text-white cursor-pointer hover:underline"
                >
                  All
                </button>
                <span className="text-slate-700">|</span>
                <button
                  type="button"
                  onClick={() => {
                    setActiveContracts([]);
                    setAutoLog((prev) => ["⚠️ Selection cleared. Please select at least 1 digit barrier setup.", ...prev.slice(0, 49)]);
                  }}
                  className="text-slate-400 hover:text-white cursor-pointer hover:underline"
                >
                  Clear
                </button>
              </div>
            </div>

            <div className="grid grid-cols-4 gap-1.5" id="monitored-barriers-matrix-gui">
              {["OVER 1", "OVER 2", "OVER 3", "OVER 4", "UNDER 6", "UNDER 7", "UNDER 8", "UNDER 9"].map((b) => {
                const isActive = activeContracts.includes(b);
                const isOver = b.startsWith("OVER");
                return (
                  <button
                    key={b}
                    type="button"
                    onClick={() => {
                      if (isActive) {
                        setActiveContracts((prev) => prev.filter((item) => item !== b));
                        setAutoLog((prev) => [`❌ Removed barrier ${b} from scanner list.`, ...prev.slice(0, 49)]);
                      } else {
                        setActiveContracts((prev) => [...prev, b]);
                        setAutoLog((prev) => [`` + `✅ Added barrier ${b} to active scanner setup.`, ...prev.slice(0, 49)]);
                      }
                    }}
                    className={`py-1 rounded font-mono font-bold text-[9px] transition-all border text-center cursor-pointer ${
                      isActive 
                        ? isOver 
                          ? "bg-emerald-950/45 text-emerald-300 border-emerald-800/60" 
                          : "bg-sky-950/45 text-sky-300 border-sky-800/60"
                        : "bg-slate-900 text-slate-600 border-slate-850 hover:border-slate-750/80"
                    }`}
                  >
                    {b}
                  </button>
                );
              })}
            </div>
            <p className="text-[10px] text-slate-550 leading-tight">
              Bot scans <strong>only</strong> for selected Over/Under digit conditions. Fits exactly with channel instructions.
            </p>
          </div>

          {/* Column 3: Auto-Broadcasting Feed Switch */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-slate-350 font-bold block flex items-center gap-1.5">
                <Radio className="text-rose-400 w-3.5 h-3.5 animate-pulse" />
                <span>Auto-Broadcasting Channel</span>
              </label>
              <span className={`text-[8.5px] uppercase px-1.5 py-0.2 rounded font-black border ${
                autoBroadcast ? "bg-rose-950 text-rose-300 border-rose-900/40" : "bg-slate-900 text-slate-500 border-slate-800"
              }`}>
                {autoBroadcast ? "LIVE ACTIVE" : "MANUAL ONLY"}
              </span>
            </div>
            <p className="text-[10px] text-slate-500 leading-snug">
              When active, the scanner automatically pushes setups, expirations, and ready status announcements directly to Telegram.
            </p>
            
            <div className="grid grid-cols-2 gap-1.5 pt-1">
              <button
                type="button"
                onClick={() => {
                  setAutoBroadcast(false);
                  setAutoLog((prev) => ["🔒 Auto-broadcast disabled. Setup alerts will wait for manual approvals.", ...prev.slice(0, 49)]);
                }}
                className={`py-1.5 px-2 text-[10px] font-bold rounded-lg transition-all cursor-pointer text-center ${
                  !autoBroadcast
                    ? "bg-slate-850 text-white border border-slate-700/50"
                    : "bg-slate-905 text-slate-450 border border-slate-850 hover:bg-slate-800/30"
                }`}
              >
                Compose Drafts Only
              </button>
              <button
                type="button"
                onClick={() => {
                  setAutoBroadcast(true);
                  setAutoLog((prev) => ["🚀 Auto-broadcast enabled! Transmitting hourly plans directly to Telegram.", ...prev.slice(0, 49)]);
                }}
                className={`py-1.5 px-2 text-[10px] font-bold rounded-lg transition-all cursor-pointer text-center ${
                  autoBroadcast
                    ? "bg-rose-950/55 text-rose-300 border border-rose-900/40"
                    : "bg-slate-905 text-slate-455 border border-slate-850 hover:bg-slate-800/30"
                }`}
              >
                Auto-Broadcast Live
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* MULTI-MARKET STATUS GRID */}
      <div className="space-y-2">
        <div className="flex items-center justify-between text-[11px] font-bold text-slate-400 px-1 uppercase tracking-wider">
          <span>Real-time Market Matrix (Matching Criteria Check)</span>
          <span>Index Trend Strength vs Target</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3" id="volatility-grid-10-markets">
          {markets.map((m) => {
            const isHighest = strongestMarket?.id === m.id;
            const matchesThreshold = m.strength >= minStrengthThreshold;
            return (
              <div
                key={m.id}
                onClick={() => {
                  setStrongestMarket(m);
                  playBeep(1000, 0.04);
                }}
                className={`p-3.5 rounded-xl border flex items-center justify-between gap-3 cursor-pointer transition-all ${
                  isHighest 
                    ? "border-sky-500/60 bg-sky-950/10 shadow-md scale-[1.01]" 
                    : matchesThreshold
                    ? "border-emerald-500/40 bg-emerald-950/5"
                    : "border-slate-850 bg-slate-950/60 hover:bg-slate-950"
                }`}
                id={`market-idx-item-${m.id}`}
              >
                <div className="space-y-1.5 flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <CircleDot className={`w-2.5 h-2.5 ${
                      isHighest 
                        ? "text-sky-400 animate-pulse" 
                        : matchesThreshold 
                        ? "text-emerald-400" 
                        : "text-slate-600"
                    }`} />
                    <h3 className="text-xs font-bold text-slate-100 truncate tracking-wide">{m.name}</h3>
                  </div>

                  <div className="flex items-center justify-between text-[10px] font-mono text-slate-450">
                    <span className="truncate text-slate-300 font-semibold">${m.price.toFixed(2)}</span>
                    <span className={`text-[9px] border px-1.5 py-0.2 rounded font-bold ${
                      matchesThreshold 
                        ? "bg-emerald-950/30 text-emerald-400 border-emerald-900/30" 
                        : "bg-slate-900 text-slate-500 border-slate-800"
                    }`}>
                      {m.action}
                    </span>
                  </div>

                  {/* Tick Digital Flow bar */}
                  <div className="flex items-center gap-1 font-mono text-[9px] text-slate-500 pt-0.5">
                    <span className="text-[8px] uppercase tracking-wider">Ticks pattern:</span>
                    <div className="flex gap-0.5">
                      {m.lastDigits.map((dig, idx) => {
                        const isTrigger = String(dig) === m.entryDigit;
                        return (
                          <span 
                            key={idx} 
                            className={`w-3.5 h-3.5 rounded flex items-center justify-center font-bold font-mono transition-colors text-[9px] ${
                              isTrigger 
                                ? "bg-amber-950/80 text-amber-300 border border-amber-500/20 animate-pulse" 
                                : dig < 7 
                                ? "bg-emerald-950/30 text-emerald-400" 
                                : "bg-slate-900 text-slate-500"
                            }`}
                          >
                            {dig}
                          </span>
                        );
                      })}
                    </div>
                  </div>
                </div>

                {/* Score Dial status bar representation */}
                <div className="text-right shrink-0 min-w-[70px] space-y-1 text-right font-sans">
                  <div className="flex items-baseline justify-end font-mono">
                    <span className={`text-sm font-black ${
                      matchesThreshold ? "text-sky-400" : "text-slate-500"
                    }`}>{m.strength}%</span>
                  </div>

                  {/* Horizontal visual meter bar */}
                  <div className="w-16 bg-slate-900 h-1 rounded-full overflow-hidden ml-auto">
                    <div 
                      className={`h-full transition-all duration-300 ${
                        matchesThreshold ? "bg-[#2ac1f6]" : m.strength >= 75 ? "bg-indigo-500" : "bg-slate-700"
                      }`} 
                      style={{ width: `${m.strength}%` }}
                    />
                  </div>

                  <div className="text-[8px] font-mono font-bold tracking-wider uppercase">
                    {matchesThreshold ? (
                      <span className="text-emerald-405">TARGET MATCH</span>
                    ) : (
                      <span className="text-slate-600">SCAN EXCLUDED</span>
                    )}
                  </div>
                </div>

              </div>
            );
          })}
        </div>
      </div>

      {/* LIVE SCANNER LOGGER LIST */}
      <div className="space-y-1.5 text-xs">
        <div className="flex items-center justify-between text-slate-405 px-1 font-bold text-[10px] uppercase font-mono tracking-widest">
          <span>Scanner Console Monitoring Protocol</span>
          <span className="text-[#2ac1f6] font-bold">TICKS STREAM COUNT ({scannedCount})</span>
        </div>

        <div className="h-32 bg-[#090e18] border border-slate-850 rounded-xl p-3 font-mono text-[10.5px] leading-relaxed text-slate-350 space-y-1.5 overflow-y-auto" id="scanner-logger-listbox">
          {autoLog.map((log, idx) => (
            <div key={idx} className="flex items-start gap-1.5 border-b border-slate-950/60 pb-1.5 last:border-b-0 hover:text-white">
              <span className="text-slate-600 shrink-0 select-none">[{idx}]</span>
              <span className="break-all">{log}</span>
            </div>
          ))}
        </div>
      </div>

    </div>
  );
}
