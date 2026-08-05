import { Pool } from 'pg';

import { seasonEndAfter } from '../seasons.ts';

// POSTGRES_PORT is absent from .env.example, and the previous
// parseInt(undefined) handed the pool a NaN port instead of Postgres' default.
const configuredPort = Number(process.env.POSTGRES_PORT);

const pool = new Pool({
    host: process.env.POSTGRES_HOST,
    port: Number.isInteger(configuredPort) ? configuredPort : 5432,
    user: process.env.POSTGRES_USER,
    password: process.env.POSTGRES_PASSWORD,
    database: process.env.POSTGRES_DATABASE,
    // recommended config
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000,
});

// Fail loudly at boot if the database is unreachable. The client has to go back
// to the pool afterwards; holding it leaked a connection for the process' life.
pool.connect()
    .then((client) => client.release())
    .catch((e) => console.error(e.stack));

// https://node-postgres.com/apis/pool#error
pool.on('error', (err) => {
    console.error('Unexpected error on idle client', err);
});

/** Drains the pool so the process can exit. */
export const closePool = () => pool.end();

type StatisticItem = {
    amount: number;
    nickname: string;
    timestamp: string;
    bet: number;
};

export type Season = {
    id: number;
    started_at: Date;
    ends_at: Date;
    closed_at: Date | null;
};

// --------------------------------------------------------------- seasons

/** The season people are currently competing in, if any. */
export const getActiveSeason = async (): Promise<Season | null> => {
    try {
        const result = await pool.query<Season>(
            `SELECT id, started_at, ends_at, closed_at
             FROM seasons
             WHERE closed_at IS NULL AND ends_at > NOW()
             ORDER BY started_at DESC
             LIMIT 1`,
        );
        return result.rows[0] ?? null;
    } catch (err) {
        console.error(err);
        return null;
    }
};

/**
 * The season to report on: the running one, or the one that just finished so
 * that /stats and /analyysi keep working between seasons.
 */
export const getSeasonForReporting = async (): Promise<Season | null> => {
    try {
        const result = await pool.query<Season>(
            `SELECT id, started_at, ends_at, closed_at
             FROM seasons
             ORDER BY started_at DESC
             LIMIT 1`,
        );
        return result.rows[0] ?? null;
    } catch (err) {
        console.error(err);
        return null;
    }
};

/**
 * A season that has run past its end date but was never closed, e.g. because
 * the bot was down on the 1st of May.
 */
export const getSeasonDueForClosing = async (): Promise<Season | null> => {
    try {
        const result = await pool.query<Season>(
            `SELECT id, started_at, ends_at, closed_at
             FROM seasons
             WHERE closed_at IS NULL AND ends_at <= NOW()
             ORDER BY started_at DESC
             LIMIT 1`,
        );
        return result.rows[0] ?? null;
    } catch (err) {
        console.error(err);
        return null;
    }
};

export const openSeason = async (
    startedAt: Date,
): Promise<
    { success: true; season: Season } | { success: false; message: string }
> => {
    const existing = await getActiveSeason();
    if (existing !== null) {
        return { success: false, message: 'A season is already running' };
    }

    try {
        const result = await pool.query<Season>(
            `INSERT INTO seasons (started_at, ends_at)
             VALUES ($1, $2)
             RETURNING id, started_at, ends_at, closed_at`,
            [startedAt, seasonEndAfter(startedAt)],
        );
        return { success: true, season: result.rows[0] };
    } catch (err) {
        console.error(err);
        return { success: false, message: 'Error opening the season' };
    }
};

export const closeSeason = async (
    seasonId: number,
    closedAt: Date,
): Promise<boolean> => {
    try {
        await pool.query(
            `UPDATE seasons SET closed_at = $2 WHERE id = $1 AND closed_at IS NULL`,
            [seasonId, closedAt],
        );
        return true;
    } catch (err) {
        console.error(err);
        return false;
    }
};

// ----------------------------------------------------------------- users

const createUser = async (
    userId: number,
    firstName: string,
    lastName: string | null,
): Promise<{ success: boolean; message: string }> => {
    const query = `INSERT INTO users (user_id, first_name, last_name, nickname)
                    VALUES ($1, $2, $3, $2)
                    ON CONFLICT (user_id)
                    DO UPDATE SET first_name = $2, last_name = $3`;
    const values = [userId, firstName, lastName];

    try {
        await pool.query(query, values);
        return { success: true, message: 'User created or updated' };
    } catch (err) {
        console.error(err);
        return { success: false, message: 'Error creating or updating user' };
    }
};

export const setNickname = async (
    userId: number,
    nickname: string,
): Promise<{ success: boolean; message: string }> => {
    const query = `UPDATE users
                    SET nickname = $2
                    WHERE user_id = $1`;
    const values = [userId, nickname];

    try {
        await pool.query(query, values);
        return { success: true, message: 'Nickname updated successfully' };
    } catch (err) {
        console.error(err);
        return { success: false, message: 'Error updating nickname' };
    }
};

export const getNickname = async (userId: number): Promise<string | null> => {
    const query = `SELECT nickname
                    FROM users
                    WHERE user_id = $1`;
    const values = [userId];

    try {
        const result = await pool.query(query, values);
        if (result.rows.length === 0) return null;
        return result.rows[0].nickname;
    } catch (err) {
        console.error(err);
        return null;
    }
};

// ------------------------------------------------------- bets and entries

export const writeRecordToDb = async (
    userId: number,
    firstName: string,
    lastName: string | null,
    timestamp: Date,
    amount: number,
    seasonId: number,
): Promise<{ success: boolean; message: string }> => {
    const userResult = await createUser(userId, firstName, lastName);
    if (!userResult.success) return userResult;

    const query = `INSERT INTO ski_entries (user_id, timestamp, amount, season_id)
                    VALUES ($1, $2, $3, $4)`;
    const values = [userId, timestamp, amount, seasonId];

    try {
        await pool.query(query, values);
        return { success: true, message: 'Ski entry added' };
    } catch (err) {
        console.error(err);
        return { success: false, message: 'Error adding ski entry' };
    }
};

export const getBet = async (
    userId: number,
    seasonId: number,
): Promise<number | null> => {
    const query = `SELECT amount
                    FROM season_bets
                    WHERE user_id = $1 AND season_id = $2`;
    const values = [userId, seasonId];

    try {
        const result = await pool.query(query, values);
        if (result.rows.length === 0) return null;
        return result.rows[0].amount;
    } catch (err) {
        console.error(err);
        return null;
    }
};

export const setBet = async (
    userId: number,
    firstName: string,
    lastName: string | null,
    bet: number,
    seasonId: number,
): Promise<{ success: boolean; message: string }> => {
    const userResult = await createUser(userId, firstName, lastName);
    if (!userResult.success) return userResult;

    const query = `INSERT INTO season_bets (season_id, user_id, amount)
                    VALUES ($1, $2, $3)
                    ON CONFLICT (season_id, user_id)
                    DO UPDATE SET amount = $3`;
    const values = [seasonId, userId, bet];

    try {
        await pool.query(query, values);
        return { success: true, message: 'Bet updated' };
    } catch (err) {
        console.error(err);
        return { success: false, message: 'Error updating bet' };
    }
};

export const getStatsForUser = async (
    userId: number,
    seasonId: number,
): Promise<StatisticItem | null> => {
    const query = `SELECT SUM(ski_entries.amount) as amount, users.nickname
                    FROM ski_entries
                    JOIN users ON users.user_id = ski_entries.user_id
                    WHERE ski_entries.user_id = $1 AND ski_entries.season_id = $2
                    GROUP BY users.user_id`;
    const values = [userId, seasonId];

    try {
        const result = await pool.query(query, values);
        return result.rows.length ? result.rows[0] : null;
    } catch (err) {
        console.error(err);
        return null;
    }
};

export const getEntriesForUser = async (
    userId: number,
    seasonId: number,
): Promise<{ amount: number; timestamp: string }[]> => {
    const query = `SELECT amount, timestamp
                    FROM ski_entries
                    WHERE user_id = $1 AND season_id = $2
                    ORDER BY timestamp DESC`;
    const values = [userId, seasonId];

    try {
        const result = await pool.query(query, values);
        return result.rows;
    } catch (err) {
        console.error(err);
        return [];
    }
};

export const getEntriesForLastWeek = async (
    seasonId: number,
): Promise<{ amount: number; nickname: string }[]> => {
    const query = `SELECT SUM(ski_entries.amount) AS amount, users.nickname
                    FROM ski_entries, users
                    WHERE ski_entries.user_id = users.user_id
                      AND ski_entries.season_id = $1
                      AND ski_entries.timestamp > NOW() - INTERVAL '7 days'
                    GROUP BY users.user_id
                    ORDER BY SUM(ski_entries.amount) DESC`;

    try {
        const result = await pool.query(query, [seasonId]);
        return result.rows;
    } catch (err) {
        console.error(err);
        return [];
    }
};

export const getStatistics = async (
    seasonId: number,
): Promise<StatisticItem[]> => {
    const query = `SELECT COALESCE(SUM(ski_entries.amount), 0) as amount,
                          users.nickname,
                          MAX(ski_entries.timestamp) as timestamp,
                          season_bets.amount as bet
                    FROM season_bets
                    JOIN users ON users.user_id = season_bets.user_id
                    LEFT JOIN ski_entries
                      ON ski_entries.user_id = season_bets.user_id
                      AND ski_entries.season_id = season_bets.season_id
                    WHERE season_bets.season_id = $1
                    GROUP BY users.user_id, users.nickname, season_bets.amount
                    ORDER BY amount DESC`;

    try {
        const result = await pool.query(query, [seasonId]);
        return result.rows;
    } catch (err) {
        console.error(err);
        return [];
    }
};

// ------------------------------------------------------------- schema

/**
 * Folds everything that predates seasons into one season, so no history is
 * lost. It ends on the 1st of May that followed the first recorded ski, and is
 * marked closed straight away if that date has already gone by.
 */
const adoptDataFromBeforeSeasons = async (): Promise<void> => {
    const seasonCount = await pool.query<{ count: number }>(
        'SELECT COUNT(*)::int AS count FROM seasons',
    );
    if (seasonCount.rows[0].count > 0) return;

    const legacy = await pool.query<{ earliest: Date | null; count: number }>(
        `SELECT MIN(timestamp) AS earliest, COUNT(*)::int AS count FROM ski_entries`,
    );
    const legacyBets = await pool.query<{ count: number }>(
        'SELECT COUNT(*)::int AS count FROM users WHERE bet IS NOT NULL',
    );

    if (legacy.rows[0].count === 0 && legacyBets.rows[0].count === 0) {
        // Fresh install: wait for an admin to open the first season.
        return;
    }

    const startedAt = legacy.rows[0].earliest ?? new Date();
    const endsAt = seasonEndAfter(startedAt);
    const alreadyOver = endsAt.getTime() <= Date.now();

    const inserted = await pool.query<{ id: number }>(
        `INSERT INTO seasons (started_at, ends_at, closed_at)
         VALUES ($1, $2, $3)
         RETURNING id`,
        [startedAt, endsAt, alreadyOver ? endsAt : null],
    );
    const seasonId = inserted.rows[0].id;

    await pool.query(
        'UPDATE ski_entries SET season_id = $1 WHERE season_id IS NULL',
        [seasonId],
    );
    await pool.query(
        `INSERT INTO season_bets (season_id, user_id, amount)
         SELECT $1, user_id, bet FROM users WHERE bet IS NOT NULL
         ON CONFLICT (season_id, user_id) DO NOTHING`,
        [seasonId],
    );

    console.log(
        `Adopted pre-season data into season ${seasonId} ` +
            `(${startedAt.toISOString()} – ${endsAt.toISOString()}` +
            `${alreadyOver ? ', already closed' : ''})`,
    );
};

export const initializeDb = async (): Promise<void> => {
    const createUsersTable = `CREATE TABLE IF NOT EXISTS users (
        user_id BIGINT PRIMARY KEY,
        first_name VARCHAR(255) NOT NULL,
        last_name VARCHAR(255) DEFAULT NULL,
        nickname VARCHAR(255) DEFAULT NULL,
        bet FLOAT DEFAULT NULL
    )`;

    const createEntriesTable = `CREATE TABLE IF NOT EXISTS ski_entries (
        id SERIAL PRIMARY KEY,
        user_id BIGINT NOT NULL REFERENCES users (user_id) ON DELETE CASCADE,
        timestamp TIMESTAMP NOT NULL,
        amount FLOAT NOT NULL
    )`;

    const createSeasonsTable = `CREATE TABLE IF NOT EXISTS seasons (
        id SERIAL PRIMARY KEY,
        started_at TIMESTAMPTZ NOT NULL,
        ends_at TIMESTAMPTZ NOT NULL,
        closed_at TIMESTAMPTZ DEFAULT NULL
    )`;

    const createSeasonBetsTable = `CREATE TABLE IF NOT EXISTS season_bets (
        season_id INTEGER NOT NULL REFERENCES seasons (id) ON DELETE CASCADE,
        user_id BIGINT NOT NULL REFERENCES users (user_id) ON DELETE CASCADE,
        amount FLOAT NOT NULL,
        PRIMARY KEY (season_id, user_id)
    )`;

    const addSeasonToEntries = `ALTER TABLE ski_entries
        ADD COLUMN IF NOT EXISTS season_id INTEGER
        REFERENCES seasons (id) ON DELETE CASCADE`;

    try {
        await pool.query(createUsersTable);
        await pool.query(createEntriesTable);
        await pool.query(createSeasonsTable);
        await pool.query(createSeasonBetsTable);
        await pool.query(addSeasonToEntries);
        await adoptDataFromBeforeSeasons();
    } catch (err) {
        console.error(err);
    }
};
