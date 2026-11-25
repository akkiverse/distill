# Distill data server

Keeps each person's topics and saved cards so they sync across devices (AC-6.5). It runs on the founder's own home server with Docker; the Distill app on Vercel reaches it over HTTPS through Tailscale Funnel, and every request must carry the shared key. If the data server is off, Distill keeps working on each device and syncs later (AC-6.6).

```
Distill on Vercel ──HTTPS + key──▶ Tailscale Funnel (port 443) ──▶ 127.0.0.1:8090 Caddy (checks the key)
                                                                    └─▶ PostgREST ──▶ Postgres (never published)
```

| Part | What it does | Limits |
|---|---|---|
| `db` (Postgres 17) | Stores one row per person: `api.user_state(user_id, state jsonb, updated_at)` | 512 MB memory, data in the `db-data` volume |
| `api` (PostgREST) | Turns HTTP requests into SQL for that one table only | 128 MB |
| `gateway` (Caddy) | Lets a request in only with `Authorization: Bearer <DATA_GATEWAY_KEY>`; published on 127.0.0.1:8090 only | 64 MB |
| `backup` | `pg_dump` every night at about 02:30 into `./backups`, keeps 14 days | 128 MB |

Everything is its own Compose project (`distill`) on its own Docker network, restarts by itself after a reboot (`restart: unless-stopped`, with Docker enabled at boot), and doesn't touch other containers on the same machine.

## Set it up (once, about 15 minutes)

These steps are for the founder; they need your own accounts and keys, so Claude doesn't do them.

1. **Copy this folder** to the home server, for example `~/distill-data`:
   `git clone https://github.com/akkiverse/distill && cp -r distill/data-server ~/distill-data && cd ~/distill-data`
2. **Make the secrets.** `cp .env.example .env`, then fill each line with the output of `openssl rand -hex 32` (three different values). Keep `.env` private; it's ignored by git.
3. **Start it:** `docker compose up -d`, then `docker compose ps` (all four should be running) and check the key works:
   - `curl -s http://127.0.0.1:8090/user_state` answers `Not allowed`.
   - `curl -s http://127.0.0.1:8090/user_state -H "Authorization: Bearer <your DATA_GATEWAY_KEY>"` answers `[]`.
4. **Make sure Docker starts at boot:** `sudo systemctl enable docker`.
5. **Publish it with Tailscale Funnel** (Tailscale is free for personal use):
   - Install: `curl -fsSL https://tailscale.com/install.sh | sh`, then `sudo tailscale up` and sign in.
   - In the Tailscale admin console, allow Funnel for this machine (Access controls → add the `funnel` attribute, as the prompt shows).
   - `sudo tailscale funnel --bg 8090`. It prints the public address, like `https://<machine>.<tailnet>.ts.net`.
   - From another network: `curl -s https://<machine>.<tailnet>.ts.net/user_state` answers `Not allowed`.
6. **Tell Distill where it is.** In Vercel → project `distill` → Settings → Environment Variables (Production and Preview), add:
   - `DATA_ENDPOINT` = the Funnel address from step 5 (no trailing slash)
   - `DATA_GATEWAY_KEY` = the same key as in `.env`
   Then redeploy (Deployments → the latest → Redeploy). The Feed stops showing "Not synced yet" once it reaches the data server.

## Everyday

- **Status:** `docker compose ps` and `tailscale funnel status`.
- **Logs:** `docker compose logs --tail 50 gateway api`.
- **Backups:** files in `./backups`. Restore one into an empty database with
  `gunzip -c backups/distill-YYYY-MM-DD.sql.gz | docker compose exec -T db psql -U distill_owner distill`.
- **Change the key:** edit `DATA_GATEWAY_KEY` in `.env`, run `docker compose up -d gateway`, update it in Vercel and redeploy.
- **Stop it:** `docker compose down` (data stays in the volume). Distill keeps working on each device meanwhile.

## What it stores

Only what the app needs: the Studio Accounts user id, chosen sections and keywords, the cards (headline, source link, AI summary and key points; never full articles) and the last refresh time. No passwords, emails or names.
