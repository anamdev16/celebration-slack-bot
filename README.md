# Celebrations Bot 🎉

An automated Slack bot that monitors multiple Gusto company calendars for birthday and anniversary events, sending personalized celebration messages to your team channel.

## Features

- **Multi-Calendar Support**: Monitors multiple Gusto company calendars simultaneously
- **Smart Event Detection**: Recognizes both named events ("John's birthday") and personal events ("Happy birthday to you!")
- **Personalized Messages**: Random selection from 24 birthday messages and 20 anniversary messages
- **Anniversary Years**: Automatically extracts and includes years of service in anniversary messages
- **Automated Scheduling**: Runs daily at 7 AM EST via GitHub Actions
- **Error Handling**: Gracefully handles calendar access issues and continues processing
- **Zero Maintenance**: Fully automated once configured

## Setup Instructions

### 1. Repository Setup

1. Create a new GitHub repository for your celebrations bot
2. Add the following files to your repository:
   - `celebrations-check.js` (main bot script)
   - `.github/workflows/celebrations-check.yml` (GitHub Action)
   - `package.json` (dependencies)

### 2. Slack App Setup

1. Go to [Slack API](https://api.slack.com/apps) and create a new app
2. Navigate to "OAuth & Permissions"
3. Add these Bot Token Scopes:
   - `chat:write`
   - `chat:write.public`
4. Install the app to your workspace
5. Copy the "Bot User OAuth Token" (starts with `xoxb-`)

### 3. Google Calendar API Setup

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select existing one
3. Enable the Google Calendar API
4. Create credentials (API Key)
5. Copy your API key

### 4. Calendar Configuration

#### Getting Calendar IDs

For each Gusto calendar you want to monitor:

1. Open the calendar in Google Calendar
2. Click the three dots next to the calendar name
3. Select "Settings and sharing"
4. Scroll to "Calendar ID" section
5. Copy the Calendar ID (looks like: `abcd1234@group.calendar.google.com`)

#### Creating Name Mapping

Create a JSON mapping for personal events ("Your anniversary" format):

```json
{
  "calendar1@group.calendar.google.com": "John Smith",
  "calendar2@group.calendar.google.com": "Sarah Johnson",
  "calendar3@group.calendar.google.com": "Mike Davis"
}
```

### 5. GitHub Secrets Configuration

In your GitHub repository, go to Settings → Secrets and variables → Actions, and add these secrets:

#### Required Secrets

| Secret Name | Description | Example |
|------------|-------------|---------|
| `SLACK_TOKEN` | Bot User OAuth Token from Slack | `xoxb-1234567890-abcdefghijk` |
| `GOOGLE_CALENDAR_API_KEY` | Google Calendar API key | `AIzaSyABC123DEF456GHI789` |
| `CALENDAR_IDS` | Comma-separated calendar IDs | `cal1@group.calendar.google.com,cal2@group.calendar.google.com` |
| `CALENDAR_NAME_MAP` | JSON mapping calendar IDs to names | `{"cal1@group.calendar.google.com":"John Smith"}` |

#### Optional Secrets

| Secret Name | Description | Default Value |
|------------|-------------|---------------|
| `SLACK_CHANNEL` | Slack channel to send messages | `#celebrations-bot-test` |

### 6. Testing

#### Manual Test

1. Go to your repository's Actions tab
2. Select "Daily Celebrations Check" workflow
3. Click "Run workflow" to test manually

#### Calendar Event Formats

The bot recognizes these event title formats:

**Birthday Events:**
- `John Smith's birthday`
- `Happy birthday to you!` (uses name mapping)

**Anniversary Events:**
- `Sarah Johnson's 5-year anniversary`
- `Your 3-year anniversary` (uses name mapping)
- `Mike Davis's anniversary` (generic anniversary)

## Message Examples

### Birthday Messages
```
🎉 Happy Birthday John Smith! 🎂
Hope your special day brings you all the happiness your heart can hold! 🌟
```

### Anniversary Messages
```
🎊 Congratulations Sarah Johnson on your 5-year anniversary! 🎊
Thank you for your dedication and all the amazing work you do! 🌟
```

## Troubleshooting

### Common Issues

1. **No events detected**
   - Verify calendar IDs are correct
   - Ensure events are marked as "All day"
   - Check event titles match expected formats

2. **Calendar access errors**
   - Verify Google Calendar API key is valid
   - Ensure calendars are public or API key has access
   - Check calendar sharing settings

3. **Slack message failures**
   - Verify Slack token is correct and not expired
   - Ensure bot has permission to post in target channel
   - Check channel name format (include # for public channels)

4. **Name mapping issues**
   - Verify JSON format in `CALENDAR_NAME_MAP`
   - Ensure calendar IDs match exactly
   - Check for typos in calendar IDs

### Debug Mode

To see detailed logs, check the GitHub Actions run logs:

1. Go to your repository's Actions tab
2. Click on the most recent workflow run
3. Expand the "Run celebrations check" step to see detailed logs

## Workflow Schedule

The bot runs automatically every day at 7:00 AM EST (12:00 UTC). The schedule accounts for EST timezone (UTC-5).

To change the schedule, modify the cron expression in `.github/workflows/celebrations-check.yml`:

```yaml
schedule:
  - cron: '0 12 * * *'  # 7 AM EST = 12:00 UTC
```

## Security Considerations

- Never commit API keys or tokens to your repository
- Use GitHub Secrets for all sensitive configuration
- Regularly rotate API keys and tokens
- Monitor GitHub Actions logs for any exposed secrets

## Customization

### Adding More Messages

Edit the `BIRTHDAY_MESSAGES` or `ANNIVERSARY_MESSAGES` arrays in `celebrations-check.js`:

```javascript
const BIRTHDAY_MESSAGES = [
    "Your new custom birthday message! 🎈",
    // ... existing messages
];
```

### Changing Message Format

Modify the message formatting in the `parseBirthdayEvent()` or `parseAnniversaryEvent()` methods:

```javascript
message: `🎉 Happy Birthday ${name}! 🎂\n${this.getRandomMessage(BIRTHDAY_MESSAGES)}`
```

### Adding Event Types

Extend the `isCelebrationEvent()` method to detect additional event types:

```javascript
isCelebrationEvent(event) {
    const summary = event.summary?.toLowerCase() || '';
    const isBirthday = summary.includes('birthday');
    const isAnniversary = summary.includes('anniversary');
    const isWorkiversary = summary.includes('workiversary'); // New event type
    const isAllDay = event.start?.date && !event.start?.dateTime;
    
    return (isBirthday || isAnniversary || isWorkiversary) && isAllDay;
}
```

## Support

For issues or questions:

1. Check the troubleshooting section above
2. Review GitHub Actions logs for error details
3. Verify all configuration secrets are properly set
4. Test with manual workflow trigger to isolate issues

## License

MIT License - feel free to modify and distribute as needed for your organization.
