# SEEDlebration Bot 🎉

An automated Slack bot that watches multiple Gusto company calendars for birthdays and work anniversaries, then posts personalized celebration messages to a team Slack channel. Built for Seedtrust, Orchid, and Gather.

The celebrations half is one Node.js script running on a daily GitHub Actions cron — no server, no database, no maintenance. Alongside it lives [the Friday bot](#the-friday-bot), a small Cloudflare Worker that answers when someone asks it what day it is. The two are independent; neither can take the other down.

---

## How it works

1. GitHub Actions runs `celebrations-check.js` on a daily cron at 09:30 UTC.
2. The script loops through each calendar ID in `CALENDAR_IDS` and queries the Google Calendar API for events from yesterday through tomorrow (a buffered window to handle timezone edge cases).
3. Each event is filtered: must be all-day, and must contain "birthday" or "anniversary" in the summary.
4. Surviving events are matched against today's date in `America/New_York` (which handles EST↔EDT automatically).
5. Each match is parsed into a celebration object (name, type, optional year count) and a random message is selected from the appropriate pool.
6. Messages are posted to Slack via `chat.postMessage`, one per second to avoid rate limits.

If anything failed along the way — a calendar that wouldn't load, a Slack post that was rejected — the run exits non-zero so GitHub marks it red and emails you. A green check means every message that should have gone out, went out.

---

## Features

- **Multiple calendars**: Reads from any number of Gusto calendars in a single run.
- **Two event-title formats per type**: Handles both third-person (`Ana's birthday`) and first-person (`Happy birthday to you!`) Gusto formats.
- **Anniversary year extraction**: Pulls the year count from the event title and includes it in the message.
- **Random message rotation**: 24 birthday messages and 20 anniversary messages, randomly selected per event.
- **Timezone-aware**: All "today" comparisons normalized to `America/New_York`.
- **Resilient**: Errors fetching one calendar don't stop the others. Errors posting one message don't stop the rest.
- **Fails loudly**: A partial failure still finishes the run, then exits non-zero so a broken token shows up as a red X instead of a silent green check.
- **Stays alive**: A companion `keepalive` workflow stops GitHub from auto-disabling the schedule after 60 quiet days.
- **Answers back**: A separate Cloudflare Worker replies when anyone asks `@bot is today Friday?` — see [The Friday bot](#the-friday-bot).
- **Bot identity**: Posts as `Celebrations Bot` with a 🎉 avatar so it's instantly recognizable in Slack.

---

## Setup

### 1. Repository

Add these files to a new GitHub repository:

```
celebrations-bot/
├── celebrations-check.js
├── package.json
├── README.md
└── .github/workflows/celebrations-check.yml
```

### 2. Slack app

1. Create an app at [api.slack.com/apps](https://api.slack.com/apps).
2. Under **OAuth & Permissions**, add Bot Token Scopes:
   - `chat:write`
   - `chat:write.public`
3. Install the app to your workspace.
4. Copy the **Bot User OAuth Token** (starts with `xoxb-`).

### 3. Google Calendar API

1. In [Google Cloud Console](https://console.cloud.google.com/), create a project (or reuse one).
2. Enable the **Google Calendar API**.
3. Create an **API key** under Credentials.
4. Restrict the key to the Calendar API only (read-only is sufficient — the bot never writes).

### 4. Calendar IDs

For each Gusto calendar to monitor:

1. Open it in Google Calendar.
2. Click the three dots next to the calendar name → **Settings and sharing**.
3. Scroll to **Calendar ID** (looks like `abcd1234@group.calendar.google.com`).
4. Make sure the calendar is shared in a way the API key can read it.

### 5. GitHub Secrets

Go to **Settings → Secrets and variables → Actions** in your repo and add:

| Secret | Required | Description | Example |
|---|---|---|---|
| `SLACK_TOKEN` | yes | Bot User OAuth Token from Slack | `xoxb-1234-abcd...` |
| `GOOGLE_CALENDAR_API_KEY` | yes | API key for Google Calendar | `AIzaSy...` |
| `CALENDAR_IDS` | yes | Comma-separated calendar IDs | `cal1@group.calendar.google.com,cal2@group.calendar.google.com` |
| `CALENDAR_NAME_MAP` | yes* | JSON mapping calendar ID → person name | `{"cal1@group.calendar.google.com":"Ana May"}` |
| `SLACK_CHANNEL` | no | Target channel for celebrations | defaults to `#celebrations-bot-test` |

\* Required only if any of your calendars use the first-person format (`Happy birthday to you!` / `Your N-year anniversary`). If all titles are third-person, the map can be empty.

---

## Event title formats supported

The bot recognizes these title patterns. Anything else is logged and skipped.

### Birthdays

| Title pattern | Source | Output |
|---|---|---|
| `Ana's birthday` | Third-person view of someone else's calendar | `Happy Birthday, Ana! 🎂` + random message |
| `Happy birthday to you!` | First-person view of own calendar | Uses `CALENDAR_NAME_MAP` to resolve the name |

### Anniversaries

| Title pattern | Output |
|---|---|
| `Ana's 5-year anniversary` | `Congratulations, Ana, on your 5-year anniversary! 🎊` |
| `Your 5-year anniversary` | Same format, name pulled from `CALENDAR_NAME_MAP` |
| `Ana's anniversary` (no year) | `Congratulations Ana on your anniversary! 🎊` |

All matched events must be all-day. Timed events are ignored.

---

## Workflows

There are two, both in `.github/workflows/`. Read them there rather than trusting a copy pasted here — an earlier version of this README drifted out of sync with the real cron and went unnoticed for months.

| File | Schedule | Purpose |
|---|---|---|
| `celebrations-check.yml` | daily, 09:30 UTC | The bot itself |
| `keepalive.yml` | 1st and 15th, 04:17 UTC | Keeps the schedule above from being auto-disabled |

Manual runs (`workflow_dispatch`) of the celebrations check send everything to `#celebrations-bot-test` instead of the real channels, so you can test freely without posting to `#general`.

### Why 09:30 UTC

GitHub queues scheduled jobs on shared runners and delivers them late under load — this workflow's own history shows it landing anywhere from 17 minutes to 10 hours behind schedule, typically 3–6 hours. The time is chosen so both ends of that range are survivable: on time it fires at 4:30/5:30 AM Eastern, and a typical delay puts it mid-morning.

What matters more than the hour is that 09:30 UTC falls on the same Eastern calendar day in both EST and EDT. The date matching in `celebrations-check.js` compares against "today in `America/New_York`", so a cron time that straddles midnight Eastern would make the bot look for the wrong day's events.

### Why the keepalive exists

GitHub disables scheduled workflows after 60 days of repository inactivity. It emails you, but it's easy to miss, and the bot just stops — no failed runs, nothing in the Actions tab, just silence. This repo lost the bot twice that way (17 days in July 2026, 35 days from September to October 2026), and both times it only came back because someone manually re-ran the workflow.

A scheduled workflow can't rescue itself from this, because it gets disabled too. The keepalive works by pushing an empty commit, which counts as repository activity and resets the clock for every workflow including itself. It checks first and only commits once the repo has been quiet for 35 days, so an actively developed repo never accumulates noise commits.

---

## The Friday bot

Mention the bot and ask what day it is. On a Friday it says so and posts the video; any other day it tells you how far away Friday is.

```
Ana    @SEEDlebration is today Friday?
bot    IT IS FRIDAY. 🎉
       https://youtu.be/U6n2NcJ7rLc

                              ── on a Tuesday ──

Ana    @SEEDlebration is today Friday?
bot    Tuesday — the Monday that learned nothing.
```

It replies to *any* mention, not just ones phrased as a question — it's a one-trick bot and parsing the sentence would only add ways to fail. If it's mentioned inside a thread it replies in that thread; mentioned in the channel, it replies in the channel so the video unfurls.

### Why this can't live in the cron job

The celebrations bot is a script that wakes up, runs for twenty seconds and exits. Nothing is listening the rest of the day. Slack's Events API needs an endpoint that answers within 3 seconds, and a GitHub Actions runner takes 30 seconds to two minutes just to boot — so this is a genuinely separate piece of infrastructure, living in `worker/`.

Cloudflare Workers suit it well: the free tier covers this comfortably, and there are no cold starts, so the 3-second budget is never in danger.

### Setup

**1. Slack app** — in the same app you already use, under **Event Subscriptions**:

- Add the bot token scope `app_mentions:read` (under **OAuth & Permissions**, alongside the `chat:write` you already have), then reinstall the app.
- Copy the **Signing Secret** from **Basic Information → App Credentials**. This is *not* the bot token; you need both.

**2. Deploy the Worker**

```bash
cd worker
npx wrangler login
npx wrangler secret put SLACK_BOT_TOKEN       # the same xoxb-... token
npx wrangler secret put SLACK_SIGNING_SECRET  # from Basic Information
npx wrangler deploy
```

Deploy prints a URL like `https://celebration-slack-bot.<subdomain>.workers.dev`.

**3. Point Slack at it** — back under **Event Subscriptions**, enable events and paste that URL as the Request URL. Slack immediately sends a one-time `url_verification` challenge; the Worker answers it, and you should see a green **Verified**. Then under **Subscribe to bot events** add `app_mention` and save.

**4. Invite the bot** to any channel you want it to answer in (`/invite @SEEDlebration`). Unlike the celebrations post, `chat:write.public` is not enough here — it has to be in the channel to receive the mention.

### Secrets

Set with `npx wrangler secret put NAME`, never in `wrangler.toml` — that file is committed.

| Secret | Description |
|---|---|
| `SLACK_BOT_TOKEN` | Bot User OAuth Token, `xoxb-...`. Same one the cron job uses. |
| `SLACK_SIGNING_SECRET` | From **Basic Information → App Credentials**. Used to prove requests really came from Slack. |

### Tests

```bash
cd worker
npm test
```

28 tests, no network and no deploy needed. They cover the reply logic across all seven weekdays — including two cases where the Eastern weekday and the UTC weekday disagree — and drive the Worker's `fetch` handler directly with genuinely HMAC-signed requests, checking that tampered bodies, wrong secrets, stale timestamps and missing headers are all rejected.

### Troubleshooting

**Slack won't verify the Request URL** → the Worker returns 401 if the signature doesn't check out, and a wrong `SLACK_SIGNING_SECRET` is the usual cause. Watch it live with `npx wrangler tail` while you hit **Retry** in Slack.

**Verified, but it ignores mentions** → either `app_mention` wasn't added under **Subscribe to bot events**, or the app wasn't reinstalled after adding the scope, or the bot isn't in the channel.

**It replies but the video doesn't embed** → Slack only unfurls a bare URL on its own line. Keep `FRIDAY_VIDEO` unwrapped.

**Nothing in the logs at all** → Slack is not reaching the Worker. Check the Request URL in the dashboard still matches the deployed URL.

### Changing what it says

Everything is in `worker/src/friday.js`: `FRIDAY_REPLIES` for Fridays, `NOT_FRIDAY_REPLIES` keyed by weekday for the rest, and `FRIDAY_VIDEO` for the link. The day-specific pools reference how many days remain, so if you move messages between days, update the counts. Run `npm test` after editing — the tests assert each day draws from its own pool.

---

## Testing

### Manual run

1. Go to the **Actions** tab in your repo.
2. Select **Daily Celebrations Check**.
3. Click **Run workflow**.

### What you'll see in the logs

The script logs each step verbosely. Successful runs include lines like:

```
🚀 Starting celebrations check...
📅 Checking date: 2026-04-27
📋 Processing calendar: cal1@group.calendar.google.com
Found 3 total events for calendar cal1@...
Found 1 celebration events for today
📝 Processing event: Ana's birthday
✅ Added birthday for Ana
🎉 Found 1 celebration(s) for today!
📤 Sending birthday message for Ana...
✅ Message sent successfully to Slack
✨ Celebrations check complete!
📊 Sent 1/1 messages successfully
```

If no celebrations are found, the run still succeeds and logs `🔍 No celebrations found for today`.

---

## Troubleshooting

### No events detected

- Verify each calendar ID in `CALENDAR_IDS` is correct (no extra spaces, comma-separated).
- Confirm the events are **all-day** events. Timed events are filtered out.
- Confirm event titles match one of the supported formats above.
- Check the run logs for a `Could not parse...` warning, which means the title format isn't recognized.

### Calendar access errors

- Confirm the Google Calendar API is enabled on the project tied to your API key.
- Confirm each calendar is shared so the API key can read it (calendar must be public, or accessible to the project).
- Check the run logs for the exact error message returned by the Calendar API.

### Slack message failures

- Confirm `SLACK_TOKEN` is current and hasn't been revoked.
- Confirm the bot is a member of the target channel (or the channel is public and the bot has `chat:write.public`).
- Channel name should include the `#` for public channels (e.g., `#celebrations`).

### Name mapping issues

- `CALENDAR_NAME_MAP` must be valid JSON. A trailing comma or missing quote will silently fall back to an empty map.
- Calendar IDs in the map must match `CALENDAR_IDS` exactly.
- Only needed for first-person event formats (`Happy birthday to you!`, `Your N-year anniversary`).

### The bot stopped entirely

First, check whether it's *failing* or *not running at all* — they look the same in Slack but have nothing else in common.

```bash
gh run list --limit 30
```

**Runs are present but red** → a real error. Open the failing run; the summary at the bottom lists every failure with its cause.

**No runs at all for a stretch of days** → the schedule isn't firing. Almost always GitHub's 60-day inactivity auto-disable. Check **Actions → Daily Celebrations Check** for a banner offering to re-enable it, then:

```bash
gh workflow enable "Daily Celebrations Check"
gh workflow run "Keepalive"    # resets the clock so it doesn't recur
```

**Runs are present and green but Slack is quiet** → that should no longer be possible; a green run means every message was accepted by Slack. If it happens anyway, the bot is posting to the wrong place: check `SLACK_CHANNEL`, and remember that manual runs deliberately redirect to `#celebrations-bot-test`.

### The bot doesn't answer @mentions

That's the Worker, not the cron job — they're completely separate and share no infrastructure. See [The Friday bot](#the-friday-bot).

---

## Customization

### Add or change messages

Edit the arrays at the top of `celebrations-check.js`:

```javascript
const BIRTHDAY_MESSAGES = [
    "Hope your special day brings you all the happiness your heart can hold! 🌟",
    // ... add your own
];

const ANNIVERSARY_MESSAGES = [
    "Thank you for your dedication and all the amazing work you do! 🌟",
    // ... add your own
];
```

The Friday bot's replies live separately, in `worker/src/friday.js`.

### Change message format

Format strings live in `parseBirthdayEvent()` and `parseAnniversaryEvent()`:

```javascript
message: `🎉 Happy Birthday, ${name}! 🎂\n${this.getRandomMessage(BIRTHDAY_MESSAGES)}`
```

### Add new event types

Extend `isCelebrationEvent()`:

```javascript
isCelebrationEvent(event) {
    const summary = event.summary?.toLowerCase() || '';
    const isBirthday = summary.includes('birthday');
    const isAnniversary = summary.includes('anniversary');
    const isWorkiversary = summary.includes('workiversary'); // new
    const isAllDay = event.start?.date && !event.start?.dateTime;
    return (isBirthday || isAnniversary || isWorkiversary) && isAllDay;
}
```

Then add a corresponding `parseWorkiversaryEvent()` and route to it from `parseEventDetails()`.

### Change the schedule

Edit the cron in `.github/workflows/celebrations-check.yml`. Some examples:

| Cron | Runs at |
|---|---|
| `30 9 * * *` | 09:30 UTC daily (current) |
| `30 11 * * *` | 11:30 UTC daily (6:30 AM EST / 7:30 AM EDT) |
| `30 9 * * 1-5` | 09:30 UTC weekdays only |

Two constraints worth keeping in mind before you move it:

- **Don't schedule between roughly 00:00 and 05:00 UTC.** That's the previous Eastern calendar day in EST, so the bot would look for the wrong day's events.
- **Avoid the top of the hour.** GitHub's queues spike there, and this job is already arriving hours late. `:30` is deliberate.

A weekday-only schedule (`1-5`) means any birthday falling on a weekend is missed entirely, since the bot only ever looks at the day it runs.

---

## Security

- Nothing sensitive lives in the repo — GitHub Secrets for the cron job, Wrangler secrets for the Worker, both injected at runtime. `wrangler.toml` is committed and deliberately holds no values.
- The Google API key is restricted to the Calendar API and only ever reads. If it leaks, the blast radius is bounded to reading already-shared calendar events.
- The Slack bot token can be revoked from the Slack admin panel and re-pasted without any code change. Rotating it now means updating it in **both** places — GitHub Secrets and Wrangler.
- The keepalive workflow pushes with the built-in `GITHUB_TOKEN`, scoped to `contents: write` on this repo only. No extra credential is involved.
- **The Worker's URL is public**, so every request is verified against `SLACK_SIGNING_SECRET` before it is parsed, and anything signed more than five minutes ago is rejected to block replays. Without that check, anyone who found the URL could make the bot post as itself. Treat the signing secret as being as sensitive as the bot token.
- Rotate all three credentials annually as a baseline, and immediately if any is suspected compromised.

---

## Architecture summary

```
┌─────────────────┐    cron 30 9 * * *
│ GitHub Actions  │ ─────────────────────┐          ┌──────────────────┐
└─────────────────┘                      │          │ keepalive.yml    │
                                         │          │ 1st + 15th       │
                                         ▼          │ empty commit, so │
                             ┌─────────────────────┐│ the cron above   │
                             │ celebrations-check  ││ is never auto-   │
                             │       .js (Node 18) ││ disabled         │
                             └──────────┬──────────┘└──────────────────┘
                                        │
               ┌────────────────────────┼─────────────────────┐
               ▼                        ▼                     ▼
      ┌────────────────┐      ┌─────────────────┐    ┌──────────────┐
      │ Calendar API   │      │ Calendar API    │    │ Calendar API │
      │ (Gusto cal 1)  │ ...  │ (Gusto cal N)   │    │ (Gusto cal X)│
      └────────────────┘      └─────────────────┘    └──────────────┘
                                        │
                                        ▼
                             ┌─────────────────────┐
                             │ filter + parse      │
                             │ (today in EST only) │
                             └──────────┬──────────┘
                                        ▼
                             ┌─────────────────────┐
                             │ Slack chat.postMsg  │
                             │  → #celebrations    │
                             └──────────┬──────────┘
                                        ▼
                             ┌─────────────────────┐
                             │ any failures?       │
                             │  yes → exit 1 (red) │
                             └─────────────────────┘
```

The Friday bot is a second, entirely separate system. It shares no code, no credentials and no runtime with the cron job above — if one breaks, the other carries on.

```
  someone types "@bot is today Friday?"
                │
                ▼
     ┌─────────────────────┐   POST, signed with
     │ Slack Events API    │ ─ the signing secret ─┐
     └─────────────────────┘                      │
                                                  ▼
                                   ┌──────────────────────────┐
                                   │ Cloudflare Worker        │
                                   │  1. verify signature     │
                                   │  2. ack 200 immediately  │
                                   │  3. waitUntil(reply)     │
                                   └────────────┬─────────────┘
                                                ▼
                                   ┌──────────────────────────┐
                                   │ weekday in America/      │
                                   │ New_York == 'Friday'?    │
                                   └────────────┬─────────────┘
                                   yes ─────────┴───────── no
                                    │                       │
                                    ▼                       ▼
                          one-liner + video        day-specific excuse
                                    └───────────┬───────────┘
                                                ▼
                                      Slack chat.postMessage
```

---

## License

MIT — modify and reuse freely within your organization.
