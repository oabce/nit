// db.js – Conexão com MySQL (Hostinger)
//
// Quando o npm estiver disponível, instalar:
//   npm install mysql2 dotenv  (dentro de backend/)
//
// Após instalar, descomentar o bloco abaixo e remover o `module.exports = null`.

// require('dotenv').config({ path: '../.env' });
// const mysql = require('mysql2/promise');
//
// const pool = mysql.createPool({
//   host:             process.env.DB_HOST,
//   port:             process.env.DB_PORT || 3306,
//   user:             process.env.DB_USER,
//   password:         process.env.DB_PASSWORD,
//   database:         process.env.DB_NAME,
//   waitForConnections: true,
//   connectionLimit:  10,
// });
//
// module.exports = pool;

module.exports = null; // temporário até npm ser liberado
