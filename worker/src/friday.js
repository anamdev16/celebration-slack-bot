// Everything the bot knows about Fridays. No Workers APIs in here on purpose --
// it's pure, so it runs and tests under plain Node as happily as on the edge.

export const FRIDAY_VIDEO = 'https://youtu.be/U6n2NcJ7rLc';

export const FRIDAY_REPLIES = [
    "IT IS FRIDAY. 🎉",
    "Yes. Yes it is. You know what happens now.",
    "Affirmative. Deploying the video.",
    "I have been waiting all week for someone to ask. 🎸",
    "Friday confirmed. Please enjoy responsibly.",
    "It is Friday, and I have exactly one thing to contribute.",
    "Correct. And as is tradition:",
    "FRIDAY. FRIDAY. Gotta get down on Friday. 🕺",
    "Scientists have confirmed it. Today is Friday. 🔬",
    "You asked. I answer. It's Friday. 📅"
];

// Day-specific, because "no" is funnier when it knows exactly how far away Friday is.
export const NOT_FRIDAY_REPLIES = {
    Monday: [
        "It's Monday. We are as far from Friday as it is physically possible to be. 💀",
        "Monday. I'm so sorry. Four more sleeps.",
        "Monday. Bold of you to even ask."
    ],
    Tuesday: [
        "Tuesday. Not even close. Three to go.",
        "Tuesday — the Monday that learned nothing.",
        "It's Tuesday. Ask me again in 72 hours."
    ],
    Wednesday: [
        "Wednesday. Halfway. The summit is visible but distant. 🏔️",
        "Wednesday. Two more. You can do two more.",
        "It's Wednesday, the furthest thing from Friday that still counts as progress."
    ],
    Thursday: [
        "Thursday. SO close. Do not ask me again until tomorrow. 😤",
        "Thursday. One more sleep. Hold the line.",
        "It's Thursday. I can almost taste it. Almost."
    ],
    Saturday: [
        "It's Saturday. You've overshot Friday entirely. Go outside. 🌞",
        "Saturday — better than Friday, and yet here you are on Slack. Reconsider.",
        "It's Saturday. Why are you here. Log off."
    ],
    Sunday: [
        "Sunday. Friday was two days ago and five days away. Grim in both directions. 😬",
        "It's Sunday. Enjoy it. Tomorrow is Monday.",
        "Sunday. The weekend's final boss."
    ]
};

const FALLBACK_REPLY = "It is not Friday. I checked twice.";

export function weekdayInET(now = new Date()) {
    // Ask Intl directly rather than round-tripping through a parsed date string,
    // so this is correct wherever it runs. Handles EST/EDT on its own.
    return now.toLocaleDateString('en-US', {
        timeZone: 'America/New_York',
        weekday: 'long'
    });
}

export function pick(pool, random = Math.random) {
    return pool[Math.floor(random() * pool.length)];
}

/**
 * The bot's whole personality. Returns the text to post and, on Fridays only,
 * the video -- withholding it the rest of the week is the joke.
 *
 * `now` and `random` are injectable so the tests can pin both.
 */
export function buildReply(now = new Date(), random = Math.random) {
    const weekday = weekdayInET(now);

    if (weekday === 'Friday') {
        return {
            weekday,
            isFriday: true,
            text: pick(FRIDAY_REPLIES, random),
            video: FRIDAY_VIDEO
        };
    }

    const pool = NOT_FRIDAY_REPLIES[weekday];
    return {
        weekday,
        isFriday: false,
        text: pool ? pick(pool, random) : FALLBACK_REPLY,
        video: null
    };
}

/** The exact string posted to Slack. Bare URL on its own line so Slack unfurls it. */
export function formatMessage(reply) {
    return reply.video ? `${reply.text}\n${reply.video}` : reply.text;
}
