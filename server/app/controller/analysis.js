// server/app/controller/analysis.js
'use strict';

const Controller = require('egg').Controller;
const analysisService = require('../service/analysis');

class AnalysisController extends Controller {
  // 创建分析任务
  async create() {
    const { ctx, app } = this;
    const { timestamp } = ctx.params;
    const { cameraType } = ctx.request.body;

    if (!['front', 'rear'].includes(cameraType)) {
      ctx.status = 400;
      ctx.body = { error: '无效的摄像头类型，必须是 front 或 rear' };
      return;
    }

    try {
      const result = await analysisService.createTask(timestamp, cameraType, app.config);
      ctx.body = result;
    } catch (err) {
      ctx.status = 500;
      ctx.body = { error: err.message };
    }
  }

  // 获取分析结果
  async show() {
    const { ctx, app } = this;
    const { timestamp, cameraType } = ctx.params;

    if (!cameraType) {
      ctx.status = 400;
      ctx.body = { error: '缺少 cameraType 参数' };
      return;
    }

    try {
      const task = await analysisService.getTask(timestamp, cameraType, app.config);
      if (!task) {
        ctx.status = 404;
        ctx.body = { error: '分析任务不存在' };
        return;
      }

      // 解析 result JSON
      if (task.result) {
        try {
          task.result = JSON.parse(task.result);
        } catch (e) {
          // 保持原始字符串
        }
      }

      ctx.body = task;
    } catch (err) {
      ctx.status = 500;
      ctx.body = { error: err.message };
    }
  }

  // 获取视频的所有分析结果
  async index() {
    const { ctx, app } = this;
    const { timestamp } = ctx.params;

    try {
      const tasks = await analysisService.getAllTasks(timestamp, app.config);
      // 解析 result JSON
      for (const task of tasks) {
        if (task.result) {
          try {
            task.result = JSON.parse(task.result);
          } catch (e) {
            // 保持原始字符串
          }
        }
      }
      ctx.body = tasks;
    } catch (err) {
      ctx.status = 500;
      ctx.body = { error: err.message };
    }
  }

  // 取消分析任务
  async destroy() {
    const { ctx, app } = this;
    const { timestamp, cameraType } = ctx.params;

    if (!cameraType) {
      ctx.status = 400;
      ctx.body = { error: '缺少 cameraType 参数' };
      return;
    }

    try {
      await analysisService.cancelTask(timestamp, cameraType, app.config);
      ctx.body = { message: '分析任务已取消' };
    } catch (err) {
      ctx.status = 500;
      ctx.body = { error: err.message };
    }
  }
}

module.exports = AnalysisController;
