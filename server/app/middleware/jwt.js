// app/middleware/jwt.js
const jwt = require('jsonwebtoken');

module.exports = (options, app) => {
  return async function jwtMiddleware(ctx, next) {
    // 跳过公开路径
    const publicPaths = ['/api/auth/login'];
    if (publicPaths.includes(ctx.path)) {
      return await next();
    }

    const token = ctx.get('Authorization')?.replace('Bearer ', '');

    if (!token) {
      ctx.status = 401;
      ctx.body = { error: '未提供认证令牌' };
      return;
    }

    try {
      const decoded = jwt.verify(token, app.config.jwt.secret);
      ctx.state.user = decoded;
      await next();
    } catch (err) {
      ctx.status = 401;
      ctx.body = { error: '令牌无效或已过期' };
    }
  };
};
