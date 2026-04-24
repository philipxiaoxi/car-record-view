// app/middleware/admin.js
module.exports = (options, app) => {
  return async function adminMiddleware(ctx, next) {
    const user = ctx.state.user;

    if (!user || user.role !== 'admin') {
      ctx.status = 403;
      ctx.body = { error: '需要管理员权限' };
      return;
    }

    await next();
  };
};
