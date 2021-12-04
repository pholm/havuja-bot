import { Pool } from "pg";

var _ = require("lodash");
require("dotenv").config();

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
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
            })
        );
};

// create new ski entry for user. if user does not exist, create user first
export const writeRecordToDb = async (
    userId: number,
    firstName: string,
    timestamp: Date,
    amount: number
) => {
    // create user if not exists
    await createUser(userId, firstName);
    const query = `INSERT INTO ski_entries (user_id, timestamp, amount) VALUES ($1, $2, $3)`;
    const values = [userId, timestamp, amount];
    await pool.query(query, values).catch((err) =>
        setImmediate(() => {
            throw err;
        })
    );
};

export const getRecordsForUser = async (userId: number) => {
    const query = `SELECT ski_entries.amount, users.first_name, ski_entries.timestamp FROM ski_entries, users WHERE ski_entries.user_id = $1 AND users.user_id = $1 ORDER BY timestamp DESC`;
    const values = [userId];
    const result = await pool.query(query, values).catch((err) =>
        setImmediate(() => {
            throw err;
        })
    );
    return result.rows;
};

export const getFirstNameForUser = async (userId: number): Promise<string> => {
    const query = `SELECT first_name FROM users WHERE user_id = $1`;
    const values = [userId];
    const result = await pool.query(query, values).catch((err) =>
        setImmediate(() => {
            throw err;
        })
    );
    return result.rows[0].first_name;
};

export const initializeDb = async () => {
    const createUsersTable = `CREATE TABLE IF NOT EXISTS users (
        user_id INTEGER PRIMARY KEY,
        first_name VARCHAR(255) NOT NULL
    )`;
    await pool.query(createUsersTable).catch((err) =>
        setImmediate(() => {
            throw err;
        })
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
        })
    );
};
