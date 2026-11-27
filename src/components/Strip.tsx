import { MAX_PINNED, direction, pctText } from "../markets";
import { usePrices } from "../prices";
import { useDistill } from "../state";
import type { PriceItem } from "../types";
import { pinnedKeys, priceNotices, shortOf } from "../watch";
import { shown } from "../rupees";
import { Badge } from "./PriceBits";
import { Arrow, PriceText, Spark } from "./Trend";
import { IconAlert, IconCalendar, IconClock, IconMoon, IconPause } from "./Icons";

const ICONS = { moon: IconMoon, clock: IconClock, pause: IconPause, calendar: IconCalendar, alert: IconAlert };

function quietText(item: PriceItem): string {
  if (item.status === "waiting" || item.price === null) return item.market === "AMFI" ? "NAV tonight" : "Waiting";
  if (item.market === "AMFI") return "NAV";
  return item.market_state === "closed" ? "Last close" : "No change";
}

/**
 * AC-10.1: up to 6 pinned items under the header: short name, type badge, price and change; tap for the item's detail.
 * Scrolls sideways on a phone; on a wide screen the tiles wrap and the last one offers the free slots.
 */
export function Strip({ showLink }: { showLink: boolean }) {
  const { state } = useDistill();
  const { result, status, item } = usePrices();
  const pinned = pinnedKeys(state.watchlist);
  if (pinned.length === 0 || status === "not_set_up") return null; // AC-9.10: the Watchlist explains; the strip stays out of the way
  const notice = priceNotices(status, result)[0];
  const free = MAX_PINNED - pinned.length;
  const tiles = pinned.map((k) => ({ k, it: item(k) })).filter(({ it }) => !result || it); // hidden items stay out (AC-9.8)
  if (result && tiles.length === 0) return null;
  if (!result && status === "offline") {
    return <p className="strip-note error strip-alone"><IconAlert width={14} height={14} /><span>{notice?.short}</span></p>;
  }
  const NoticeIcon = notice ? ICONS[notice.icon] : null;
  return (
    <div className="strip-wrap">
      <nav className="strip" aria-label="Pinned prices" data-testid="strip">
        <ul>
          {tiles.map(({ k, it }) => (
            <li key={k}>
              <a className="tile" href={`#/item/${encodeURIComponent(k)}`} aria-label={it ? undefined : k}>
                {it ? (
                  <>
                    <span className="tn">{shortOf(it)} <Badge item={it} /></span>
                    <span className="tp">{it.price !== null ? <PriceText it={it} usdClass="tu" showNoRate={false} /> : "—"}</span>
                    {it.price !== null && it.change !== null && it.change_pct !== null ? (
                      <span className="tc-row">
                        <span className={`tc ${direction(shown(it)?.delta ?? it.change)}`}>
                          <Arrow dir={direction(shown(it)?.delta ?? it.change)} size={10} />
                          <span className="tc-pct">{pctText(it.change_pct)}</span>
                          <span className="tc-full">{shown(it)?.change}</span>
                        </span>
                        <Spark it={it} width={44} height={14} />
                      </span>
                    ) : (
                      <span className="tc flat">{quietText(it)}</span>
                    )}
                  </>
                ) : (
                  <>
                    <span className="tn">{k.split(":")[1]}</span>
                    <span className="tp skeleton" aria-hidden="true" />
                    <span className="tc flat">Loading</span>
                  </>
                )}
              </a>
            </li>
          ))}
          {free > 0 && (
            <li className="tile-more">
              <a className="tile more" href="#/watchlist">{free} more {free === 1 ? "slot" : "slots"} · Edit</a>
            </li>
          )}
        </ul>
      </nav>
      {(notice || showLink) && (
        <p className={`strip-note${notice ? ` ${notice.tone}` : ""}`}>
          {notice && NoticeIcon && <NoticeIcon width={14} height={14} />}
          {notice && <span>{notice.short}</span>}
          {showLink && <a href="#/watchlist" className="strip-link">Watchlist</a>}
        </p>
      )}
    </div>
  );
}
