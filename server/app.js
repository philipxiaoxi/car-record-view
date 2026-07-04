// app.js
const { getDatabase, closeDatabase } = require('./app/service/db');
const scannerService = require('./app/service/scanner');
const { getStorageDriver } = require('./app/service/storage');
const bcrypt = require('bcryptjs');

module.exports = app => {
  const config = app.config;

  app.beforeStart(async () => {
    const db = getDatabase(config);
    app.logger.info('[Database] SQLite initialized');

    // 校验存储连接
    try {
      const storage = getStorageDriver(config);
      if (storage.type === 'webdav' && typeof storage.testConnection === 'function') {
        const result = await storage.testConnection();
        if (result.ok) {
          app.logger.info('[Storage] WebDAV 连接正常');
        } else {
          app.logger.warn('[Storage] WebDAV 连接失败: %s', result.error);
        }
      } else {
        app.logger.info('[Storage] 使用本地文件系统');
      }
    } catch (err) {
      app.logger.warn('[Storage] 存储初始化异常: %s', err.message);
    }

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

  // 服务启动后检查是否有未完成的扫描/转码任务
  app.ready(async () => {
    const db = getDatabase(config);

    // 将卡住的 running 任务重置为 paused，让用户手动操作
    db.prepare(`
      UPDATE scan_tasks SET status = 'paused' WHERE status = 'running'
    `).run();
    db.prepare(`
      UPDATE transcode_tasks SET status = 'paused' WHERE status = 'running'
    `).run();

    const scanTask = scannerService.getTaskStatus(config);
    if (scanTask && scanTask.status === 'paused') {
      app.logger.info('[Scanner] 发现未完成的任务（已暂停），可手动继续');
    }
  });

  app.beforeClose(async () => {
    closeDatabase();
    app.logger.info('[Database] SQLite connection closed');
  });
};
