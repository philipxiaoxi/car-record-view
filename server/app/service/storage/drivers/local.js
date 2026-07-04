const fs = require('fs-extra');
const path = require('path');
const StorageDriver = require('../base');

class LocalDriver extends StorageDriver {
  constructor(config) {
    super();
    this.rootDir = config.video.rootDir;
  }

  get type() {
    return 'local';
  }

  _resolve(relativePath) {
    return path.join(this.rootDir, relativePath);
  }

  async listFiles(dir, pattern) {
    const fullPath = this._resolve(dir);
    if (!await fs.pathExists(fullPath)) {
      return [];
    }
    const files = await fs.readdir(fullPath);
    return files.filter(f => pattern ? pattern.test(f) : true);
  }

  async fileExists(relativePath) {
    return fs.pathExists(this._resolve(relativePath));
  }

  async getFileStream(relativePath, range) {
    const fullPath = this._resolve(relativePath);
    if (range) {
      const { start, end } = range;
      return fs.createReadStream(fullPath, { start, end });
    }
    return fs.createReadStream(fullPath);
  }

  async getFileStats(relativePath) {
    const fullPath = this._resolve(relativePath);
    const stat = await fs.stat(fullPath);
    return { size: stat.size, mtime: stat.mtime };
  }

  async downloadFile(remotePath, localPath) {
    const fullPath = this._resolve(remotePath);
    await fs.ensureDir(path.dirname(localPath));
    await fs.copy(fullPath, localPath);
  }

  async downloadPartial(remotePath, localPath, maxBytes) {
    const fullPath = this._resolve(remotePath);
    const stat = await fs.stat(fullPath);
    const end = Math.min(stat.size, maxBytes) - 1;
    await fs.ensureDir(path.dirname(localPath));
    const readStream = fs.createReadStream(fullPath, { start: 0, end });
    const writeStream = fs.createWriteStream(localPath);
    await new Promise((resolve, reject) => {
      readStream.pipe(writeStream);
      readStream.on('error', reject);
      writeStream.on('finish', resolve);
    });
  }

  getLocalPath(relativePath) {
    return this._resolve(relativePath);
  }

  async removeFile(relativePath) {
    await fs.remove(this._resolve(relativePath));
  }
}

module.exports = LocalDriver;
