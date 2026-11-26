/**
 * One price reader for the pinned strip, the Watchlist and an item's detail (CR-0006). It reads every watched item in one
 * request, only while prices are on screen and the app is visible: every 30 seconds while a watched market is open, every
 * 15 minutes otherwise (AC-9.9), and tells the gateway which keys are wanted (AC-9.3).
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { api, type ApiError } from "./api";
import { refreshEvery } from "./markets";
import { useDistill } from "./state";
import type { PriceItem, PricesResult } from "./types";
import { allKeys } from "./watch";

export type PriceStatus = "idle" | "loading" | "ok" | "not_set_up" | "offline";

interface PricesCtx {
  status: PriceStatus;
  result: PricesResult | null;
  item: (key: string) => PriceItem | undefined;
}

const Ctx = createContext<PricesCtx>({ status: "idle", result: null, item: () => undefined });
export const usePrices = () => useContext(Ctx);

const onScreen = () => typeof document === "undefined" || document.visibilityState !== "hidden";

export function PricesProvider({ active, children }: { active: boolean; children: ReactNode }) {
  const { state } = useDistill();
  const keys = allKeys(state.watchlist);
  const keyList = keys.join(",");
  const [status, setStatus] = useState<PriceStatus>("idle");
  const [result, setResult] = useState<PricesResult | null>(null);
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
    return { status, result, item: (k) => byKey.get(k) };
  }, [status, result]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
