// app/controller/auth.js
const Controller = require('egg').Controller;
const authService = require('../service/auth');

class AuthController extends Controller {
  async login() {
    const { ctx } = this;
    const { username, password } = ctx.request.body;

    if (!username || !password) {
      ctx.status = 400;
      ctx.body = { error: '用户名和密码不能为空' };
      return;
    }

    const result = await authService.login(username, password, ctx.app.config);

    if (result.error) {
      ctx.status = 401;
      ctx.body = { error: result.error };
      return;
    }

    ctx.body = result;
  }

  async logout() {
    const { ctx } = this;
    ctx.body = { message: '登出成功' };
  }

  async me() {
    const { ctx } = this;
    const userId = ctx.state.user.id;
    const result = await authService.getCurrentUser(userId, ctx.app.config);

    if (result.error) {
      ctx.status = 404;
      ctx.body = { error: result.error };
      return;
    }

    ctx.body = result;
  }
}

module.exports = AuthController;
