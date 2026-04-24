import { createRouter, createWebHistory } from 'vue-router'
import { useAuthStore } from '../stores/auth'

const routes = [
  { path: '/login', name: 'Login', component: () => import('../views/LoginView.vue'), meta: { public: true } },
  { path: '/', name: 'VideoList', component: () => import('../views/VideoListView.vue') },
  { path: '/play/:timestamp', name: 'VideoPlay', component: () => import('../views/VideoPlayView.vue') },
  { path: '/admin', name: 'Admin', component: () => import('../views/AdminView.vue'), meta: { admin: true },
    children: [
      { path: 'users', name: 'AdminUsers', component: () => import('../views/AdminUsersView.vue') },
      { path: 'config', name: 'AdminConfig', component: () => import('../views/AdminConfigView.vue') },
    ]
  },
]

const router = createRouter({ history: createWebHistory(), routes })

router.beforeEach((to, from, next) => {
  const authStore = useAuthStore()
  if (to.meta.public) return next()
  if (!authStore.isLoggedIn) return next({ name: 'Login', query: { redirect: to.fullPath } })
  if (to.meta.admin && authStore.user?.role !== 'admin') return next({ name: 'VideoList' })
  next()
})

export default router
