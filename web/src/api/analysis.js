// web/src/api/analysis.js
import api from './index'

export const analysisApi = {
  // 创建分析任务
  create: (timestamp, cameraType) =>
    api.post(`/videos/${encodeURIComponent(timestamp)}/analysis`, { cameraType }),

  // 获取分析结果
  get: (timestamp, cameraType) =>
    api.get(`/videos/${encodeURIComponent(timestamp)}/analysis/${cameraType}`),

  // 获取视频的所有分析结果
  getAll: (timestamp) =>
    api.get(`/videos/${encodeURIComponent(timestamp)}/analysis`),

  // 取消分析任务
  cancel: (timestamp, cameraType) =>
    api.delete(`/videos/${encodeURIComponent(timestamp)}/analysis/${cameraType}`),
}
