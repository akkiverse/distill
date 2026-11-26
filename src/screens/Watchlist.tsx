import { useState, type DragEvent } from "react";
import { AddSheet } from "../components/AddSheet";
import { IconChevron, IconGrip, IconPlus, IconStar, IconX } from "../components/Icons";
import { Badge, Disclaimer, NoticeView } from "../components/PriceBits";
import { MAX_PINNED, NOT_SET_UP, STRIP_FULL, changeText, direction, money, pctText } from "../markets";
import { usePrices } from "../prices";
import { useDistill } from "../state";
import { priceTime } from "../time";
import type { Instrument, PriceItem } from "../types";
import {
  GROUPS, STRIP_SETTINGS, allKeys, groupOf, moveOnto, moveWithin, nameOf, pinnedKeys, priceNotices, shortOf, stripSetting, subLine,
  typeLabel, waitingText,
} from "../watch";

/** US-10 (CR-0006): the Watchlist page, which replaces the Prices tab. `adding` opens the Add sheet over it. */
export function Watchlist({ adding = false }: { adding?: boolean }) {
  const { state, saveWatchlist } = useDistill();
  const { status, result, item } = usePrices();
  const keys = allKeys(state.watchlist);
  const pinned = pinnedKeys(state.watchlist);
  const strip = stripSetting(state.watchlist);
  const [editing, setEditing] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);

  const shown = keys.filter((k) => !result || item(k)); // AC-9.8: items the server hides are not shown
  const groupOfKey = (k: string) => {
    const it = item(k);
    return it ? groupOf(it) : k.startsWith("US:") ? "us" : k.startsWith("GOLD:") || k.startsWith("MCX:") || k.startsWith("MF:") ? "gold" : "india";
  };
  const notices = priceNotices(status, result);

  const togglePin = (k: string) => {
    if (pinned.includes(k)) {
      setMessage(null);
      void saveWatchlist({ pinned: pinned.filter((p) => p !== k) });
    } else if (pinned.length >= MAX_PINNED) {
      setMessage(STRIP_FULL); // AC-10.3
    } else {
      setMessage(null);
      void saveWatchlist({ pinned: [...pinned, k] });
    }
  };
  const remove = (k: string) => void saveWatchlist({ keys: keys.filter((x) => x !== k), pinned: pinned.filter((x) => x !== k) });
  const move = (k: string, by: -1 | 1) => void saveWatchlist({ keys: moveWithin(keys, k, by, (o) => groupOfKey(o) === groupOfKey(k)) });
  const movePin = (k: string, by: -1 | 1) => void saveWatchlist({ pinned: moveWithin(pinned, k, by) });

  // AC-10.4: drag on a computer (phones use the buttons), only within a group, and in the strip order.
  const drag = (list: "keys" | "pins", k: string) => ({
    draggable: true,
    onDragStart: (e: DragEvent) => {
      setDragging(`${list}:${k}`);
      e.dataTransfer?.setData("text/plain", k);
    },
    onDragEnd: () => setDragging(null),
    onDragOver: (e: DragEvent) => {
      const from = dragging?.slice(list.length + 1);
      if (dragging?.startsWith(`${list}:`) && from && (list === "pins" || groupOfKey(from) === groupOfKey(k))) e.preventDefault();
    },
    onDrop: (e: DragEvent) => {
      e.preventDefault();
      const from = dragging?.slice(list.length + 1);
      setDragging(null);
      if (!from || from === k) return;
      if (list === "keys") void saveWatchlist({ keys: moveOnto(keys, from, k) });
      else void saveWatchlist({ pinned: moveOnto(pinned, from, k) });
    },
  });

  return (
    <section className={`watchlist${editing ? " editing" : ""}`} aria-labelledby="wl-title">
      <div className="wl-head">
        <h1 id="wl-title" className="screen-title">Watchlist</h1>
        <div className="wl-actions">
          {keys.length > 0 && (
            <button type="button" className="btn" aria-pressed={editing} onClick={() => setEditing(!editing)}>{editing ? "Done" : "Edit"}</button>
          )}
          <a className="btn primary" href="#/watchlist/add"><IconPlus width={16} height={16} /><span>Add<span className="wide-only"> an item</span></span></a>
        </div>
      </div>
      <p className="muted small wl-intro">Pin up to {MAX_PINNED} to show them on top of every screen. {pinned.length} of {MAX_PINNED} pinned.</p>
      {status === "not_set_up" && <p className="note" role="status">{NOT_SET_UP}. Everything else in Distill works as usual.</p>}
      {notices.map((n) => <NoticeView key={n.text} notice={n} />)}
      {message && <p className="note error" role="alert">{message}.</p>}

      <div className="wl-layout">
        <div className="wl-main">
          {keys.length === 0 ? (
            <div className="wl-empty">
              <p>Add gold or a share to follow its price.</p>
              <a className="btn primary" href="#/watchlist/add"><IconPlus width={16} height={16} /> Add an item</a>
            </div>
          ) : (
            <>
              <div className="wl-cols" aria-hidden="true">
                <span>Item</span><span>Type</span><span className="num">Price</span><span className="num">Change</span><span>Price time (IST)</span><span />
              </div>
              {GROUPS.map((g) => {
                const ks = shown.filter((k) => groupOfKey(k) === g.id);
                if (ks.length === 0) return null;
                return (
                  <div key={g.id} className="wl-group">
                    <h2 className="group-title" id={`grp-${g.id}`}><span>{g.label}</span><span className="muted">{ks.length}</span></h2>
                    <ol className="wl-list" aria-labelledby={`grp-${g.id}`}>
                      {ks.map((k, i) => (
                        <Row
                          key={k} k={k} it={item(k)} pinned={pinned.includes(k)} editing={editing} first={i === 0} last={i === ks.length - 1}
                          dragProps={editing ? drag("keys", k) : {}} dragging={dragging === `keys:${k}`}
                          onPin={() => togglePin(k)} onUp={() => move(k, -1)} onDown={() => move(k, 1)} onRemove={() => remove(k)}
                        />
                      ))}
                    </ol>
                  </div>
                );
              })}
              {result && shown.length === 0 && <p className="muted small">None of these items are available to you.</p>}
            </>
          )}
          <Disclaimer result={result} />
        </div>

        <aside className="wl-side">
          {pinned.length > 0 && (
            <section className="side pin-order" aria-labelledby="pin-order-title">
              <h2 id="pin-order-title" className="side-title">On top of every screen</h2>
              <p className="muted small">{pinned.length} of {MAX_PINNED} pinned. Drag or use the arrows to set the order.</p>
              <ol className="ord">
                {pinned.filter((k) => !result || item(k)).map((k, i, shownPins) => {
                  const it = item(k);
                  const name = it ? shortOf(it) : k;
                  return (
                    <li key={k} {...drag("pins", k)} className={dragging === `pins:${k}` ? "dragging" : undefined}>
                      <IconGrip className="grip" width={16} height={16} />
                      <span>{name}</span>
                      <button type="button" className="icon-btn" aria-label={`Move ${name} earlier in the strip`} disabled={i === 0} onClick={() => movePin(k, -1)}><IconChevron dir="up" /></button>
                      <button type="button" className="icon-btn" aria-label={`Move ${name} later in the strip`} disabled={i === shownPins.length - 1} onClick={() => movePin(k, 1)}><IconChevron dir="down" /></button>
                    </li>
                  );
                })}
              </ol>
            </section>
          )}
          <section className="side" aria-labelledby="strip-setting-title">
            <h2 id="strip-setting-title" className="side-title">Show pinned prices</h2>
            <div className="seg" role="group" aria-labelledby="strip-setting-title">
              {STRIP_SETTINGS.map((s) => (
                <button key={s.id} type="button" aria-pressed={strip === s.id} onClick={() => void saveWatchlist({ strip: s.id })}>{s.label}</button>
              ))}
            </div>
          </section>
        </aside>
      </div>
      {adding && <AddSheet />}
    </section>
  );
}

function Row(props: {
  k: string; it: PriceItem | undefined; pinned: boolean; editing: boolean; first: boolean; last: boolean; dragging: boolean;
  dragProps: object; onPin: () => void; onUp: () => void; onDown: () => void; onRemove: () => void;
}) {
  const { k, it, pinned, editing, first, last } = props;
  const { result } = usePrices();
  const name = it ? nameOf(it) : k;
  const has = it && it.price !== null;
  const dir = direction(it?.change ?? null);
  const href = `#/item/${encodeURIComponent(k)}`;
  return (
    <li className={`wl-row${props.dragging ? " dragging" : ""}`} data-testid="price-row" {...props.dragProps}>
      <div className="wl-item">
        {editing && <IconGrip className="grip" width={18} height={18} />}
        <a href={href} className="wl-name">{name}</a>
        <span className="wl-sub">{it && <Badge item={it} />}<span>{it ? subLine(it) : k}</span></span>
      </div>
      <span className="wl-type">{it && <span className="badge plain">{typeLabel(it as Instrument)}</span>}</span>
      <span className="wl-price num">
        {has ? (
          <>
            <b>{money(it.price!, it.currency)}</b>
            <span className={`wl-pct ${dir}`}>{it.change_pct !== null && it.change !== null ? pctText(it.change_pct) : it.market === "AMFI" ? "Daily" : "Last close"}</span>
          </>
        ) : (
          <span className="muted small">{it?.status === "error" ? it.error : it ? waitingText(it, result) : "Loading"}</span>
        )}
      </span>
      <span className={`wl-change num ${dir}`}>{has && it.change !== null ? changeText(it.change, it.change_pct) : ""}</span>
      <span className="wl-time small">
        {has && <time dateTime={it.as_of ?? undefined}>{priceTime(it.as_of)}</time>}
        {has && <span className={`wl-label ${it.market_state === "closed" ? "closed" : it.label === "Live" ? "live" : "delayed"}`}>{it.label}</span>}
        {has && it.status === "error" && it.error && <span className="price-error">{it.error}</span>}
      </span>
      {editing ? (
        <span className="wl-tools">
          <button type="button" className="icon-btn" aria-label={`Move ${name} up`} disabled={first} onClick={props.onUp}><IconChevron dir="up" /></button>
          <button type="button" className="icon-btn" aria-label={`Move ${name} down`} disabled={last} onClick={props.onDown}><IconChevron dir="down" /></button>
          <button type="button" className="icon-btn" aria-label={`Remove ${name}`} onClick={props.onRemove}><IconX /></button>
        </span>
      ) : (
        <button type="button" className={`icon-btn pin${pinned ? " on" : ""}`} aria-pressed={pinned} aria-label={`Pin ${name}`} onClick={props.onPin}>
          <IconStar filled={pinned} />
        </button>
      )}
    </li>
  );
}
