import { Pool } from 'pg';

const pool = new Pool({
    host: process.env.POSTGRES_HOST,
    user: process.env.POSTGRES_USER,
    password: process.env.POSTGRES_PASSWORD,
    database: process.env.POSTGRES_DATABASE,
});

pool.connect().catch((e) => console.error(e.stack));

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
) => {
    const query = `INSERT INTO users (user_id, first_name, last_name, nickname)
                    VALUES ($1, $2, $3, $2) 
                    ON CONFLICT (user_id) 
                    DO UPDATE SET first_name = $2, last_name = $3`;
    const values = [userId, firstName, lastName];
    await pool
        .query(query, values)
        .then((res) => console.log(res.rows[0]))
        .catch((err) =>
            setImmediate(() => {
                throw err;
            }),
        );
};

export const setNickname = async (userId: number, nickname: string) => {
    const query = `UPDATE users 
                    SET nickname = $2
                    WHERE user_id = $1`;
    const values = [userId, nickname];
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
    lastName: string,
    timestamp: Date,
    amount: number,
) => {
    // create user if not exists
    await createUser(userId, firstName, lastName);
    const query = `INSERT INTO ski_entries (user_id, timestamp, amount) 
                    VALUES ($1, $2, $3)`;
    const values = [userId, timestamp, amount];
    await pool.query(query, values).catch((err) =>
        setImmediate(() => {
            throw err;
        }),
    );
};

export const getBet = async (userId: number) => {
    const query = `SELECT bet 
                    FROM users 
                    WHERE user_id = $1`;
    const values = [userId];
    const result = await pool.query(query, values).catch((err) =>
        setImmediate(() => {
            throw err;
        }),
    );
    // guard if the user does not exist
    if (result.rows.length === 0) {
        return null;
    }
    return result.rows[0].bet;
};

export const setBet = async (
    userId: number,
    firstName: string,
    lastName: string,
    bet: number,
) => {
    console.log('bet in db', bet);
    // this neatly handles both insert and update, as well as creates the user if it does not exist!
    const query = `INSERT INTO users (user_id, first_name, last_name, bet) 
                    VALUES ($1, $2, $3, $4) 
                    ON CONFLICT (user_id) 
                    DO UPDATE SET bet = $4`;
    const values = [userId, firstName, lastName, bet];
    await pool.query(query, values).catch((err) =>
        setImmediate(() => {
            throw err;
        }),
    );
};

export const getStatsForUser = async (userId: number) => {
    const query = `SELECT SUM(ski_entries.amount) as amount, users.nickname FROM ski_entries, users 
                    WHERE ski_entries.user_id = $1 AND users.user_id = $1 
                    GROUP BY users.user_id`;
    const values = [userId];
    const result = await pool.query(query, values).catch((err) =>
        setImmediate(() => {
            throw err;
        }),
    );
    return result.rows[0];
};

export const getEntriesForUser = async (userId: number) => {
    const query = `SELECT amount, timestamp 
                    FROM ski_entries 
                    WHERE user_id = $1 
                    ORDER BY timestamp DESC`;
    const values = [userId];
    const result = await pool.query(query, values).catch((err) =>
        setImmediate(() => {
            throw err;
        }),
    );
    return result.rows;
};

export const getEntriesForLastWeek = async () => {
    const query = `SELECT SUM(ski_entries.amount), users.nickname
                    FROM ski_entries, users 
                    WHERE ski_entries.user_id = users.user_id AND ski_entries.timestamp > NOW() - INTERVAL '7 days' 
                    GROUP BY users.user_id
                    ORDER BY SUM(ski_entries.amount) DESC`;

    const result = await pool.query(query).catch((err) =>
        setImmediate(() => {
            throw err;
        }),
    );
    return result.rows;
};

export const getStatistics: () => Promise<StatisticItem[]> = async () => {
    const query = `SELECT SUM(ski_entries.amount) as amount, users.nickname, MAX(ski_entries.timestamp) as timestamp, users.bet 
                    FROM ski_entries, users
                    WHERE users.user_id = ski_entries.user_id AND users.bet IS NOT NULL 
                    GROUP BY users.user_id, users.bet 
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
        last_name VARCHAR(255) DEFAULT NULL,
        nickname VARCHAR(255) DEFAULT NULL,
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
