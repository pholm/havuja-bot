import type { Bot } from 'grammy';
import { CronJob } from 'cron';

import type { BotContext } from './context.ts';
import {
    closeSeason,
    getActiveSeason,
    getEntriesForLastWeek,
    getSeasonDueForClosing,
    getStatistics,
} from './db/index.ts';
import { CHAT_ID } from './env.ts';
import { SEASON_END_HOUR } from './seasons.ts';

/** Builds the weekly leaderboard, or null when nobody skied. */
export const buildWeeklyReport = async (
    seasonId: number,
): Promise<string | null> => {
    const entriesForLastWeek = await getEntriesForLastWeek(seasonId);

    // if no entries, do nothing
    if (!entriesForLastWeek || entriesForLastWeek.length === 0) {
        return null;
    }

    let reportMessage = 'Taas on viikko takana.\n\n';
    reportMessage += '<b>Kuluneen viikon latujen sankarit:\n\n</b>';

    // For the first three entries, add a medal
    reportMessage += entriesForLastWeek
        .slice(0, 3)
        .map((entry, index) => {
            const medal = ['🥇', '🥈', '🥉'][index];
            return `${medal} ${entry.nickname} - ${entry.amount.toFixed(2)}km`;
        })
        .join('\n');

    // Then add the rest of the entries
    if (entriesForLastWeek.length > 3) {
        reportMessage += '\n\n';
        reportMessage += entriesForLastWeek
            .slice(3)
            .map((entry) => `${entry.nickname} - ${entry.amount.toFixed(2)}km`)
            .join('\n');
    }

    // Add the total
    const total = entriesForLastWeek.reduce(
        (acc, entry) => acc + entry.amount,
        0,
    );
    reportMessage += `\n\nYhteensä: ${total.toFixed(2)}km`;
    reportMessage += '\nLiukkaita latuja!';

    return reportMessage;
};

/** Final standings, sent when a season closes on the 1st of May. */
export const buildSeasonRecap = async (seasonId: number): Promise<string> => {
    const standings = await getStatistics(seasonId);

    if (standings.length === 0) {
        return 'Kausi on päättynyt, mutta kukaan ei ehtinyt betata. Ensi kaudella sitten!';
    }

    const lines = standings.map((entry, index) => {
        const medal = ['🥇', '🥈', '🥉'][index] ?? '　';
        const percentage = ((entry.amount / entry.bet) * 100).toFixed(1);
        const madeIt = entry.amount >= entry.bet ? ' ✅' : '';
        return `${medal} <b>${entry.nickname}</b> - ${entry.amount.toFixed(
            2,
        )}/${entry.bet}km (${percentage}%)${madeIt}`;
    });

    const total = standings.reduce((sum, entry) => sum + entry.amount, 0);
    const winners = standings.filter((entry) => entry.amount >= entry.bet);

    return `<b>Kausi on paketissa!</b> 🎿

${lines.join('\n')}

Yhteensä hiihdettiin ${total.toFixed(2)}km.
Bettinsä lunasti ${winners.length}/${standings.length}.

Kiitos kaudesta, nähdään syksyllä!`;
};

/** Weekly leaderboard. Stays quiet between seasons. */
export const sendWeeklyReport = async (bot: Bot<BotContext>) => {
    try {
        const season = await getActiveSeason();
        if (season === null) {
            console.log('No season running, skipping the weekly report.');
            return;
        }

        const reportMessage = await buildWeeklyReport(season.id);

        if (reportMessage === null) {
            console.log('No entries for the last week.');
            return;
        }

        await bot.api.sendMessage(CHAT_ID, reportMessage, {
            parse_mode: 'HTML',
        });
    } catch (error) {
        console.error('Error sending scheduled messages:', error);
    }
};

/**
 * Sends the final standings and closes the season. Looks for any season past
 * its end date rather than assuming today is the 1st of May, so a bot that was
 * down over the changeover still finishes the season on its next run.
 */
export const closeFinishedSeason = async (bot: Bot<BotContext>) => {
    try {
        const season = await getSeasonDueForClosing();
        if (season === null) {
            return;
        }

        const recap = await buildSeasonRecap(season.id);
        await bot.api.sendMessage(CHAT_ID, recap, { parse_mode: 'HTML' });
        await closeSeason(season.id, new Date());
    } catch (error) {
        console.error('Error closing the season:', error);
    }
};

export const startWeeklyReportJob = (bot: Bot<BotContext>) =>
    CronJob.from({
        // every Sunday at 21:00
        cronTime: '0 21 * * 0',
        onTick: async () => {
            await sendWeeklyReport(bot);
        },
        timeZone: 'Europe/Helsinki',
        start: true,
    });

export const startSeasonEndJob = (bot: Bot<BotContext>) =>
    CronJob.from({
        // 09:00 on the 1st of May
        cronTime: `0 ${SEASON_END_HOUR} 1 5 *`,
        onTick: async () => {
            await closeFinishedSeason(bot);
        },
        timeZone: 'Europe/Helsinki',
        start: true,
    });
