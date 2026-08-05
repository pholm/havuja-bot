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
    stubChartService,
} from './helpers/harness.ts';
import { ALICE, BOB, commandUpdate, textUpdate } from './helpers/telegram.ts';
import {
    getActiveSeason,
    getBet,
    getEntriesForUser,
    getSeasonForReporting,
    initializeDb,
} from '../src/db/index.ts';
import { seasonEndAfter, timeUntilString } from '../src/seasons.ts';

let chart: ReturnType<typeof stubChartService>;

before(async () => {
    chart = stubChartService();
    await setupDatabase();
});

after(async () => {
    chart.restore();
    await closeDatabase();
});

beforeEach(async () => {
    await resetDatabase();
});

describe('season end dates', () => {
    it('is the 1st of May at 09:00 later the same year', () => {
        const end = seasonEndAfter(new Date(2026, 9, 15)); // October 2026
        assert.equal(end.getFullYear(), 2027);
        assert.equal(end.getMonth(), 4);
        assert.equal(end.getDate(), 1);
        assert.equal(end.getHours(), 9);
    });

    it('is this year when the season opens before May', () => {
        const end = seasonEndAfter(new Date(2027, 0, 10)); // January 2027
        assert.equal(end.getFullYear(), 2027);
        assert.equal(end.getMonth(), 4);
    });

    it('rolls to next year when opened on the 1st of May itself', () => {
        const end = seasonEndAfter(new Date(2027, 4, 1, 12, 0));
        assert.equal(end.getFullYear(), 2028);
    });

    it('never lands in the past', () => {
        for (const month of [0, 3, 4, 5, 11]) {
            const from = new Date(2026, month, 20);
            assert.ok(
                seasonEndAfter(from).getTime() > from.getTime(),
                `month ${month} produced a deadline in the past`,
            );
        }
    });
});

describe('countdown wording', () => {
    it('counts months and days', () => {
        const text = timeUntilString(
            new Date(2027, 4, 1, 9),
            new Date(2027, 1, 1, 9),
        );
        assert.match(text, /Aikaa Wappuun 3 kuukautta ja 0 päivää!/);
    });

    it('uses the singular for one month', () => {
        const text = timeUntilString(
            new Date(2027, 4, 1, 9),
            new Date(2027, 3, 1, 9),
        );
        assert.match(text, /1 kuukausi/);
    });

    it('gives up once the deadline has gone', () => {
        const text = timeUntilString(
            new Date(2026, 4, 1, 9),
            new Date(2026, 7, 5),
        );
        assert.equal(text, 'Wabu ei lobu');
    });
});

describe('/avaakausi', () => {
    it('opens a season for an admin', async () => {
        const { bot, telegram } = createTestBot();

        await bot.handleUpdate(commandUpdate('avaakausi', ALICE));

        assert.match(
            String(telegram.calls.at(-1)?.payload.text),
            /Uusi kausi on avattu/,
        );
        const season = await getActiveSeason();
        assert.notEqual(season, null);
    });

    it('refuses a non-admin and opens nothing', async () => {
        const { bot, telegram } = createTestBot();

        await bot.handleUpdate(commandUpdate('avaakausi', BOB));

        assert.match(
            String(telegram.calls.at(-1)?.payload.text),
            /Vain atk-jaosto/,
        );
        assert.equal(await getActiveSeason(), null);
    });

    it('refuses when a season is already running', async () => {
        await openTestSeason();
        const { bot, telegram } = createTestBot();

        await bot.handleUpdate(commandUpdate('avaakausi', ALICE));

        assert.match(
            String(telegram.calls.at(-1)?.payload.text),
            /Kausi on jo käynnissä/,
        );
        const seasons = await query('SELECT id FROM seasons');
        assert.equal(seasons.length, 1);
    });

    it('opens a fresh season once the previous one has finished', async () => {
        await insertOverdueSeason();
        const { bot } = createTestBot();

        await bot.handleUpdate(commandUpdate('avaakausi', ALICE));

        const seasons = await query('SELECT id FROM seasons');
        assert.equal(seasons.length, 2);
        assert.notEqual(await getActiveSeason(), null);
    });
});

describe('between seasons', () => {
    it('refuses /latua', async () => {
        const { bot, telegram } = createTestBot();

        await bot.handleUpdate(commandUpdate('latua'));

        assert.match(
            String(telegram.calls.at(-1)?.payload.text),
            /Ei kausi käynnissä/,
        );
    });

    it('refuses /betti', async () => {
        const { bot, telegram } = createTestBot();

        await bot.handleUpdate(commandUpdate('betti'));

        assert.match(
            String(telegram.calls.at(-1)?.payload.text),
            /Ei kausi käynnissä/,
        );
    });

    it('refuses /latua once the season has run out', async () => {
        await insertOverdueSeason();
        const { bot, telegram } = createTestBot();

        await bot.handleUpdate(commandUpdate('latua'));

        assert.match(
            String(telegram.calls.at(-1)?.payload.text),
            /Ei kausi käynnissä/,
        );
    });

    it('still reports the finished season in /stats', async () => {
        const finished = await insertOverdueSeason();
        await query(
            `INSERT INTO users (user_id, first_name, nickname) VALUES ($1, $2, $2)`,
            [ALICE.id, 'Petrus'],
        );
        await query(
            `INSERT INTO ski_entries (user_id, timestamp, amount, season_id)
             VALUES ($1, NOW() - INTERVAL '30 days', $2, $3)`,
            [ALICE.id, 400, finished.id],
        );
        await query(
            `INSERT INTO season_bets (season_id, user_id, amount) VALUES ($1, $2, $3)`,
            [finished.id, ALICE.id, 750],
        );

        const { bot, telegram } = createTestBot();
        await bot.handleUpdate(commandUpdate('stats'));

        const text = String(telegram.calls.at(-1)?.payload.text);
        assert.match(text, /Petrus - 400\.00\/750km/);
        assert.match(text, /Wabu ei lobu/);
    });
});

describe('season scoping', () => {
    it('starts everyone from zero in a new season', async () => {
        const first = await openTestSeason();
        const { bot } = createTestBot();

        await bot.handleUpdate(commandUpdate('betti'));
        await bot.handleUpdate(textUpdate('750'));
        await bot.handleUpdate(commandUpdate('latua'));
        await bot.handleUpdate(textUpdate('120'));

        assert.equal(await getBet(ALICE.id, first.id), 750);
        assert.equal((await getEntriesForUser(ALICE.id, first.id)).length, 1);

        // Close the season and open the next one.
        await query('UPDATE seasons SET closed_at = NOW() WHERE id = $1', [
            first.id,
        ]);
        const second = await openTestSeason();

        assert.equal(
            await getBet(ALICE.id, second.id),
            null,
            'bets do not carry over',
        );
        assert.equal(
            (await getEntriesForUser(ALICE.id, second.id)).length,
            0,
            'kilometres do not carry over',
        );
        // The old season is untouched.
        assert.equal(await getBet(ALICE.id, first.id), 750);
        assert.equal((await getEntriesForUser(ALICE.id, first.id)).length, 1);
    });

    it('lets a lower bet be placed in a new season', async () => {
        const first = await openTestSeason();
        const { bot } = createTestBot();
        await bot.handleUpdate(commandUpdate('betti'));
        await bot.handleUpdate(textUpdate('750'));

        await query('UPDATE seasons SET closed_at = NOW() WHERE id = $1', [
            first.id,
        ]);
        const second = await openTestSeason();

        await bot.handleUpdate(commandUpdate('betti'));
        await bot.handleUpdate(textUpdate('300'));

        assert.equal(await getBet(ALICE.id, second.id), 300);
    });
});

describe('migrating data recorded before seasons existed', () => {
    /** Recreates the pre-seasons shape and runs the migration over it. */
    const seedLegacyData = async (entryTimestamp: string) => {
        await query('DROP TABLE IF EXISTS season_bets');
        await query('ALTER TABLE ski_entries DROP COLUMN IF EXISTS season_id');
        await query('DROP TABLE IF EXISTS seasons');
        await query(
            `INSERT INTO users (user_id, first_name, nickname, bet)
             VALUES ($1, 'Petrus', 'Petrus', 750)`,
            [ALICE.id],
        );
        await query(
            `INSERT INTO ski_entries (user_id, timestamp, amount)
             VALUES ($1, $2, 400)`,
            [ALICE.id, entryTimestamp],
        );
        await initializeDb();
    };

    it('folds old entries and bets into one season', async () => {
        await seedLegacyData('2025-11-15T10:00:00');

        const seasons = await query<{ id: number }>('SELECT id FROM seasons');
        assert.equal(seasons.length, 1, 'exactly one season is created');

        const entries = await query<{ season_id: number }>(
            'SELECT season_id FROM ski_entries',
        );
        assert.equal(entries[0].season_id, seasons[0].id);

        const bets = await query<{ amount: number }>(
            'SELECT amount FROM season_bets',
        );
        assert.equal(Number(bets[0].amount), 750);
    });

    it('closes the adopted season when its 1st of May has gone', async () => {
        await seedLegacyData('2025-11-15T10:00:00');

        // The season ran 2025-11 to 2026-05-01, which is already past.
        assert.equal(await getActiveSeason(), null);
        const reporting = await getSeasonForReporting();
        assert.notEqual(reporting, null);
        assert.notEqual(reporting?.closed_at, null);
        assert.equal(new Date(reporting!.ends_at).getFullYear(), 2026);
    });

    it('is a no-op on a fresh install', async () => {
        await query('DROP TABLE IF EXISTS season_bets');
        await query('ALTER TABLE ski_entries DROP COLUMN IF EXISTS season_id');
        await query('DROP TABLE IF EXISTS seasons');

        await initializeDb();

        assert.deepEqual(await query('SELECT id FROM seasons'), []);
    });

    it('does not run twice', async () => {
        await seedLegacyData('2025-11-15T10:00:00');
        await initializeDb();
        await initializeDb();

        const seasons = await query('SELECT id FROM seasons');
        assert.equal(seasons.length, 1);
    });
});
