import type { Bot } from 'grammy';
import { CronJob } from 'cron';

import type { BotContext } from './context.ts';
import { getEntriesForLastWeek } from './db/index.ts';
import { CHAT_ID } from './env.ts';

/** Builds the weekly leaderboard, or null when nobody skied. */
export const buildWeeklyReport = async (): Promise<string | null> => {
    const entriesForLastWeek = await getEntriesForLastWeek();

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

export const sendWeeklyReport = async (bot: Bot<BotContext>) => {
    try {
        const reportMessage = await buildWeeklyReport();

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
