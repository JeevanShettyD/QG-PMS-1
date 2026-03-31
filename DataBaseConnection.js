const mysql = require('mysql');
require('dotenv').config()
// Set up MySQL connection
// const db = mysql.createConnection({
//     host: 'localhost',
//     user: process.env.MySQLUser,
//     password: process.env.MySQLPassword,
//     database: process.env.MySQLDB,
//     multipleStatements: true
//   });
const db=mysql.createPool({
    host: 'localhost',
    user: process.env.MySQLUser,
    password: process.env.MySQLPassword,
    database: process.env.MySQLDB,
    multipleStatements: true
})
  module.exports=db