import { sectionLabel, useDistill } from "../state";
import type { Card } from "../types";
import { Diagram, drawable } from "./Diagram";
import { IconSection } from "./Icons";

/** One hue per section for the card covers (AC-11.4); keyword topics use the accent. */
const HUE: Record<string, string> = {
  world: "#6366f1", india: "#f97316", business: "#3b82f6", finance: "#f59e0b", technology: "#8b5cf6", science: "#06b6d4",
  health: "#f43f5e", sports: "#22c55e", entertainment: "#ec4899", politics: "#ef4444", environment: "#10b981", education: "#0ea5e9",
};
export const topicHue = (id: string) => HUE[id] ?? "#14b8a6";

/** The AI's theme for the story, or the topic's name when there is none (AC-11.4, AC-11.7). */
export const coverText = (card: Card, topic: string) => (typeof card.cover === "string" && card.cover.trim() ? card.cover.trim() : topic);

/** AC-11.4: the cover band of an AI-summarised card, in its topic's colour, with the compact diagram when there is one. */
export function Cover({ card, large = false }: { card: Card; large?: boolean }) {
  const { sections } = useDistill();
  const topic = sectionLabel(card.topic_section, sections);
  const visual = !large && drawable(card.visual) ? card.visual : null;
  return (
    <div className={`cover${large ? " large" : ""}${visual ? " has-visual" : ""}`} style={{ "--topic": topicHue(card.topic_section) } as React.CSSProperties} data-testid="cover">
      <div className="cover-text">
        <span className="cover-topic"><IconSection id={card.topic_section} />{topic}</span>
        <p className="cover-theme">{coverText(card, topic)}</p>
      </div>
      {visual ? <div className="cover-visual"><Diagram visual={visual} compact /></div> : <IconSection id={card.topic_section} className="cover-mark" width={84} height={84} />}
    </div>
  );
}
