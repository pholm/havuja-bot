import { Bot, InputFile, MemorySessionStorage } from 'grammy';
import { conversations, createConversation } from '@grammyjs/conversations';
import { differenceInDays, differenceInMonths, formatDistance } from 'date-fns';
import { fi } from 'date-fns/locale';

import type { BotContext } from './context.ts';
import { BOT_TOKEN, CHAT_ID } from './env.ts';
import {
    BET_CONVERSATION,
    NICKNAME_CONVERSATION,
    SKI_RECORD_CONVERSATION,
    betConversation,
    nicknameConversation,
    skiRecordConversation,
} from './conversations.ts';
import {
    getBet,
    getEntriesForUser,
    getNickname,
    getStatistics,
    initializeDb,
} from './db/index.ts';

import { createSkiChart } from './grapher.ts';
import cron from './weekly.ts';

// Initialize the database
initializeDb();

// Define deadline date (May 1, 2026)
const deadLineDate = new Date(2026, 4, 1);

// Helper function for pluralization
const pluralize = (count: number, singular: string, plural: string): string => {
    return `${count} ${count === 1 ? singular : plural}`;
};

// Function to generate a string representing the time until the deadline
const timeUntilDeadLineString = (): string => {
    const now = new Date();
    const months = differenceInMonths(deadLineDate, now);
    const monthsDate = new Date(now);
    monthsDate.setMonth(monthsDate.getMonth() + months);
    const days = differenceInDays(deadLineDate, monthsDate);

    if (months < 0) {
        return 'Wabu ei lobu';
    }

    return `Aikaa Wappuun ${pluralize(
        months,
        'kuukausi',
        'kuukautta',
    )} ja ${pluralize(days, 'päivä', 'päivää')}!`;
};

// Create a new bot instance
export const bot = new Bot<BotContext>(BOT_TOKEN);

// Register the conversations plugin and the wizards it drives.
// The plugin keys its state by chat by default, which in a group chat would let
// one member's half-finished wizard swallow everyone else's messages. The old
// telegraf-session-local setup keyed sessions per user per chat, so do the same.
bot.use(
    conversations({
        storage: {
            type: 'key',
            getStorageKey: (ctx) =>
                ctx.chat === undefined || ctx.from === undefined
                    ? undefined
                    : `${ctx.chat.id}:${ctx.from.id}`,
            adapter: new MemorySessionStorage(),
        },
    }),
);
bot.use(createConversation(skiRecordConversation, SKI_RECORD_CONVERSATION));
bot.use(createConversation(betConversation, BET_CONVERSATION));
bot.use(createConversation(nicknameConversation, NICKNAME_CONVERSATION));

// Set bot commands
bot.api
    .setMyCommands([
        { command: 'analyysi', description: 'Katso omat hiihdot' },
        { command: 'betti', description: 'Aseta betti' },
        { command: 'help', description: 'Apua' },
        { command: 'latua', description: 'Lisää uusi rykäsy' },
        { command: 'kutsumua', description: 'Vaihda lempinimi' },
        { command: 'stats', description: 'Katso tilastot' },
    ])
    .catch((err) => console.error('Failed to set bot commands', err));

// Function to generate stats reply
const statsReply = async () => {
    const userListWithScores = await getStatistics();

    const retString: string[] = userListWithScores.map((entry) => {
        // Logic for generating the time ago string
        // If there are no entries, the timestamp is undefined and we adjust the list item accordingly
        let agoString = undefined;
        if (entry.timestamp) {
            agoString = formatDistance(
                Date.parse(entry.timestamp),
                new Date(),
                {
                    addSuffix: true,
                    locale: fi,
                },
            );
        }

        const betPercentage = (entry.amount / entry.bet) * 100;
        const percentageRounded = betPercentage.toFixed(1);

        return `<b>${entry.nickname} - ${entry.amount.toFixed(2)}/${
            entry.bet
        }km (${percentageRounded}%) ${betPercentage > 100 ? '🎉' : ''}</b>${
            agoString ? `\nedellinen ${agoString}` : ''
        }\n\n`;
    });

    return `
Nonii, katellaas vähä paljo peli

${retString.join('')}
${timeUntilDeadLineString()}
`;
};

// Register logging middleware
bot.use(async (ctx, next) => {
    if (ctx.message?.text) {
        console.log(`${ctx.from?.first_name}: ${ctx.message.text}`);
    }
    return next();
});

// Register chat ID middleware (commented out for testing)
bot.use(async (ctx, next) => {
    if (ctx.chat && ctx.chat.id !== parseInt(CHAT_ID)) {
        console.log(ctx.chat.id);
        // ctx.reply('Laitappa viestit HIIHTO_RINKIIN');
        // return;
        return next();
    }
    return next();
});

bot.command('help', (ctx) => ctx.reply('Lehviltä skiergo lainaksi?'));

// Handle command for adding a new record
bot.command('latua', async (ctx) => {
    await ctx.conversation.enter(SKI_RECORD_CONVERSATION);
});

// Handle command for setting the bet
bot.command('betti', async (ctx) => {
    await ctx.conversation.enter(BET_CONVERSATION);
});

// Handle command for changing the nickname
bot.command('kutsumua', async (ctx) => {
    await ctx.conversation.enter(NICKNAME_CONVERSATION);
});

// User-specific graph command
bot.command('analyysi', async (ctx) => {
    const from = ctx.from;
    if (from === undefined) {
        return;
    }

    const skiEntries = await getEntriesForUser(from.id);
    const bet = await getBet(from.id);

    if (skiEntries.length === 0) {
        await ctx.reply('Ei hiihtoja vielä');
        return;
    }

    const imageBuffer = await createSkiChart(skiEntries, deadLineDate, bet);
    const totalLastWeek = skiEntries
        .filter((entry) => {
            const lastWeek = new Date();
            lastWeek.setDate(lastWeek.getDate() - 7);
            return Date.parse(entry.timestamp) > lastWeek.getTime();
        })
        .reduce((acc, entry) => acc + entry.amount, 0)
        .toFixed(2);

    const totalLastMonth = skiEntries
        .filter((entry) => {
            const lastMonth = new Date();
            lastMonth.setDate(lastMonth.getDate() - 30);
            return Date.parse(entry.timestamp) > lastMonth.getTime();
        })
        .reduce((acc, entry) => acc + entry.amount, 0)
        .toFixed(2);

    const nickname = await getNickname(from.id);

    const captionTextMultiline = `
${nickname || from.first_name}, tässä sun hiihdot

Viimeisen 7 päivän hiihdot: ${totalLastWeek}km
Viimeisen 30 päivän hiihdot: ${totalLastMonth}km

Hyvin menee!`;

    await ctx.replyWithPhoto(new InputFile(imageBuffer), {
        caption: captionTextMultiline,
        disable_notification: true,
    });
});

// Command for getting generic stats
bot.command('stats', async (ctx) => {
    await ctx.reply(await statsReply(), { parse_mode: 'HTML' });
});

// Global error handler
bot.catch(async (err) => {
    console.error(
        `Error encountered for update ${err.ctx.update.update_id}`,
        err.error,
    );
    try {
        await err.ctx.reply('Hups! Bitti meni vinoon. Ping ATK-jaosto');
    } catch (replyError) {
        console.error('Could not report the error to the chat', replyError);
    }
});

// Stop polling cleanly so in-flight updates are not lost on redeploy
process.once('SIGINT', () => bot.stop());
process.once('SIGTERM', () => bot.stop());

// Launch the bot
bot.start().catch((err) => console.error('Bot stopped unexpectedly', err));

// Start the cron job for the weekly report
cron();

console.log('Initialization ready');
