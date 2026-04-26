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
}

module.exports = new TranscoderService();
