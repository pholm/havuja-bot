import { Bot, InputFile, MemorySessionStorage } from 'grammy';
import type { BotConfig } from 'grammy';
import { conversations, createConversation } from '@grammyjs/conversations';
import { formatDistance } from 'date-fns';
import { fi } from 'date-fns/locale';

import type { BotContext } from './context.ts';
import { BOT_TOKEN, CHAT_ID, isAdmin } from './env.ts';
import {
    BET_CONVERSATION,
    NICKNAME_CONVERSATION,
    SKI_RECORD_CONVERSATION,
    betConversation,
    nicknameConversation,
    skiRecordConversation,
} from './conversations.ts';
import {
    getActiveSeason,
    getBet,
    getEntriesForUser,
    getNickname,
    getSeasonForReporting,
    getStatistics,
    openSeason,
} from './db/index.ts';
import { createSkiChart } from './grapher.ts';
import { timeUntilString } from './seasons.ts';

/** Shown whenever someone tries to compete outside a running season. */
export const NO_SEASON_MESSAGE =
    'Ei kausi käynnissä. Odota että kausi avataan komennolla /avaakausi.';

const formatDate = (date: Date) =>
    new Intl.DateTimeFormat('fi-FI', {
        dateStyle: 'long',
    }).format(date);

// Function to generate stats reply
const statsReply = async (seasonId: number, endsAt: Date) => {
    const userListWithScores = await getStatistics(seasonId);

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
${timeUntilString(endsAt)}
`;
};

/**
 * Builds a fully wired bot without starting it or touching the network. Tests
 * pass a `client.fetch` stub through `config`; the conversations plugin builds
 * its inner API client from these same options, so the stub reaches the
 * wizards too.
 */
export const createBot = (config?: BotConfig<BotContext>) => {
    const bot = new Bot<BotContext>(BOT_TOKEN, config);

    // Register the conversations plugin and the wizards it drives.
    // The plugin keys its state by chat by default, which in a group chat would
    // let one member's half-finished wizard swallow everyone else's messages.
    // The old telegraf-session-local setup keyed sessions per user per chat, so
    // do the same.
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

    // Opens a new season. Admins only; see ADMIN_USER_IDS.
    bot.command('avaakausi', async (ctx) => {
        if (!isAdmin(ctx.from?.id)) {
            await ctx.reply('Vain atk-jaosto voi avata kauden.');
            return;
        }

        const running = await getActiveSeason();
        if (running !== null) {
            await ctx.reply(
                `Kausi on jo käynnissä, se päättyy ${formatDate(
                    new Date(running.ends_at),
                )}.`,
            );
            return;
        }

        const result = await openSeason(new Date());
        if (!result.success) {
            await ctx.reply('Jokin meni pieleen, yritä uudelleen.');
            return;
        }

        await ctx.reply(
            `<b>Uusi kausi on avattu!</b> 🎿\n\n` +
                `Kisa päättyy ${formatDate(new Date(result.season.ends_at))} klo 9.\n` +
                `Pistäkää betit tiskiin komennolla /betti.`,
            { parse_mode: 'HTML' },
        );
    });

    // Handle command for adding a new record
    bot.command('latua', async (ctx) => {
        const season = await getActiveSeason();
        if (season === null) {
            await ctx.reply(NO_SEASON_MESSAGE);
            return;
        }
        await ctx.conversation.enter(SKI_RECORD_CONVERSATION, season.id);
    });

    // Handle command for setting the bet
    bot.command('betti', async (ctx) => {
        const season = await getActiveSeason();
        if (season === null) {
            await ctx.reply(NO_SEASON_MESSAGE);
            return;
        }
        await ctx.conversation.enter(BET_CONVERSATION, season.id);
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

        // Between seasons this reports on the one that just finished.
        const season = await getSeasonForReporting();
        if (season === null) {
            await ctx.reply(NO_SEASON_MESSAGE);
            return;
        }

        const skiEntries = await getEntriesForUser(from.id, season.id);
        const bet = await getBet(from.id, season.id);

        if (skiEntries.length === 0) {
            await ctx.reply('Ei hiihtoja vielä');
            return;
        }

        const imageBuffer = await createSkiChart(
            skiEntries,
            new Date(season.ends_at),
            bet,
        );
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
        const season = await getSeasonForReporting();
        if (season === null) {
            await ctx.reply(NO_SEASON_MESSAGE);
            return;
        }

        await ctx.reply(await statsReply(season.id, new Date(season.ends_at)), {
            parse_mode: 'HTML',
        });
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

    return bot;
};

export const setMyCommands = (bot: Bot<BotContext>) =>
    bot.api.setMyCommands([
        { command: 'analyysi', description: 'Katso omat hiihdot' },
        { command: 'avaakausi', description: 'Avaa uusi kausi (atk-jaosto)' },
        { command: 'betti', description: 'Aseta betti' },
        { command: 'help', description: 'Apua' },
        { command: 'latua', description: 'Lisää uusi rykäsy' },
        { command: 'kutsumua', description: 'Vaihda lempinimi' },
        { command: 'stats', description: 'Katso tilastot' },
    ]);
