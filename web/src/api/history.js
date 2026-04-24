import api from './index'

export const historyApi = {
  getList: () => api.get('/history'),
  add: (timestamp) => api.post('/history', { timestamp }),
}
