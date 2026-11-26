import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError, api } from "../api";
import {
  DISCLAIMER, MARKETS_CLOSED, MAX_WATCH, NOT_SET_UP, TOO_MANY, UNREACHABLE, WAITING, cardsMentioning, changeText, direction, money,
  quietBecauseClosed, refreshEvery,
} from "../markets";
import { useDistill } from "../state";
import { priceTime } from "../time";
import type { Instrument, PriceItem, PricesResult } from "../types";
import { IconChevron, IconMoon, IconPause, IconPlus, IconX } from "./Icons";

type Status = "idle" | "loading" | "ok" | "not_set_up" | "offline";
const FOLD_KEY = "distill.prices.open";
const onScreen = () => typeof document === "undefined" || document.visibilityState !== "hidden";

function readOpen(): boolean {
  try {
    return localStorage.getItem(FOLD_KEY) !== "0";
  } catch {
    return true;
  }
}

/** US-9 (CR-0005): the price watchlist. `folded` is the Feed's version, which can be folded away. */
export function Prices({ folded = false }: { folded?: boolean }) {
  const { state, saveWatchlist } = useDistill();
  const keys = state.watchlist?.keys ?? [];
  const keyList = keys.join(",");
  const [open, setOpen] = useState(() => (folded ? readOpen() : true));
  const [status, setStatus] = useState<Status>("idle");
  const [result, setResult] = useState<PricesResult | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const showing = open; // AC-9.9: read only while the list is on screen
  const keysRef = useRef(keys);
  keysRef.current = keys;
  const lastRead = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const read = useCallback(async () => {
    const ks = keysRef.current;
    if (ks.length === 0) return;
    lastRead.current = Date.now();
    try {
      const r = await api.marketPrices(ks);
      setResult(r);
      setStatus("ok");
    } catch (e) {
      setStatus((e as ApiError).code === "market_not_set_up" ? "not_set_up" : "offline");
    }
  }, []);

  // AC-9.3: opening the watchlist tells the gateway these keys are still wanted.
  useEffect(() => {
    if (!showing || keys.length === 0) return;
    api.marketWatch(keys).catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showing, keyList]);

  // AC-9.9: one read for all items now, then every 30 s while a market is open, else every 15 min; never in the background.
  useEffect(() => {
    if (!showing || keys.length === 0) return;
    let alive = true;
    const schedule = () => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(tick, refreshEvery(keysRef.current));
    };
    const tick = async () => {
      if (!alive) return;
      if (onScreen()) await read();
      if (alive) schedule();
    };
    const onVisible = () => {
      if (onScreen() && Date.now() - lastRead.current >= refreshEvery(keysRef.current)) void tick();
    };
    if (status === "idle") setStatus("loading");
    void tick();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      alive = false;
      if (timer.current) clearTimeout(timer.current);
      document.removeEventListener("visibilitychange", onVisible);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showing, keyList, read]);

  const toggleOpen = (next: boolean) => {
    setOpen(next);
    try {
      localStorage.setItem(FOLD_KEY, next ? "1" : "0");
    } catch {
      /* fine: it opens next time */
    }
  };

  const add = async (inst: Instrument) => {
    if (keys.includes(inst.key)) return;
    if (keys.length >= MAX_WATCH) {
      setMessage(TOO_MANY); // AC-9.2
      return;
    }
    setMessage(null);
    await saveWatchlist([...keys, inst.key]);
    api.marketWatch([inst.key]).catch(() => undefined); // AC-9.3
  };
  const remove = (key: string) => void saveWatchlist(keys.filter((k) => k !== key));
  const move = (key: string, by: -1 | 1) => {
    const i = keys.indexOf(key);
    const j = i + by;
    if (i < 0 || j < 0 || j >= keys.length) return;
    const next = [...keys];
    [next[i], next[j]] = [next[j], next[i]];
    void saveWatchlist(next); // AC-9.11
  };

  const byKey = new Map((result?.items ?? []).map((i) => [i.key, i]));
  const rows = keys.filter((k) => byKey.has(k) || !result).map((k) => byKey.get(k) ?? null);
  const shownKeys = (result?.items ?? []).map((i) => i.key);
  const closedNow = quietBecauseClosed(shownKeys, result?.gateway.markets_closed); // AC-9.15
  const showsGold = (result?.items ?? []).some((i) => i.source === "metalcharts" && i.price !== null);

  const body = (
    <div className="prices-body">
      {status === "not_set_up" && <p className="note" role="status">{NOT_SET_UP}. Everything else in Distill works as usual.</p>}
      {status === "offline" && <p className="note error" role="status">{UNREACHABLE}. The last prices stay until it's back.</p>}
      {status === "ok" && result?.gateway.paused && closedNow && (
        <p className="note closed" role="status">
          <IconMoon />
          {MARKETS_CLOSED}
        </p>
      )}
      {status === "ok" && result?.gateway.paused && !closedNow && (
        <p className="note paused" role="status">
          <IconPause />
          {result.gateway.heartbeat_at ? `Prices paused since ${priceTime(result.gateway.heartbeat_at)}` : "Prices paused: the price service hasn't checked in yet"}
        </p>
      )}
      {keys.length === 0 ? (
        <p className="muted small prices-empty">Add gold or a share to follow its price.</p>
      ) : (
        <ol className="price-list" aria-label="Your watchlist">
          {keys.map((k, i) => {
            const item = byKey.get(k);
            if (result && !item) return null; // not available to this person (AC-9.8) or unknown
            return (
              <PriceRow
                key={k} k={k} item={item ?? null} first={i === 0} last={i === keys.length - 1}
                expanded={expanded === k} onToggle={() => setExpanded(expanded === k ? null : k)}
                onUp={() => move(k, -1)} onDown={() => move(k, 1)} onRemove={() => remove(k)}
              />
            );
          })}
        </ol>
      )}
      {rows.length === 0 && keys.length > 0 && result && <p className="muted small">None of these items are available to you.</p>}
      <Search keys={keys} onAdd={add} disabled={status === "not_set_up"} />
      {message && <p className="note error" role="alert">{message}.</p>}
      <p className="muted small disclaimer">
        {DISCLAIMER}
        {showsGold && <> Gold spot prices by <a href="https://metalcharts.org" target="_blank" rel="noreferrer">MetalCharts</a>.</>}
      </p>
    </div>
  );

  if (!folded) {
    return (
      <section aria-labelledby="prices-title">
        <h1 id="prices-title" className="screen-title">Prices</h1>
        {body}
      </section>
    );
  }
  return (
    <details className="prices-fold" open={open} onToggle={(e) => toggleOpen((e.currentTarget as HTMLDetailsElement).open)} data-testid="prices-fold">
      <summary><span className="prices-summary">Prices</span><span className="muted small">{keys.length ? `${keys.length} watched` : "Add an item"}</span></summary>
      {open && body}
    </details>
  );
}

function PriceRow(props: {
  k: string; item: PriceItem | null; first: boolean; last: boolean; expanded: boolean;
  onToggle: () => void; onUp: () => void; onDown: () => void; onRemove: () => void;
}) {
  const { k, item, first, last, expanded } = props;
  const { state } = useDistill();
  const name = item?.name ?? k;
  const has = item && item.price !== null;
  const dir = direction(item?.change ?? null);
  const news = expanded && item ? cardsMentioning(state.cards, item.symbol, item.name).slice(0, 5) : [];
  return (
    <li className="price-row" data-testid="price-row">
      <button type="button" className="price-main" aria-expanded={expanded} onClick={props.onToggle}>
        <span className="price-name">
          <span className="price-title">{name}</span>
          <span className="muted small">{item ? `${item.symbol} · ${item.exchange}` : k}</span>
        </span>
        <span className="price-figures">
          {has ? (
            <>
              <span className="price-value">{money(item.price!, item.currency)}</span>
              {item.change !== null && <span className={`price-change ${dir}`}>{changeText(item.change, item.change_pct)}</span>}
            </>
          ) : (
            <span className="muted small">{item?.status === "error" ? item.error : WAITING}</span>
          )}
        </span>
      </button>
      {has && (
        <p className="price-meta small">
          <time dateTime={item.as_of ?? undefined}>{priceTime(item.as_of)}</time>
          <span className={`price-label ${item.market_state === "closed" ? "closed" : item.label === "Live" ? "live" : "delayed"}`}>{item.label}</span>
          {item.status === "error" && item.error && <span className="price-error">{item.error}</span>}
        </p>
      )}
      <div className="price-tools">
        <button type="button" className="icon-btn" aria-label={`Move ${name} up`} disabled={first} onClick={props.onUp}><IconChevron dir="up" /></button>
        <button type="button" className="icon-btn" aria-label={`Move ${name} down`} disabled={last} onClick={props.onDown}><IconChevron dir="down" /></button>
        <button type="button" className="icon-btn" aria-label={`Remove ${name}`} onClick={props.onRemove}><IconX /></button>
      </div>
      {expanded && (
        <div className="price-news">
          {news.length === 0 ? (
            <p className="muted small">No news cards mention it right now.</p>
          ) : (
            <ul>
              {news.map((c) => <li key={c.id}><a href={`#/post/${encodeURIComponent(c.id)}`}>{c.title}</a> <span className="muted small">{c.source_name}</span></li>)}
            </ul>
          )}
        </div>
      )}
    </li>
  );
}

function Search({ keys, onAdd, disabled }: { keys: string[]; onAdd: (i: Instrument) => void; disabled: boolean }) {
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Instrument[]>([]);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    const term = q.trim();
    if (!term) {
      setHits([]);
      return;
    }
    let alive = true;
    const t = setTimeout(() => {
      api.marketSearch(term).then((r) => alive && (setHits(r), setError(null))).catch((e: ApiError) => {
        if (alive) setError(e.code === "market_not_set_up" ? NOT_SET_UP : UNREACHABLE);
      });
    }, 250);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [q]);
  return (
    <div className="price-search">
      <label htmlFor="price-search" className="small">Add an item</label>
      <input
        id="price-search" type="search" placeholder="Search gold, TCS, EPAM…" value={q} disabled={disabled}
        onChange={(e) => setQ(e.target.value)} autoComplete="off"
      />
      {error && q.trim() && <p className="muted small">{error}.</p>}
      {hits.length > 0 && (
        <ul className="search-hits" aria-label="Search results">
          {hits.map((h) => (
            <li key={h.key}>
              <span><strong>{h.symbol}</strong> <span className="muted small">{h.name} · {h.exchange}</span></span>
              {keys.includes(h.key) ? (
                <span className="muted small">Added</span>
              ) : (
                <button type="button" className="btn" onClick={() => { onAdd(h); setQ(""); }} aria-label={`Add ${h.name}`}><IconPlus /> Add</button>
              )}
            </li>
          ))}
        </ul>
      )}
      {q.trim() && hits.length === 0 && !error && <p className="muted small" aria-live="polite">No matches yet.</p>}
    </div>
  );
}
