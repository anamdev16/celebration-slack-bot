import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';

import worker from '../src/index.js';
import { FRIDAY_VIDEO } from '../src/friday.js';

const SIGNING_SECRET = 'test-signing-secret';
const ENV = { SLACK_SIGNING_SECRET: SIGNING_SECRET, SLACK_BOT_TOKEN: 'xoxb-test' };

/** Sign a body the way Slack does, so the Worker's verification is really exercised. */
async function sign(body, timestamp, secret = SIGNING_SECRET) {
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
        'raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
    );
    const mac = await crypto.subtle.sign('HMAC', key, encoder.encode(`v0:${timestamp}:${body}`));
    return 'v0=' + [...new Uint8Array(mac)].map(b => b.toString(16).padStart(2, '0')).join('');
}

async function slackRequest(payload, { timestamp, secret, retry, signature } = {}) {
    const body = typeof payload === 'string' ? payload : JSON.stringify(payload);
    const ts = timestamp ?? Math.floor(Date.now() / 1000).toString();
    const headers = {
        'content-type': 'application/json',
        'x-slack-request-timestamp': ts,
        'x-slack-signature': signature ?? await sign(body, ts, secret)
    };
    if (retry) headers['x-slack-retry-num'] = String(retry);
    return new Request('https://bot.example.com/', { method: 'POST', headers, body });
}

/** Collects ctx.waitUntil promises so tests can await the background post. */
function makeCtx() {
    const pending = [];
    return { waitUntil: p => pending.push(p), settle: () => Promise.all(pending) };
}

let posted;
let originalFetch;

beforeEach(() => {
    posted = [];
    originalFetch = globalThis.fetch;
    globalThis.fetch = async (url, options) => {
        posted.push({ url, options, body: JSON.parse(options.body) });
        return new Response(JSON.stringify({ ok: true }), {
            headers: { 'content-type': 'application/json' }
        });
    };
});

afterEach(() => {
    globalThis.fetch = originalFetch;
});

describe('request verification', () => {
    test('rejects GET', async () => {
        const res = await worker.fetch(
            new Request('https://bot.example.com/'), ENV, makeCtx()
        );
        assert.equal(res.status, 405);
    });

    test('rejects a body that was tampered with after signing', async () => {
        const original = JSON.stringify({ type: 'event_callback', event: { type: 'app_mention' } });
        const ts = Math.floor(Date.now() / 1000).toString();
        const signature = await sign(original, ts);

        const tampered = new Request('https://bot.example.com/', {
            method: 'POST',
            headers: {
                'x-slack-request-timestamp': ts,
                'x-slack-signature': signature
            },
            body: original.replace('app_mention', 'app_mentionX')
        });

        const res = await worker.fetch(tampered, ENV, makeCtx());
        assert.equal(res.status, 401);
        assert.equal(posted.length, 0);
    });

    test('rejects a signature made with the wrong secret', async () => {
        const req = await slackRequest({ type: 'url_verification', challenge: 'c' }, {
            secret: 'not-the-real-secret'
        });
        const res = await worker.fetch(req, ENV, makeCtx());
        assert.equal(res.status, 401);
    });

    test('rejects a replayed request older than five minutes', async () => {
        const stale = (Math.floor(Date.now() / 1000) - 600).toString();
        const req = await slackRequest({ type: 'url_verification', challenge: 'c' }, {
            timestamp: stale
        });
        const res = await worker.fetch(req, ENV, makeCtx());
        assert.equal(res.status, 401);
    });

    test('rejects a request with no signature headers at all', async () => {
        const bare = new Request('https://bot.example.com/', {
            method: 'POST',
            body: JSON.stringify({ type: 'url_verification', challenge: 'c' })
        });
        const res = await worker.fetch(bare, ENV, makeCtx());
        assert.equal(res.status, 401);
    });
});

describe('event handling', () => {
    test('answers the url_verification handshake', async () => {
        const req = await slackRequest({ type: 'url_verification', challenge: 'abc123' });
        const res = await worker.fetch(req, ENV, makeCtx());
        assert.equal(res.status, 200);
        assert.deepEqual(await res.json(), { challenge: 'abc123' });
    });

    test('replies to an app_mention in the channel it came from', async () => {
        const ctx = makeCtx();
        const req = await slackRequest({
            type: 'event_callback',
            event: { type: 'app_mention', channel: 'C_GENERAL', user: 'U_ANA', text: '<@B1> is today Friday?' }
        });

        const res = await worker.fetch(req, ENV, ctx);
        assert.equal(res.status, 200);

        await ctx.settle();
        assert.equal(posted.length, 1);
        assert.equal(posted[0].url, 'https://slack.com/api/chat.postMessage');
        assert.equal(posted[0].body.channel, 'C_GENERAL');
        assert.equal(posted[0].options.headers.authorization, 'Bearer xoxb-test');
        assert.ok(posted[0].body.text.length > 0);
        assert.equal(posted[0].body.thread_ts, undefined);
    });

    test('replies inside the thread when asked in a thread', async () => {
        const ctx = makeCtx();
        const req = await slackRequest({
            type: 'event_callback',
            event: { type: 'app_mention', channel: 'C_GENERAL', thread_ts: '1730300000.123', text: 'hi' }
        });

        await worker.fetch(req, ENV, ctx);
        await ctx.settle();
        assert.equal(posted[0].body.thread_ts, '1730300000.123');
    });

    test('ignores Slack retries so it cannot double-post', async () => {
        const ctx = makeCtx();
        const req = await slackRequest({
            type: 'event_callback',
            event: { type: 'app_mention', channel: 'C_GENERAL' }
        }, { retry: 1 });

        const res = await worker.fetch(req, ENV, ctx);
        assert.equal(res.status, 200);
        await ctx.settle();
        assert.equal(posted.length, 0);
    });

    test('ignores messages from other bots', async () => {
        const ctx = makeCtx();
        const req = await slackRequest({
            type: 'event_callback',
            event: { type: 'app_mention', channel: 'C_GENERAL', bot_id: 'B_OTHER' }
        });

        await worker.fetch(req, ENV, ctx);
        await ctx.settle();
        assert.equal(posted.length, 0);
    });

    test('ignores event types it does not handle', async () => {
        const ctx = makeCtx();
        const req = await slackRequest({
            type: 'event_callback',
            event: { type: 'message', channel: 'C_GENERAL', text: 'just chatting' }
        });

        await worker.fetch(req, ENV, ctx);
        await ctx.settle();
        assert.equal(posted.length, 0);
    });

    test('rejects malformed JSON with 400 rather than throwing', async () => {
        const req = await slackRequest('{not json');
        const res = await worker.fetch(req, ENV, makeCtx());
        assert.equal(res.status, 400);
    });

    test('survives Slack rejecting the post', async () => {
        globalThis.fetch = async () => new Response(
            JSON.stringify({ ok: false, error: 'channel_not_found' }),
            { headers: { 'content-type': 'application/json' } }
        );

        const ctx = makeCtx();
        const req = await slackRequest({
            type: 'event_callback',
            event: { type: 'app_mention', channel: 'C_MISSING' }
        });

        const res = await worker.fetch(req, ENV, ctx);
        assert.equal(res.status, 200);
        await ctx.settle();   // must not reject
    });
});

describe('the actual reply text', () => {
    test('contains the video only when it is really Friday in Eastern time', async () => {
        const ctx = makeCtx();
        const req = await slackRequest({
            type: 'event_callback',
            event: { type: 'app_mention', channel: 'C_GENERAL' }
        });

        await worker.fetch(req, ENV, ctx);
        await ctx.settle();

        const text = posted[0].body.text;
        const isFridayNow = new Date().toLocaleDateString('en-US', {
            timeZone: 'America/New_York', weekday: 'long'
        }) === 'Friday';

        assert.equal(text.includes(FRIDAY_VIDEO), isFridayNow);
    });
});
