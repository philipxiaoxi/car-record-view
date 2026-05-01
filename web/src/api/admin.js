import api from './index'

export const adminApi = {
  getUsers: () => api.get('/admin/users'),
  addUser: (username, password, role) => api.post('/admin/users', { username, password, role }),
  deleteUser: (id) => api.delete(`/admin/users/${id}`),
  resetPassword: (id, password) => api.put(`/admin/users/${id}/password`, { password }),
  getConfig: () => api.get('/admin/config'),
  updateConfig: (data) => api.put('/admin/config', data),
  clearCache: (type = 'all') => api.post('/admin/cache/clear', { type }),

  // 扫描相关
  startScan: () => api.post('/admin/scan'),
  getScanStatus: () => api.get('/admin/scan/status'),
  pauseScan: () => api.post('/admin/scan/pause'),
  resumeScan: () => api.post('/admin/scan/resume'),
  stopScan: () => api.post('/admin/scan/stop'),
  rescan: () => api.post('/admin/scan/rescan'),

  // 转码相关
  startTranscode: () => api.post('/admin/transcode'),
  getTranscodeStatus: () => api.get('/admin/transcode/status'),
  pauseTranscode: () => api.post('/admin/transcode/pause'),
  resumeTranscode: () => api.post('/admin/transcode/resume'),
  stopTranscode: () => api.post('/admin/transcode/stop'),
  getTranscodeErrors: () => api.get('/admin/transcode/errors'),
  retryTranscode: () => api.post('/admin/transcode/retry'),

  // AI 配置相关
  getAiConfig: () => api.get('/admin/config/ai'),
  updateAiConfig: (data) => api.put('/admin/config/ai', data),
  getAnalysisQueue: () => api.get('/admin/analysis/queue'),
}
