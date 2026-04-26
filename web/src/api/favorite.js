// web/src/api/favorite.js
import api from './index'

export const favoriteApi = {
  getList: () => api.get('/favorites'),
  add: (timestamp) => api.post('/favorites', { timestamp }),
  remove: (timestamp) => api.delete(`/favorites/${encodeURIComponent(timestamp)}`),
}
