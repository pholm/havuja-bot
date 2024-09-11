import { Pool } from 'pg';

const pool = new Pool({
    host: process.env.POSTGRES_HOST,
    user: process.env.POSTGRES_USER,
    password: process.env.POSTGRES_PASSWORD,
    database: process.env.POSTGRES_DATABASE,
});

pool.connect().catch((e) => console.error(e.stack));

const createUser = async (userId: number, firstName: string) => {
    const query = `INSERT INTO users (user_id, first_name) VALUES ($1, $2) ON CONFLICT (user_id) DO UPDATE SET first_name = $2`;
    const values = [userId, firstName];
    await pool
        .query(query, values)
        .then((res) => console.log(res.rows[0]))
        .catch((err) =>
            setImmediate(() => {
                throw err;
            }),
        );
};

// create new ski entry for user. if user does not exist, create user first
export const writeRecordToDb = async (
    userId: number,
    firstName: string,
    timestamp: Date,
    amount: number,
) => {
    // create user if not exists
    await createUser(userId, firstName);
    const query = `INSERT INTO ski_entries (user_id, timestamp, amount) VALUES ($1, $2, $3)`;
    const values = [userId, timestamp, amount];
    await pool.query(query, values).catch((err) =>
        setImmediate(() => {
            throw err;
        }),
    );
};

export const setBet = async (
    userId: number,
    firstName: string,
    bet: number,
) => {
    await createUser(userId, firstName);
    const query = `UPDATE users SET bet = $1 
                    WHERE user_id = $2`;
    const values = [bet, userId];
    await pool.query(query, values).catch((err) =>
        setImmediate(() => {
            throw err;
        }),
    );
};

export const getStatsForUser = async (userId: number) => {
    const query = `SELECT SUM(ski_entries.amount) as amount, users.first_name FROM ski_entries, users 
                    WHERE ski_entries.user_id = $1 AND users.user_id = $1 
                    GROUP BY users.first_name`;
    const values = [userId];
    const result = await pool.query(query, values).catch((err) =>
        setImmediate(() => {
            throw err;
        }),
    );
    return result.rows[0];
};

type StatisticItem = {
    amount: number;
    first_name: string;
    timestamp: string;
    bet: number;
};

export const getStatistics: () => Promise<StatisticItem[]> = async () => {
    const query = `SELECT SUM(ski_entries.amount) as amount, users.first_name, MAX(ski_entries.timestamp) as timestamp, users.bet 
                    FROM ski_entries, users 
                    WHERE users.user_id = ski_entries.user_id AND users.bet IS NOT NULL 
                    GROUP BY users.first_name, ski_entries.user_id, users.bet 
                    ORDER BY SUM(ski_entries.amount) DESC`;
    const result = await pool.query(query).catch((err) =>
        setImmediate(() => {
            throw err;
        }),
    );
    return result.rows;
};

export const initializeDb = async () => {
    const createUsersTable = `CREATE TABLE IF NOT EXISTS users (
        user_id BIGINT PRIMARY KEY,
        first_name VARCHAR(255) NOT NULL,
        bet FLOAT DEFAULT NULL
    )`;
    await pool.query(createUsersTable).catch((err) =>
        setImmediate(() => {
            throw err;
        }),
    );
    const createEntriesTable = `CREATE TABLE IF NOT EXISTS ski_entries (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users (user_id) ON DELETE CASCADE,
        timestamp TIMESTAMP NOT NULL,
        amount FLOAT NOT NULL
    )`;
    await pool.query(createEntriesTable).catch((err) =>
        setImmediate(() => {
            throw err;
        }),
    );
};
