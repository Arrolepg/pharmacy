const { Pool } = require('pg');

const pool = new Pool({
  user: 'Arrole',
  host: 'localhost',
  database: 'pharmacy',
  password: 'pass',
  port: 5434,
});

module.exports = pool;