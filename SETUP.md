# Keep the Bot Sending Signals After Logout — Setup Guide

## What was actually broken

There were **two separate bugs** stacking on top of each other:

1. **State wasn't persisting.** The server-side "enabled" flag was being saved
   to `/tmp` on Vercel's filesystem. Vercel serverless functions are
   stateless — each request can run on a different physical machine, so the
   file written when you clicked "Enable" was often invisible to the next
   request (including the cron trigger). This made the toggle silently
   revert to "off" almost immediately, regardless of login state.

2. **The scheduler wasn't reliable.** GitHub Actions' `schedule:` trigger is
   not guaranteed to fire on time, can be delayed 15–60+ minutes, and will
   only run from your repo's default branch. If nothing pings the server,
   nothing gets sent — independent of bug #1.

Both are now fixed: state is stored in **Vercel KV** (a real persistent
database, not a temp file), and the recommended scheduler is **cron-job.org**,
a purpose-built pinger that fires within seconds, not GitHub Actions.

## Important: what this *can* and *cannot* do

✅ Signals keep sending after you **log out of the app** or **close your browser/tab**.
✅ Signals keep sending if **your phone or laptop is turned off**.
❌ Signals **cannot** send while the **server itself** has no internet — no bot,
anywhere, on any platform, can deliver a message to Telegram without a network
path to Telegram's servers. "Offline" always means *some* machine has to be online
to do the sending; here, that machine is Vercel's server, not your device.

---

## Step 1 — Provision Vercel KV (required, ~2 minutes)

1. Go to [vercel.com](https://vercel.com) → open your project (`signaltraker`)
2. Click the **Storage** tab
3. Click **Create Database** → choose **KV**
4. Give it any name (e.g. `signal-state`) → **Create**
5. On the next screen, click **Connect Project** and select your `signaltraker` project
6. Vercel automatically injects two environment variables into your project:
   - `KV_REST_API_URL`
   - `KV_REST_API_TOKEN`
7. Go to **Deployments** → click the **⋯** menu on the latest deployment → **Redeploy**
   (this ensures the new environment variables are picked up)

**How to verify this worked:** open `https://your-app.vercel.app/api/autobroadcast/status`
in your browser. Look for `"persistenceMode": "kv"` in the response. If it instead
says `"memory-fallback-not-persistent"`, the KV store isn't connected yet — repeat
the steps above.

---

## Step 2 — Set up the external pinger (required)

1. Go to [cron-job.org](https://cron-job.org) and create a free account (no card needed)
2. Click **Create cronjob**
3. **Title:** Signal Auto-Broadcast
4. **URL:** `https://your-app.vercel.app/api/cron/auto-broadcast`
   (replace with your actual deployed domain)
5. **Schedule:** Every 1 minute
6. Save

This service is built specifically for this purpose and fires reliably within
seconds of the scheduled time — unlike GitHub Actions' schedule trigger, which
is explicitly documented as best-effort and can be delayed by up to an hour.

*(Optional, recommended for security)* In Vercel, add an environment variable
`CRON_SECRET` with any random value you choose. Then in cron-job.org, add a
custom request header: `Authorization: Bearer your-secret-value`. This stops
anyone else from triggering your broadcasts if they guess your URL.

---

## Step 3 — Enable in the app

1. Open the app → **Settings**
2. Make sure your Bot Token and Channel ID are connected at the top of the page
3. Scroll to **Server-Side Auto-Broadcast** → set your interval → click
   **Enable Server-Side Broadcasting**
4. You should see "🟢 Running on Server" — this state is now stored in Vercel
   KV and will be read correctly by every future cron ping, regardless of
   whether you are logged in.

To stop it permanently, click **Disconnect (Stop Auto-Broadcast)** — this is
the only thing that will stop it going forward (besides disconnecting your bot).

---

## Troubleshooting

**Status still shows "memory-fallback-not-persistent" after Step 1:**
Double-check the KV store shows as "Connected" under your project's Storage
tab, and that you redeployed after connecting it. Environment variables only
take effect on new deployments.

**cron-job.org shows failed executions:**
Open the execution log in cron-job.org and check the HTTP response body — the
`/api/cron/auto-broadcast` endpoint returns a JSON error describing exactly
what's wrong (e.g. bot token invalid, KV not configured, etc).

**Signals send while logged in but stop within a minute of logging out:**
This was bug #1 above (state not persisting). If you've completed Step 1 and
still see this, check `/api/autobroadcast/status` immediately after enabling —
if `enabled: true` is not present, the KV write itself may be failing; check
your Vercel function logs for `[AutoBroadcast] KV write error`.
