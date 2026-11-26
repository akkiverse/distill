import { IconBack, IconMoon, IconStar } from "../components/Icons";
import { Badge, Disclaimer, NoticeView } from "../components/PriceBits";
import { MAX_PINNED, STRIP_FULL, cardsMentioning, changeText, direction, money } from "../markets";
import { usePrices } from "../prices";
import { useDistill } from "../state";
import { priceTime, publishedLabel } from "../time";
import { useState } from "react";
import {
  allKeys, marketKey, nameOf, pinnedKeys, priceNotices, sourceLabel, updatesLabel, waitingText, watchedMarkets, whatItIs, whenLabel,
} from "../watch";

/** AC-10.7 (CR-0006): one item's detail: price, change, time in IST, label, what it is, source, pin and remove, its news. */
export function Item({ k }: { k: string }) {
  const { state, saveWatchlist } = useDistill();
  const { status, result, item } = usePrices();
  const [message, setMessage] = useState<string | null>(null);
  const keys = allKeys(state.watchlist);
  const pinned = pinnedKeys(state.watchlist);
  const it = item(k);

  if (!keys.includes(k) || (result && !it)) {
    return (
      <section className="empty" aria-labelledby="item-gone">
        <h1 id="item-gone" className="empty-title">This item isn't in your watchlist</h1>
        <p>It may have been removed on another device.</p>
        <a className="btn primary" href="#/watchlist">Back to the Watchlist</a>
      </section>
    );
  }

  const back = <a href="#/watchlist" className="btn ghost"><IconBack /> Watchlist</a>;
  if (!it) {
    return (
      <section aria-busy="true" aria-label="Loading the price">
        {back}
        {status === "offline" ? priceNotices(status, result).map((n) => <NoticeView key={n.text} notice={n} />) : <p className="muted">Loading the price…</p>}
      </section>
    );
  }

  const isPinned = pinned.includes(k);
  const togglePin = () => {
    if (isPinned) void saveWatchlist({ pinned: pinned.filter((p) => p !== k) });
    else if (pinned.length >= MAX_PINNED) return setMessage(STRIP_FULL);
    else void saveWatchlist({ pinned: [...pinned, k] });
    setMessage(null);
  };
  const remove = async () => {
    await saveWatchlist({ keys: keys.filter((x) => x !== k), pinned: pinned.filter((x) => x !== k) });
    window.location.hash = "#/watchlist";
  };
  const has = it.price !== null;
  const market = watchedMarkets(result).find((m) => m.market === marketKey(it));
  const closed = it.market_state === "closed" || market?.state === "closed";
  const news = cardsMentioning(state.cards, it.symbol, it.name, nameOf(it)).slice(0, 5);
  const notice = priceNotices(status, result).find((n) => n.tone !== "calm");

  let stateLine: string;
  if (!has) stateLine = it.status === "error" && it.error ? it.error : waitingText(it, result);
  else if (marketKey(it) === "AMFI") stateLine = `NAV for ${priceTime(it.as_of).replace(/, .*$/, "")}. A new NAV comes once a day, after about 9 PM IST.`;
  else if (closed) stateLine = `Market closed, last close at ${priceTime(it.as_of)}.${market?.next_open_at ? ` Opens ${whenLabel(market.next_open_at)}.` : ""}`;
  else stateLine = `${it.label} · ${priceTime(it.as_of)}`;

  return (
    <article className="item" aria-labelledby="item-title">
      {back}
      <p className="item-kicker"><Badge item={it} /><span className="muted small">{it.symbol} · {it.exchange}</span></p>
      <h1 id="item-title" className="item-title">{nameOf(it)}</h1>
      {has ? (
        <>
          <p className="item-price">{money(it.price!, it.currency)}</p>
          {it.change !== null && (
            <p className="item-change"><span className={direction(it.change)}>{changeText(it.change, it.change_pct)}</span> <span className="muted">since the previous close</span></p>
          )}
        </>
      ) : (
        <p className="item-price muted">—</p>
      )}
      <p className="item-state muted small">{closed && has && <IconMoon width={14} height={14} />}<span>{stateLine}</span></p>
      {has && it.status === "error" && it.error && <p className="note error" role="status">{it.error}</p>}
      {notice && <NoticeView notice={notice} />}
      <div className="item-actions">
        <button type="button" className={`btn${isPinned ? " on" : ""}`} aria-pressed={isPinned} onClick={togglePin}>
          <IconStar filled={isPinned} width={18} height={18} /> {isPinned ? "Pinned on top" : "Pin on top"}
        </button>
        <button type="button" className="btn" onClick={() => void remove()}>Remove</button>
      </div>
      {message && <p className="note error" role="alert">{message}.</p>}
      <section className="box" aria-labelledby="what-title">
        <h2 id="what-title" className="box-title">What this is</h2>
        <p>{whatItIs(it)}</p>
      </section>
      <section className="box" aria-label="About this price">
        <dl className="kv">
          <dt>Price time</dt><dd>{has ? priceTime(it.as_of) : "Not yet"}</dd>
          <dt>Label</dt><dd>{has ? it.label : "Waiting"}</dd>
          <dt>Source</dt><dd>{sourceLabel(it.source)}</dd>
          <dt>Updates</dt><dd>{updatesLabel(it)}</dd>
        </dl>
      </section>
      <h2 className="sub">In your news</h2>
      {news.length === 0 ? (
        <p className="muted">No news cards mention it right now.</p>
      ) : (
        <ul className="item-news">
          {news.map((c) => (
            <li key={c.id}>
              <a href={`#/post/${encodeURIComponent(c.id)}`}>{c.title}</a>
              <span className="muted small">{c.source_name} · {publishedLabel(c.published_at)}</span>
            </li>
          ))}
        </ul>
      )}
      <Disclaimer result={result} />
    </article>
  );
}
