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

    // 设置 HttpOnly Cookie
    ctx.cookies.set('token', result.token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      path: '/',
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7天
    });

    // 只返回用户信息，不返回 token
    ctx.body = { user: result.user };
  }

  async logout() {
    const { ctx } = this;
    // 清除 Cookie
    ctx.cookies.set('token', null, {
      path: '/',
      maxAge: 0,
    });
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
