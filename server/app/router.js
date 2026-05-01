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

  // 收藏路由
  router.get('/api/favorites', controller.favorite.list);
  router.post('/api/favorites', controller.favorite.add);
  router.delete('/api/favorites/:timestamp', controller.favorite.remove);

  // 视频分析路由
  router.post('/api/videos/:timestamp/analysis', controller.analysis.create);
  router.get('/api/videos/:timestamp/analysis', controller.analysis.index);
  router.get('/api/videos/:timestamp/analysis/:cameraType', controller.analysis.show);
  router.delete('/api/videos/:timestamp/analysis', controller.analysis.destroy);

  // 管理后台路由（需要管理员权限）
  // 扫描路由
  router.post('/api/admin/scan', adminMiddleware, controller.admin.startScan);
  router.get('/api/admin/scan/status', adminMiddleware, controller.admin.getScanStatus);
  router.post('/api/admin/scan/pause', adminMiddleware, controller.admin.pauseScan);
  router.post('/api/admin/scan/resume', adminMiddleware, controller.admin.resumeScan);
  router.post('/api/admin/scan/stop', adminMiddleware, controller.admin.stopScan);
  router.post('/api/admin/scan/rescan', adminMiddleware, controller.admin.rescan);
  // 转码路由
  router.post('/api/admin/transcode', adminMiddleware, controller.admin.startTranscode);
  router.get('/api/admin/transcode/status', adminMiddleware, controller.admin.getTranscodeStatus);
  router.post('/api/admin/transcode/pause', adminMiddleware, controller.admin.pauseTranscode);
  router.post('/api/admin/transcode/resume', adminMiddleware, controller.admin.resumeTranscode);
  router.post('/api/admin/transcode/stop', adminMiddleware, controller.admin.stopTranscode);
  router.get('/api/admin/transcode/errors', adminMiddleware, controller.admin.getTranscodeErrors);
  router.post('/api/admin/transcode/retry', adminMiddleware, controller.admin.retryTranscode);
  // 用户管理路由
  router.get('/api/admin/users', adminMiddleware, controller.admin.getUsers);
  router.post('/api/admin/users', adminMiddleware, controller.admin.addUser);
  router.delete('/api/admin/users/:id', adminMiddleware, controller.admin.deleteUser);
  router.put('/api/admin/users/:id/password', adminMiddleware, controller.admin.resetPassword);
  router.get('/api/admin/config', adminMiddleware, controller.admin.getConfig);
  router.put('/api/admin/config', adminMiddleware, controller.admin.updateConfig);
  router.post('/api/admin/cache/clear', adminMiddleware, controller.admin.clearCache);
};
