import { createBot, setMyCommands } from './bot.ts';
import { initializeDb } from './db/index.ts';
import {
    closeFinishedSeason,
    startSeasonEndJob,
    startWeeklyReportJob,
} from './weekly.ts';

// Initialize the database
await initializeDb();

export const bot = createBot();

setMyCommands(bot).catch((err) =>
    console.error('Failed to set bot commands', err),
);

// Stop polling cleanly so in-flight updates are not lost on redeploy
process.once('SIGINT', () => bot.stop());
process.once('SIGTERM', () => bot.stop());

// Launch the bot
bot.start().catch((err) => console.error('Bot stopped unexpectedly', err));

// Wrap up a season that ended while the bot was down, then schedule both jobs
closeFinishedSeason(bot).catch((err) =>
    console.error('Failed to close the finished season', err),
);
startWeeklyReportJob(bot);
startSeasonEndJob(bot);

console.log('Initialization ready');
