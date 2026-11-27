/**
 * One price reader for the pinned strip, the Watchlist and an item's detail (CR-0006). It reads every watched item in one
 * request, only while prices are on screen and the app is visible: every 30 seconds while a watched market is open, every
 * 15 minutes otherwise (AC-9.9), and tells the gateway which keys are wanted (AC-9.3).
 *
 * CR-0012 (AC-14.7): with the same reads it keeps today's price history for the small trend graphs, read at most every
 * 5 minutes while a market is open (the gateway keeps one point per 5 minutes) and every 30 minutes otherwise.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { api, type ApiError } from "./api";
import { OPEN_EVERY_MS, refreshEvery } from "./markets";
import { useDistill } from "./state";
import type { HistoryPoint, HistoryResult, PriceItem, PricesResult } from "./types";
import { allKeys } from "./watch";

export type PriceStatus = "idle" | "loading" | "ok" | "not_set_up" | "offline";

interface PricesCtx {
  status: PriceStatus;
  result: PricesResult | null;
  item: (key: string) => PriceItem | undefined;
  /** CR-0012: today's points for an item (undefined until read, or when the gateway keeps no history). */
  today: (key: string) => HistoryPoint[] | undefined;
  historyAvailable: boolean;
}

export const HISTORY_OPEN_MS = 5 * 60_000; // AC-14.7: the gateway's 5-minute points
export const HISTORY_CLOSED_MS = 30 * 60_000;

const Ctx = createContext<PricesCtx>({ status: "idle", result: null, item: () => undefined, today: () => undefined, historyAvailable: false });
export const usePrices = () => useContext(Ctx);

const onScreen = () => typeof document === "undefined" || document.visibilityState !== "hidden";

export function PricesProvider({ active, children }: { active: boolean; children: ReactNode }) {
  const { state } = useDistill();
  const keys = allKeys(state.watchlist);
  const keyList = keys.join(",");
  const [status, setStatus] = useState<PriceStatus>("idle");
  const [result, setResult] = useState<PricesResult | null>(null);
  const [history, setHistory] = useState<HistoryResult | null>(null);
  const historyAt = useRef<{ at: number; keys: string }>({ at: 0, keys: "" });
  const keysRef = useRef(keys);
  keysRef.current = keys;
  const resultRef = useRef(result);
  resultRef.current = result;
  const lastRead = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reading = active && keys.length > 0;

  const read = useCallback(async () => {
    const ks = keysRef.current;
    if (ks.length === 0) return;
    lastRead.current = Date.now();
    try {
      const r = await api.marketPrices(ks);
      setResult(r);
      setStatus("ok");
      // AC-14.7: the small graphs' points, when they may have changed (never fails the price read)
      const list = ks.join(",");
      const every = refreshEvery(ks, Date.now(), r.markets) === OPEN_EVERY_MS ? HISTORY_OPEN_MS : HISTORY_CLOSED_MS;
      if (historyAt.current.keys !== list || Date.now() - historyAt.current.at >= every) {
        historyAt.current = { at: Date.now(), keys: list };
        api.marketHistory(ks, "1d").then(setHistory, () => {
          historyAt.current = { at: 0, keys: "" };
        });
      }
    } catch (e) {
      setStatus((e as ApiError).code === "market_not_set_up" ? "not_set_up" : "offline");
    }
  }, []);

  // AC-9.3: showing prices tells the gateway these keys are still wanted (so it starts or keeps fetching them).
  useEffect(() => {
    if (!reading) return;
    api.marketWatch(keysRef.current).catch(() => undefined);
  }, [reading, keyList]);

  // AC-9.9: one read for all items now, then by market hours; never in the background or with no prices on screen.
  useEffect(() => {
    if (!reading) return;
    let alive = true;
    const every = () => refreshEvery(keysRef.current, Date.now(), resultRef.current?.markets);
    const schedule = () => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(tick, every());
    };
    const tick = async () => {
      if (!alive) return;
      if (onScreen()) await read();
      if (alive) schedule();
    };
    const onVisible = () => {
      if (onScreen() && Date.now() - lastRead.current >= every()) void tick();
    };
    setStatus((s) => (s === "idle" ? "loading" : s));
    void tick();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      alive = false;
      if (timer.current) clearTimeout(timer.current);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [reading, keyList, read]);

  const value = useMemo<PricesCtx>(() => {
    const byKey = new Map((result?.items ?? []).map((i) => [i.key, i]));
    const series = history?.available ? history.series : {};
    return { status, result, item: (k) => byKey.get(k), today: (k) => series[k], historyAvailable: Boolean(history?.available) };
  }, [status, result, history]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
