// app/controller/admin.js
const Controller = require('egg').Controller;
const adminService = require('../service/admin');
const scannerService = require('../service/scanner');

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
    const { videoRootDir } = ctx.request.body;

    if (videoRootDir) {
      await adminService.updateConfig('videoRootDir', videoRootDir, ctx.app.config);
      ctx.app.config.video.rootDir = videoRootDir;
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
}

module.exports = AdminController;
