import { useEffect, useRef, useState } from "react";
import { watchAiStatus } from "./ai-status.js";
import { IconBookmark, IconFeed, IconTopics, IconX } from "./components/Icons";
import { Feed } from "./screens/Feed";
import { Post } from "./screens/Post";
import { Saved } from "./screens/Saved";
import { Topics } from "./screens/Topics";
import { DistillProvider, useDistill } from "./state";

export function useHashRoute(): string {
  const [route, setRoute] = useState(() => window.location.hash.replace(/^#/, "") || "/");
  useEffect(() => {
    const on = () => {
      setRoute(window.location.hash.replace(/^#/, "") || "/");
      window.scrollTo({ top: 0 });
    };
    window.addEventListener("hashchange", on);
    return () => window.removeEventListener("hashchange", on);
  }, []);
  return route;
}

const NAV = [
  { href: "#/", route: "/", label: "Feed", Icon: IconFeed },
  { href: "#/saved", route: "/saved", label: "Saved", Icon: IconBookmark },
  { href: "#/topics", route: "/topics", label: "Topics", Icon: IconTopics },
];

function Shell() {
  const route = useHashRoute();
  const { notice, dismissNotice, sync } = useDistill();
  const banner = useRef<HTMLDivElement>(null);
  const [me, setMe] = useState<string | null>(null);

  useEffect(() => {
    const stop = watchAiStatus({ mount: banner.current, text: "AI is offline right now. New stories show as headlines until it's back." });
    fetch("/auth/me", { credentials: "same-origin" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => j?.signed_in && setMe(j.user?.name ?? "Signed in"))
      .catch(() => undefined);
    return stop;
  }, []);

  let screen;
  if (route.startsWith("/post/")) screen = <Post id={decodeURIComponent(route.slice(6))} />;
  else if (route === "/saved") screen = <Saved />;
  else if (route === "/topics") screen = <Topics />;
  else screen = <Feed />;
  const active = route.startsWith("/post/") ? "/" : route;

  return (
    <div className="shell">
      <a className="skip" href="#main">Skip to content</a>
      <div ref={banner} />
      <header className="top">
        <a href="#/" className="wordmark" aria-label="Distill, your feed">
          <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 4h14l-5 8v6l-4 2v-8z" fill="currentColor" /></svg>
          Distill
        </a>
        <nav className="nav-top" aria-label="Main">
          {NAV.map(({ href, route: r, label }) => (
            <a key={r} href={href} aria-current={active === r ? "page" : undefined}>{label}</a>
          ))}
        </nav>
        <div className="who">
          {sync === "pending" && <span className="sync-dot" title="Changes will sync when the connection is back">Not synced yet</span>}
          {me && <><span className="small muted">{me}</span> <a className="small" href="/auth/logout">Sign out</a></>}
        </div>
      </header>
      <main id="main" tabIndex={-1}>{screen}</main>
      {notice && (
        <div className="toast" role="status">
          <span>{notice}</span>
          <button type="button" className="icon-btn" aria-label="Dismiss" onClick={dismissNotice}><IconX /></button>
        </div>
      )}
      <footer className="foot">
        <a href="https://idea-studio-akkiverse.vercel.app">Part of Idea Studio by AkkiVerse</a>
      </footer>
      <nav className="nav-bottom" aria-label="Main">
        {NAV.map(({ href, route: r, label, Icon }) => (
          <a key={r} href={href} aria-current={active === r ? "page" : undefined}><Icon /><span>{label}</span></a>
        ))}
      </nav>
    </div>
  );
}

export function App() {
  return (
    <DistillProvider>
      <Shell />
    </DistillProvider>
  );
}
