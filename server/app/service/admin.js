// app/service/admin.js
const { getDatabase } = require('./db');
const bcrypt = require('bcryptjs');
const fs = require('fs-extra');
const path = require('path');

class AdminService {
  async getUserList(config) {
    const db = getDatabase(config);
    return db.prepare(`SELECT id, username, role, created_at FROM users ORDER BY created_at DESC`).all();
  }

  async addUser(username, password, role, config) {
    const db = getDatabase(config);
    const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
    if (existing) {
      return { error: '用户名已存在' };
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const result = db.prepare(
      'INSERT INTO users (username, password, role) VALUES (?, ?, ?)'
    ).run(username, hashedPassword, role || 'user');

    return { id: result.lastInsertRowid, username, role: role || 'user' };
  }

  async deleteUser(userId, config) {
    const db = getDatabase(config);
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
    if (!user) {
      return { error: '用户不存在' };
    }

    db.prepare('DELETE FROM play_history WHERE user_id = ?').run(userId);
    db.prepare('DELETE FROM users WHERE id = ?').run(userId);
    return { message: '删除成功' };
  }

  async resetPassword(userId, newPassword, config) {
    const db = getDatabase(config);
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
    if (!user) {
      return { error: '用户不存在' };
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    db.prepare('UPDATE users SET password = ? WHERE id = ?').run(hashedPassword, userId);
    return { message: '密码重置成功' };
  }

  async getConfig(config) {
    const db = getDatabase(config);
    const rows = db.prepare('SELECT key, value FROM config').all();
    const result = {};

    for (const c of rows) {
      result[c.key] = c.value;
    }

    const storageConfig = {
      storageType: result.storageType || 'local',
      webdavUrl: result.webdavUrl || '',
      webdavUsername: result.webdavUsername || '',
      webdavPassword: result.webdavPassword ? '***' + result.webdavPassword.slice(-4) : '',
      webdavRootDir: result.webdavRootDir || '',
    };

    // 敏感信息脱敏
    if (storageConfig.webdavUrl) {
      storageConfig.webdavUrl = '***' + storageConfig.webdavUrl.slice(-6);
    }
    if (storageConfig.webdavUsername) {
      storageConfig.webdavUsername = '***' + storageConfig.webdavUsername.slice(-4);
    }

    return {
      videoRootDir: result.videoRootDir || config.video.rootDir,
      ...storageConfig,
      cacheSize: await this.getCacheSize(),
    };
  }

  async updateConfig(key, value, config) {
    const db = getDatabase(config);
    db.prepare(`
      INSERT INTO config (key, value, updated_at) VALUES (?, ?, datetime('now'))
      ON CONFLICT(key) DO UPDATE SET value = ?, updated_at = datetime('now')
    `).run(key, value, value);
    return { message: '配置更新成功' };
  }

  async updateStorageConfig(data, config) {
    const db = getDatabase(config);
    const stmt = db.prepare(`
      INSERT INTO config (key, value, updated_at) VALUES (?, ?, datetime('now'))
      ON CONFLICT(key) DO UPDATE SET value = ?, updated_at = datetime('now')
    `);

    const updates = [];
    if (data.storageType) { stmt.run('storageType', data.storageType, data.storageType); updates.push('storageType'); }
    if (data.webdavUrl !== undefined) { stmt.run('webdavUrl', data.webdavUrl, data.webdavUrl); updates.push('webdavUrl'); }
    if (data.webdavUsername !== undefined) { stmt.run('webdavUsername', data.webdavUsername, data.webdavUsername); updates.push('webdavUsername'); }
    if (data.webdavPassword !== undefined && !data.webdavPassword.startsWith('***')) {
      stmt.run('webdavPassword', data.webdavPassword, data.webdavPassword);
      updates.push('webdavPassword');
    }
    if (data.webdavRootDir !== undefined) { stmt.run('webdavRootDir', data.webdavRootDir, data.webdavRootDir); updates.push('webdavRootDir'); }

    return { message: '存储配置更新成功', updates };
  }

  async getCacheSize() {
    const cacheDir = path.join(__dirname, '../../cache');

    const getDirSize = async (dir) => {
      let size = 0;
      if (await fs.pathExists(dir)) {
        const files = await fs.readdir(dir);
        for (const file of files) {
          const filePath = path.join(dir, file);
          const stat = await fs.stat(filePath);
          if (stat.isDirectory()) {
            size += await getDirSize(filePath);
          } else {
            size += stat.size;
          }
        }
      }
      return size;
    };

    const bytes = await getDirSize(cacheDir);
    return { bytes, mb: (bytes / 1024 / 1024).toFixed(2) };
  }

  async clearCache(type, config) {
    const db = getDatabase(config);
    const cacheDir = path.join(__dirname, '../../cache');

    if (type === 'covers' || type === 'all') {
      await fs.emptyDir(path.join(cacheDir, 'covers'));
    }

    if (type === 'mp4' || type === 'all') {
      await fs.emptyDir(path.join(cacheDir, 'mp4'));
      db.prepare('UPDATE videos SET mp4_cached = 0').run();
    }

    return { message: '缓存清理成功' };
  }
}

module.exports = new AdminService();
