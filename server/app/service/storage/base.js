class StorageDriver {
  async listFiles(dir, pattern) {
    throw new Error('not implemented');
  }

  async fileExists(path) {
    throw new Error('not implemented');
  }

  async getFileStream(path, range) {
    throw new Error('not implemented');
  }

  async getFileStats(path) {
    throw new Error('not implemented');
  }

  async downloadFile(remotePath, localPath) {
    throw new Error('not implemented');
  }

  async downloadPartial(remotePath, localPath, maxBytes) {
    throw new Error('not implemented');
  }

  async removeFile(path) {
    throw new Error('not implemented');
  }

  close() {
  }

  get type() {
    throw new Error('not implemented');
  }
}

module.exports = StorageDriver;
