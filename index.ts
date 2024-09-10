require('dotenv').config();

import { Context, Scenes, Telegraf } from 'telegraf';

import { fi } from 'date-fns/locale';
import { formatDistance } from 'date-fns';

const LocalSession = require('telegraf-session-local');

import db = require('./db');

var _ = require('lodash');

db.initializeDb();

const validChatId = (chatId) => {
    return true;
    // return chatId === -416691354
};

const deadLineDate = new Date(2025, 4, 1); // until May Day 2025. months start indexing from 0 :)

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

type BotContext = Context & Scenes.SceneContext;

interface MyWizardContext extends Scenes.WizardContext {
    wizard: any;
}

const bot = new Telegraf<BotContext>(process.env.BOT_TOKEN);
// register the session middleware; required for scenes to work
bot.use(new LocalSession().middleware());

// set the commands so it's easier to use the bot
bot.telegram.setMyCommands([
    { command: 'latua', description: 'Lisää uusi rykäsy' },
    { command: 'stats', description: 'Katso tilastot' },
    { command: 'betti', description: 'Aseta betti' },
    { command: 'help', description: 'Apua' },
]);

const cheersReply = async (ctx: BotContext) => {
    const stats = await db.getStatsForUser(ctx.from.id);

    return `
    
    Se oli kunnon repäsy.
    
Hyvä homma ${
        ctx.message.from.first_name
    }! Sinulla on nyt ${stats.amount.toFixed(2)} kilometriä kasassa.
                `;
};

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

        return `<b>${entry.first_name} - ${String(
            entry.amount.toFixed(2),
        )} kilometriä</b>\nedellinen ${agoString}\n\n`;
    });

    return `
Nonii, katellaas vähä paljo peli

${retString.join('')}
${timeUntilDeadLineString()}

`;
};

const skiRecordWizard = new Scenes.WizardScene<MyWizardContext>(
    'SKIED_RECORD_WIZARD',
    (ctx) => {
        ctx.reply('Ok, laitappas vielä ne kilometrit', {
            reply_markup: {
                input_field_placeholder: '12.3',
                // force the user to reply to the bot
                force_reply: true,
            },
        });

        return ctx.wizard.next();
    },
    async (ctx) => {
        // guard to check if the chat is valid
        if (!('text' in ctx.message)) {
            ctx.reply('Vastaa nyt järkevästi');
            return ctx.scene.reenter();
        }
        const kilometers = parseFloat(ctx.message.text.replace(',', '.'));
        const kmRounded = _.round(kilometers, 2);
        if (isNaN(kmRounded)) {
            console.log('Invalid input');
            await ctx.reply(
                'Botilla on vaikea päivä. Ota yhteyttä ATK-osastoon',
            );
        } else {
            db.writeRecordToDb(
                ctx.message.from.id,
                ctx.message.from.first_name,
                new Date(),
                kmRounded,
            );
            await ctx.reply(await cheersReply(ctx));
        }
        return await ctx.scene.leave();
    },
);

// Stage initialization
const stage = new Scenes.Stage<Scenes.WizardContext>([skiRecordWizard], {
    default: 'super-wizard',
});

// Register the stage middleware
bot.use(stage.middleware());

const handleBetSetting = async (ctx: Context) => {
    ctx.reply('Paljon pistetään?', {
        reply_markup: {
            input_field_placeholder: '750',
            // force the user to reply to the bot
            force_reply: true,
        },
    });

    // TODO: handle the part where the bet amount is saved to db
};

bot.start((ctx) => ctx.reply('Se on raaka peli'));
bot.help((ctx) => ctx.reply('Kannattaa jo suunnata Alkoon'));

// handle the command for adding a new record
bot.command('latua', async (ctx) => {
    await ctx.scene.enter('SKIED_RECORD_WIZARD');
});

// get the generic stats list
bot.command('stats', async (ctx) => {
    ctx.replyWithHTML(await statsReply(ctx));
});

// handle the command for setting the bet
bot.command('betti', async (ctx) => {
    await handleBetSetting(ctx);
});

bot.launch();

// Enable graceful stop
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));

console.log('Ready');
