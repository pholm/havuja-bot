import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';

import {
    closeDatabase,
    createTestBot,
    openTestSeason,
    query,
    resetDatabase,
    setupDatabase,
    stubChartService,
} from './helpers/harness.ts';
import type { Season } from '../src/db/index.ts';
import {
    ALICE,
    BOB,
    commandUpdate,
    stickerUpdate,
    textUpdate,
} from './helpers/telegram.ts';
import { getBet, getEntriesForUser, getNickname } from '../src/db/index.ts';

let chart: ReturnType<typeof stubChartService>;
let season: Season;

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
    season = await openTestSeason();
});

describe('/latua — recording a ski', () => {
    it('prompts for kilometres with a force reply', async () => {
        const { bot, telegram } = createTestBot();

        await bot.handleUpdate(commandUpdate('latua'));

        const prompt = telegram.calls.at(-1);
        assert.equal(prompt?.method, 'sendMessage');
        assert.match(
            String(prompt?.payload.text),
            /laitappas vielä ne kilometrit/,
        );
        assert.equal(
            (prompt?.payload.reply_markup as { force_reply?: boolean })
                ?.force_reply,
            true,
        );
    });

    it('stores the distance and confirms with the running total', async () => {
        const { bot, telegram } = createTestBot();

        await bot.handleUpdate(commandUpdate('latua'));
        const mark = telegram.mark();
        await bot.handleUpdate(textUpdate('12.5'));

        const texts = telegram.textsSince(mark);
        assert.ok(
            texts.some((t) => t.includes('Lisäsin sinulle 12.5 kilometriä')),
        );
        assert.ok(texts.some((t) => t.includes('12.50 kilometriä kasassa')));

        const rows = await getEntriesForUser(ALICE.id, season.id);
        assert.equal(rows.length, 1);
        assert.equal(Number(rows[0].amount), 12.5);
    });

    it('accepts a comma as the decimal separator', async () => {
        const { bot } = createTestBot();

        await bot.handleUpdate(commandUpdate('latua'));
        await bot.handleUpdate(textUpdate('8,25'));

        const rows = await getEntriesForUser(ALICE.id, season.id);
        assert.equal(Number(rows[0].amount), 8.25);
    });

    it('rounds to two decimals', async () => {
        const { bot } = createTestBot();

        await bot.handleUpdate(commandUpdate('latua'));
        await bot.handleUpdate(textUpdate('3.14159'));

        const rows = await getEntriesForUser(ALICE.id, season.id);
        assert.equal(Number(rows[0].amount), 3.14);
    });

    it('re-prompts on unparsable input and then accepts a retry', async () => {
        const { bot, telegram } = createTestBot();

        await bot.handleUpdate(commandUpdate('latua'));
        const mark = telegram.mark();
        await bot.handleUpdate(textUpdate('kaljaa'));

        const texts = telegram.textsSince(mark);
        assert.ok(texts.some((t) => t.includes('Syötä kilometrit muodossa')));
        assert.ok(
            texts.some((t) => t.includes('laitappas vielä ne kilometrit')),
        );
        assert.equal((await getEntriesForUser(ALICE.id, season.id)).length, 0);

        await bot.handleUpdate(textUpdate('7.25'));

        const rows = await getEntriesForUser(ALICE.id, season.id);
        assert.equal(rows.length, 1, 'the retry stores exactly one row');
        assert.equal(Number(rows[0].amount), 7.25);
    });

    it('asks again when the reply carries no text', async () => {
        const { bot, telegram } = createTestBot();

        await bot.handleUpdate(commandUpdate('latua'));
        const mark = telegram.mark();
        await bot.handleUpdate(stickerUpdate());

        assert.ok(
            telegram
                .textsSince(mark)
                .some((t) => t.includes('Vastaa nyt järkevästi')),
        );
        assert.equal((await getEntriesForUser(ALICE.id, season.id)).length, 0);
    });

    it('tidies up the command, the prompt and the answer', async () => {
        const { bot, telegram } = createTestBot();

        await bot.handleUpdate(commandUpdate('latua'));
        const mark = telegram.mark();
        await bot.handleUpdate(textUpdate('5'));

        const deleted = telegram
            .since(mark)
            .filter((call) => call.method === 'deleteMessage');
        assert.ok(
            deleted.length >= 3,
            `expected the thread to be cleaned up, saw ${deleted.length} deletions`,
        );
    });

    it('records the skier so later entries accumulate', async () => {
        const { bot } = createTestBot();

        await bot.handleUpdate(commandUpdate('latua'));
        await bot.handleUpdate(textUpdate('10'));
        await bot.handleUpdate(commandUpdate('latua'));
        await bot.handleUpdate(textUpdate('5.5'));

        const rows = await getEntriesForUser(ALICE.id, season.id);
        assert.equal(rows.length, 2);
        const total = rows.reduce((sum, row) => sum + Number(row.amount), 0);
        assert.equal(total, 15.5);
    });
});

describe('/betti — setting a bet', () => {
    it('stores the bet and confirms with a photo', async () => {
        const { bot, telegram } = createTestBot();

        await bot.handleUpdate(commandUpdate('betti'));
        const mark = telegram.mark();
        await bot.handleUpdate(textUpdate('750'));

        const photo = telegram
            .since(mark)
            .find((call) => call.method === 'sendPhoto');
        assert.ok(photo, 'expected a sendPhoto call');
        assert.equal(await getBet(ALICE.id, season.id), 750);
    });

    it('refuses to lower an existing bet and keeps the old value', async () => {
        const { bot, telegram } = createTestBot();

        await bot.handleUpdate(commandUpdate('betti'));
        await bot.handleUpdate(textUpdate('750'));

        await bot.handleUpdate(commandUpdate('betti'));
        const mark = telegram.mark();
        await bot.handleUpdate(textUpdate('100'));

        assert.ok(
            telegram
                .textsSince(mark)
                .some((t) => t.includes('Et voi betata vähemmän kuin 750')),
        );
        assert.equal(await getBet(ALICE.id, season.id), 750);
    });

    it('allows raising an existing bet', async () => {
        const { bot } = createTestBot();

        await bot.handleUpdate(commandUpdate('betti'));
        await bot.handleUpdate(textUpdate('750'));
        await bot.handleUpdate(commandUpdate('betti'));
        await bot.handleUpdate(textUpdate('1000'));

        assert.equal(await getBet(ALICE.id, season.id), 1000);
    });

    it('re-prompts on unparsable input', async () => {
        const { bot, telegram } = createTestBot();

        await bot.handleUpdate(commandUpdate('betti'));
        const mark = telegram.mark();
        await bot.handleUpdate(textUpdate('paljon'));

        const texts = telegram.textsSince(mark);
        assert.ok(texts.some((t) => t.includes('Syötä betti muodossa 100')));
        assert.equal(await getBet(ALICE.id, season.id), null);
    });

    it('asks again when the reply carries no text', async () => {
        const { bot, telegram } = createTestBot();

        await bot.handleUpdate(commandUpdate('betti'));
        const mark = telegram.mark();
        await bot.handleUpdate(stickerUpdate());

        assert.ok(
            telegram
                .textsSince(mark)
                .some((t) => t.includes('Bettaas nyt järkevästi')),
        );
    });
});

describe('/kutsumua — changing the nickname', () => {
    it('stores the nickname and confirms', async () => {
        const { bot, telegram } = createTestBot();

        // The user has to exist before a nickname can be set.
        await bot.handleUpdate(commandUpdate('latua'));
        await bot.handleUpdate(textUpdate('1'));

        await bot.handleUpdate(commandUpdate('kutsumua'));
        const mark = telegram.mark();
        await bot.handleUpdate(textUpdate('Hiihtokuningas'));

        assert.ok(
            telegram
                .textsSince(mark)
                .some((t) => t.includes('Lempinimesi on nyt Hiihtokuningas')),
        );
        assert.equal(await getNickname(ALICE.id), 'Hiihtokuningas');
    });

    it('is used in place of the first name afterwards', async () => {
        const { bot, telegram } = createTestBot();

        await bot.handleUpdate(commandUpdate('latua'));
        await bot.handleUpdate(textUpdate('1'));
        await bot.handleUpdate(commandUpdate('kutsumua'));
        await bot.handleUpdate(textUpdate('Hiihtokuningas'));

        await bot.handleUpdate(commandUpdate('latua'));
        const mark = telegram.mark();
        await bot.handleUpdate(textUpdate('2'));

        assert.ok(
            telegram
                .textsSince(mark)
                .some((t) => t.includes('Hyvä homma Hiihtokuningas!')),
        );
    });

    it('asks again when the reply carries no text', async () => {
        const { bot, telegram } = createTestBot();

        await bot.handleUpdate(commandUpdate('kutsumua'));
        const mark = telegram.mark();
        await bot.handleUpdate(stickerUpdate());

        assert.ok(
            telegram
                .textsSince(mark)
                .some((t) => t.includes('Vastaa nyt järkevästi')),
        );
    });
});

describe('wizard isolation between users', () => {
    it("does not let one user's open wizard swallow another's command", async () => {
        const { bot, telegram } = createTestBot();

        // Alice leaves a bet wizard open.
        await bot.handleUpdate(commandUpdate('betti', ALICE));

        const mark = telegram.mark();
        await bot.handleUpdate(commandUpdate('latua', BOB));

        assert.ok(
            telegram
                .textsSince(mark)
                .some((t) => t.includes('laitappas vielä ne kilometrit')),
            "Bob's command was consumed by Alice's wizard",
        );
    });

    it('resolves two concurrent wizards independently', async () => {
        const { bot } = createTestBot();

        await bot.handleUpdate(commandUpdate('betti', ALICE));
        await bot.handleUpdate(commandUpdate('latua', BOB));

        await bot.handleUpdate(textUpdate('500', ALICE));
        await bot.handleUpdate(textUpdate('9', BOB));

        assert.equal(await getBet(ALICE.id, season.id), 500);
        assert.equal(await getBet(BOB.id, season.id), null);

        assert.equal((await getEntriesForUser(BOB.id, season.id)).length, 1);
        assert.equal((await getEntriesForUser(ALICE.id, season.id)).length, 0);
    });

    it('keeps each skier’s totals separate', async () => {
        const { bot } = createTestBot();

        await bot.handleUpdate(commandUpdate('latua', ALICE));
        await bot.handleUpdate(textUpdate('10', ALICE));
        await bot.handleUpdate(commandUpdate('latua', BOB));
        await bot.handleUpdate(textUpdate('4', BOB));

        const rows = await query<{ user_id: string; amount: string }>(
            'SELECT user_id, amount FROM ski_entries ORDER BY user_id',
        );
        assert.deepEqual(
            rows.map((row) => [Number(row.user_id), Number(row.amount)]),
            [
                [ALICE.id, 10],
                [BOB.id, 4],
            ],
        );
    });
});
