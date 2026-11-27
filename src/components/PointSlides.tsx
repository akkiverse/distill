import { useRef, useState, type KeyboardEvent, type TouchEvent } from "react";
import { IconChevron } from "./Icons";

/** AC-13.6: up to 10 points in slides of 3 to 4, spread evenly (10 points: 4, 3, 3; 7 points: 4, 3; 5 points: 3, 2). */
export function slidesOf(points: string[]): string[][] {
  const all = points.slice(0, 10);
  if (all.length <= 4) return all.length ? [all] : [];
  const count = Math.ceil(all.length / 4);
  const base = Math.floor(all.length / count);
  const extra = all.length % count;
  const out: string[][] = [];
  let at = 0;
  for (let i = 0; i < count; i++) {
    const size = base + (i < extra ? 1 : 0);
    out.push(all.slice(at, at + size));
    at += size;
  }
  return out;
}

const SWIPE_PX = 40;

/**
 * AC-13.6, AC-13.7: a story's bullet points as slides. The arrows (and a swipe on phones, and the arrow keys once the
 * slides have focus) move between them; the dots show how many there are. Tapping elsewhere on the card opens the story.
 */
export function PointSlides({ points, title, href }: { points: string[]; title: string; href: string }) {
  const slides = slidesOf(points);
  const [at, setAt] = useState(0);
  const start = useRef<{ x: number; y: number } | null>(null);
  const i = Math.min(at, Math.max(0, slides.length - 1));
  const last = slides.length - 1;
  const go = (to: number) => setAt(Math.max(0, Math.min(last, to)));

  const onKey = (e: KeyboardEvent) => {
    if (e.key === "ArrowRight") go(i + 1);
    else if (e.key === "ArrowLeft") go(i - 1);
    else return;
    e.preventDefault();
    e.stopPropagation();
  };
  const onTouchStart = (e: TouchEvent) => {
    const t = e.touches[0];
    start.current = t ? { x: t.clientX, y: t.clientY } : null;
  };
  const onTouchEnd = (e: TouchEvent) => {
    const s = start.current;
    const t = e.changedTouches[0];
    start.current = null;
    if (!s || !t) return;
    const dx = t.clientX - s.x;
    if (Math.abs(dx) < SWIPE_PX || Math.abs(dx) < Math.abs(t.clientY - s.y)) return; // a tap or a scroll, not a swipe
    e.preventDefault(); // a swipe doesn't also open the story
    go(dx < 0 ? i + 1 : i - 1);
  };

  if (slides.length === 0) return null;
  return (
    <div
      className="slides"
      role="group"
      aria-roledescription="slides"
      aria-label={slides.length > 1 ? `Points for “${title}”, ${i + 1} of ${slides.length}` : `Points for “${title}”`}
      tabIndex={slides.length > 1 ? 0 : undefined}
      onKeyDown={slides.length > 1 ? onKey : undefined}
      onTouchStart={slides.length > 1 ? onTouchStart : undefined}
      onTouchEnd={slides.length > 1 ? onTouchEnd : undefined}
      onClick={() => { window.location.hash = href; }} // the slides sit above the card's link, so a tap here opens the story too
      data-testid="slides"
    >
      <ul className="points slide" key={i}>
        {slides[i].map((p, n) => <li key={n}>{p}</li>)}
      </ul>
      {slides.length > 1 && (
        <div className="slide-nav">
          <button type="button" className="icon-btn slide-btn" aria-label="Previous points" disabled={i === 0} onClick={(e) => { e.stopPropagation(); go(i - 1); }}>
            <IconChevron dir="left" />
          </button>
          <span className="dots" aria-hidden="true" data-testid="dots">
            {slides.map((_, n) => <span key={n} className={n === i ? "dot on" : "dot"} />)}
          </span>
          <button type="button" className="icon-btn slide-btn" aria-label="Next points" disabled={i === last} onClick={(e) => { e.stopPropagation(); go(i + 1); }}>
            <IconChevron dir="right" />
          </button>
        </div>
      )}
    </div>
  );
}
