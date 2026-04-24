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

  // 服务启动后异步扫描，不阻塞启动
  app.ready(async () => {
    app.logger.info('[Scanner] Starting video scan in background...');
    setImmediate(async () => {
      try {
        const results = await scannerService.scanVideos(config);
        app.logger.info('[Scanner] Scan completed: added=%d, removed=%d, errors=%d',
          results.added, results.removed, results.errors.length);
        if (results.errors.length > 0) {
          app.logger.warn('[Scanner] Errors:', results.errors.slice(0, 5));
        }
      } catch (err) {
        app.logger.error('[Scanner] Scan failed:', err);
      }
    });
  });

  app.beforeClose(async () => {
    closeDatabase();
    app.logger.info('[Database] SQLite connection closed');
  });
};
