import { bot } from './index';
import { getEntriesForLastWeek } from './db';

const CronJob = require('cron').CronJob;

const sendScheduledMessages = async () => {
    const entriesForLastWeek = await getEntriesForLastWeek();

    console.log(entriesForLastWeek);

    let reportMessage = 'Kuluneen viikon latujen sankarit:\n\n';

    // for the first three entries, add a medal :D
    reportMessage += entriesForLastWeek
        .slice(0, 3)
        .map((entry, index) => {
            const medal = ['🥇', '🥈', '🥉'][index];
            return `${medal} ${entry.first_name} - ${entry.sum.toFixed(2)}km`;
        })
        .join('\n');

    // then add the rest of the entries
    reportMessage += '\n';
    reportMessage += entriesForLastWeek
        .slice(3)
        .map((entry) => `${entry.first_name} - ${entry.sum.toFixed(2)}km`)
        .join('\n');

    // add the total
    const total = entriesForLastWeek.reduce((acc, entry) => acc + entry.sum, 0);
    reportMessage += `\n\nYhteensä: ${total.toFixed(2)}km`;

    try {
        bot.telegram.sendMessage(process.env.CHAT_ID, reportMessage);
    } catch (error) {
        console.log(error);
    }
};

const job = new CronJob(
    // cron every minute
    '* * * * *',
    // '0 21 * * 0',
    async () => {
        sendScheduledMessages();
    },
    null,
    true,
    'Europe/Helsinki',
);

const cron = () => {
    job.start();
};

export default cron;
