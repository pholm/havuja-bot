import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';

import {
    closeDatabase,
    createTestBot,
    openTestSeason,
    resetDatabase,
    setupDatabase,
    stubChartService,
} from './helpers/harness.ts';
import { ALICE, BOB, commandUpdate, textUpdate } from './helpers/telegram.ts';

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
    await openTestSeason();
    chart.requestedUrls.length = 0;
});

/** Records a ski for a user through the wizard. */
const recordSki = async (
    bot: ReturnType<typeof createTestBot>['bot'],
    kilometres: string,
    user = ALICE,
) => {
    await bot.handleUpdate(commandUpdate('latua', user));
    await bot.handleUpdate(textUpdate(kilometres, user));
};

describe('/help', () => {
    it('replies', async () => {
        const { bot, telegram } = createTestBot();
        const mark = telegram.mark();

        await bot.handleUpdate(commandUpdate('help'));

        assert.ok(
            telegram
                .textsSince(mark)
                .some((t) => t.includes('Lehviltä skiergo lainaksi?')),
        );
    });
});

describe('/analyysi', () => {
    it('says there is nothing yet when the user has no entries', async () => {
        const { bot, telegram } = createTestBot();
        const mark = telegram.mark();

        await bot.handleUpdate(commandUpdate('analyysi'));

        assert.ok(
            telegram
                .textsSince(mark)
                .some((t) => t.includes('Ei hiihtoja vielä')),
        );
        assert.equal(chart.requestedUrls.length, 0, 'no chart should be drawn');
    });

    it('sends a chart with 7 and 30 day totals', async () => {
        const { bot, telegram } = createTestBot();
        await recordSki(bot, '12.5');
        await recordSki(bot, '7.25');

        const mark = telegram.mark();
        await bot.handleUpdate(commandUpdate('analyysi'));

        const photo = telegram
            .since(mark)
            .find((call) => call.method === 'sendPhoto');
        assert.ok(photo, 'expected a sendPhoto call');
        assert.equal(chart.requestedUrls.length, 1);
    });

    it('still renders for a user who has never set a bet', async () => {
        const { bot, telegram } = createTestBot();
        await recordSki(bot, '5', BOB);

        const mark = telegram.mark();
        await bot.handleUpdate(commandUpdate('analyysi', BOB));

        assert.ok(
            telegram.since(mark).some((call) => call.method === 'sendPhoto'),
            'a null bet must not break the chart',
        );
    });
});

describe('/stats', () => {
    it('renders as HTML', async () => {
        const { bot, telegram } = createTestBot();
        const mark = telegram.mark();

        await bot.handleUpdate(commandUpdate('stats'));

        const message = telegram
            .since(mark)
            .find((call) => call.method === 'sendMessage');
        assert.equal(message?.payload.parse_mode, 'HTML');
    });

    it('lists each better with their distance and percentage', async () => {
        const { bot, telegram } = createTestBot();

        await recordSki(bot, '20.75');
        await bot.handleUpdate(commandUpdate('betti'));
        await bot.handleUpdate(textUpdate('750'));

        const mark = telegram.mark();
        await bot.handleUpdate(commandUpdate('stats'));

        const text = String(
            telegram.since(mark).find((c) => c.method === 'sendMessage')
                ?.payload.text,
        );
        assert.match(text, /Petrus - 20\.75\/750km \(2\.8%\)/);
        assert.match(text, /edellinen/, 'shows when the last ski was');
    });

    it('only lists users who have placed a bet', async () => {
        const { bot, telegram } = createTestBot();

        await recordSki(bot, '10', ALICE);
        await bot.handleUpdate(commandUpdate('betti', ALICE));
        await bot.handleUpdate(textUpdate('500', ALICE));
        // Bob skis but never bets.
        await recordSki(bot, '99', BOB);

        const mark = telegram.mark();
        await bot.handleUpdate(commandUpdate('stats'));

        const text = String(
            telegram.since(mark).find((c) => c.method === 'sendMessage')
                ?.payload.text,
        );
        assert.match(text, /Petrus/);
        assert.doesNotMatch(text, /Lehvi/);
    });

    it('celebrates a better who passed their bet', async () => {
        const { bot, telegram } = createTestBot();

        await bot.handleUpdate(commandUpdate('betti'));
        await bot.handleUpdate(textUpdate('10'));
        await recordSki(bot, '12');

        const mark = telegram.mark();
        await bot.handleUpdate(commandUpdate('stats'));

        const text = String(
            telegram.since(mark).find((c) => c.method === 'sendMessage')
                ?.payload.text,
        );
        assert.match(text, /🎉/);
    });

    it('shows a user with a bet but no skis at zero', async () => {
        const { bot, telegram } = createTestBot();

        await bot.handleUpdate(commandUpdate('betti'));
        await bot.handleUpdate(textUpdate('750'));

        const mark = telegram.mark();
        await bot.handleUpdate(commandUpdate('stats'));

        const text = String(
            telegram.since(mark).find((c) => c.method === 'sendMessage')
                ?.payload.text,
        );
        assert.match(text, /Petrus - 0\.00\/750km \(0\.0%\)/);
        assert.doesNotMatch(
            text,
            /edellinen/,
            'no last-ski line without entries',
        );
    });

    it('always ends with the deadline countdown', async () => {
        const { bot, telegram } = createTestBot();
        const mark = telegram.mark();

        await bot.handleUpdate(commandUpdate('stats'));

        const text = String(
            telegram.since(mark).find((c) => c.method === 'sendMessage')
                ?.payload.text,
        );
        assert.ok(
            /Aikaa Wappuun/.test(text) || /Wabu ei lobu/.test(text),
            `expected a countdown, got: ${text}`,
        );
    });
});

describe('non-command messages', () => {
    it('are ignored', async () => {
        const { bot, telegram } = createTestBot();
        const mark = telegram.mark();

        await bot.handleUpdate(textUpdate('juttelua kanavalla'));

        assert.deepEqual(telegram.textsSince(mark), []);
    });
});
