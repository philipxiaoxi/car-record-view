// app/service/scanner.js
const fs = require('fs-extra');
const path = require('path');
const { getDatabase } = require('./db');
const ffmpegService = require('./ffmpeg');

class ScannerService {
  async scanVideos(config) {
    const db = getDatabase(config);
    const rootDir = config.video.rootDir;
    const fDir = path.join(rootDir, 'F');
    const rDir = path.join(rootDir, 'R');

    const results = { added: 0, updated: 0, removed: 0, errors: [] };

    const existingFiles = db.prepare('SELECT filename FROM videos').all();
    const existingSet = new Set(existingFiles.map(f => f.filename));
    const foundFiles = new Set();

    if (await fs.pathExists(fDir)) {
      await this.scanDirectory(fDir, 'F', db, existingSet, foundFiles, results, config);
    }

    if (await fs.pathExists(rDir)) {
      await this.scanDirectory(rDir, 'R', db, existingSet, foundFiles, results, config);
    }

    for (const filename of existingSet) {
      if (!foundFiles.has(filename)) {
        db.prepare('DELETE FROM videos WHERE filename = ?').run(filename);
        results.removed++;
      }
    }

    return results;
  }

  async scanDirectory(dirPath, type, db, existingSet, foundFiles, results, config) {
    const files = await fs.readdir(dirPath);
    const tsFiles = files.filter(f => f.endsWith('.ts'));

    for (const filename of tsFiles) {
      foundFiles.add(filename);
      const filePath = path.join(dirPath, filename);

      try {
        const timestamp = this.parseFilename(filename);
        if (!timestamp) {
          results.errors.push({ filename, error: '无效的文件名格式' });
          continue;
        }

        if (existingSet.has(filename)) {
          continue;
        }

        const metadata = await ffmpegService.getMetadata(filePath);

        db.prepare(`
          INSERT INTO videos (filename, timestamp, type, duration, resolution, bitrate)
          VALUES (?, ?, ?, ?, ?, ?)
        `).run(
          filename,
          timestamp.toISOString(),
          type,
          Math.round(metadata.duration),
          metadata.resolution,
          metadata.bitrate
        );

        results.added++;
      } catch (err) {
        results.errors.push({ filename, error: err.message });
      }
    }
  }

  parseFilename(filename) {
    const match = filename.match(/^V(\d{8})-(\d{6})([FR])\.ts$/);
    if (!match) return null;

    const [, dateStr, timeStr] = match;
    const year = parseInt(dateStr.substring(0, 4));
    const month = parseInt(dateStr.substring(4, 6)) - 1;
    const day = parseInt(dateStr.substring(6, 8));
    const hour = parseInt(timeStr.substring(0, 2));
    const minute = parseInt(timeStr.substring(2, 4));
    const second = parseInt(timeStr.substring(4, 6));

    return new Date(year, month, day, hour, minute, second);
  }
}

module.exports = new ScannerService();
