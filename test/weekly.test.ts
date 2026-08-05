import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';

import {
    closeDatabase,
    createTestBot,
    query,
    resetDatabase,
    setupDatabase,
} from './helpers/harness.ts';
import { CHAT_ID } from './helpers/telegram.ts';
import { buildWeeklyReport, sendWeeklyReport } from '../src/weekly.ts';

before(async () => {
    await setupDatabase();
});

after(async () => {
    await closeDatabase();
});

beforeEach(async () => {
    await resetDatabase();
});

/** Writes an entry straight to the database, optionally backdated. */
const addEntry = async (
    userId: number,
    nickname: string,
    amount: number,
    daysAgo = 0,
) => {
    await query(
        `INSERT INTO users (user_id, first_name, nickname) VALUES ($1, $2, $3)
         ON CONFLICT (user_id) DO UPDATE SET nickname = $3`,
        [userId, nickname, nickname],
    );
    await query(
        `INSERT INTO ski_entries (user_id, timestamp, amount)
         VALUES ($1, NOW() - ($2 || ' days')::interval, $3)`,
        [userId, String(daysAgo), amount],
    );
};

describe('weekly report', () => {
    it('is empty when nobody skied', async () => {
        assert.equal(await buildWeeklyReport(), null);
    });

    it('awards medals to the top three', async () => {
        await addEntry(1, 'Yksi', 50);
        await addEntry(2, 'Kaksi', 40);
        await addEntry(3, 'Kolme', 30);

        const report = await buildWeeklyReport();

        assert.ok(report);
        assert.match(report, /🥇 Yksi - 50\.00km/);
        assert.match(report, /🥈 Kaksi - 40\.00km/);
        assert.match(report, /🥉 Kolme - 30\.00km/);
    });

    it('lists everyone past the podium without a medal', async () => {
        await addEntry(1, 'Yksi', 50);
        await addEntry(2, 'Kaksi', 40);
        await addEntry(3, 'Kolme', 30);
        await addEntry(4, 'Nelja', 20);

        const report = await buildWeeklyReport();

        assert.ok(report);
        assert.match(report, /\nNelja - 20\.00km/);
        assert.doesNotMatch(report, /🥇 Nelja/);
    });

    it('sums the week', async () => {
        await addEntry(1, 'Yksi', 12.5);
        await addEntry(2, 'Kaksi', 7.25);

        const report = await buildWeeklyReport();

        assert.ok(report);
        assert.match(report, /Yhteensä: 19\.75km/);
    });

    it('adds up several entries from the same skier', async () => {
        await addEntry(1, 'Yksi', 10);
        await addEntry(1, 'Yksi', 5.5);

        const report = await buildWeeklyReport();

        assert.ok(report);
        assert.match(report, /🥇 Yksi - 15\.50km/);
    });

    it('ignores entries older than seven days', async () => {
        await addEntry(1, 'Tuore', 10, 2);
        await addEntry(2, 'Vanha', 99, 9);

        const report = await buildWeeklyReport();

        assert.ok(report);
        assert.match(report, /Tuore/);
        assert.doesNotMatch(report, /Vanha/);
        assert.match(report, /Yhteensä: 10\.00km/);
    });

    it('is sent to the configured chat as HTML', async () => {
        await addEntry(1, 'Yksi', 10);
        const { bot, telegram } = createTestBot();

        await sendWeeklyReport(bot);

        const message = telegram.calls.find(
            (call) => call.method === 'sendMessage',
        );
        assert.equal(Number(message?.payload.chat_id), CHAT_ID);
        assert.equal(message?.payload.parse_mode, 'HTML');
        assert.match(String(message?.payload.text), /Taas on viikko takana/);
    });

    it('sends nothing when nobody skied', async () => {
        const { bot, telegram } = createTestBot();

        await sendWeeklyReport(bot);

        assert.deepEqual(
            telegram.calls.filter((call) => call.method === 'sendMessage'),
            [],
        );
    });
});
