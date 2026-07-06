// app/middleware/jwt.js
const jwt = require('jsonwebtoken');

module.exports = (options, app) => {
  return async function jwtMiddleware(ctx, next) {
    // 只保护 API 路由，SPA 静态资源不受限
    if (!ctx.path.startsWith('/api/')) {
      return await next();
    }

    // 跳过登录接口
    if (ctx.path === '/api/auth/login') {
      return await next();
    }

    // 从 Cookie 读取 token
    const token = ctx.cookies.get('token');

    if (!token) {
      ctx.status = 401;
      ctx.body = { error: '未登录' };
      return;
    }

    try {
      const decoded = jwt.verify(token, app.config.jwt.secret);
      ctx.state.user = decoded;
      await next();
    } catch (err) {
      ctx.status = 401;
      ctx.body = { error: '登录已过期，请重新登录' };
    }
  };
};
