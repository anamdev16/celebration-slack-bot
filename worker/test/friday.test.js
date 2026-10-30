import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
    buildReply,
    formatMessage,
    weekdayInET,
    FRIDAY_VIDEO,
    FRIDAY_REPLIES,
    NOT_FRIDAY_REPLIES
} from '../src/friday.js';

// 2026-10-26 is a Monday, so this covers a full week.
const WEEK = {
    Monday: '2026-10-26T15:00:00Z',
    Tuesday: '2026-10-27T15:00:00Z',
    Wednesday: '2026-10-28T15:00:00Z',
    Thursday: '2026-10-29T15:00:00Z',
    Friday: '2026-10-30T15:00:00Z',
    Saturday: '2026-10-31T15:00:00Z',
    Sunday: '2026-11-01T15:00:00Z'
};

describe('weekdayInET', () => {
    for (const [expected, iso] of Object.entries(WEEK)) {
        test(`${iso} is ${expected}`, () => {
            assert.equal(weekdayInET(new Date(iso)), expected);
        });
    }

    test('uses Eastern time, not UTC, when the two disagree', () => {
        // 02:00 UTC Saturday is still 22:00 Friday in Eastern time.
        assert.equal(weekdayInET(new Date('2026-10-31T02:00:00Z')), 'Friday');
        // ...and 03:00 UTC Friday is still Thursday evening in Eastern time.
        assert.equal(weekdayInET(new Date('2026-10-30T03:00:00Z')), 'Thursday');
    });
});

describe('buildReply', () => {
    test('Friday returns the video', () => {
        const reply = buildReply(new Date(WEEK.Friday), () => 0);
        assert.equal(reply.isFriday, true);
        assert.equal(reply.weekday, 'Friday');
        assert.equal(reply.video, FRIDAY_VIDEO);
        assert.ok(FRIDAY_REPLIES.includes(reply.text));
    });

    test('every other day withholds the video', () => {
        for (const [weekday, iso] of Object.entries(WEEK)) {
            if (weekday === 'Friday') continue;
            const reply = buildReply(new Date(iso), () => 0);
            assert.equal(reply.isFriday, false, `${weekday} should not be Friday`);
            assert.equal(reply.video, null, `${weekday} should not link the video`);
            assert.ok(
                NOT_FRIDAY_REPLIES[weekday].includes(reply.text),
                `${weekday} should use its own message pool`
            );
        }
    });

    test('answers for a Friday evening that UTC already calls Saturday', () => {
        const reply = buildReply(new Date('2026-10-31T02:00:00Z'), () => 0);
        assert.equal(reply.isFriday, true);
        assert.equal(reply.video, FRIDAY_VIDEO);
    });

    test('reaches every message in a pool', () => {
        const seen = new Set();
        for (let i = 0; i < FRIDAY_REPLIES.length; i++) {
            seen.add(buildReply(new Date(WEEK.Friday), () => i / FRIDAY_REPLIES.length).text);
        }
        assert.equal(seen.size, FRIDAY_REPLIES.length);
    });
});

describe('formatMessage', () => {
    test('puts the URL alone on the second line so Slack unfurls it', () => {
        const message = formatMessage(buildReply(new Date(WEEK.Friday), () => 0));
        const lines = message.split('\n');
        assert.equal(lines.length, 2);
        assert.equal(lines[1], FRIDAY_VIDEO);
    });

    test('is a single line when there is no video', () => {
        const message = formatMessage(buildReply(new Date(WEEK.Monday), () => 0));
        assert.ok(!message.includes('\n'));
        assert.ok(!message.includes('youtu.be'));
    });
});
