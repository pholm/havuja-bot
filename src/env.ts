const required = (name: string): string => {
    const value = process.env[name];
    if (!value) {
        throw new Error(`Missing required environment variable: ${name}`);
    }
    return value;
};

/** Telegraf rejects a missing or malformed token in its constructor anyway. */
export const BOT_TOKEN = required('BOT_TOKEN');

/** The group chat the weekly report is sent to. */
export const CHAT_ID = required('CHAT_ID');
