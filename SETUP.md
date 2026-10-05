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
   (e.g. every 2 min) → **Enable Server-Side Broadcasting**.
2. Click **Show Setup Values**. You get 3 things:
   - **Cron URL** (same for both jobs):
     `https://your-app.vercel.app/api/cron/auto-broadcast`
   - **Cron Job 1 body** (`{"type":"alert",...}`)
   - **Cron Job 2 body** (`{"type":"signal",...}`)
3. Go to [cron-job.org](https://cron-job.org) → free account → **Create cronjob** twice:

   **Cron Job 1 — Alert (fires first)**
   - Title: `Signal Alert`
   - URL: `<cronUrl>` from step 2
   - Schedule: your interval (e.g. every 2 minutes)
   - Request method: **POST**
   - Headers: `Content-Type: application/json`
     (+ `Authorization: Bearer <CRON_SECRET>` if you set one in Vercel)
   - Body: paste the **alertPayload** exactly (use the Copy button — hand-typing
     risks truncating the bot token)
   - Save. Note the time you saved it.

   **Before creating the jobs**, in the app click
   **▶ Test-send this exact signal now**. ✅ = your copied URL + body are
   proven correct end-to-end (same POST cron-job.org will send). ❌ = fix the
   shown error, then Stop + Enable again for fresh bodies — never paste
   failing values into cron-job.org.

   **Cron Job 2 — Signal (fires 1 min after alert)**
   - Same as above, but Body = **signalPayload**.
   - Create/save it **exactly 1 minute after Job 1** so the two jobs stay
     offset by 1 minute forever (alert → 1 min later → signal, repeating).

4. In cron-job.org → History/Logs confirm both jobs return HTTP 200 with
   `{"success":true,...}`.

That's it — signals now send 24/7 even while you are logged out.

> GET fallback: the endpoint also accepts GET with
> `?botToken=...&chatId=...&type=signal` query params, so a job accidentally
> left on GET still works. POST with JSON body is the supported mode.

---

## Optional — GitHub Actions fallback scheduler

If you prefer not to rely on cron-job.org, the repo includes
`.github/workflows/auto-broadcast-cron.yml` (every 2 min, correct POST with
JSON body). To use it, add repo Secrets `APP_URL`, `BOT_TOKEN`, `CHAT_ID`
(and `CRON_SECRET` if set in Vercel), then enable the workflow in the
Actions tab. You can run **both** schedulers, but normally one is enough —
running both at the same interval doubles the messages.

---

## Troubleshooting

**cron-job.org shows failed executions:**
Open its execution log and read the JSON body:
- `botToken is required` / `chatId is required` → the job's Body is empty or
  not valid JSON. Causes: (1) Body field left blank, (2) Request method left
  on GET, (3) Content-Type header missing so the body arrived as plain text —
  the server now recovers case (3) automatically, but set
  `Content-Type: application/json` anyway. Re-paste via the Copy button.
- `Bot token is invalid` (at Enable time) → fresh token from @BotFather first.
- `Unauthorized cron trigger` → add the `Authorization: Bearer ...` header
  with the same `CRON_SECRET` value as in Vercel, or remove `CRON_SECRET`
  from Vercel if you don't want auth.
- Telegram `chat not found / forbidden` → see Step 2 errors above. The app's
  setup panel now shows the exact Chat ID + masked token embedded in each
  body with ✅/⚠️ match indicators — if ⚠️, Stop + Enable again.
- `localhost` in the cron URL → you Enabled from `npm run dev`. cron-job.org
  cannot reach your laptop. Enable from the LIVE Vercel URL instead.

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
