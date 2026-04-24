// app/router.js
module.exports = app => {
  const { router, controller } = app;

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
};
