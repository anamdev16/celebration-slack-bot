// Cloudflare Worker that answers "@bot is today Friday?" in Slack.
//
// Slack's Events API posts here whenever someone mentions the bot. Two hard
// constraints shape this file:
//
//   1. Every request must be verified against the signing secret. The URL is
//      public, so without this anyone could make the bot say anything.
//   2. Slack wants a 200 within 3 seconds or it retries. We acknowledge
//      immediately and do the actual posting in ctx.waitUntil().

import { buildReply, formatMessage } from './friday.js';

const SLACK_POST_MESSAGE = 'https://slack.com/api/chat.postMessage';
const MAX_SIGNATURE_AGE_SECONDS = 60 * 5;

export default {
    async fetch(request, env, ctx) {
        if (request.method !== 'POST') {
            return new Response('This endpoint only accepts Slack events.', { status: 405 });
        }

        // Read once, as text -- the signature covers the exact raw bytes, so we
        // cannot let JSON.parse round-trip them first.
        const rawBody = await request.text();

        if (!await isSignedBySlack(request, rawBody, env.SLACK_SIGNING_SECRET)) {
            return new Response('Signature verification failed.', { status: 401 });
        }

        let payload;
        try {
            payload = JSON.parse(rawBody);
        } catch {
            return new Response('Malformed JSON.', { status: 400 });
        }

        // One-time handshake when you paste the URL into the Slack dashboard.
        if (payload.type === 'url_verification') {
            return Response.json({ challenge: payload.challenge });
        }

        // Slack retries anything it thinks timed out. We ack fast enough that this
        // should be rare, but honouring it is what stops double-posts.
        if (request.headers.get('x-slack-retry-num')) {
            return new Response('', { status: 200 });
        }

        const event = payload.event;
        const isHumanMention =
            payload.type === 'event_callback' &&
            event?.type === 'app_mention' &&
            !event.bot_id &&
            event.subtype !== 'bot_message';

        if (isHumanMention) {
            ctx.waitUntil(replyToMention(event, env));
        }

        return new Response('', { status: 200 });
    }
};

async function replyToMention(event, env) {
    const reply = buildReply();

    const body = {
        channel: event.channel,
        text: formatMessage(reply)
    };

    // Answer where it was asked. A mention inside a thread gets a threaded reply;
    // one in the channel gets a top-level post, so the video unfurls in the open.
    if (event.thread_ts) {
        body.thread_ts = event.thread_ts;
    }

    try {
        const response = await fetch(SLACK_POST_MESSAGE, {
            method: 'POST',
            headers: {
                authorization: `Bearer ${env.SLACK_BOT_TOKEN}`,
                'content-type': 'application/json; charset=utf-8'
            },
            body: JSON.stringify(body)
        });

        const result = await response.json();
        if (result.ok) {
            console.log(`Replied in ${event.channel} (${reply.weekday}, friday=${reply.isFriday})`);
        } else {
            console.error(`Slack rejected the reply: ${result.error}`);
        }
    } catch (error) {
        console.error(`Failed to reach Slack: ${error.message}`);
    }
}

/**
 * Slack signs `v0:{timestamp}:{raw body}` with the app's signing secret.
 * Rejects anything older than five minutes so a captured request can't be replayed.
 */
async function isSignedBySlack(request, rawBody, signingSecret) {
    const timestamp = request.headers.get('x-slack-request-timestamp');
    const signature = request.headers.get('x-slack-signature');

    if (!signingSecret || !timestamp || !signature) return false;

    const ageSeconds = Math.abs(Date.now() / 1000 - Number(timestamp));
    if (!Number.isFinite(ageSeconds) || ageSeconds > MAX_SIGNATURE_AGE_SECONDS) return false;

    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
        'raw',
        encoder.encode(signingSecret),
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['sign']
    );

    const mac = await crypto.subtle.sign('HMAC', key, encoder.encode(`v0:${timestamp}:${rawBody}`));
    const expected = 'v0=' + [...new Uint8Array(mac)]
        .map(byte => byte.toString(16).padStart(2, '0'))
        .join('');

    return timingSafeEqual(expected, signature);
}

function timingSafeEqual(a, b) {
    if (a.length !== b.length) return false;
    let mismatch = 0;
    for (let i = 0; i < a.length; i++) {
        mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
    }
    return mismatch === 0;
}
