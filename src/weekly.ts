import { bot } from '.';
import { getEntriesForLastWeek } from './db';
const CronJob = require('cron').CronJob;

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
        reportMessage += '\n\nLiukkaita latuja!';

        await bot.telegram.sendMessage(process.env.CHAT_ID, reportMessage, {
            parse_mode: 'HTML',
        });
    } catch (error) {
        console.error('Error sending scheduled messages:', error);
    }
};

const job = new CronJob(
    '* * * * *', // cron every minute for debugging
    async () => {
        await sendScheduledMessages();
    },
    null,
    true,
    'Europe/Helsinki',
);

const cron = () => {
    job.start();
};

export default cron;
