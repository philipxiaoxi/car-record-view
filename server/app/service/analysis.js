// server/app/service/analysis.js
'use strict';

const { getDatabase } = require('./db');
const ArkService = require('./ark');
const videoService = require('./video');

// 分析提示词
const ANALYSIS_PROMPT = `你是一个行车安全分析专家。请分析这段行车记录仪视频，识别以下风险情况：

1. 碰撞风险：检测可能发生碰撞的危险情况
2. 车距分析：分析与前车距离是否过近
3. 车道偏离：检测是否有压线、偏离车道的情况
4. 行人/障碍物：识别视频中的行人、非机动车等潜在风险

请以 JSON 格式输出分析结果，格式如下：
{
  "summary": "整体风险概述",
  "risk_level": "low|medium|high",
  "events": [
    {
      "start_time": "HH:mm:ss",
      "end_time": "HH:mm:ss",
      "event": "事件描述",
      "risk_type": "collision|distance|lane|pedestrian",
      "danger": true|false,
      "description": "详细描述"
    }
  ]
}

只输出 JSON，不要有其他内容。`;

class AnalysisService {
  // 创建分析任务
  async createTask(videoTimestamp, cameraType, config) {
    const db = getDatabase(config);

    // 检查是否已存在分析结果
    const existing = db.prepare(
      'SELECT * FROM video_analysis WHERE video_timestamp = ? AND camera_type = ?'
    ).get(videoTimestamp, cameraType);

    if (existing && existing.status === 'completed') {
      return { id: existing.id, status: 'completed', message: '已有分析结果' };
    }

    if (existing && existing.status === 'processing') {
      return { id: existing.id, status: 'processing', message: '正在分析中' };
    }

    if (existing && existing.status === 'pending') {
      return { id: existing.id, status: 'pending', message: '任务已创建，等待处理' };
    }

    // 如果已存在失败的任务，删除后重新创建
    if (existing && existing.status === 'failed') {
      db.prepare(
        'DELETE FROM video_analysis WHERE id = ?'
      ).run(existing.id);
    }

    // 创建新任务
    const result = db.prepare(
      `INSERT INTO video_analysis (video_timestamp, camera_type, status) VALUES (?, ?, 'pending')`
    ).run(videoTimestamp, cameraType);

    return { id: result.lastInsertRowid, status: 'pending', message: '分析任务已创建' };
  }

  // 获取任务状态/结果
  async getTask(videoTimestamp, cameraType, config) {
    const db = getDatabase(config);
    return db.prepare(
      'SELECT * FROM video_analysis WHERE video_timestamp = ? AND camera_type = ?'
    ).get(videoTimestamp, cameraType);
  }

  // 获取所有任务状态
  async getAllTasks(videoTimestamp, config) {
    const db = getDatabase(config);
    return db.prepare(
      'SELECT * FROM video_analysis WHERE video_timestamp = ?'
    ).all(videoTimestamp);
  }

  // 取消任务
  async cancelTask(videoTimestamp, cameraType, config) {
    const db = getDatabase(config);
    db.prepare(
      `DELETE FROM video_analysis WHERE video_timestamp = ? AND camera_type = ? AND status = 'pending'`
    ).run(videoTimestamp, cameraType);
  }

  // 处理任务队列（定时调用）
  async processQueue(config) {
    const db = getDatabase(config);

    // 检查是否有正在处理的任务
    const processing = db.prepare(
      `SELECT * FROM video_analysis WHERE status = 'processing' LIMIT 1`
    ).get();

    if (processing) {
      console.log('[Analysis] 已有任务正在处理中');
      return;
    }

    // 获取一个待处理的任务
    const task = db.prepare(
      `SELECT * FROM video_analysis WHERE status = 'pending' ORDER BY created_at LIMIT 1`
    ).get();

    if (!task) return;

    try {
      await this.processTask(task.id, config);
    } catch (err) {
      console.error(`[Analysis] 处理任务 ${task.id} 失败:`, err);
    }
  }

  // 处理单个任务
  async processTask(taskId, config) {
    const db = getDatabase(config);

    // 更新状态为 processing
    db.prepare(
      `UPDATE video_analysis SET status = 'processing' WHERE id = ?`
    ).run(taskId);

    try {
      const task = db.prepare('SELECT * FROM video_analysis WHERE id = ?').get(taskId);

      // 获取视频信息
      const video = await videoService.getVideoByTimestamp(task.video_timestamp, config);
      if (!video) {
        throw new Error('视频不存在');
      }

      const camera = task.camera_type === 'front' ? video.front : video.rear;
      if (!camera) {
        throw new Error('摄像头视频不存在');
      }

      // 获取 MP4 缓存路径
      const mp4Result = await videoService.getOrCreateMp4Cache(camera.filename, config);
      if (mp4Result.error) {
        throw new Error(mp4Result.error);
      }

      // 获取 AI 配置
      const aiConfig = this.getAiConfig(config, db);

      // 创建 Ark 服务实例
      const arkService = new ArkService(aiConfig);

      // 上传视频
      console.log(`[Analysis] 上传视频: ${camera.filename}`);
      const fileInfo = await arkService.uploadVideo(mp4Result.path, 0.5);

      // 保存 file_id
      db.prepare(
        `UPDATE video_analysis SET file_id = ? WHERE id = ?`
      ).run(fileInfo.id, taskId);

      // 分析视频
      console.log(`[Analysis] 分析视频: ${fileInfo.id}`);
      const response = await arkService.analyzeVideo(fileInfo.id, ANALYSIS_PROMPT);

      // 解析结果
      let result;
      try {
        const outputText = response.output || '';
        result = JSON.parse(outputText);
      } catch (parseErr) {
        console.warn('[Analysis] 解析 AI 响应失败，保存原始文本');
        result = { raw: response.output || '', parse_error: parseErr.message };
      }

      // 保存结果
      db.prepare(
        `UPDATE video_analysis SET status = 'completed', result = ?, completed_at = datetime('now') WHERE id = ?`
      ).run(JSON.stringify(result), taskId);

      console.log(`[Analysis] 任务 ${taskId} 完成`);
    } catch (err) {
      // 标记失败
      db.prepare(
        `UPDATE video_analysis SET status = 'failed', error_message = ? WHERE id = ?`
      ).run(err.message, taskId);
      console.error(`[Analysis] 任务 ${taskId} 失败:`, err);
    }
  }

  // 获取 AI 配置
  getAiConfig(config, db) {
    const keys = ['ark_api_key', 'ark_model_id', 'ark_base_url'];
    const result = {};

    for (const key of keys) {
      const row = db.prepare('SELECT value FROM config WHERE key = ?').get(key);
      if (row) {
        result[key] = row.value;
      }
    }

    return result;
  }

  // 获取队列统计
  async getQueueStats(config) {
    const db = getDatabase(config);

    const stats = db.prepare(`
      SELECT
        COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending,
        COUNT(CASE WHEN status = 'processing' THEN 1 END) as processing,
        COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed,
        COUNT(CASE WHEN status = 'failed' THEN 1 END) as failed
      FROM video_analysis
    `).get();

    const recentTasks = db.prepare(`
      SELECT id, video_timestamp, camera_type, status, created_at, completed_at, error_message
      FROM video_analysis
      ORDER BY created_at DESC
      LIMIT 20
    `).all();

    return {
      ...stats,
      tasks: recentTasks,
    };
  }
}

module.exports = new AnalysisService();
