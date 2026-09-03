const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const dbPath = process.env.DATABASE_PATH || path.join(__dirname, '../../waifu_catcher.db');
const db = new Database(dbPath);

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

function initDatabase() {
  const schemaSql = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  db.exec(schemaSql);
}

function transaction(fn) {
  return db.transaction(fn)();
}

module.exports = {
  db,
  initDatabase,
  transaction
};
