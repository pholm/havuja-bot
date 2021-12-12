require('dotenv').config();
import { Telegraf, Context } from 'telegraf';
import { formatDistance, parseISO } from 'date-fns';
import { fi } from 'date-fns/locale';
import { Update, Message } from 'typegram';
import db = require('./db');

var _ = require('lodash');

db.initializeDb();

const validChatId = (chatId) => {
    return true;
    // return chatId === -416691354
};

const deadLineDate = new Date('2022-05-01T00:00:00.000Z');

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

const timeUntilDeadLineString: string = `Aikaa Wappuun ${
    timeUntilDeadLine().months
} kuukautta ja ${
    timeUntilDeadLine().days
} päivää. Lumet saattaa kyllä sulaa ennen sitä :D`;

// Define your own context type
interface MyContext extends Context {
    myProp?: string;
    myOtherProp?: number;
}

const bot = new Telegraf<MyContext>(process.env.BOT_TOKEN);

const cheersReply = async (
    ctx: Context<{
        message: Update.New & Update.NonChannel & Message.TextMessage;
        update_id: number;
    }> &
        Omit<MyContext, keyof Context<Update>>
) => {
    const entriesForUser = await db.getRecordsForUser(ctx.from.id);

    const amountTotal = _.round(
        entriesForUser.reduce((acc, cur) => acc + cur.amount, 0),
        2
    );

    return `
    
    Se oli kunnon repäsy.
    
Hyvä homma ${ctx.message.from.first_name}! Sinulla on nyt ${amountTotal} kilometriä kasassa.
                `;
};

const statsReply = async (
    ctx: Context<{
        message: Update.New & Update.NonChannel & Message.TextMessage;
        update_id: number;
    }> &
        Omit<MyContext, keyof Context<Update>>
) => {
    const entries = await db.getRecordsForAllUsers();

    const groupedEntries = _.chain(entries)
        .groupBy('userId')
        .mapValues((entryList) => {
            const firstName = entryList[0].first_name;
            return {
                firstName: firstName,
                amount: _.round(
                    entryList.reduce((acc, cur) => acc + cur.amount, 0),
                    2
                ),
                last: entryList[entryList.length - 1].timestamp,
            };
        })
        .values()
        .sortBy('amount')
        .reverse()
        .value();

    const retString: string[] = groupedEntries.map((entry) => {
        const agoString = formatDistance(Date.parse(entry.last), new Date(), {
            addSuffix: true,
            locale: fi,
        });

        return `<b>${entry.firstName} - ${String(
            entry.amount
        )} kilometriä</b>\nedellinen ${agoString}\n\n`;
    });

    return `
Nonii, katellaas vähä paljo peli

${retString.join('')}
${timeUntilDeadLineString}

`;
};

bot.start((ctx) => ctx.reply('Se on raaka peli'));
bot.help((ctx) => ctx.reply('Kannattaa jo suunnata Alkoon'));
bot.on('text', async (ctx) => {
    console.log(`${ctx.message.from.first_name}: ${ctx.message.text}`);
    if (!!ctx.message.text) {
        if (!validChatId((await ctx.getChat()).id)) {
            ctx.reply('Kirjaa kaikki jutut chätin kautta');
        } else if (ctx.message.text.includes('/latua')) {
            // replace comma with dot for correct parsing. Round to 2 decimal with lodash
            const userInput = ctx.message.text.split(' ')[1];
            const kilometers = parseFloat(userInput?.replace(',', '.'));
            const kmRounded = _.round(kilometers, 2);
            if (isNaN(kmRounded)) {
                ctx.reply('lisää kilometrit komennolla /latua <kilometri>');
            } else {
                await db.writeRecordToDb(
                    ctx.message.from.id,
                    ctx.message.from.first_name,
                    new Date(),
                    kilometers
                );
                ctx.reply(await cheersReply(ctx));
            }
        } else if (ctx.message.text.includes('/stats')) {
            ctx.replyWithHTML(await statsReply(ctx));
        }
    }
});

bot.launch();

console.log('Ready');
