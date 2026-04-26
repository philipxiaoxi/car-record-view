// app/router.js
module.exports = app => {
  const { router, controller } = app;
  const adminMiddleware = app.middleware.admin({}, app);

  // 认证路由
  router.post('/api/auth/login', controller.auth.login);
  router.post('/api/auth/logout', controller.auth.logout);
  router.get('/api/auth/me', controller.auth.me);

  // 视频路由
  router.get('/api/videos', controller.video.list);
  router.get('/api/videos/:timestamp', controller.video.detail);
  router.get('/api/videos/:filename/stream', controller.video.stream);
  router.get('/api/videos/:filename/cover', controller.video.cover);

  // 播放历史路由
  router.get('/api/history', controller.history.list);
  router.post('/api/history', controller.history.add);

  // 管理后台路由（需要管理员权限）
  // 扫描路由
  router.post('/api/admin/scan', adminMiddleware, controller.admin.startScan);
  router.get('/api/admin/scan/status', adminMiddleware, controller.admin.getScanStatus);
  router.post('/api/admin/scan/pause', adminMiddleware, controller.admin.pauseScan);
  router.post('/api/admin/scan/resume', adminMiddleware, controller.admin.resumeScan);
  router.post('/api/admin/scan/stop', adminMiddleware, controller.admin.stopScan);
  router.post('/api/admin/scan/rescan', adminMiddleware, controller.admin.rescan);
  // 用户管理路由
  router.get('/api/admin/users', adminMiddleware, controller.admin.getUsers);
  router.post('/api/admin/users', adminMiddleware, controller.admin.addUser);
  router.delete('/api/admin/users/:id', adminMiddleware, controller.admin.deleteUser);
  router.put('/api/admin/users/:id/password', adminMiddleware, controller.admin.resetPassword);
  router.get('/api/admin/config', adminMiddleware, controller.admin.getConfig);
  router.put('/api/admin/config', adminMiddleware, controller.admin.updateConfig);
  router.post('/api/admin/cache/clear', adminMiddleware, controller.admin.clearCache);
};
