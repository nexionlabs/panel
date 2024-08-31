const Keyv = require('keyv');
const db = new Keyv('sqlite://nexion.db');

module.exports = { db }