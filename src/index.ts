import { createBot, setMyCommands } from './bot.ts';
import { initializeDb } from './db/index.ts';
import { startWeeklyReportJob } from './weekly.ts';

// Initialize the database
initializeDb();

export const bot = createBot();

setMyCommands(bot).catch((err) =>
    console.error('Failed to set bot commands', err),
);

// Stop polling cleanly so in-flight updates are not lost on redeploy
process.once('SIGINT', () => bot.stop());
process.once('SIGTERM', () => bot.stop());

// Launch the bot
bot.start().catch((err) => console.error('Bot stopped unexpectedly', err));

// Start the cron job for the weekly report
startWeeklyReportJob(bot);

console.log('Initialization ready');
