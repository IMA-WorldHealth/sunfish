const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');
const debug = require('debug')('sunfish:db');

const db = new Database(process.env.DB, { verbose: debug });

const schemaFile = path.resolve(__dirname, '../schema.sql');
const schema = fs.readFileSync(schemaFile, 'utf8');

// ensure the database schema is built
db.exec(schema);

module.exports = db;
