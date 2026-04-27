# SEEDlebration Bot 🎉

An automated Slack bot that watches multiple Gusto company calendars for birthdays and work anniversaries, then posts personalized celebration messages to a team Slack channel. Built for Seedtrust, Orchid, and Gather.

The whole thing is one Node.js script (~370 lines) running on a daily GitHub Actions cron. No server, no database, no maintenance.

---

## How it works

1. GitHub Actions runs `celebrations-check.js` on a daily cron at 12:00 UTC (7 AM EST / 8 AM EDT).
2. The script loops through each calendar ID in `CALENDAR_IDS` and queries the Google Calendar API for events from yesterday through tomorrow (a buffered window to handle timezone edge cases).
3. Each event is filtered: must be all-day, and must contain "birthday" or "anniversary" in the summary.
4. Surviving events are matched against today's date in `America/New_York` (which handles EST↔EDT automatically).
5. Each match is parsed into a celebration object (name, type, optional year count) and a random message is selected from the appropriate pool.
6. Messages are posted to Slack via `chat.postMessage`, one per second to avoid rate limits.

---

## Features

- **Multiple calendars**: Reads from any number of Gusto calendars in a single run.
- **Two event-title formats per type**: Handles both third-person (`Ana's birthday`) and first-person (`Happy birthday to you!`) Gusto formats.
- **Anniversary year extraction**: Pulls the year count from the event title and includes it in the message.
- **Random message rotation**: 24 birthday messages and 20 anniversary messages, randomly selected per event.
- **Timezone-aware**: All "today" comparisons normalized to `America/New_York`.
- **Resilient**: Errors fetching one calendar don't stop the others. Errors posting one message don't stop the rest.
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
| `SLACK_CHANNEL` | no | Target channel | defaults to `#celebrations-bot-test` |

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

## Workflow file

`.github/workflows/celebrations-check.yml`:

```yaml
name: Daily Celebrations Check

on:
  schedule:
    - cron: '0 12 * * *'   # 12:00 UTC = 7 AM EST / 8 AM EDT
  workflow_dispatch:        # allow manual trigger from the Actions tab

jobs:
  celebrate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '18'
      - run: npm install
      - name: Run celebrations check
        run: node celebrations-check.js
        env:
          SLACK_TOKEN: ${{ secrets.SLACK_TOKEN }}
          GOOGLE_CALENDAR_API_KEY: ${{ secrets.GOOGLE_CALENDAR_API_KEY }}
          CALENDAR_IDS: ${{ secrets.CALENDAR_IDS }}
          CALENDAR_NAME_MAP: ${{ secrets.CALENDAR_NAME_MAP }}
          SLACK_CHANNEL: ${{ secrets.SLACK_CHANNEL }}
```

> **DST note**: The cron is fixed at 12:00 UTC, so during EDT the post time shifts to 8 AM Eastern instead of 7 AM. The bot's date math is timezone-aware regardless — only the post time drifts.

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
| `0 12 * * *` | 12:00 UTC daily (current) |
| `0 13 * * *` | 1 PM UTC daily (8 AM EST / 9 AM EDT) |
| `0 12 * * 1-5` | 12:00 UTC weekdays only |

---

## Security

- Nothing sensitive lives in the repo — all credentials are GitHub Secrets, injected at runtime.
- The Google API key is restricted to the Calendar API and only ever reads. If it leaks, the blast radius is bounded to reading already-shared calendar events.
- The Slack bot token can be revoked from the Slack admin panel and re-pasted into GitHub Secrets without any code change.
- Rotate both tokens annually as a baseline, and immediately if either is suspected compromised.

---

## Architecture summary

```
┌─────────────────┐       cron 0 12 * * *
│ GitHub Actions  │ ─────────────────────┐
└─────────────────┘                      │
                                          ▼
                              ┌─────────────────────┐
                              │ celebrations-check  │
                              │       .js (Node 18) │
                              └──────────┬──────────┘
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
                              └─────────────────────┘
```

---

## License

MIT — modify and reuse freely within your organization.
