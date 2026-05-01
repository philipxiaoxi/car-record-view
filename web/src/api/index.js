import axios from 'axios'

const api = axios.create({ baseURL: '/api', timeout: 30000 })

// Cookie 认证不需要手动设置 Authorization header
// 浏览器会自动携带 Cookie

api.interceptors.response.use(r => r, error => {
  if (error.response?.status === 401) {
    // 清除本地用户状态
    localStorage.removeItem('user')
    window.location.href = '/login'
  }
  return Promise.reject(error)
})

export default api
