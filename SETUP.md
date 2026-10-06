# Keep the Bot Sending Signals After Logout — Setup Guide

Architecture: **stateless, no database required.** The bot token, channel ID
and message style travel **inside every cron request body**, so the server
never needs to remember anything. No Vercel KV / Redis / paid plan needed.

What this can and cannot do:

✅ Signals keep sending after you **log out of the app** or **close your browser/tab**.
✅ Signals keep sending if **your phone or laptop is turned off**.
❌ Signals **cannot** send while **no server is online** — some machine must
reach Telegram's servers. Here that machine is Vercel's server (triggered by
cron-job.org), not your device.

---

## Step 1 — Deploy the app (required once)

1. Push this repo to GitHub and import it in Vercel.
2. In Vercel → Settings → Environment Variables add:
   - `GEMINI_API_KEY` = your Gemini key (for AI signal text; app still works
     in template fallback mode without it).
   - `ADMIN_USERNAME` / `ADMIN_PASSWORD` (optional; default `admin` / `password`).
   - `CRON_SECRET` (optional but recommended): any random string, e.g.
     `openssl rand -hex 16`. If set, every cron call must send header
     `Authorization: Bearer <that-value>`.
3. Deploy. Note your URL, e.g. `https://your-app.vercel.app` (no trailing slash).
4. Verify in your browser:
   - `https://your-app.vercel.app/api/health` → `{"status":"ok",...}`
   - `https://your-app.vercel.app/api/autobroadcast/status` →
     `{"serverReachable":true,"persistenceMode":"stateless-config-in-request",...}`
   - `https://your-app.vercel.app/api/autobroadcast/diagnose` → reachable.

If `/api/*` returns HTML instead of JSON, the API route is not deployed
(check `vercel.json` rewrites and that `api/index.ts` deployed).

---

## Step 2 — Connect Telegram in the app (required once)

1. Open the app → **Settings** (or the Telegram panel).
2. Bot token: from Telegram → `@BotFather` → `/newbot` → paste the token
   exactly (`123456789:ABCdef...`, no spaces).
3. Channel: Channel Settings → Admins → Add your bot as **Admin** with
   **Post Messages** permission.
4. Channel ID:
   - Public: `@yourchannel`
   - Private: forward any channel post to `@username_to_id_bot` → copy the
     numeric ID **exactly**, e.g. `-1001234567890` (keep the minus sign —
     the app never adds/removes `-100` on negative IDs).
5. Click **Send Test Message**. You must see it in the channel before continuing.

Common Telegram errors:
- `chat not found` → wrong Channel ID, or bot is not an admin yet.
- `bot was blocked / not a member / needs admin` → re-add bot as admin.
- `unauthorized` → wrong bot token.

---

## Step 3 — Enable server broadcasting + set up cron-job.org (required once)

1. In the app → **Settings → Server-Side Auto-Broadcast** → set interval
   (e.g. 15 minutes — every message states Nairobi EAT times computed from it)
   → **Enable Server-Side Broadcasting**.
2. Click **Show Setup Values**. You get 2 things:
   - **Cron URL**: `https://your-app.vercel.app/api/cron/auto-broadcast`
   - **Cycle body** (`{"mode":"cycle",...}` — one body for the one job)
3. Go to [cron-job.org](https://cron-job.org) → free account → **Create cronjob** once:
   - Title: `Signal Cycle`
   - URL: `<cronUrl>` from step 2
   - Schedule: **every 1 minute**
   - Request method: **POST**
   - Headers: `Content-Type: application/json`
     (+ `Authorization: Bearer <CRON_SECRET>` only if the app's banner says
     your server requires it)
   - Body: paste the **cycle body** exactly (use the Copy button — hand-typing
     risks truncating the bot token)
   - Save.

   **Before creating the job**, in the app click
   **▶ Simulate this minute's tick**. It runs the exact clock logic cron-job.org
   will run and tells you the phase plus the next event in Kenyan time
   (e.g. `Next: alert at 14:34 EAT`). Use **▶ Send alert now** /
   **▶ Send signal now** for immediate demos. ✅ = proven end-to-end.
   ❌ = fix the shown error, then Stop + Enable again — never paste failing
   values into cron-job.org.

   (No-body alternative: use the **GET-mode URL** with Method GET and an empty
   body — same cycle, nothing to mistype.)

4. In cron-job.org → History/Logs confirm HTTP 200 with
   `{"success":true,...}`. Mid-cycle ticks return
   `{"success":true,"phase":"waiting",...}` — also 200, nothing due that minute.

That's it — the alert always fires first (last minute of each cycle block),
the signal follows exactly 1 minute later (first minute of the next block),
every message states its real Nairobi time, and each expired signal gets its
expiry notice + auto-delete on the following cycle. 24/7, logged out or not.

> Old two-body payloads (`type: alert/signal`) still work for existing jobs,
> but re-do this step to move to the single-job cycle — order is then
> mathematically guaranteed instead of depending on save-time offsets.

---

## Optional — GitHub Actions full-auto scheduler (with expiry cleanup)

The repo includes `.github/workflows/auto-broadcast-cron.yml`: every minute it
pings the cycle endpoint and **chains message IDs through a cache**, so each
cycle posts the previous signal's expiry notice and deletes it — the only
fully unattended path with complete cleanup. To use it, add repo Secrets
`APP_URL`, `BOT_TOKEN`, `CHAT_ID` (plus `CRON_SECRET` if set in Vercel, and
optional `INTERVAL_MINUTES`, default 15), then enable the workflow in the
Actions tab. Run **either** this **or** cron-job.org, not both at once —
running both doubles every message (and each would try to expire the other's).

---

## Troubleshooting

**cron-job.org shows failed executions:**
Open its execution log and read the JSON body:
- `Request body is not valid JSON` → the pasted body was truncated (partial
  copy). Re-copy the WHOLE body with the Copy button — it must start with
  `{` and end with `}` — or avoid bodies entirely with the GET-mode URLs.
- `botToken is required` / `chatId is required` → the job's Body is empty or
  not valid JSON. Causes: (1) Body field left blank, (2) Request method left
  on GET — either switch the method to POST with the body, or use the
  GET-mode URL with an empty body, (3) Content-Type header missing so the
  body arrived as plain text — the server now recovers case (3)
  automatically, but set `Content-Type: application/json` anyway. Re-paste
  via the Copy button.
- cron-job.org itself says *"the server could not understand the request.
  Check the request body, headers and method"* → that text is cron-job.org
  rejecting the job definition (not our server): the method/body/headers
  combination is invalid, e.g. a body was pasted while Method is GET, the URL
  field contains line breaks, or a header line is malformed. Simplest fix:
  use the app's **GET-mode URLs** (Method GET, no body, no extra headers),
  which cannot trigger this validation error.
- `Bot token is invalid` (at Enable time) → fresh token from @BotFather first.
- `Unauthorized cron trigger` → add the `Authorization: Bearer ...` header
  with the same `CRON_SECRET` value as in Vercel, or remove `CRON_SECRET`
  from Vercel if you don't want auth.
- Telegram `chat not found / forbidden` → see Step 2 errors above. The app's
  setup panel now shows the exact Chat ID + masked token embedded in each
  body with ✅/⚠️ match indicators — if ⚠️, Stop + Enable again.
- `localhost` in the cron URL → you Enabled from `npm run dev`. cron-job.org
  cannot reach your laptop. Enable from the LIVE Vercel URL instead.

**Signals arrive but alerts never do:**
This has exactly two causes, no others:
1. The cron schedule is not **every 1 minute** (e.g. every 15 minutes lands
   every ping in a signal phase — mathematically, alerts can never fire).
   Fix the schedule to every 1 minute.
2. Vercel is serving an older deployment (cycle bodies degrade to
   signals-only there). The app refuses to Enable in that state — if Enable
   shows the STALE warning, wait for the newest deployment and retry.

**Signals send while the app is open but not via cron:**
The in-browser scanner only runs while the tab is open. After logout only
cron-job.org (or GitHub Actions) can trigger sends — confirm at least one
scheduler shows HTTP 200 `success:true` history.

**Status shows no `lastRunAt`:**
No cron request has successfully delivered yet (each deploy resets the
in-memory counter — this is expected on serverless). Fix the scheduler, not
the app.

**Local `npm run dev` API 404s:**
`server.ts` now mirrors all `api/index.ts` routes. If you still see HTML
instead of JSON on `/api/*` locally, restart `npm run dev` (Express runs on
`:3000`, Vite proxies `/api` there).
