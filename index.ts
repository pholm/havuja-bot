import { Context, Scenes, Telegraf } from 'telegraf';
import { betWizard, skiRecordWizard } from './scenes';

import { createSkiChart } from './grapher';
import cron from './weekly';
import { fi } from 'date-fns/locale';
import { formatDistance } from 'date-fns';

const LocalSession = require('telegraf-session-local');

import db = require('./db');

db.initializeDb();

// TODO: write middleware to check if the chat is valid
const validChatId = (chatId) => {
    return true;
    // return chatId === -416691354
};

const deadLineDate = new Date(2025, 4, 1); // until May Day 2025. months start indexing from 0 :)

export type BotContext = Context & Scenes.SceneContext;

interface DeadLineObject {
    months: number;
    days: number;
}

const timeUntilDeadLine = (): DeadLineObject => {
    const now = new Date();
    const diff = deadLineDate.getTime() - now.getTime();
    const months = Math.floor(diff / (1000 * 60 * 60 * 24 * 30));
    const days = Math.floor(diff / (1000 * 60 * 60 * 24)) % 30;
    return { months, days };
};

const timeUntilDeadLineString: () => string = () => {
    return `Aikaa Wappuun ${timeUntilDeadLine().months} kuukautta ja ${
        timeUntilDeadLine().days
    } päivää!`;
};

export const bot = new Telegraf<BotContext>(process.env.BOT_TOKEN);

// register the session middleware; required for scenes to work
bot.use(new LocalSession().middleware());

// set the commands so it's easier to discover the bot's functionality
bot.telegram.setMyCommands([
    { command: 'analyysi', description: 'Katso omat hiihdot' },
    { command: 'betti', description: 'Aseta betti' },
    { command: 'help', description: 'Apua' },
    { command: 'latua', description: 'Lisää uusi rykäsy' },
    { command: 'stats', description: 'Katso tilastot' },
]);

const statsReply = async (ctx: Context) => {
    const userListWithScores = await db.getStatistics();

    const retString: string[] = userListWithScores.map((entry) => {
        const agoString = formatDistance(
            Date.parse(entry.timestamp),
            new Date(),
            {
                addSuffix: true,
                locale: fi,
            },
        );

        const betPercentage = ((entry.amount / entry.bet) * 100).toFixed(1);

        return `<b>${entry.first_name} - ${String(entry.amount.toFixed(2))}/${
            entry.bet
        }km (${betPercentage}%)</b>\nedellinen ${agoString}\n\n`;
    });

    return `
Nonii, katellaas vähä paljo peli

${retString.join('')}
${timeUntilDeadLineString()}

`;
};

// Stage initialization
const stage = new Scenes.Stage<Scenes.WizardContext>([
    skiRecordWizard,
    betWizard,
]);

// Register the stage middleware
bot.use(stage.middleware());

// Register the logging middleware
bot.use((ctx, next) => {
    // guard if the message has text
    if (ctx.message && 'text' in ctx.message) {
        console.log(`${ctx.from.first_name}: ${ctx.message.text}`);
    }
    return next();
});

// The necessary base commands
bot.start((ctx) => ctx.reply('Se on raaka peli'));
bot.help((ctx) => ctx.reply('Lehviltä skiergo lainaksi?'));

// handle the command for adding a new record
bot.command('latua', async (ctx) => {
    ctx.scene.enter('SKIED_RECORD_WIZARD');
});

// handle the command for setting the bet
bot.command('betti', async (ctx) => {
    ctx.scene.enter('BET_WIZARD');
});

// user-specific graph!
bot.command('analyysi', async (ctx) => {
    const skiEntries = await db.getEntriesForUser(ctx.message.from.id);
    const bet = await db.getBet(ctx.message.from.id);
    if (skiEntries.length === 0) {
        ctx.reply('Ei hiihtoja vielä');
        return;
    }
    const imageBuffer = await createSkiChart(skiEntries, deadLineDate, bet);

    const captionTextMultiline =
        `${ctx.message.from.first_name}, tässä sun hiihdot\n\n` +
        (skiEntries.length > 0
            ? `Viimeisen 7 päivän hiihdot: ${skiEntries
                  .filter((entry) => {
                      const now = new Date();
                      const lastWeek = new Date();
                      lastWeek.setDate(now.getDate() - 7);
                      return Date.parse(entry.timestamp) > lastWeek.getTime();
                  })
                  .reduce((acc, entry) => acc + entry.amount, 0)
                  .toFixed(2)}km\n`
            : '') +
        (skiEntries.length > 0
            ? `Viimeisen 30 päivän hiihdot: ${skiEntries
                  .filter((entry) => {
                      const now = new Date();
                      const lastMonth = new Date();
                      lastMonth.setDate(now.getDate() - 30);
                      return Date.parse(entry.timestamp) > lastMonth.getTime();
                  })
                  .reduce((acc, entry) => acc + entry.amount, 0)
                  .toFixed(2)}km\n`
            : '') +
        `\nHyvin menee!`;

    ctx.replyWithPhoto(
        { source: imageBuffer },
        {
            caption: captionTextMultiline,
            disable_notification: true,
        },
    );
});

// get the generic stats list
bot.command('stats', async (ctx) => {
    ctx.replyWithHTML(await statsReply(ctx));
});

// global error handler :)
bot.catch((err, ctx) => {
    console.error(`Error encountered for ${ctx.updateType}`, err);

    // Respond to the user with a generic message
    ctx.reply('Hups! Bitti meni vinoon. Ping ATK-jaosto');
});

bot.launch();

// start the cron job for weekly report
cron();

console.log('Initialization ready');
