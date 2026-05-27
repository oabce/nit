const mysql = require('mysql2/promise');
const env = require('./envFile');

const dbPassword = env.get('DB_PASSWORD') ?? env.get('DB_PASS');

const pool = mysql.createPool({
  host: env.get('DB_HOST'),
  port: Number(env.get('DB_PORT', 3306)),
  user: env.get('DB_USER'),
  password: dbPassword,
  database: env.get('DB_NAME'),
  waitForConnections: true,
  connectionLimit: 10,
});

module.exports = pool;
