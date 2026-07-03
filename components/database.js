require('dotenv').config();
const mysql = require('mysql2');

const pool = mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 3306,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
});

pool.query(
    `CREATE TABLE IF NOT EXISTS embed_status (channel_id VARCHAR(255) PRIMARY KEY, embed_created BOOLEAN DEFAULT 0, message_id VARCHAR(255))`,
    (err) => {
        if (err) console.error('Error creating embed_status table', err.message);
    }
);

// Add message_id to tables created before this column existed. Ignore the
// duplicate-column error when it's already present.
pool.query(`ALTER TABLE embed_status ADD COLUMN message_id VARCHAR(255)`, (err) => {
    if (err && err.code !== 'ER_DUP_FIELDNAME') {
        console.error('Error adding message_id column', err.message);
    }
});

pool.query(
    `CREATE TABLE IF NOT EXISTS tickets (user_id VARCHAR(255) PRIMARY KEY, ticket_count INT DEFAULT 0)`,
    (err) => {
        if (err) console.error('Error creating tickets table', err.message);
    }
);

function getEmbedStatus(channelId, callback) {
    pool.query(`SELECT embed_created, message_id FROM embed_status WHERE channel_id = ?`, [channelId], (err, rows) => {
        callback(err, rows && rows[0]);
    });
}

function setEmbedStatus(channelId, messageId) {
    pool.query(
        `INSERT INTO embed_status (channel_id, embed_created, message_id) VALUES (?, 1, ?) ON DUPLICATE KEY UPDATE embed_created = 1, message_id = VALUES(message_id)`,
        [channelId, messageId]
    );
}

function getTicketCount(userId, callback) {
    pool.query(`SELECT ticket_count FROM tickets WHERE user_id = ?`, [userId], (err, rows) => {
        callback(err, rows && rows[0]);
    });
}

function incrementTicketCount(userId) {
    pool.query(`INSERT INTO tickets (user_id, ticket_count) VALUES (?, 1) ON DUPLICATE KEY UPDATE ticket_count = ticket_count + 1`, [userId]);
}

function resetTicketCount(userId) {
    pool.query(`UPDATE tickets SET ticket_count = 0 WHERE user_id = ?`, [userId]);
}

module.exports = {
    getEmbedStatus,
    setEmbedStatus,
    getTicketCount,
    incrementTicketCount,
    resetTicketCount
};
