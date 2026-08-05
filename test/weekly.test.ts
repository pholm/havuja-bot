import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';

import {
    closeDatabase,
    createTestBot,
    insertOverdueSeason,
    openTestSeason,
    query,
    resetDatabase,
    setupDatabase,
} from './helpers/harness.ts';
import { CHAT_ID } from './helpers/telegram.ts';
import type { Season } from '../src/db/index.ts';
import {
    buildSeasonRecap,
    buildWeeklyReport,
    closeFinishedSeason,
    sendWeeklyReport,
} from '../src/weekly.ts';

let season: Season;

before(async () => {
    await setupDatabase();
});

after(async () => {
    await closeDatabase();
});

beforeEach(async () => {
    await resetDatabase();
    season = await openTestSeason();
});

/** Writes an entry straight to the database, optionally backdated. */
const addEntry = async (
    userId: number,
    nickname: string,
    amount: number,
    daysAgo = 0,
    seasonId = season.id,
) => {
    await query(
        `INSERT INTO users (user_id, first_name, nickname) VALUES ($1, $2, $3)
         ON CONFLICT (user_id) DO UPDATE SET nickname = $3`,
        [userId, nickname, nickname],
    );
    await query(
        `INSERT INTO ski_entries (user_id, timestamp, amount, season_id)
         VALUES ($1, NOW() - ($2 || ' days')::interval, $3, $4)`,
        [userId, String(daysAgo), amount, seasonId],
    );
};

const addBet = async (userId: number, amount: number, seasonId = season.id) => {
    await query(
        `INSERT INTO season_bets (season_id, user_id, amount) VALUES ($1, $2, $3)
         ON CONFLICT (season_id, user_id) DO UPDATE SET amount = $3`,
        [seasonId, userId, amount],
    );
};

describe('weekly report', () => {
    it('is empty when nobody skied', async () => {
        assert.equal(await buildWeeklyReport(season.id), null);
    });

    it('awards medals to the top three', async () => {
        await addEntry(1, 'Yksi', 50);
        await addEntry(2, 'Kaksi', 40);
        await addEntry(3, 'Kolme', 30);

        const report = await buildWeeklyReport(season.id);

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

        const report = await buildWeeklyReport(season.id);

        assert.ok(report);
        assert.match(report, /\nNelja - 20\.00km/);
        assert.doesNotMatch(report, /🥇 Nelja/);
    });

    it('sums the week', async () => {
        await addEntry(1, 'Yksi', 12.5);
        await addEntry(2, 'Kaksi', 7.25);

        const report = await buildWeeklyReport(season.id);

        assert.ok(report);
        assert.match(report, /Yhteensä: 19\.75km/);
    });

    it('adds up several entries from the same skier', async () => {
        await addEntry(1, 'Yksi', 10);
        await addEntry(1, 'Yksi', 5.5);

        const report = await buildWeeklyReport(season.id);

        assert.ok(report);
        assert.match(report, /🥇 Yksi - 15\.50km/);
    });

    it('ignores entries older than seven days', async () => {
        await addEntry(1, 'Tuore', 10, 2);
        await addEntry(2, 'Vanha', 99, 9);

        const report = await buildWeeklyReport(season.id);

        assert.ok(report);
        assert.match(report, /Tuore/);
        assert.doesNotMatch(report, /Vanha/);
        assert.match(report, /Yhteensä: 10\.00km/);
    });

    it('ignores entries from another season', async () => {
        const other = await insertOverdueSeason();
        await addEntry(1, 'Tama', 10);
        await addEntry(2, 'Toinen', 99, 0, other.id);

        const report = await buildWeeklyReport(season.id);

        assert.ok(report);
        assert.match(report, /Tama/);
        assert.doesNotMatch(report, /Toinen/);
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

    it('stays quiet between seasons', async () => {
        await resetDatabase();
        const finished = await insertOverdueSeason();
        await addEntry(1, 'Yksi', 10, 0, finished.id);
        const { bot, telegram } = createTestBot();

        await sendWeeklyReport(bot);

        assert.deepEqual(
            telegram.calls.filter((call) => call.method === 'sendMessage'),
            [],
            'no weekly report should go out when no season is running',
        );
    });
});

describe('season recap', () => {
    it('ranks the betters and marks who made it', async () => {
        await addEntry(1, 'Yksi', 800);
        await addBet(1, 750);
        await addEntry(2, 'Kaksi', 300);
        await addBet(2, 750);

        const recap = await buildSeasonRecap(season.id);

        assert.match(recap, /Kausi on paketissa/);
        assert.match(recap, /🥇 <b>Yksi<\/b> - 800\.00\/750km \(106\.7%\) ✅/);
        assert.match(recap, /🥈 <b>Kaksi<\/b> - 300\.00\/750km \(40\.0%\)/);
        assert.doesNotMatch(recap, /Kaksi<\/b>.*✅/);
    });

    it('counts how many made their bet', async () => {
        await addEntry(1, 'Yksi', 800);
        await addBet(1, 750);
        await addEntry(2, 'Kaksi', 300);
        await addBet(2, 750);

        const recap = await buildSeasonRecap(season.id);

        assert.match(recap, /Bettinsä lunasti 1\/2/);
        assert.match(recap, /Yhteensä hiihdettiin 1100\.00km/);
    });

    it('copes with a season nobody bet in', async () => {
        const recap = await buildSeasonRecap(season.id);
        assert.match(recap, /kukaan ei ehtinyt betata/);
    });
});

describe('closing a finished season', () => {
    it('sends the recap and closes the season', async () => {
        await resetDatabase();
        const finished = await insertOverdueSeason();
        await addEntry(1, 'Yksi', 800, 0, finished.id);
        await addBet(1, 750, finished.id);
        const { bot, telegram } = createTestBot();

        await closeFinishedSeason(bot);

        const message = telegram.calls.find(
            (call) => call.method === 'sendMessage',
        );
        assert.match(String(message?.payload.text), /Kausi on paketissa/);
        assert.equal(message?.payload.parse_mode, 'HTML');

        const rows = await query<{ closed_at: Date | null }>(
            'SELECT closed_at FROM seasons WHERE id = $1',
            [finished.id],
        );
        assert.notEqual(rows[0].closed_at, null);
    });

    it('does nothing while a season is still running', async () => {
        const { bot, telegram } = createTestBot();

        await closeFinishedSeason(bot);

        assert.deepEqual(telegram.calls, []);
    });

    it('does not send the recap twice', async () => {
        await resetDatabase();
        const finished = await insertOverdueSeason();
        await addEntry(1, 'Yksi', 800, 0, finished.id);
        await addBet(1, 750, finished.id);
        const { bot, telegram } = createTestBot();

        await closeFinishedSeason(bot);
        const afterFirst = telegram.calls.length;
        await closeFinishedSeason(bot);

        assert.equal(telegram.calls.length, afterFirst);
    });
});
