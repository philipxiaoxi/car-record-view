import api from './index'

export const videoApi = {
  getList: (page = 1, pageSize = 50) => api.get('/videos', { params: { page, pageSize } }),
  getDetail: (timestamp) => api.get(`/videos/${encodeURIComponent(timestamp)}`),
  getStreamUrl: (filename) => `/api/videos/${filename}/stream`,
  getCoverUrl: (filename) => `/api/videos/${filename}/cover`,
}
