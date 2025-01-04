const { Pool } = require('pg');

const pool = new Pool({
  user: 'postgres', // Замените на свое имя пользователя
  host: 'localhost',
  database: 'pharmacy',
  password: 'Dimakolix123', // Замените на свой пароль
  port: 5434,
});

module.exports = pool;