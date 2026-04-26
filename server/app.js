// app.js
const { getDatabase, closeDatabase } = require('./app/service/db');
const scannerService = require('./app/service/scanner');
const bcrypt = require('bcryptjs');

module.exports = app => {
  const config = app.config;

  app.beforeStart(async () => {
    const db = getDatabase(config);
    app.logger.info('[Database] SQLite initialized');

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

  // 服务启动后检查是否有未完成的扫描任务
  app.ready(async () => {
    const task = scannerService.getTaskStatus(config);
    if (task && task.status === 'paused') {
      app.logger.info('[Scanner] Found paused scan task, resuming...');
      scannerService.resumeScan(config);
    } else if (task && task.status === 'running') {
      app.logger.info('[Scanner] Scan task already running');
    }
  });

  app.beforeClose(async () => {
    closeDatabase();
    app.logger.info('[Database] SQLite connection closed');
  });
};
