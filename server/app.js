// app.js
const { getDatabase, closeDatabase } = require('./app/service/db');
const bcrypt = require('bcryptjs');

module.exports = app => {
  const config = app.config;

  // 应用启动时初始化数据库
  app.beforeStart(async () => {
    const db = getDatabase(config);
    app.logger.info('[Database] SQLite initialized');

    // 检查是否需要创建初始管理员
    const admin = config.admin;
    const existingAdmin = db.prepare('SELECT id FROM users WHERE username = ?').get(admin.username);

    if (!existingAdmin) {
      const hashedPassword = await bcrypt.hash(admin.password, 10);
      db.prepare(
        'INSERT INTO users (username, password, role) VALUES (?, ?, ?)'
      ).run(admin.username, hashedPassword, 'admin');
      app.logger.info('[Database] Initial admin user created');
    }
  });

  // 应用关闭时关闭数据库连接
  app.beforeClose(async () => {
    closeDatabase();
    app.logger.info('[Database] SQLite connection closed');
  });
};
