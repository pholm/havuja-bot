import { Pool } from 'pg';

const pool = new Pool({
    host: process.env.POSTGRES_HOST,
    port: parseInt(process.env.POSTGRES_PORT),
    user: process.env.POSTGRES_USER,
    password: process.env.POSTGRES_PASSWORD,
    database: process.env.POSTGRES_DATABASE,
    // recommended config
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000,
});

pool.connect().catch((e) => console.error(e.stack));

// https://node-postgres.com/apis/pool#error
pool.on('error', (err) => {
    console.error('Unexpected error on idle client', err);
});

type StatisticItem = {
    amount: number;
    nickname: string;
    timestamp: string;
    bet: number;
};

const createUser = async (
    userId: number,
    firstName: string,
    lastName: string,
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

export const writeRecordToDb = async (
    userId: number,
    firstName: string,
    lastName: string,
    timestamp: Date,
    amount: number,
): Promise<{ success: boolean; message: string }> => {
    const userResult = await createUser(userId, firstName, lastName);
    if (!userResult.success) return userResult;

    const query = `INSERT INTO ski_entries (user_id, timestamp, amount) 
                    VALUES ($1, $2, $3)`;
    const values = [userId, timestamp, amount];

    try {
        await pool.query(query, values);
        return { success: true, message: 'Ski entry added' };
    } catch (err) {
        console.error(err);
        return { success: false, message: 'Error adding ski entry' };
    }
};

export const getBet = async (userId: number): Promise<number | null> => {
    const query = `SELECT bet 
                    FROM users 
                    WHERE user_id = $1`;
    const values = [userId];

    try {
        const result = await pool.query(query, values);
        if (result.rows.length === 0) return null;
        return result.rows[0].bet;
    } catch (err) {
        console.error(err);
        return null;
    }
};

export const setBet = async (
    userId: number,
    firstName: string,
    lastName: string,
    bet: number,
): Promise<{ success: boolean; message: string }> => {
    const query = `INSERT INTO users (user_id, first_name, last_name, bet, nickname) 
                    VALUES ($1, $2, $3, $4, $2) 
                    ON CONFLICT (user_id) 
                    DO UPDATE SET bet = $4`;
    const values = [userId, firstName, lastName, bet];

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
): Promise<StatisticItem | null> => {
    const query = `SELECT SUM(ski_entries.amount) as amount, users.nickname FROM ski_entries, users 
                    WHERE ski_entries.user_id = $1 AND users.user_id = $1 
                    GROUP BY users.user_id`;
    const values = [userId];

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
): Promise<{ amount: number; timestamp: string }[]> => {
    const query = `SELECT amount, timestamp 
                    FROM ski_entries 
                    WHERE user_id = $1 
                    ORDER BY timestamp DESC`;
    const values = [userId];

    try {
        const result = await pool.query(query, values);
        return result.rows;
    } catch (err) {
        console.error(err);
        return [];
    }
};

export const getEntriesForLastWeek = async (): Promise<
    { amount: number; nickname: string }[]
> => {
    const query = `SELECT SUM(ski_entries.amount) AS amount, users.nickname
                    FROM ski_entries, users 
                    WHERE ski_entries.user_id = users.user_id AND ski_entries.timestamp > NOW() - INTERVAL '7 days' 
                    GROUP BY users.user_id
                    ORDER BY SUM(ski_entries.amount) DESC`;

    try {
        const result = await pool.query(query);
        return result.rows;
    } catch (err) {
        console.error(err);
        return [];
    }
};

export const getStatistics: () => Promise<StatisticItem[]> = async () => {
    const query = `SELECT COALESCE(SUM(ski_entries.amount), 0) as amount, users.nickname, MAX(ski_entries.timestamp) as timestamp, users.bet 
                    FROM users
                    LEFT JOIN ski_entries ON users.user_id = ski_entries.user_id
                    WHERE users.bet IS NOT NULL 
                    GROUP BY users.user_id, users.nickname, users.bet 
                    ORDER BY amount DESC`;

    try {
        const result = await pool.query(query);
        return result.rows;
    } catch (err) {
        console.error(err);
        return [];
    }
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

    try {
        await pool.query(createUsersTable);
        await pool.query(createEntriesTable);
    } catch (err) {
        console.error(err);
    }
};
