import { type Context, Scenes, Telegraf } from 'telegraf';
import { betWizard, nicknameWizard, skiRecordWizard } from './scenes.ts';
import { differenceInDays, differenceInMonths, formatDistance } from 'date-fns';
import {
    getBet,
    getEntriesForUser,
    getNickname,
    getStatistics,
    initializeDb,
} from './db/index.ts';

import { createSkiChart } from './grapher.ts';
import cron from './weekly.ts';
import { fi } from 'date-fns/locale';

import LocalSession from 'telegraf-session-local';

// Initialize the database
initializeDb();

// Define deadline date (May 1, 2026)
const deadLineDate = new Date(2026, 4, 1);

// Define BotContext type
export type BotContext = Context & Scenes.SceneContext;

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

// Create a new Telegraf bot instance
export const bot = new Telegraf<BotContext>(process.env.BOT_TOKEN);

// Register session middleware
bot.use(new LocalSession().middleware());

// Set bot commands
bot.telegram.setMyCommands([
    { command: 'analyysi', description: 'Katso omat hiihdot' },
    { command: 'betti', description: 'Aseta betti' },
    { command: 'help', description: 'Apua' },
    { command: 'latua', description: 'Lisää uusi rykäsy' },
    { command: 'kutsumua', description: 'Vaihda lempinimi' },
    { command: 'stats', description: 'Katso tilastot' },
]);

// Function to generate stats reply
const statsReply = async (ctx: Context) => {
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

// Initialize scenes
const stage = new Scenes.Stage<Scenes.WizardContext>([
    skiRecordWizard,
    betWizard,
    nicknameWizard,
]);

// Register stage middleware
bot.use(stage.middleware());

// Register logging middleware
bot.use((ctx, next) => {
    if (ctx.message && 'text' in ctx.message) {
        console.log(`${ctx.from.first_name}: ${ctx.message.text}`);
    }
    return next();
});

// Register chat ID middleware (commented out for testing)
bot.use((ctx, next) => {
    if (ctx.chat.id !== parseInt(process.env.CHAT_ID)) {
        console.log(ctx.chat.id);
        // ctx.reply('Laitappa viestit HIIHTO_RINKIIN');
        // return;
        return next();
    }
    return next();
});

bot.help((ctx) => ctx.reply('Lehviltä skiergo lainaksi?'));

// Handle command for adding a new record
bot.command('latua', async (ctx) => {
    ctx.scene.enter('SKIED_RECORD_WIZARD');
});

// Handle command for setting the bet
bot.command('betti', async (ctx) => {
    ctx.scene.enter('BET_WIZARD');
});

// Handle command for changing the nickname
bot.command('kutsumua', async (ctx) => {
    ctx.scene.enter('NICKNAME_WIZARD');
});

// User-specific graph command
bot.command('analyysi', async (ctx) => {
    const skiEntries = await getEntriesForUser(ctx.message.from.id);
    const bet = await getBet(ctx.message.from.id);

    if (skiEntries.length === 0) {
        ctx.reply('Ei hiihtoja vielä');
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

    const nickname = await getNickname(ctx.message.from.id);

    const captionTextMultiline = `
${nickname || ctx.message.from.first_name}, tässä sun hiihdot

Viimeisen 7 päivän hiihdot: ${totalLastWeek}km
Viimeisen 30 päivän hiihdot: ${totalLastMonth}km

Hyvin menee!`;

    ctx.replyWithPhoto(
        { source: imageBuffer },
        { caption: captionTextMultiline, disable_notification: true },
    );
});

// Command for getting generic stats
bot.command('stats', async (ctx) => {
    ctx.replyWithHTML(await statsReply(ctx));
});

// Global error handler
bot.catch((err, ctx) => {
    console.error(`Error encountered for ${ctx.updateType}`, err);
    ctx.reply('Hups! Bitti meni vinoon. Ping ATK-jaosto');
});

// Launch the bot
bot.launch();

// Start the cron job for the weekly report
cron();

console.log('Initialization ready');
