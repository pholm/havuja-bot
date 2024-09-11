import { Context, Scenes, Telegraf } from 'telegraf';
import { betWizard, skiRecordWizard } from './scenes';

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

const bot = new Telegraf<BotContext>(process.env.BOT_TOKEN);

// register the session middleware; required for scenes to work
bot.use(new LocalSession().middleware());

// set the commands so it's easier to discover the bot's functionality
bot.telegram.setMyCommands([
    { command: 'latua', description: 'Lisää uusi rykäsy' },
    { command: 'stats', description: 'Katso tilastot' },
    { command: 'betti', description: 'Aseta betti' },
    { command: 'help', description: 'Apua' },
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
    console.log('Got message', ctx.message);
    return next();
});

// The necessary base commands
bot.start((ctx) => ctx.reply('Se on raaka peli'));
bot.help((ctx) => ctx.reply('Kannattaa jo suunnata Alkoon'));

// handle the command for adding a new record
bot.command('latua', async (ctx) => {
    ctx.scene.enter('SKIED_RECORD_WIZARD');
});

// handle the command for setting the bet
bot.command('betti', async (ctx) => {
    ctx.scene.enter('BET_WIZARD');
});

// get the generic stats list
bot.command('stats', async (ctx) => {
    ctx.replyWithHTML(await statsReply(ctx));
});

bot.launch();

console.log('Initialization ready');
