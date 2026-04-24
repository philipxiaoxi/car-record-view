// app/router.js
module.exports = app => {
  const { router, controller } = app;

  // 认证路由
  router.post('/api/auth/login', controller.auth.login);
  router.post('/api/auth/logout', controller.auth.logout);
  router.get('/api/auth/me', controller.auth.me);
};
