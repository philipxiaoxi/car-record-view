import { defineStore } from 'pinia'
import { authApi } from '../api/auth'

export const useAuthStore = defineStore('auth', {
  state: () => ({
    token: localStorage.getItem('token') || null,
    user: JSON.parse(localStorage.getItem('user') || 'null'),
  }),
  getters: {
    isLoggedIn: state => !!state.token,
    isAdmin: state => state.user?.role === 'admin',
  },
  actions: {
    async login(username, password) {
      const { data } = await authApi.login(username, password)
      this.token = data.token
      this.user = data.user
      localStorage.setItem('token', data.token)
      localStorage.setItem('user', JSON.stringify(data.user))
      return data
    },
    async logout() {
      await authApi.logout()
      this.token = null
      this.user = null
      localStorage.removeItem('token')
      localStorage.removeItem('user')
    },
    async fetchUser() {
      if (!this.token) return
      try {
        const { data } = await authApi.me()
        this.user = data.user
        localStorage.setItem('user', JSON.stringify(data.user))
      } catch { this.logout() }
    },
  },
})
