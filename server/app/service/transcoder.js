// app/service/transcoder.js
const fs = require('fs-extra');
const path = require('path');
const { getDatabase } = require('./db');
const ffmpegService = require('./ffmpeg');

class TranscoderService {
  constructor() {
    this.currentTask = null;
    this.pauseRequested = false;
    this.stopRequested = false;
  }

  // 获取当前任务状态
  getTaskStatus(config) {
    const db = getDatabase(config);
    const task = db.prepare(`
      SELECT * FROM transcode_tasks
      WHERE status IN ('running', 'paused')
      ORDER BY id DESC LIMIT 1
    `).get();
    return task || null;
  }

  // 创建新任务
  createTask(config) {
    const db = getDatabase(config);
    const result = db.prepare(`
      INSERT INTO transcode_tasks (status, started_at)
      VALUES ('running', datetime('now'))
    `).run();
    return result.lastInsertRowid;
  }

  // 更新任务进度
  updateTaskProgress(taskId, data, config) {
    const db = getDatabase(config);
    const sets = [];
    const values = [];

    for (const [key, value] of Object.entries(data)) {
      sets.push(`${key} = ?`);
      values.push(value);
    }
    values.push(taskId);

    db.prepare(`UPDATE transcode_tasks SET ${sets.join(', ')} WHERE id = ?`).run(...values);
  }

  // 获取任务详情（用于 API 响应）
  getTaskDetail(taskId, config) {
    const db = getDatabase(config);
    const task = db.prepare('SELECT * FROM transcode_tasks WHERE id = ?').get(taskId);
    if (!task) return null;

    const elapsed = task.started_at
      ? Math.floor((Date.now() - new Date(task.started_at).getTime()) / 1000)
      : 0;

    return {
      taskId: task.id,
      status: task.status,
      totalFiles: task.total_files,
      processedFiles: task.processed_files,
      successCount: task.success_count,
      failedCount: task.failed_count,
      currentFile: task.current_file,
      progress: task.total_files > 0 ? Math.round((task.processed_files / task.total_files) * 100) : 0,
      startedAt: task.started_at,
      finishedAt: task.finished_at,
      elapsedSeconds: elapsed,
      errorMessage: task.error_message,
    };
  }

  // 获取缓存路径
  getCachePaths(filename) {
    const cacheDir = path.join(__dirname, '../../cache');
    return {
      mp4Path: path.join(cacheDir, 'mp4', filename.replace('.ts', '.mp4')),
      coverPath: path.join(cacheDir, 'covers', filename.replace('.ts', '.jpg')),
    };
  }

  // 检查文件是否已转码
  async isAlreadyTranscoded(filename, config) {
    const db = getDatabase(config);
    const video = db.prepare('SELECT mp4_cached FROM videos WHERE filename = ?').get(filename);

    if (!video || video.mp4_cached !== 1) return false;

    const { mp4Path, coverPath } = this.getCachePaths(filename);
    return await fs.pathExists(mp4Path) && await fs.pathExists(coverPath);
  }

  // 记录转码错误
  recordError(taskId, filename, errorMessage, config) {
    const db = getDatabase(config);
    db.prepare(`
      INSERT INTO transcode_errors (task_id, filename, error_message)
      VALUES (?, ?, ?)
    `).run(taskId, filename, errorMessage);
  }

  // 处理单个视频文件
  async processFile(filename, config) {
    const db = getDatabase(config);

    // 获取视频信息
    const video = db.prepare('SELECT * FROM videos WHERE filename = ?').get(filename);
    if (!video) {
      return { error: '视频记录不存在' };
    }

    // 检查源文件是否存在
    const type = filename.includes('F.ts') ? 'F' : 'R';
    const sourcePath = path.join(config.video.rootDir, type, filename);

    if (!await fs.pathExists(sourcePath)) {
      return { error: '源文件不存在' };
    }

    const { mp4Path, coverPath } = this.getCachePaths(filename);

    try {
      // 转码 MP4
      await ffmpegService.convertTsToMp4(sourcePath, mp4Path);

      // 生成封面
      await ffmpegService.extractCover(sourcePath, coverPath);

      // 更新数据库
      db.prepare('UPDATE videos SET mp4_cached = 1 WHERE filename = ?').run(filename);

      return { success: true };
    } catch (err) {
      // 清理可能已创建的部分文件
      await fs.remove(mp4Path).catch(() => {});
      await fs.remove(coverPath).catch(() => {});

      return { error: err.message };
    }
  }

  // 启动转码任务
  async startTranscode(config) {
    // 检查是否有运行中的任务
    const existingTask = this.getTaskStatus(config);
    if (existingTask) {
      return this.getTaskDetail(existingTask.id, config);
    }

    const taskId = this.createTask(config);
    this.currentTask = taskId;
    this.pauseRequested = false;
    this.stopRequested = false;

    // 异步执行转码
    this.runTranscode(taskId, config).catch(err => {
      console.error('Transcode error:', err);
      const db = getDatabase(config);
      db.prepare(`
        UPDATE transcode_tasks
        SET status = 'error', error_message = ?, finished_at = datetime('now')
        WHERE id = ?
      `).run(err.message, taskId);
    });

    return this.getTaskDetail(taskId, config);
  }

  // 执行转码
  async runTranscode(taskId, config) {
    const db = getDatabase(config);

    // 获取所有需要转码的视频
    const videos = db.prepare('SELECT filename FROM videos ORDER BY timestamp DESC').all();

    // 过滤已转码文件
    const filesToTranscode = [];
    for (const v of videos) {
      if (!await this.isAlreadyTranscoded(v.filename, config)) {
        filesToTranscode.push(v.filename);
      }
    }

    const totalFiles = filesToTranscode.length;
    this.updateTaskProgress(taskId, { total_files: totalFiles }, config);

    let processed = 0;
    let successCount = 0;
    let failedCount = 0;

    for (const filename of filesToTranscode) {
      // 检查暂停/停止请求
      if (this.stopRequested) {
        this.updateTaskProgress(taskId, {
          status: 'error',
          error_message: '用户停止',
          finished_at: new Date().toISOString()
        }, config);
        return;
      }

      if (this.pauseRequested) {
        this.updateTaskProgress(taskId, { status: 'paused' }, config);
        return;
      }

      this.updateTaskProgress(taskId, { current_file: filename }, config);

      try {
        const result = await this.processFile(filename, config);

        if (result.success) {
          successCount++;
        } else {
          failedCount++;
          this.recordError(taskId, filename, result.error, config);
        }
      } catch (err) {
        failedCount++;
        this.recordError(taskId, filename, err.message, config);
      }

      processed++;
      this.updateTaskProgress(taskId, {
        processed_files: processed,
        success_count: successCount,
        failed_count: failedCount
      }, config);
    }

    // 完成
    this.updateTaskProgress(taskId, {
      status: 'completed',
      current_file: null,
      finished_at: new Date().toISOString()
    }, config);
  }

  // 暂停转码
  pauseTranscode(config) {
    const task = this.getTaskStatus(config);
    if (!task || task.status !== 'running') {
      return { error: '没有运行中的任务' };
    }
    this.pauseRequested = true;
    return { message: '正在暂停' };
  }

  // 恢复转码
  resumeTranscode(config) {
    const db = getDatabase(config);
    const task = db.prepare(`
      SELECT * FROM transcode_tasks
      WHERE status = 'paused'
      ORDER BY id DESC LIMIT 1
    `).get();

    if (!task) {
      return { error: '没有暂停的任务' };
    }

    this.currentTask = task.id;
    this.pauseRequested = false;
    this.stopRequested = false;

    db.prepare(`UPDATE transcode_tasks SET status = 'running' WHERE id = ?`).run(task.id);

    // 继续转码
    this.runTranscode(task.id, config).catch(err => {
      console.error('Resume transcode error:', err);
      db.prepare(`
        UPDATE transcode_tasks
        SET status = 'error', error_message = ?, finished_at = datetime('now')
        WHERE id = ?
      `).run(err.message, task.id);
    });

    return this.getTaskDetail(task.id, config);
  }

  // 停止转码
  stopTranscode(config) {
    const task = this.getTaskStatus(config);
    if (!task) {
      return { error: '没有运行中的任务' };
    }
    this.stopRequested = true;
    return { message: '正在停止' };
  }
}

module.exports = new TranscoderService();
