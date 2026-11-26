import { MAX_PINNED, changeText, direction, money, pctText } from "../markets";
import { usePrices } from "../prices";
import { useDistill } from "../state";
import type { PriceItem } from "../types";
import { pinnedKeys, priceNotices, shortOf } from "../watch";
import { Badge } from "./PriceBits";
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
  if (pinned.length === 0) return null;
  const notice = priceNotices(status, result)[0];
  const free = MAX_PINNED - pinned.length;
  const tiles = pinned.map((k) => ({ k, it: item(k) })).filter(({ it }) => !result || it); // hidden items stay out (AC-9.8)
  if (result && tiles.length === 0) return null;
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
                    <span className="tp">{it.price !== null ? money(it.price, it.currency) : "—"}</span>
                    {it.price !== null && it.change !== null && it.change_pct !== null ? (
                      <span className={`tc ${direction(it.change)}`}>
                        <span className="tc-pct">{pctText(it.change_pct)}</span>
                        <span className="tc-full">{changeText(it.change, it.change_pct)}</span>
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
