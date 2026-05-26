require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const mysql = require('mysql2/promise');

const dbPassword = process.env.DB_PASSWORD ?? process.env.DB_PASS;

const pool = mysql.createPool({
  host:               process.env.DB_HOST,
  port:               process.env.DB_PORT || 3306,
  user:               process.env.DB_USER,
  password:           dbPassword,
  database:           process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit:    10,
});

module.exports = pool;
