import api from './index'

export const adminApi = {
  getUsers: () => api.get('/admin/users'),
  addUser: (username, password, role) => api.post('/admin/users', { username, password, role }),
  deleteUser: (id) => api.delete(`/admin/users/${id}`),
  resetPassword: (id, password) => api.put(`/admin/users/${id}/password`, { password }),
  getConfig: () => api.get('/admin/config'),
  updateConfig: (data) => api.put('/admin/config', data),
  clearCache: (type = 'all') => api.post('/admin/cache/clear', { type }),
}
