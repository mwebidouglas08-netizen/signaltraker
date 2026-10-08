export type SignalStatus = "ACTIVE" | "TP1_HIT" | "TP2_HIT" | "TP3_HIT" | "SL_HIT" | "CLOSED";

export interface SignalUpdate {
  id: string;
  updateType: string;
  text: string;
  sentMessageId: string;
  timestamp: string;
}

export interface TradingSignal {
  id: string;
  assetClass: string;
  symbol: string;
  action: string;
  entry: string;
  tp1: string;
  tp2: string;
  tp3: string;
  sl: string;
  userNotes: string;
  formattedText: string;
  rationale: string;
  status: SignalStatus;
  sentMessageId: string | null;
  botTokenUsed: string | null;
  chatIdUsed: string | null;
  chatTitle: string | null;
  createdAt: string;
  updateHistory: SignalUpdate[];
  // Expiry lifecycle: validity window in minutes (server signals use the cron
  // interval, browser scanner signals default to 5). Alerts delete silently.
  validMinutes?: number;
  expiryNoticeSent?: boolean;
  siteName?: string;
  isAlert?: boolean;
  // Last auto-delete failure for this record (e.g. missing admin rights) —
  // rendered in History so it is visible instead of silent.
  deleteError?: string;
}

export interface TelegramConfig {
  botToken: string;
  chatId: string;
  chatTitle?: string;
  isConnected: boolean;
  enableScannerBroadcast?: boolean;
  enableManualBroadcast?: boolean;
}
