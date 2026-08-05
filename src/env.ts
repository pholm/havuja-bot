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

/**
 * Who may open a season with /avaakausi. Override without a redeploy by setting
 * ADMIN_USER_IDS to a comma-separated list of numeric Telegram user ids.
 */
const DEFAULT_ADMIN_USER_IDS = [
    29715987, // Pekka Lammi
    236175478, // Petrus Holm
];

export const ADMIN_USER_IDS = new Set<number>(
    process.env.ADMIN_USER_IDS
        ? process.env.ADMIN_USER_IDS.split(',')
              .map((id) => Number(id.trim()))
              .filter((id) => Number.isInteger(id))
        : DEFAULT_ADMIN_USER_IDS,
);

export const isAdmin = (userId: number | undefined): boolean =>
    userId !== undefined && ADMIN_USER_IDS.has(userId);
