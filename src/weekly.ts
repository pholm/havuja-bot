import { bot } from './index.ts';
import { getEntriesForLastWeek } from './db/index.ts';
import { CronJob } from 'cron';

const sendScheduledMessages = async () => {
    try {
        const entriesForLastWeek = await getEntriesForLastWeek();

        // if no entries, do nothing
        if (!entriesForLastWeek || entriesForLastWeek.length === 0) {
            console.log('No entries for the last week.');
            return;
        }

        let reportMessage = 'Taas on viikko takana.\n\n';
        reportMessage += '<b>Kuluneen viikon latujen sankarit:\n\n</b>';

        // For the first three entries, add a medal
        reportMessage += entriesForLastWeek
            .slice(0, 3)
            .map((entry, index) => {
                const medal = ['🥇', '🥈', '🥉'][index];
                return `${medal} ${entry.nickname} - ${entry.amount.toFixed(
                    2,
                )}km`;
            })
            .join('\n');

        // Then add the rest of the entries
        if (entriesForLastWeek.length > 3) {
            reportMessage += '\n\n';
            reportMessage += entriesForLastWeek
                .slice(3)
                .map(
                    (entry) =>
                        `${entry.nickname} - ${entry.amount.toFixed(2)}km`,
                )
                .join('\n');
        }

        // Add the total
        const total = entriesForLastWeek.reduce(
            (acc, entry) => acc + entry.amount,
            0,
        );
        reportMessage += `\n\nYhteensä: ${total.toFixed(2)}km`;
        reportMessage += '\nLiukkaita latuja!';

        await bot.telegram.sendMessage(process.env.CHAT_ID, reportMessage, {
            parse_mode: 'HTML',
        });
    } catch (error) {
        console.error('Error sending scheduled messages:', error);
    }
};

const cron = () => {
    CronJob.from({
        // every Sunday at 21:00
        cronTime: '0 21 * * 0',
        onTick: async () => {
            await sendScheduledMessages();
        },
        timeZone: 'Europe/Helsinki',
        start: true,
    });
};

export default cron;
