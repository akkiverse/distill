import { useEffect, useState } from "react";
import { api } from "../api";
import { priceTime } from "../time";
import type { MarketSharing } from "../types";

/**
 * AC-14.9 (added CR-0012): the founder's switch "Share Zerodha prices with other users" (On unless switched Off). It is
 * saved on the server and applies to everyone within about 30 seconds, with no release.
 */
export function ShareSwitch() {
  const [value, setValue] = useState<MarketSharing | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let alive = true;
    api.marketSharing().then(
      (v) => alive && setValue(v),
      () => alive && setError("The setting can't be loaded right now. Try again in a moment."),
    );
    return () => {
      alive = false;
    };
  }, []);

  const flip = async () => {
    if (!value || saving) return;
    setSaving(true);
    setError(null);
    try {
      setValue(await api.setMarketSharing(!value.share_kite));
    } catch {
      setError("The setting can't be saved right now. Nothing was changed; try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <section aria-labelledby="share-title" className="share-switch">
      <h2 id="share-title" className="settings-h">Prices (admin)</h2>
      {!value && !error && <p className="muted" role="status">Loading…</p>}
      {value && (
        <>
          <label className="switch-row">
            <span className="switch-name">Share Zerodha prices with other users</span>
            <input type="checkbox" role="switch" className="switch" checked={value.share_kite} disabled={saving} onChange={() => void flip()} />
          </label>
          <p className="small muted">
            {value.share_kite
              ? "On: everyone signed in to Distill can search, add and see Indian shares, ETFs, gold bonds and the India gold rate."
              : "Off: only you see prices from Zerodha. Everyone else sees US shares, international gold and gold funds."}{" "}
            Each person's watchlist stays private to them.
            {value.updated_at && <> Changed {priceTime(value.updated_at)}.</>}
            {!value.saved_in_database && <> This preview keeps it only until the server restarts.</>}
          </p>
        </>
      )}
      {error && <p className="note error" role="alert">{error}</p>}
    </section>
  );
}
