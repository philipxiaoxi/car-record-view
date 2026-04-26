// app/service/scanner.js
const fs = require('fs-extra');
const path = require('path');
const { getDatabase } = require('./db');
const ffmpegService = require('./ffmpeg');

class ScannerService {
  constructor() {
    this.currentTask = null;
    this.pauseRequested = false;
    this.stopRequested = false;
  }

  // 获取当前任务状态
  getTaskStatus(config) {
    const db = getDatabase(config);
    const task = db.prepare(`
      SELECT * FROM scan_tasks
      WHERE status IN ('running', 'paused')
      ORDER BY id DESC LIMIT 1
    `).get();
    return task || null;
  }

  // 创建新任务
  createTask(config) {
    const db = getDatabase(config);
    const result = db.prepare(`
      INSERT INTO scan_tasks (status, started_at)
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

    db.prepare(`UPDATE scan_tasks SET ${sets.join(', ')} WHERE id = ?`).run(...values);
  }

  // 获取任务详情（用于 API 响应）
  getTaskDetail(taskId, config) {
    const db = getDatabase(config);
    const task = db.prepare('SELECT * FROM scan_tasks WHERE id = ?').get(taskId);
    if (!task) return null;

    const elapsed = task.started_at
      ? Math.floor((Date.now() - new Date(task.started_at).getTime()) / 1000)
      : 0;

    return {
      taskId: task.id,
      status: task.status,
      totalFiles: task.total_files,
      processedFiles: task.processed_files,
      currentFile: task.current_file,
      progress: task.total_files > 0 ? Math.round((task.processed_files / task.total_files) * 100) : 0,
      startedAt: task.started_at,
      finishedAt: task.finished_at,
      elapsedSeconds: elapsed,
      errorMessage: task.error_message,
    };
  }

  // 解析文件名获取时间戳
  parseFilename(filename) {
    const match = filename.match(/^V(\d{8})-(\d{6})[FR]\.ts$/);
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

  // 处理单个视频文件
  async processFile(filename, filePath, type, config) {
    const db = getDatabase(config);

    // 检查是否已存在
    const exists = db.prepare('SELECT 1 FROM videos WHERE filename = ?').get(filename);
    if (exists) return { skipped: true };

    const timestamp = this.parseFilename(filename);
    if (!timestamp) {
      return { error: '无效的文件名格式' };
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

    return { added: true };
  }

  // 启动扫描任务
  async startScan(config) {
    // 检查是否有运行中的任务
    const existingTask = this.getTaskStatus(config);
    if (existingTask) {
      return this.getTaskDetail(existingTask.id, config);
    }

    const taskId = this.createTask(config);
    this.currentTask = taskId;
    this.pauseRequested = false;
    this.stopRequested = false;

    // 异步执行扫描
    this.runScan(taskId, config).catch(err => {
      console.error('Scan error:', err);
      const db = getDatabase(config);
      db.prepare(`
        UPDATE scan_tasks
        SET status = 'error', error_message = ?, finished_at = datetime('now')
        WHERE id = ?
      `).run(err.message, taskId);
    });

    return this.getTaskDetail(taskId, config);
  }

  // 执行扫描
  async runScan(taskId, config) {
    const db = getDatabase(config);
    const rootDir = config.video.rootDir;
    const fDir = path.join(rootDir, 'F');
    const rDir = path.join(rootDir, 'R');

    // 获取当前任务进度（用于恢复扫描）
    const task = db.prepare('SELECT processed_files FROM scan_tasks WHERE id = ?').get(taskId);
    let processed = task.processed_files || 0;

    // 获取 F 目录所有文件
    let fFiles = [];
    if (await fs.pathExists(fDir)) {
      const files = await fs.readdir(fDir);
      fFiles = files.filter(f => f.endsWith('.ts'));
    }

    const totalFiles = fFiles.length;
    this.updateTaskProgress(taskId, { total_files: totalFiles }, config);

    for (const filename of fFiles) {
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

      const fPath = path.join(fDir, filename);

      try {
        // 处理 F 文件
        await this.processFile(filename, fPath, 'F', config);

        // 查找并处理对应的 R 文件
        const rFilename = filename.replace('F.ts', 'R.ts');
        const rPath = path.join(rDir, rFilename);

        if (await fs.pathExists(rPath)) {
          await this.processFile(rFilename, rPath, 'R', config);
        }
      } catch (err) {
        console.error(`Error processing ${filename}:`, err);
      }

      processed++;
      this.updateTaskProgress(taskId, { processed_files: processed }, config);
    }

    // 清理不存在的文件
    await this.cleanupMissingFiles(config);

    // 完成
    this.updateTaskProgress(taskId, {
      status: 'completed',
      current_file: null,
      finished_at: new Date().toISOString()
    }, config);
  }

  // 清理数据库中不存在的文件
  async cleanupMissingFiles(config) {
    const db = getDatabase(config);
    const rootDir = config.video.rootDir;
    const fDir = path.join(rootDir, 'F');
    const rDir = path.join(rootDir, 'R');

    const videos = db.prepare('SELECT filename FROM videos').all();

    for (const v of videos) {
      const type = v.filename.includes('F.ts') ? 'F' : 'R';
      const dir = type === 'F' ? fDir : rDir;
      const filePath = path.join(dir, v.filename);

      if (!(await fs.pathExists(filePath))) {
        db.prepare('DELETE FROM videos WHERE filename = ?').run(v.filename);
      }
    }
  }

  // 暂停扫描
  pauseScan(config) {
    const task = this.getTaskStatus(config);
    if (!task || task.status !== 'running') {
      return { error: '没有运行中的任务' };
    }
    this.pauseRequested = true;
    return { message: '正在暂停' };
  }

  // 恢复扫描
  resumeScan(config) {
    const db = getDatabase(config);
    const task = db.prepare(`
      SELECT * FROM scan_tasks
      WHERE status = 'paused'
      ORDER BY id DESC LIMIT 1
    `).get();

    if (!task) {
      return { error: '没有暂停的任务' };
    }

    this.currentTask = task.id;
    this.pauseRequested = false;
    this.stopRequested = false;

    db.prepare(`UPDATE scan_tasks SET status = 'running' WHERE id = ?`).run(task.id);

    // 继续扫描
    this.runScan(task.id, config).catch(err => {
      console.error('Resume scan error:', err);
      db.prepare(`
        UPDATE scan_tasks
        SET status = 'error', error_message = ?, finished_at = datetime('now')
        WHERE id = ?
      `).run(err.message, task.id);
    });

    return this.getTaskDetail(task.id, config);
  }

  // 停止扫描
  stopScan(config) {
    const task = this.getTaskStatus(config);
    if (!task) {
      return { error: '没有运行中的任务' };
    }
    this.stopRequested = true;
    return { message: '正在停止' };
  }

  // 重新扫描（清除已有数据）
  async rescan(config) {
    const db = getDatabase(config);

    // 停止当前任务
    this.stopRequested = true;

    // 清空视频表
    db.prepare('DELETE FROM videos').run();

    // 清空任务表
    db.prepare('DELETE FROM scan_tasks').run();

    // 启动新扫描
    return this.startScan(config);
  }
}

module.exports = new ScannerService();
