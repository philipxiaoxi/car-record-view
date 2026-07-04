const { createClient } = require('webdav');
const fs = require('fs-extra');
const path = require('path');
const StorageDriver = require('../base');

class WebDAVDriver extends StorageDriver {
  constructor(config) {
    super();
    const { url, username, password, rootDir } = config;
    this.rootDir = rootDir || '';
    this.client = createClient(url, { username, password });
  }

  get type() {
    return 'webdav';
  }

  _resolve(relativePath) {
    return this.rootDir
      ? path.posix.join(this.rootDir, relativePath)
      : relativePath;
  }

  async listFiles(dir, pattern) {
    try {
      const remotePath = this._resolve(dir);
      const items = await this.client.getDirectoryContents(remotePath);
      return items
        .filter(item => item.type === 'file')
        .map(item => path.basename(item.filename))
        .filter(f => pattern ? pattern.test(f) : true);
    } catch {
      return [];
    }
  }

  async fileExists(relativePath) {
    try {
      const remotePath = this._resolve(relativePath);
      return await this.client.exists(remotePath);
    } catch {
      return false;
    }
  }

  async getFileStream(relativePath, range) {
    const remotePath = this._resolve(relativePath);
    return this.client.createReadStream(remotePath, { range });
  }

  async getFileStats(relativePath) {
    const remotePath = this._resolve(relativePath);
    const stat = await this.client.stat(remotePath);
    return { size: stat.size, mtime: stat.lastmod ? new Date(stat.lastmod) : null };
  }

  async downloadFile(relativePath, localPath) {
    const remotePath = this._resolve(relativePath);
    await fs.ensureDir(path.dirname(localPath));
    const readStream = this.client.createReadStream(remotePath);
    const writeStream = fs.createWriteStream(localPath);
    await new Promise((resolve, reject) => {
      readStream.pipe(writeStream);
      readStream.on('error', reject);
      writeStream.on('finish', resolve);
    });
  }

  async downloadPartial(relativePath, localPath, maxBytes) {
    const remotePath = this._resolve(relativePath);
    await fs.ensureDir(path.dirname(localPath));
    const readStream = this.client.createReadStream(remotePath, {
      range: { start: 0, end: maxBytes - 1 },
    });
    const writeStream = fs.createWriteStream(localPath);
    await new Promise((resolve, reject) => {
      readStream.pipe(writeStream);
      readStream.on('error', reject);
      writeStream.on('finish', resolve);
    });
  }

  async removeFile(relativePath) {
    const remotePath = this._resolve(relativePath);
    await this.client.deleteFile(remotePath);
  }

  async testConnection() {
    try {
      const remotePath = this._resolve('/');
      await this.client.getDirectoryContents(remotePath);
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  }
}

module.exports = WebDAVDriver;
