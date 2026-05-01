import { defineStore } from 'pinia'
import { authApi } from '../api/auth'

export const useAuthStore = defineStore('auth', {
  state: () => ({
    user: JSON.parse(localStorage.getItem('user') || 'null'),
  }),
  getters: {
    isLoggedIn: state => !!state.user,
    isAdmin: state => state.user?.role === 'admin',
  },
  actions: {
    async login(username, password) {
      const { data } = await authApi.login(username, password)
      // Cookie 由后端设置，前端只存储用户信息
      this.user = data.user
      localStorage.setItem('user', JSON.stringify(data.user))
      return data
    },
    async logout() {
      await authApi.logout()
      // Cookie 由后端清除
      this.user = null
      localStorage.removeItem('user')
    },
    async fetchUser() {
      try {
        const { data } = await authApi.me()
        this.user = data.user
        localStorage.setItem('user', JSON.stringify(data.user))
      } catch {
        // 认证失效，清理本地状态
        // 401 拦截器会处理重定向到登录页
        this.user = null
        localStorage.removeItem('user')
      }
    },
  },
})
