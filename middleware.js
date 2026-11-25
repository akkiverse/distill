// Studio sign-in for this app (Vercel Routing Middleware; runs before every request).
//
// Copy this file to the repo root as `middleware.js`, add the dependencies
// `jose` and `@vercel/functions` to package.json, and fill in the two settings below.
// Whether sign-in is on is decided in the Idea Studio admin (Users → Apps), so the
// founder can open or close the app without a redeploy. See studio-auth/README.md.
import { createRemoteJWKSet, jwtVerify } from "jose";
import { next } from "@vercel/functions";

const HUB = "https://idea-studio-akkiverse.vercel.app";
const APP = "distill";
// If the account service can't be reached and its answer isn't cached, keep the app
// closed (true) or let people in (false). Use true for apps holding private data.
const PROTECT_IF_UNSURE = true;

const SESSION = "studio_session";
const FLOW = "studio_flow";
const PUBLIC = [/^\/favicon/, /^\/(apple-touch-icon|icon-\d+|og)\.png$/, /^\/site\.webmanifest$/, /^\/robots\.txt$/, /^\/api\/health$/];

export const config = { matcher: "/:path*" };

const JWKS = createRemoteJWKSet(new URL(HUB + "/api/auth/jwks.json"), { cacheMaxAge: 10 * 60 * 1000 });
let setting = { at: 0, required: null };

async function signInRequired() {
  if (setting.required !== null && Date.now() - setting.at < 60_000) return setting.required;
  try {
    const r = await fetch(`${HUB}/api/auth/apps/${APP}`, { signal: AbortSignal.timeout(2500) });
    if (r.ok) {
      const j = await r.json();
      setting = { at: Date.now(), required: !!j.signin_required };
      return setting.required;
    }
    if (r.status === 404) { setting = { at: Date.now(), required: false }; return false; }
  } catch { /* fall through */ }
  return setting.required ?? PROTECT_IF_UNSURE;
}

const b64url = (bytes) => btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const randomToken = (n = 32) => b64url(crypto.getRandomValues(new Uint8Array(n)));
const challengeFor = async (verifier) => b64url(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier)));

function cookies(request) {
  const out = {};
  for (const part of (request.headers.get("cookie") || "").split(";")) {
    const i = part.indexOf("=");
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

function cookie(name, value, { maxAge, path = "/", secure }) {
  return `${name}=${encodeURIComponent(value)}; Path=${path}; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure ? "; Secure" : ""}`;
}

async function user(request) {
  const token = cookies(request)[SESSION];
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, JWKS, { issuer: HUB, audience: APP, algorithms: ["EdDSA"] });
    return payload;
  } catch {
    return null;
  }
}

function page(status, title, text) {
  const html = `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title>
<body style="font:16px/1.5 system-ui,sans-serif;max-width:32rem;margin:15vh auto;padding:0 16px"><h1 style="font-size:1.4rem">${title}</h1><p>${text}</p><p><a href="/">Try again</a></p></body>`;
  return new Response(html, { status, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } });
}

export default async function middleware(request) {
  const url = new URL(request.url);
  const secure = url.protocol === "https:";
  // Previews are already private (Vercel sign-in), so Studio sign-in only guards production and local runs.
  if (process.env.VERCEL_ENV === "preview") return next();
  if (PUBLIC.some((re) => re.test(url.pathname))) return next();

  if (url.pathname === "/auth/me") {
    const u = await user(request);
    const body = u ? { signed_in: true, user: { id: u.sub, name: u.name, email: u.email, role: u.role } } : { signed_in: false };
    return Response.json(body, { headers: { "cache-control": "no-store" } });
  }
  if (url.pathname === "/auth/logout") {
    return new Response(null, { status: 302, headers: { location: "/", "set-cookie": cookie(SESSION, "", { maxAge: 0, secure }), "cache-control": "no-store" } });
  }
  if (url.pathname === "/auth/callback") {
    const flow = (cookies(request)[FLOW] || "").split(".");
    const [state, verifier, back] = [flow[0], flow[1], decodeURIComponent(flow.slice(2).join(".") || "%2F")];
    const code = url.searchParams.get("code");
    if (!code || !state || url.searchParams.get("state") !== state || !verifier) {
      return page(400, "Sign-in didn't finish", "The sign-in link expired or was opened in another browser. Please sign in again.");
    }
    let token;
    try {
      const r = await fetch(`${HUB}/api/auth/token`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ app: APP, code, redirect_uri: `${url.origin}/auth/callback`, code_verifier: verifier }),
        signal: AbortSignal.timeout(8000),
      });
      if (!r.ok) throw new Error("token " + r.status);
      token = (await r.json()).access_token;
      const { payload } = await jwtVerify(token, JWKS, { issuer: HUB, audience: APP, algorithms: ["EdDSA"] });
      const maxAge = Math.max(60, Number(payload.exp) - Math.floor(Date.now() / 1000));
      const headers = new Headers({ location: back.startsWith("/") && !back.startsWith("//") ? back : "/", "cache-control": "no-store" });
      headers.append("set-cookie", cookie(SESSION, token, { maxAge, secure }));
      headers.append("set-cookie", cookie(FLOW, "", { maxAge: 0, path: "/auth", secure }));
      return new Response(null, { status: 302, headers });
    } catch {
      return page(502, "Sign-in didn't finish", "We couldn't confirm your sign-in. Please try again in a moment.");
    }
  }

  if (!(await signInRequired())) return next();
  if (await user(request)) return next();

  if (url.pathname.startsWith("/api/")) {
    return Response.json({ error: { code: "signin_required", message: "Sign in to use this app." } }, { status: 401, headers: { "cache-control": "no-store" } });
  }
  const state = randomToken(16);
  const verifier = randomToken(32);
  const back = encodeURIComponent(url.pathname + url.search);
  const login = new URL(HUB + "/auth/login");
  login.search = new URLSearchParams({
    app: APP, redirect_uri: `${url.origin}/auth/callback`, state, code_challenge: await challengeFor(verifier), code_challenge_method: "S256",
  }).toString();
  return new Response(null, {
    status: 302,
    headers: { location: login.toString(), "set-cookie": cookie(FLOW, `${state}.${verifier}.${back}`, { maxAge: 600, path: "/auth", secure }), "cache-control": "no-store" },
  });
}
