// app/service/video.js
const path = require('path');
const fs = require('fs-extra');
const { getDatabase } = require('./db');
const ffmpegService = require('./ffmpeg');
const transcoderService = require('./transcoder');

class VideoService {
  async getVideoList(config, page = 1, pageSize = 50) {
    const db = getDatabase(config);
    const offset = (page - 1) * pageSize;

    const videos = db.prepare(`
      SELECT
        timestamp,
        GROUP_CONCAT(CASE WHEN type = 'F' THEN filename END) as front_filename,
        GROUP_CONCAT(CASE WHEN type = 'R' THEN filename END) as rear_filename,
        MAX(duration) as duration,
        MAX(resolution) as resolution
      FROM videos
      GROUP BY timestamp
      ORDER BY timestamp DESC
      LIMIT ? OFFSET ?
    `).all(pageSize, offset);

    const total = db.prepare('SELECT COUNT(DISTINCT timestamp) as count FROM videos').get().count;

    return {
      list: videos.map(v => ({
        timestamp: v.timestamp,
        front: v.front_filename,
        rear: v.rear_filename,
        duration: v.duration,
        resolution: v.resolution,
      })),
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      },
    };
  }

  async getVideoByTimestamp(timestamp, config) {
    const db = getDatabase(config);

    const videos = db.prepare(`SELECT * FROM videos WHERE timestamp = ?`).all(timestamp);

    if (videos.length === 0) {
      return null;
    }

    const result = { timestamp };
    for (const v of videos) {
      if (v.type === 'F') {
        result.front = {
          filename: v.filename,
          duration: v.duration,
          resolution: v.resolution,
          mp4Cached: v.mp4_cached === 1,
        };
      } else {
        result.rear = {
          filename: v.filename,
          duration: v.duration,
          resolution: v.resolution,
          mp4Cached: v.mp4_cached === 1,
        };
      }
    }

    return result;
  }

  getVideoPath(filename, config) {
    const type = filename.includes('F.ts') ? 'F' : 'R';
    return path.join(config.video.rootDir, type, filename);
  }

  async getOrCreateMp4Cache(filename, config) {
    const cacheDir = path.join(__dirname, '../../cache/mp4');
    const mp4Filename = filename.replace('.ts', '.mp4');
    const mp4Path = path.join(cacheDir, mp4Filename);

    if (await fs.pathExists(mp4Path)) {
      return { path: mp4Path, cached: true };
    }

    // 检查是否有正在运行的批量转码任务
    const task = transcoderService.getTaskStatus(config);
    if (task && task.status === 'running') {
      // 等待批量转码处理这个文件（最多等待 30 秒）
      for (let i = 0; i < 6; i++) {
        await new Promise(resolve => setTimeout(resolve, 5000));
        if (await fs.pathExists(mp4Path)) {
          return { path: mp4Path, cached: true };
        }
      }
    }

    const tsPath = this.getVideoPath(filename, config);

    if (!await fs.pathExists(tsPath)) {
      return { error: '视频文件不存在' };
    }

    await ffmpegService.convertTsToMp4(tsPath, mp4Path);

    const db = getDatabase(config);
    db.prepare('UPDATE videos SET mp4_cached = 1 WHERE filename = ?').run(filename);

    return { path: mp4Path, cached: false };
  }

  async getOrCreateCover(filename, config) {
    const cacheDir = path.join(__dirname, '../../cache/covers');
    const coverFilename = filename.replace('.ts', '.jpg');
    const coverPath = path.join(cacheDir, coverFilename);

    if (await fs.pathExists(coverPath)) {
      return coverPath;
    }

    // 检查是否有正在运行的批量转码任务
    const task = transcoderService.getTaskStatus(config);
    if (task && task.status === 'running') {
      // 等待批量转码处理这个文件（最多等待 30 秒）
      for (let i = 0; i < 6; i++) {
        await new Promise(resolve => setTimeout(resolve, 5000));
        if (await fs.pathExists(coverPath)) {
          return coverPath;
        }
      }
    }

    const tsPath = this.getVideoPath(filename, config);

    if (!await fs.pathExists(tsPath)) {
      return null;
    }

    try {
      await ffmpegService.extractCover(tsPath, coverPath);
      return coverPath;
    } catch (err) {
      return path.join(__dirname, '../../public/images/default-cover.jpg');
    }
  }

  async getAdjacentVideos(timestamp, config) {
    const db = getDatabase(config);

    const prev = db.prepare(`
      SELECT DISTINCT timestamp FROM videos
      WHERE timestamp < ?
      ORDER BY timestamp DESC
      LIMIT 1
    `).get(timestamp);

    const next = db.prepare(`
      SELECT DISTINCT timestamp FROM videos
      WHERE timestamp > ?
      ORDER BY timestamp ASC
      LIMIT 1
    `).get(timestamp);

    return {
      prev: prev ? prev.timestamp : null,
      next: next ? next.timestamp : null,
    };
  }
}

module.exports = new VideoService();
