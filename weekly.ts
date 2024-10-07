import { bot } from './index';
import { getEntriesForLastWeek } from './db';

const CronJob = require('cron').CronJob;

const sendScheduledMessages = async () => {
    const entriesForLastWeek = await getEntriesForLastWeek();

    console.log(entriesForLastWeek);

    let reportMessage = 'Taas on viikko takana.\n\n';
    reportMessage += '<b>Kuluneen viikon latujen sankarit:\n\n</b>';

    // for the first three entries, add a medal :D
    reportMessage += entriesForLastWeek
        .slice(0, 3)
        .map((entry, index) => {
            const medal = ['🥇', '🥈', '🥉'][index];
            return `${medal} ${entry.first_name} - ${entry.sum.toFixed(2)}km`;
        })
        .join('\n');

    // then add the rest of the entries
    if (entriesForLastWeek.length > 3) {
        reportMessage += '\n\n';
        reportMessage += entriesForLastWeek
            .slice(3)
            .map((entry) => `${entry.first_name} - ${entry.sum.toFixed(2)}km`)
            .join('\n');
    }
    // add the total
    const total = entriesForLastWeek.reduce((acc, entry) => acc + entry.sum, 0);
    reportMessage += `\n\nYhteensä: ${total.toFixed(2)}km`;
    reportMessage += '\n\nLiukkaita latuja!';
    try {
        bot.telegram.sendMessage(process.env.CHAT_ID, reportMessage, {
            parse_mode: 'HTML',
        });
    } catch (error) {
        console.log(error);
    }
};

const job = new CronJob(
    // cron every minute
    '* * * * *',
    // cron every sunday at 21:00
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
