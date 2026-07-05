// app/service/transcoder.js
const fs = require('fs-extra');
const path = require('path');
const { getDatabase } = require('./db');
const ffmpegService = require('./ffmpeg');
const { getStorageDriver } = require('./storage');

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
    const startedAtMs = Date.now();
    const result = db.prepare(`
      INSERT INTO transcode_tasks (status, started_at, started_at_ms)
      VALUES ('running', datetime('now'), ?)
    `).run(startedAtMs);
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

    let elapsedSeconds = 0;
    if (task.started_at_ms) {
      let pausedMs = task.paused_duration_ms || 0;
      // 如果当前是暂停状态，加上当前暂停的时间
      if (task.status === 'paused' && task.paused_at_ms) {
        pausedMs += Date.now() - task.paused_at_ms;
      }
      elapsedSeconds = Math.max(0, Math.floor((Date.now() - task.started_at_ms - pausedMs) / 1000));
    }

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
      elapsedSeconds: elapsedSeconds,
      errorMessage: task.error_message,
    };
  }

  // 获取缓存路径
  getCachePaths(filename) {
    const cacheDir = process.env.CACHE_DIR
      ? path.join(process.env.CACHE_DIR, 'cache')
      : path.join(__dirname, '../../cache');
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

    const storage = getStorageDriver(config);
    const type = filename.includes('F.ts') ? 'F' : 'R';
    const remotePath = type + '/' + filename;

    if (!await storage.fileExists(remotePath)) {
      return { error: '源文件不存在' };
    }

    const { mp4Path, coverPath } = this.getCachePaths(filename);
    const tempDir = process.env.CACHE_DIR ? path.join(process.env.CACHE_DIR, 'cache/remote') : path.join(__dirname, '../../cache/remote');
    const tempTsPath = path.join(tempDir, filename);

    try {
      let sourcePath;

      if (storage.type === 'local') {
        sourcePath = storage.getLocalPath(remotePath);
      } else {
        // 下载远程文件到临时目录
        await storage.downloadFile(remotePath, tempTsPath);
        sourcePath = tempTsPath;
      }

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
    } finally {
      // 清理临时文件
      if (storage.type !== 'local') {
        await fs.remove(tempTsPath).catch(() => {});
      }
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

    // 获取当前任务进度（用于恢复转码）
    const task = db.prepare('SELECT processed_files, success_count, failed_count FROM transcode_tasks WHERE id = ?').get(taskId);
    let processed = task.processed_files || 0;
    let successCount = task.success_count || 0;
    let failedCount = task.failed_count || 0;

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
    const db = getDatabase(config);
    const task = this.getTaskStatus(config);
    if (!task || task.status !== 'running') {
      return { error: '没有运行中的任务' };
    }
    this.pauseRequested = true;

    // 记录暂停开始时间
    db.prepare(`UPDATE transcode_tasks SET paused_at_ms = ? WHERE id = ?`).run(Date.now(), task.id);

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

    // 计算本次暂停时长并累加
    let pausedDurationMs = task.paused_duration_ms || 0;
    if (task.paused_at_ms) {
      pausedDurationMs += Date.now() - task.paused_at_ms;
    }

    this.currentTask = task.id;
    this.pauseRequested = false;
    this.stopRequested = false;

    db.prepare(`UPDATE transcode_tasks SET status = 'running', paused_at_ms = NULL, paused_duration_ms = ? WHERE id = ?`).run(pausedDurationMs, task.id);

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
      return { error: '没有运行中或暂停的任务' };
    }
    this.stopRequested = true;
    return { message: '正在停止' };
  }

  // 获取失败文件列表
  getFailedFiles(config) {
    const db = getDatabase(config);

    // 获取最近一个已完成的任务
    const task = db.prepare(`
      SELECT id FROM transcode_tasks
      WHERE status = 'completed'
      ORDER BY id DESC LIMIT 1
    `).get();

    if (!task) return [];

    return db.prepare(`
      SELECT filename, error_message, created_at
      FROM transcode_errors
      WHERE task_id = ?
      ORDER BY created_at DESC
    `).all(task.id);
  }

  // 重试失败文件
  async retryFailed(config) {
    const db = getDatabase(config);

    // 获取最近一个任务的失败文件
    const task = db.prepare(`
      SELECT id FROM transcode_tasks
      WHERE status = 'completed'
      ORDER BY id DESC LIMIT 1
    `).get();

    if (!task) {
      return { error: '没有已完成的任务' };
    }

    const failedFiles = db.prepare(`
      SELECT filename FROM transcode_errors
      WHERE task_id = ?
    `).all(task.id);

    if (failedFiles.length === 0) {
      return { message: '没有失败文件需要重试' };
    }

    // 创建新任务
    const newTaskId = this.createTask(config);
    this.currentTask = newTaskId;
    this.pauseRequested = false;
    this.stopRequested = false;

    // 异步执行重试
    this.retryFiles(newTaskId, failedFiles.map(f => f.filename), config).catch(err => {
      console.error('Retry error:', err);
      db.prepare(`
        UPDATE transcode_tasks
        SET status = 'error', error_message = ?, finished_at = datetime('now')
        WHERE id = ?
      `).run(err.message, newTaskId);
    });

    return this.getTaskDetail(newTaskId, config);
  }

  // 重试指定文件
  async retryFiles(taskId, filenames, config) {
    const db = getDatabase(config);

    const totalFiles = filenames.length;
    this.updateTaskProgress(taskId, { total_files: totalFiles }, config);

    // 获取当前任务进度（用于恢复）
    const task = db.prepare('SELECT processed_files, success_count, failed_count FROM transcode_tasks WHERE id = ?').get(taskId);
    let processed = task.processed_files || 0;
    let successCount = task.success_count || 0;
    let failedCount = task.failed_count || 0;

    for (const filename of filenames) {
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
          // 成功后删除对应的错误记录
          db.prepare('DELETE FROM transcode_errors WHERE filename = ?').run(filename);
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
}

module.exports = new TranscoderService();
