export type AiStatus = "ok" | "offline" | "not_configured" | "error";

export interface Section {
  id: string;
  name: string;
}

/** The AI's diagram for a story (AC-11.5, added CR-0008). */
export interface VisualPoint {
  label: string;
  value: number;
}
export interface Visual {
  kind: "bars" | "change" | "trend" | "steps";
  title: string;
  unit: string;
  points: VisualPoint[];
  steps: string[];
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
  /** The AI's short theme for the cover band (AC-11.4, added CR-0008); absent on cards made by v0.5.1. */
  cover?: string;
  /** The AI's diagram (AC-11.5, added CR-0008). */
  visual?: Visual | null;
  /** US-13 (added CR-0011): the detailed summary from the article. All absent on cards made by v0.7.0.
   * "ready": detail_summary and detail_points are set; "unavailable": the page couldn't be read (never asked again). */
  detail_status?: DetailState | null;
  /** The longer summary, about 4 to 5 sentences (AC-13.5). */
  detail_summary?: string;
  /** Up to 10 bullet points (AC-13.6). */
  detail_points?: string[];
  /** Unusable AI answers so far; after 2 the story keeps its short summary (AC-13.4). */
  detail_tries?: number;
}

export type DetailState = "ready" | "unavailable";
export type DetailAnswer = { status: "ready" | "unavailable" | "offline" | "not_configured" | "error"; summary: string; points: string[] };

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

export type Theme = "system" | "light" | "dark";

export interface Settings {
  last_refreshed_at: string | null;
  theme: Theme;
  /** When the reader last chose a theme (AC-11.3, added CR-0008); absent in copies saved by v0.5.1. */
  theme_changed_at?: string | null;
  /** AC-12.6 (added CR-0010): the news sources this person switched off, and when; absent in copies saved by v0.6.1. */
  sources_off?: string[] | null;
  sources_changed_at?: string | null;
}

/** US-12 (CR-0010): an active news source a reader can switch on or off. `sections` is [] for keyed news services. */
export interface PersonSource {
  id: string;
  name: string;
  sections: string[];
  kind: string;
}

export interface SourceCheck {
  at: string;
  ok: boolean;
  stories: number;
  error: string;
  failing_since: string | null;
}

/** A source as the admin's News sources screen sees it. */
export interface AdminSource extends PersonSource {
  url: string;
  paused: boolean;
  builtin: boolean;
  note: string;
  check: SourceCheck | null;
  can_remove: boolean;
  missing_key: boolean;
  key_name: string | null;
}

export interface AdminSources {
  sources: AdminSource[];
  checked_at: string | null;
  saved_in_database: boolean;
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

export type Category = "stock" | "etf" | "gold_spot" | "gold_india" | "gold_etf" | "gold_bond" | "gold_mf" | "fx";
export type Group = "gold" | "india" | "us" | "currency"; // "fx" and "currency" added CR-0012

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
  /** CR-0012 (AC-14.1): a US-dollar price in rupees at the gateway's rate; absent from v0.8.0 servers and without a rate. */
  price_inr?: number | null;
  prev_close_inr?: number | null;
  change_inr?: number | null;
}

/** CR-0012 (AC-14.2): the USD to INR rate the rupee prices use, and when it is from. */
export interface FxRate {
  key: string;
  rate: number;
  as_of: string | null;
  error: string | null;
}

export type HistoryRange = "1d" | "1w" | "1m";
export interface HistoryPoint {
  at: string;
  price: number;
}

/** CR-0012 (AC-14.7, AC-14.8): price history for the trend graphs; `available` is false before Market Gateway E4. */
export interface HistoryResult {
  range: HistoryRange;
  available: boolean;
  series: Record<string, HistoryPoint[]>;
  hidden: string[];
  read_at: string;
}

export interface PricesResult {
  items: PriceItem[];
  hidden: string[];
  gateway: { heartbeat_at: string | null; paused: boolean; markets_closed?: boolean };
  markets?: Record<string, MarketInfo>;
  fx?: FxRate | null;
  read_at: string;
}

export type SyncStatus = "synced" | "pending" | "device-only" | "unknown";

/** CR-0012 (AC-14.9): the founder's switch "Share Zerodha prices with other users". */
export interface MarketSharing {
  share_kite: boolean;
  updated_at: string | null;
  saved_in_database: boolean;
}
