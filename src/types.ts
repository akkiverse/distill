export type AiStatus = "ok" | "offline" | "not_configured" | "error";

export interface Section {
  id: string;
  name: string;
}

export interface KeyFigure {
  label: string;
  value: number;
  unit: string;
}

export interface Card {
  id: string;
  topic_section: string;
  title: string;
  source_name: string;
  source_url: string;
  published_at: string | null;
  fetched_at: string;
  summary: string;
  key_points: string[];
  key_figures: KeyFigure[];
  story_key: string;
  relevance: number;
  saved: boolean;
  saved_changed_at: string | null;
  ai_status: AiStatus;
  /** When a newer report on the same story replaced an older card (AC-8.6); absent on cards saved before v0.3.0. */
  replaced_at?: string | null;
}

export interface Article {
  id: string;
  title: string;
  snippet: string;
  url: string;
  source_name: string;
  published_at: string | null;
  section: string;
  via: string;
}

export interface Topics {
  sections: string[];
  keywords: string[];
  updated_at: string | null;
}

export interface Settings {
  last_refreshed_at: string | null;
  theme: "system" | "light" | "dark";
}

export type StripSetting = "every" | "feed" | "off";

/**
 * The price watchlist (US-9, added CR-0005; version 2 in CR-0006): market keys such as "NSE:TCS", in display order.
 * `keys` holds the first 10 (as v0.4.0 saved them), `more` items 11 to 20. `pinned` (strip order), `strip` and `version`
 * are absent in copies saved by v0.4.0; upgradeWatchlist (watch.ts) fills them in.
 */
export interface Watchlist {
  keys: string[];
  more?: string[] | null;
  pinned?: string[] | null;
  strip?: StripSetting | null;
  version?: number | null;
  updated_at: string | null;
}

export interface UserState {
  version: number;
  topics: Topics;
  cards: Card[];
  settings: Settings;
  /** Absent in copies saved before v0.4.0; loadLocal fills it in. */
  watchlist?: Watchlist;
  updated_at: string | null;
}

export type Category = "stock" | "etf" | "gold_spot" | "gold_india" | "gold_etf" | "gold_bond" | "gold_mf";
export type Group = "gold" | "india" | "us";

export interface Instrument {
  key: string;
  symbol: string;
  exchange: string;
  name: string;
  type: string;
  currency: string;
  source: string;
  /** CR-0006: the kind (from the gateway, or worked out by the server), group, tidy name, strip name and market. */
  category?: Category;
  group?: Group;
  display_name?: string;
  short_name?: string;
  market?: string;
}

/** CR-0006: a market's state from the gateway's calendar, or Distill's own clock. */
export interface MarketInfo {
  market: string;
  state: "open" | "closing" | "closed";
  next_open_at: string | null;
  next_close_at: string | null;
  note: string | null;
  holiday: boolean;
  source: "gateway" | "clock";
}

export interface PriceItem extends Instrument {
  status: "ok" | "waiting" | "error";
  price: number | null;
  prev_close: number | null;
  change: number | null;
  change_pct: number | null;
  as_of: string | null;
  label: string;
  market_state: string;
  error: string | null;
}

export interface PricesResult {
  items: PriceItem[];
  hidden: string[];
  gateway: { heartbeat_at: string | null; paused: boolean; markets_closed?: boolean };
  markets?: Record<string, MarketInfo>;
  read_at: string;
}

export type SyncStatus = "synced" | "pending" | "device-only" | "unknown";
