// app/service/db.js
const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');

let db = null;

function getDatabase(config) {
  if (!db) {
    const dbPath = config.sqlite.filename;
    const dbDir = path.dirname(dbPath);

    // 确保数据库目录存在
    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true });
    }

    db = new Database(dbPath);

    // 执行初始化脚本
    const initSql = fs.readFileSync(
      path.join(__dirname, '../../database/init.sql'),
      'utf8'
    );
    db.exec(initSql);
  }
  return db;
}

function closeDatabase() {
  if (db) {
    db.close();
    db = null;
  }
}

module.exports = {
  getDatabase,
  closeDatabase,
};
