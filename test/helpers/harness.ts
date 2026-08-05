import { EventEmitter } from 'node:events';
import https from 'node:https';
import { Pool } from 'pg';

import { createBot } from '../../src/bot.ts';
import { closePool, initializeDb } from '../../src/db/index.ts';
import { BOT_INFO, FakeTelegram } from './telegram.ts';

/**
 * Builds a bot wired to a fake Telegram. `botInfo` is supplied up front so the
 * bot never needs to call getMe, and nothing here starts long polling.
 */
export const createTestBot = () => {
    const telegram = new FakeTelegram();
    const bot = createBot({
        botInfo: BOT_INFO,
        client: {
            // The fake speaks just enough of fetch for grammY's client.
            fetch: telegram.fetch as unknown as typeof globalThis.fetch,
        },
    });
    return { bot, telegram };
};

const testPool = new Pool({
    host: process.env.POSTGRES_HOST,
    port: Number(process.env.POSTGRES_PORT),
    user: process.env.POSTGRES_USER,
    password: process.env.POSTGRES_PASSWORD,
    database: process.env.POSTGRES_DATABASE,
});

/**
 * Waits for the test database to accept connections, then makes sure the schema
 * exists. Fails loudly with the command to start one rather than hanging.
 */
export const setupDatabase = async () => {
    const deadline = Date.now() + 30_000;
    for (;;) {
        try {
            await testPool.query('SELECT 1');
            break;
        } catch (error) {
            if (Date.now() > deadline) {
                throw new Error(
                    `Could not reach the test database at ` +
                        `${process.env.POSTGRES_HOST}:${process.env.POSTGRES_PORT}. ` +
                        `Start one with \`npm run test:db:up\`.\n${String(error)}`,
                );
            }
            await new Promise((resolve) => setTimeout(resolve, 250));
        }
    }
    await initializeDb();
};

export const resetDatabase = async () => {
    await testPool.query(
        'TRUNCATE ski_entries, users RESTART IDENTITY CASCADE',
    );
};

/** Drains both pools so the test process can exit on its own. */
export const closeDatabase = async () => {
    await testPool.end();
    await closePool();
};

export const query = <T extends Record<string, unknown>>(
    sql: string,
    values?: unknown[],
) => testPool.query<T>(sql, values).then((result) => result.rows);

/** A minimal valid PNG, so tests never depend on the QuickChart service. */
const FAKE_PNG = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
    'base64',
);

/**
 * Replaces the chart service with a canned PNG. The grapher reaches for
 * `https.get` at call time, so swapping the property is enough. Returns a
 * restore function, plus the URLs it was asked for so a test can assert on the
 * chart configuration without leaving the machine.
 */
export const stubChartService = () => {
    const original = https.get;
    const requestedUrls: string[] = [];

    // @ts-expect-error deliberately narrower than the real overloaded signature
    https.get = (url: string, callback: (res: EventEmitter) => void) => {
        requestedUrls.push(url);
        const response = new EventEmitter();
        queueMicrotask(() => {
            callback(response);
            response.emit('data', FAKE_PNG);
            response.emit('end');
        });
        return new EventEmitter();
    };

    return {
        requestedUrls,
        restore: () => {
            https.get = original;
        },
    };
};
