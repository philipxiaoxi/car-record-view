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
    const configs = db.prepare('SELECT key, value FROM config').all();
    const result = {};

    for (const c of configs) {
      result[c.key] = c.value;
    }

    return {
      videoRootDir: result.videoRootDir || config.video.rootDir,
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
