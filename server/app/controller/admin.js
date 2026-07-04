// app/controller/admin.js
const Controller = require('egg').Controller;
const adminService = require('../service/admin');
const scannerService = require('../service/scanner');
const transcoderService = require('../service/transcoder');

class AdminController extends Controller {
  async scanVideos() {
    const { ctx } = this;
    const results = await scannerService.scanVideos(ctx.app.config);
    ctx.body = results;
  }
  async getUsers() {
    const { ctx } = this;
    const users = await adminService.getUserList(ctx.app.config);
    ctx.body = { list: users };
  }

  async addUser() {
    const { ctx } = this;
    const { username, password, role } = ctx.request.body;

    if (!username || !password) {
      ctx.status = 400;
      ctx.body = { error: '用户名和密码不能为空' };
      return;
    }

    const result = await adminService.addUser(username, password, role, ctx.app.config);

    if (result.error) {
      ctx.status = 400;
      ctx.body = { error: result.error };
      return;
    }

    ctx.body = result;
  }

  async deleteUser() {
    const { ctx } = this;
    const { id } = ctx.params;
    const currentUserId = ctx.state.user.id;

    if (parseInt(id) === currentUserId) {
      ctx.status = 400;
      ctx.body = { error: '不能删除自己' };
      return;
    }

    const result = await adminService.deleteUser(parseInt(id), ctx.app.config);

    if (result.error) {
      ctx.status = 404;
      ctx.body = { error: result.error };
      return;
    }

    ctx.body = result;
  }

  async resetPassword() {
    const { ctx } = this;
    const { id } = ctx.params;
    const { password } = ctx.request.body;

    if (!password) {
      ctx.status = 400;
      ctx.body = { error: '密码不能为空' };
      return;
    }

    const result = await adminService.resetPassword(parseInt(id), password, ctx.app.config);

    if (result.error) {
      ctx.status = 404;
      ctx.body = { error: result.error };
      return;
    }

    ctx.body = result;
  }

  async getConfig() {
    const { ctx } = this;
    const config = await adminService.getConfig(ctx.app.config);
    ctx.body = config;
  }

  async updateConfig() {
    const { ctx } = this;
    const { videoRootDir, storageType, webdavUrl, webdavUsername, webdavPassword, webdavRootDir } = ctx.request.body;

    if (videoRootDir) {
      await adminService.updateConfig('videoRootDir', videoRootDir, ctx.app.config);
      ctx.app.config.video.rootDir = videoRootDir;
    }

    const storageChanged = storageType !== undefined || webdavUrl !== undefined || webdavUsername !== undefined ||
      webdavPassword !== undefined || webdavRootDir !== undefined;

    if (storageChanged) {
      await adminService.updateStorageConfig(
        { storageType, webdavUrl, webdavUsername, webdavPassword, webdavRootDir },
        ctx.app.config
      );
      const { resetStorageDriver } = require('../service/storage');
      resetStorageDriver();
    }

    ctx.body = { message: '配置更新成功' };
  }

  async clearCache() {
    const { ctx } = this;
    const { type = 'all' } = ctx.request.body;
    const result = await adminService.clearCache(type, ctx.app.config);
    ctx.body = result;
  }

  async startScan() {
    const { ctx } = this;

    // 检查是否有运行中的转码任务
    const transcodeTask = transcoderService.getTaskStatus(ctx.app.config);
    if (transcodeTask && transcodeTask.status === 'running') {
      ctx.status = 400;
      ctx.body = { error: '转码任务正在进行中，请等待完成后再启动扫描' };
      return;
    }

    const result = await scannerService.startScan(ctx.app.config);
    ctx.body = result;
  }

  async getScanStatus() {
    const { ctx } = this;
    const task = scannerService.getTaskStatus(ctx.app.config);
    if (!task) {
      ctx.body = { status: 'idle' };
      return;
    }
    ctx.body = scannerService.getTaskDetail(task.id, ctx.app.config);
  }

  async pauseScan() {
    const { ctx } = this;
    const result = scannerService.pauseScan(ctx.app.config);
    ctx.body = result;
  }

  async resumeScan() {
    const { ctx } = this;
    const result = scannerService.resumeScan(ctx.app.config);
    ctx.body = result;
  }

  async stopScan() {
    const { ctx } = this;
    const result = scannerService.stopScan(ctx.app.config);
    ctx.body = result;
  }

  async rescan() {
    const { ctx } = this;
    const result = await scannerService.rescan(ctx.app.config);
    ctx.body = result;
  }

  async startTranscode() {
    const { ctx } = this;

    // 检查是否有运行中的扫描任务
    const scanTask = scannerService.getTaskStatus(ctx.app.config);
    if (scanTask && scanTask.status === 'running') {
      ctx.status = 400;
      ctx.body = { error: '扫描任务正在进行中，请等待完成后再启动转码' };
      return;
    }

    const result = await transcoderService.startTranscode(ctx.app.config);
    ctx.body = result;
  }

  async getTranscodeStatus() {
    const { ctx } = this;
    const task = transcoderService.getTaskStatus(ctx.app.config);
    if (!task) {
      ctx.body = { status: 'idle' };
      return;
    }
    ctx.body = transcoderService.getTaskDetail(task.id, ctx.app.config);
  }

  async pauseTranscode() {
    const { ctx } = this;
    const result = transcoderService.pauseTranscode(ctx.app.config);
    ctx.body = result;
  }

  async resumeTranscode() {
    const { ctx } = this;
    const result = transcoderService.resumeTranscode(ctx.app.config);
    ctx.body = result;
  }

  async stopTranscode() {
    const { ctx } = this;
    const result = transcoderService.stopTranscode(ctx.app.config);
    ctx.body = result;
  }

  async getTranscodeErrors() {
    const { ctx } = this;
    const errors = transcoderService.getFailedFiles(ctx.app.config);
    ctx.body = { list: errors };
  }

  async retryTranscode() {
    const { ctx } = this;
    const result = await transcoderService.retryFailed(ctx.app.config);
    ctx.body = result;
  }

  // 获取 AI 配置
  async getAiConfig() {
    const { ctx, app } = this;
    const db = require('../service/db').getDatabase(app.config);

    const keys = ['ark_api_key', 'ark_model_id', 'ark_base_url'];
    const config = {};

    for (const key of keys) {
      const row = db.prepare('SELECT value FROM config WHERE key = ?').get(key);
      if (row) {
        if (key === 'ark_api_key') {
          // 脱敏显示
          config[key] = row.value ? '***' + row.value.slice(-4) : '';
        } else {
          config[key] = row.value;
        }
      }
    }

    ctx.body = config;
  }

  // 更新 AI 配置
  async updateAiConfig() {
    const { ctx, app } = this;
    const db = require('../service/db').getDatabase(app.config);

    const { ark_api_key, ark_model_id, ark_base_url } = ctx.request.body;

    const stmt = db.prepare(
      `INSERT OR REPLACE INTO config (key, value, updated_at) VALUES (?, ?, datetime('now'))`
    );

    if (ark_api_key !== undefined && ark_api_key !== '' && !ark_api_key.startsWith('***')) {
      stmt.run('ark_api_key', ark_api_key);
    }

    if (ark_model_id !== undefined) {
      stmt.run('ark_model_id', ark_model_id);
    }

    if (ark_base_url !== undefined) {
      stmt.run('ark_base_url', ark_base_url);
    }

    ctx.body = { message: 'AI 配置已更新' };
  }

  // 获取分析任务队列
  async getAnalysisQueue() {
    const { ctx, app } = this;
    const analysisService = require('../service/analysis');

    const stats = await analysisService.getQueueStats(app.config);
    ctx.body = stats;
  }
}

module.exports = AdminController;
