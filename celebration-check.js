const { google } = require('googleapis');
const axios = require('axios');

// Birthday message pool (24 messages as requested)
const BIRTHDAY_MESSAGES = [
    "Hope your special day brings you all the happiness your heart can hold! 🌟",
    "Wishing you a year filled with happiness, success, and all your favorite things! ✨",
    "May this birthday be the start of your best year yet! 🚀",
    "Here's to another year of amazing adventures and wonderful memories! 🎈",
    "Hope your day is as special as you are to our team! 💫",
    "Wishing you joy, laughter, and cake (lots of cake!) on your special day! 🍰",
    "May your birthday be filled with sunshine, smiles, and sweet surprises! ☀️",
    "Another year older, another year of being absolutely awesome! 🌈",
    "Hope your birthday is the perfect start to another wonderful year! 🎁",
    "Wishing you a day that's as wonderful as your smile! 😊",
    "May all your birthday wishes come true today and always! ⭐",
    "Here's to celebrating you and all the joy you bring to our workplace! 🎊",
    "Hope your birthday is filled with love, laughter, and everything nice! 💝",
    "Wishing you a fantastic birthday and an even better year ahead! 🎯",
    "May your special day be as bright and beautiful as you are! 🌺",
    "Hope your birthday brings you as much happiness as you bring to others! 💖",
    "Another trip around the sun calls for celebration! 🌞",
    "Wishing you a birthday that's just as amazing as you are! ✨",
    "Hope your day is filled with good vibes and great cake! 🎵",
    "May this new year of life be your most incredible one yet! 🎆",
    "Sending you birthday wishes wrapped in love and tied with joy! 🎀",
    "Hope your birthday is the perfect blend of fun, friends, and festivities! 🎪",
    "Wishing you a day full of happy moments and a year full of happy days! 🌻",
    "May your birthday sparkle with joy and shine with love! ✨"
];

// Anniversary message pool
const ANNIVERSARY_MESSAGES = [
    "Thank you for your dedication and all the amazing work you do! 🌟",
    "Your commitment and contributions make our team stronger every day! 💪",
    "Here's to celebrating your incredible journey with us! 🚀",
    "Thank you for being such a valuable part of our team! 💎",
    "Your hard work and dedication truly make a difference! ⭐",
    "We're so grateful to have you on our team! 🙏",
    "Thank you for your continued excellence and commitment! 🏆",
    "Your contributions have helped shape our success! 🌈",
    "Here's to many more years of amazing work together! 🥂",
    "Thank you for bringing your best to work every single day! ✨",
    "Your dedication and positive attitude inspire us all! 🌟",
    "We appreciate everything you do to make our team great! 💫",
    "Thank you for your loyalty and outstanding contributions! 🎯",
    "Your expertise and commitment are truly valued! 💝",
    "Here's to celebrating your professional growth and success! 📈",
    "Thank you for being an integral part of our team's journey! 🛤️",
    "Your hard work and dedication haven't gone unnoticed! 👏",
    "We're lucky to have someone as committed as you! 🍀",
    "Thank you for your unwavering dedication and excellence! 🏅",
    "Your contributions continue to drive our team forward! ⚡"
];

class CelebrationsBot {
    constructor() {
        this.slackToken = process.env.SLACK_TOKEN;
        this.calendarApiKey = process.env.GOOGLE_CALENDAR_API_KEY;
        this.calendarIds = process.env.CALENDAR_IDS?.split(',').map(id => id.trim()) || [];
        this.calendarNameMap = this.parseCalendarNameMap();
        this.slackChannel = process.env.SLACK_CHANNEL || '#celebrations-bot-test';
        
        this.calendar = google.calendar({ version: 'v3', auth: this.calendarApiKey });
        
        console.log(`Initialized bot with ${this.calendarIds.length} calendars`);
        console.log(`Target channel: ${this.slackChannel}`);
    }

    parseCalendarNameMap() {
        try {
            return JSON.parse(process.env.CALENDAR_NAME_MAP || '{}');
        } catch (error) {
            console.error('Error parsing CALENDAR_NAME_MAP:', error.message);
            return {};
        }
    }

    getTodayInEST() {
        const now = new Date();
        const estDate = new Date(now.toLocaleString("en-US", {timeZone: "America/New_York"}));
        return estDate.toISOString().split('T')[0]; // YYYY-MM-DD format
    }

    getRandomMessage(messagePool) {
        return messagePool[Math.floor(Math.random() * messagePool.length)];
    }

    async getCalendarEvents(calendarId) {
        try {
            const today = this.getTodayInEST();
            const timeMin = `${today}T00:00:00-05:00`;
            const timeMax = `${today}T23:59:59-05:00`;

            console.log(`Fetching events for calendar ${calendarId} on ${today}`);

            const response = await this.calendar.events.list({
                calendarId: calendarId,
                timeMin: timeMin,
                timeMax: timeMax,
                singleEvents: true,
                orderBy: 'startTime',
            });

            const events = response.data.items || [];
            console.log(`Found ${events.length} events for calendar ${calendarId}`);
            
            return events.filter(event => this.isCelebrationEvent(event));
        } catch (error) {
            console.error(`Error fetching events for calendar ${calendarId}:`, error.message);
            return [];
        }
    }

    isCelebrationEvent(event) {
        const summary = event.summary?.toLowerCase() || '';
        const isBirthday = summary.includes('birthday');
        const isAnniversary = summary.includes('anniversary');
        const isAllDay = event.start?.date && !event.start?.dateTime;
        
        return (isBirthday || isAnniversary) && isAllDay;
    }

    parseEventDetails(event, calendarId) {
        const summary = event.summary || '';
        const lowerSummary = summary.toLowerCase();
        
        if (lowerSummary.includes('birthday')) {
            return this.parseBirthdayEvent(summary, calendarId);
        } else if (lowerSummary.includes('anniversary')) {
            return this.parseAnniversaryEvent(summary, calendarId);
        }
        
        return null;
    }

    parseBirthdayEvent(summary, calendarId) {
        // Handle "Happy birthday to you!" format
        if (summary.toLowerCase().includes('to you')) {
            const name = this.calendarNameMap[calendarId];
            if (!name) {
                console.warn(`No name mapping found for calendar ${calendarId}`);
                return null;
            }
            return {
                type: 'birthday',
                name: name,
                message: `🎉 Happy Birthday ${name}! 🎂\n${this.getRandomMessage(BIRTHDAY_MESSAGES)}`
            };
        }
        
        // Handle "Name's birthday" format
        const match = summary.match(/^(.+?)'s birthday/i);
        if (match) {
            const name = match[1].trim();
            return {
                type: 'birthday',
                name: name,
                message: `🎉 Happy Birthday ${name}! 🎂\n${this.getRandomMessage(BIRTHDAY_MESSAGES)}`
            };
        }
        
        console.warn(`Could not parse birthday event: ${summary}`);
        return null;
    }

    parseAnniversaryEvent(summary, calendarId) {
        // Handle "Your N-year anniversary" format
        const yourMatch = summary.match(/your (\d+)-year anniversary/i);
        if (yourMatch) {
            const years = yourMatch[1];
            const name = this.calendarNameMap[calendarId];
            if (!name) {
                console.warn(`No name mapping found for calendar ${calendarId}`);
                return null;
            }
            return {
                type: 'anniversary',
                name: name,
                years: years,
                message: `🎊 Congratulations ${name} on your ${years}-year anniversary! 🎊\n${this.getRandomMessage(ANNIVERSARY_MESSAGES)}`
            };
        }
        
        // Handle "Name's N-year anniversary" format
        const namedMatch = summary.match(/^(.+?)'s (\d+)-year anniversary/i);
        if (namedMatch) {
            const name = namedMatch[1].trim();
            const years = namedMatch[2];
            return {
                type: 'anniversary',
                name: name,
                years: years,
                message: `🎊 Congratulations ${name} on your ${years}-year anniversary! 🎊\n${this.getRandomMessage(ANNIVERSARY_MESSAGES)}`
            };
        }
        
        // Handle generic anniversary formats without specific years
        const genericMatch = summary.match(/^(.+?)'s anniversary/i);
        if (genericMatch) {
            const name = genericMatch[1].trim();
            return {
                type: 'anniversary',
                name: name,
                years: null,
                message: `🎊 Congratulations ${name} on your anniversary! 🎊\n${this.getRandomMessage(ANNIVERSARY_MESSAGES)}`
            };
        }
        
        console.warn(`Could not parse anniversary event: ${summary}`);
        return null;
    }

    async sendSlackMessage(message) {
        try {
            const response = await axios.post('https://slack.com/api/chat.postMessage', {
                channel: this.slackChannel,
                text: message,
                username: 'Celebrations Bot',
                icon_emoji: ':tada:'
            }, {
                headers: {
                    'Authorization': `Bearer ${this.slackToken}`,
                    'Content-Type': 'application/json'
                }
            });

            if (response.data.ok) {
                console.log('✅ Message sent successfully to Slack');
                return true;
            } else {
                console.error('❌ Slack API error:', response.data.error);
                return false;
            }
        } catch (error) {
            console.error('❌ Error sending Slack message:', error.message);
            return false;
        }
    }

    async run() {
        console.log('🚀 Starting celebrations check...');
        console.log(`📅 Checking date: ${this.getTodayInEST()}`);
        
        if (!this.slackToken || !this.calendarApiKey || this.calendarIds.length === 0) {
            console.error('❌ Missing required environment variables');
            console.error('Required: SLACK_TOKEN, GOOGLE_CALENDAR_API_KEY, CALENDAR_IDS');
            process.exit(1);
        }

        const celebrations = [];
        
        // Process all calendars
        for (const calendarId of this.calendarIds) {
            console.log(`\n📋 Processing calendar: ${calendarId}`);
            
            const events = await this.getCalendarEvents(calendarId);
            
            for (const event of events) {
                console.log(`📝 Processing event: ${event.summary}`);
                
                const celebration = this.parseEventDetails(event, calendarId);
                if (celebration) {
                    celebrations.push(celebration);
                    console.log(`✅ Added ${celebration.type} for ${celebration.name}`);
                }
            }
        }

        // Send messages for all celebrations found
        if (celebrations.length === 0) {
            console.log('🔍 No celebrations found for today');
            return;
        }

        console.log(`\n🎉 Found ${celebrations.length} celebration(s) for today!`);
        
        let successCount = 0;
        for (const celebration of celebrations) {
            console.log(`\n📤 Sending ${celebration.type} message for ${celebration.name}...`);
            console.log(`📝 Message: ${celebration.message}`);
            
            const success = await this.sendSlackMessage(celebration.message);
            if (success) {
                successCount++;
            }
            
            // Add a small delay between messages to avoid rate limits
            if (celebrations.length > 1) {
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
        }

        console.log(`\n✨ Celebrations check complete!`);
        console.log(`📊 Sent ${successCount}/${celebrations.length} messages successfully`);
    }
}

// Run the bot
if (require.main === module) {
    const bot = new CelebrationsBot();
    bot.run().catch(error => {
        console.error('💥 Fatal error:', error);
        process.exit(1);
    });
}

module.exports = CelebrationsBot;
