# Phase 4: 前端完整实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 使用 Vue3 + Vuetify 构建完整的前端应用，包括登录、视频列表、视频播放、管理后台等页面。

**Architecture:** SPA 单页应用，Pinia 状态管理，Vue Router 路由，响应式设计适配移动端和 PC 端。

**Tech Stack:** Vite, Vue3, Vuetify, Pinia, Vue Router, axios

**前置条件:** Phase 1-3 已完成，后端 API 可用

**重要提示:** 前端 UI 设计应使用 /frontend-design skill

---

## 文件结构

```
web/
├── public/
│   └── favicon.ico
├── src/
│   ├── api/
│   │   ├── index.js          # axios 配置
│   │   ├── auth.js           # 认证 API
│   │   ├── video.js          # 视频 API
│   │   ├── history.js        # 播放历史 API
│   │   └── admin.js          # 管理 API
│   ├── components/
│   │   ├── VideoCard.vue     # 视频卡片组件
│   │   ├── VideoPlayer.vue   # 双视频播放器组件
│   │   └── AppHeader.vue     # 应用头部
│   ├── views/
│   │   ├── LoginView.vue     # 登录页
│   │   ├── VideoListView.vue # 视频列表页
│   │   ├── VideoPlayView.vue # 视频播放页
│   │   ├── AdminView.vue     # 管理后台首页
│   │   ├── AdminUsersView.vue# 用户管理页
│   │   └── AdminConfigView.vue# 系统配置页
│   ├── stores/
│   │   ├── auth.js           # 认证状态
│   │   └── video.js          # 视频状态
│   ├── router/
│   │   └── index.js          # 路由配置
│   ├── config/
│   │   └── index.js          # 前端配置
│   ├── App.vue               # 根组件
│   └── main.js               # 入口文件
├── index.html
├── vite.config.js
└── package.json
```

---

### Task 1: 初始化 Vue3 + Vite 项目

**Files:**
- Create: `web/package.json`
- Create: `web/vite.config.js`
- Create: `web/index.html`
- Create: `web/src/main.js`
- Create: `web/src/App.vue`

- [ ] **Step 1: 创建 Vue3 项目**

```bash
npm create vite@latest web -- --template vue
cd web
```

- [ ] **Step 2: 安装依赖**

```bash
cd web
npm install
npm install vuetify @mdi/font pinia vue-router axios
```

- [ ] **Step 3: 更新 package.json**

```json
{
  "name": "car-record-web",
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "@mdi/font": "^7.4.47",
    "axios": "^1.6.0",
    "pinia": "^2.1.0",
    "vue": "^3.4.0",
    "vue-router": "^4.2.0",
    "vuetify": "^3.4.0"
  },
  "devDependencies": {
    "@vitejs/plugin-vue": "^5.0.0",
    "vite": "^5.0.0"
  }
}
```

- [ ] **Step 4: 创建 vite.config.js**

```javascript
// vite.config.js
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  server: {
    port: 3000,
    proxy: {
      '/api': {
        target: 'http://localhost:7001',
        changeOrigin: true,
      },
    },
  },
})
```

- [ ] **Step 5: 创建 src/main.js**

```javascript
// src/main.js
import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import router from './router'

// Vuetify
import 'vuetify/styles'
import { createVuetify } from 'vuetify'
import * as components from 'vuetify/components'
import * as directives from 'vuetify/directives'
import '@mdi/font/css/materialdesignicons.css'

const vuetify = createVuetify({
  components,
  directives,
  theme: {
    defaultTheme: 'dark',
    themes: {
      dark: {
        colors: {
          primary: '#1976D2',
          secondary: '#424242',
          accent: '#82B1FF',
          error: '#FF5252',
          info: '#2196F3',
          success: '#4CAF50',
          warning: '#FFC107',
        },
      },
    },
  },
})

const app = createApp(App)
app.use(createPinia())
app.use(router)
app.use(vuetify)
app.mount('#app')
```

- [ ] **Step 6: 创建 src/App.vue**

```vue
<!-- src/App.vue -->
<template>
  <v-app>
    <router-view />
  </v-app>
</template>

<script setup>
</script>

<style>
body {
  margin: 0;
  padding: 0;
}
</style>
```

- [ ] **Step 7: 验证项目可启动**

```bash
cd web
npm run dev
```

预期：访问 http://localhost:3000 显示空白页面（无报错）

- [ ] **Step 8: Commit**

```bash
git add web/
git commit -m "feat(web): initialize Vue3 + Vite + Vuetify project"
```

---

### Task 2: 创建路由配置

**Files:**
- Create: `web/src/router/index.js`

- [ ] **Step 1: 创建路由配置 src/router/index.js**

```javascript
// src/router/index.js
import { createRouter, createWebHistory } from 'vue-router'
import { useAuthStore } from '../stores/auth'

const routes = [
  {
    path: '/login',
    name: 'Login',
    component: () => import('../views/LoginView.vue'),
    meta: { public: true },
  },
  {
    path: '/',
    name: 'VideoList',
    component: () => import('../views/VideoListView.vue'),
  },
  {
    path: '/play/:timestamp',
    name: 'VideoPlay',
    component: () => import('../views/VideoPlayView.vue'),
  },
  {
    path: '/admin',
    name: 'Admin',
    component: () => import('../views/AdminView.vue'),
    meta: { admin: true },
    children: [
      {
        path: 'users',
        name: 'AdminUsers',
        component: () => import('../views/AdminUsersView.vue'),
      },
      {
        path: 'config',
        name: 'AdminConfig',
        component: () => import('../views/AdminConfigView.vue'),
      },
    ],
  },
]

const router = createRouter({
  history: createWebHistory(),
  routes,
})

// 路由守卫
router.beforeEach((to, from, next) => {
  const authStore = useAuthStore()

  if (to.meta.public) {
    next()
    return
  }

  if (!authStore.isLoggedIn) {
    next({ name: 'Login', query: { redirect: to.fullPath } })
    return
  }

  if (to.meta.admin && authStore.user?.role !== 'admin') {
    next({ name: 'VideoList' })
    return
  }

  next()
})

export default router
```

- [ ] **Step 2: Commit**

```bash
git add web/src/router/
git commit -m "feat(web): add router configuration with guards"
```

---

### Task 3: 创建 API 模块

**Files:**
- Create: `web/src/api/index.js`
- Create: `web/src/api/auth.js`
- Create: `web/src/api/video.js`
- Create: `web/src/api/history.js`
- Create: `web/src/api/admin.js`

- [ ] **Step 1: 创建 axios 配置 src/api/index.js**

```javascript
// src/api/index.js
import axios from 'axios'

const api = axios.create({
  baseURL: '/api',
  timeout: 30000,
})

// 请求拦截器 - 添加 token
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token')
    if (token) {
      config.headers.Authorization = `Bearer ${token}`
    }
    return config
  },
  (error) => Promise.reject(error)
)

// 响应拦截器 - 处理错误
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('token')
      localStorage.removeItem('user')
      window.location.href = '/login'
    }
    return Promise.reject(error)
  }
)

export default api
```

- [ ] **Step 2: 创建认证 API src/api/auth.js**

```javascript
// src/api/auth.js
import api from './index'

export const authApi = {
  login(username, password) {
    return api.post('/auth/login', { username, password })
  },

  logout() {
    return api.post('/auth/logout')
  },

  me() {
    return api.get('/auth/me')
  },
}
```

- [ ] **Step 3: 创建视频 API src/api/video.js**

```javascript
// src/api/video.js
import api from './index'

export const videoApi = {
  getList(page = 1, pageSize = 50) {
    return api.get('/videos', { params: { page, pageSize } })
  },

  getDetail(timestamp) {
    return api.get(`/videos/${encodeURIComponent(timestamp)}`)
  },

  getStreamUrl(filename) {
    return `/api/videos/${filename}/stream`
  },

  getCoverUrl(filename) {
    return `/api/videos/${filename}/cover`
  },
}
```

- [ ] **Step 4: 创建播放历史 API src/api/history.js**

```javascript
// src/api/history.js
import api from './index'

export const historyApi = {
  getList() {
    return api.get('/history')
  },

  add(timestamp) {
    return api.post('/history', { timestamp })
  },
}
```

- [ ] **Step 5: 创建管理 API src/api/admin.js**

```javascript
// src/api/admin.js
import api from './index'

export const adminApi = {
  getUsers() {
    return api.get('/admin/users')
  },

  addUser(username, password, role) {
    return api.post('/admin/users', { username, password, role })
  },

  deleteUser(id) {
    return api.delete(`/admin/users/${id}`)
  },

  resetPassword(id, password) {
    return api.put(`/admin/users/${id}/password`, { password })
  },

  getConfig() {
    return api.get('/admin/config')
  },

  updateConfig(data) {
    return api.put('/admin/config', data)
  },

  clearCache(type = 'all') {
    return api.post('/admin/cache/clear', { type })
  },
}
```

- [ ] **Step 6: Commit**

```bash
git add web/src/api/
git commit -m "feat(web): add API modules"
```

---

### Task 4: 创建 Pinia Store

**Files:**
- Create: `web/src/stores/auth.js`
- Create: `web/src/stores/video.js`

- [ ] **Step 1: 创建认证 Store src/stores/auth.js**

```javascript
// src/stores/auth.js
import { defineStore } from 'pinia'
import { authApi } from '../api/auth'

export const useAuthStore = defineStore('auth', {
  state: () => ({
    token: localStorage.getItem('token') || null,
    user: JSON.parse(localStorage.getItem('user') || 'null'),
  }),

  getters: {
    isLoggedIn: (state) => !!state.token,
    isAdmin: (state) => state.user?.role === 'admin',
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
      } catch {
        this.logout()
      }
    },
  },
})
```

- [ ] **Step 2: 创建视频 Store src/stores/video.js**

```javascript
// src/stores/video.js
import { defineStore } from 'pinia'
import { videoApi } from '../api/video'
import { historyApi } from '../api/history'

export const useVideoStore = defineStore('video', {
  state: () => ({
    videoList: [],
    pagination: {
      page: 1,
      pageSize: 50,
      total: 0,
      totalPages: 0,
    },
    currentVideo: null,
    history: [],
    scrollPosition: 0,
    listPage: 1,
  }),

  actions: {
    async fetchVideoList(page = 1) {
      const { data } = await videoApi.getList(page, 50)
      this.videoList = data.list
      this.pagination = data.pagination
      this.listPage = page
    },

    async fetchVideoDetail(timestamp) {
      const { data } = await videoApi.getDetail(timestamp)
      this.currentVideo = data
      return data
    },

    async fetchHistory() {
      const { data } = await historyApi.getList()
      this.history = data.list
    },

    async addHistory(timestamp) {
      await historyApi.add(timestamp)
    },

    saveScrollPosition(position) {
      this.scrollPosition = position
    },
  },
})
```

- [ ] **Step 3: Commit**

```bash
git add web/src/stores/
git commit -m "feat(web): add Pinia stores"
```

---

### Task 5: 创建登录页面

**Files:**
- Create: `web/src/views/LoginView.vue`

- [ ] **Step 1: 创建登录页面 src/views/LoginView.vue**

**使用 /frontend-design skill 设计此页面**

```vue
<!-- src/views/LoginView.vue -->
<template>
  <v-container fluid fill-height class="login-container">
    <v-row justify="center" align="center">
      <v-col cols="12" sm="8" md="4">
        <v-card class="login-card">
          <v-card-title class="text-h5 text-center py-4">
            信界后视镜视频播放器
          </v-card-title>

          <v-card-text>
            <v-form @submit.prevent="handleLogin" ref="form">
              <v-text-field
                v-model="username"
                label="用户名"
                prepend-icon="mdi-account"
                :rules="[v => !!v || '请输入用户名']"
                outlined
                dense
              />

              <v-text-field
                v-model="password"
                label="密码"
                prepend-icon="mdi-lock"
                type="password"
                :rules="[v => !!v || '请输入密码']"
                outlined
                dense
              />

              <v-alert
                v-if="error"
                type="error"
                dense
                text
                class="mb-4"
              >
                {{ error }}
              </v-alert>

              <v-btn
                type="submit"
                color="primary"
                block
                large
                :loading="loading"
              >
                登录
              </v-btn>
            </v-form>
          </v-card-text>
        </v-card>
      </v-col>
    </v-row>
  </v-container>
</template>

<script setup>
import { ref } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useAuthStore } from '../stores/auth'

const router = useRouter()
const route = useRoute()
const authStore = useAuthStore()

const username = ref('')
const password = ref('')
const error = ref('')
const loading = ref(false)
const form = ref(null)

const handleLogin = async () => {
  error.value = ''

  const { valid } = await form.value.validate()
  if (!valid) return

  loading.value = true
  try {
    await authStore.login(username.value, password.value)
    const redirect = route.query.redirect || '/'
    router.push(redirect)
  } catch (err) {
    error.value = err.response?.data?.error || '登录失败，请重试'
  } finally {
    loading.value = false
  }
}
</script>

<style scoped>
.login-container {
  background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
  min-height: 100vh;
}

.login-card {
  border-radius: 16px;
}
</style>
```

- [ ] **Step 2: Commit**

```bash
git add web/src/views/LoginView.vue
git commit -m "feat(web): add login page"
```

---

### Task 6: 创建应用头部组件

**Files:**
- Create: `web/src/components/AppHeader.vue`

- [ ] **Step 1: 创建头部组件 src/components/AppHeader.vue**

```vue
<!-- src/components/AppHeader.vue -->
<template>
  <v-app-bar app color="primary" dark>
    <v-app-bar-nav-icon
      v-if="showMenu"
      @click="drawer = !drawer"
    />

    <v-toolbar-title>
      {{ title }}
    </v-toolbar-title>

    <v-spacer />

    <v-menu v-if="authStore.isLoggedIn" offset-y>
      <template #activator="{ props }">
        <v-btn icon v-bind="props">
          <v-icon>mdi-account-circle</v-icon>
        </v-btn>
      </template>

      <v-list>
        <v-list-item disabled>
          <v-list-item-title>{{ authStore.user?.username }}</v-list-item-title>
        </v-list-item>

        <v-divider />

        <v-list-item v-if="authStore.isAdmin" to="/admin">
          <v-list-item-title>
            <v-icon small class="mr-2">mdi-cog</v-icon>
            管理后台
          </v-list-item-title>
        </v-list-item>

        <v-list-item @click="handleLogout">
          <v-list-item-title>
            <v-icon small class="mr-2">mdi-logout</v-icon>
            退出登录
          </v-list-item-title>
        </v-list-item>
      </v-list>
    </v-menu>
  </v-app-bar>
</template>

<script setup>
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '../stores/auth'

const props = defineProps({
  title: {
    type: String,
    default: '信界后视镜视频',
  },
  showMenu: {
    type: Boolean,
    default: false,
  },
})

const emit = defineEmits(['update:drawer'])

const router = useRouter()
const authStore = useAuthStore()

const drawer = computed({
  get: () => props.showMenu,
  set: (val) => emit('update:drawer', val),
})

const handleLogout = async () => {
  await authStore.logout()
  router.push('/login')
}
</script>
```

- [ ] **Step 2: Commit**

```bash
git add web/src/components/AppHeader.vue
git commit -m "feat(web): add app header component"
```

---

### Task 7: 创建视频卡片组件

**Files:**
- Create: `web/src/components/VideoCard.vue`

- [ ] **Step 1: 创建视频卡片组件 src/components/VideoCard.vue**

**使用 /frontend-design skill 设计此组件**

```vue
<!-- src/components/VideoCard.vue -->
<template>
  <v-card
    class="video-card"
    hover
    @click="$emit('click')"
  >
    <v-img
      :src="coverUrl"
      :lazy-src="defaultCover"
      aspect-ratio="16/9"
      cover
    >
      <template #placeholder>
        <v-row class="fill-height ma-0" align="center" justify="center">
          <v-progress-circular indeterminate color="grey-lighten-5" />
        </v-row>
      </template>

      <div class="video-badge" v-if="video.front && video.rear">
        <v-chip size="x-small" color="success">前后视</v-chip>
      </div>
    </v-img>

    <v-card-text class="pa-2">
      <div class="text-subtitle-2 text-truncate">
        {{ formattedTime }}
      </div>
      <div class="text-caption text-grey" v-if="video.duration">
        {{ formatDuration(video.duration) }}
      </div>
    </v-card-text>
  </v-card>
</template>

<script setup>
import { computed } from 'vue'
import { videoApi } from '../api/video'

const props = defineProps({
  video: {
    type: Object,
    required: true,
  },
})

defineEmits(['click'])

const defaultCover = '/images/default-cover.jpg'

const coverUrl = computed(() => {
  const filename = props.video.front || props.video.rear
  return filename ? videoApi.getCoverUrl(filename) : defaultCover
})

const formattedTime = computed(() => {
  if (!props.video.timestamp) return ''
  const date = new Date(props.video.timestamp)
  return date.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
})

const formatDuration = (seconds) => {
  const mins = Math.floor(seconds / 60)
  const secs = seconds % 60
  return `${mins}:${secs.toString().padStart(2, '0')}`
}
</script>

<style scoped>
.video-card {
  cursor: pointer;
  transition: transform 0.2s;
}

.video-card:hover {
  transform: translateY(-4px);
}

.video-badge {
  position: absolute;
  top: 8px;
  right: 8px;
}
</style>
```

- [ ] **Step 2: Commit**

```bash
git add web/src/components/VideoCard.vue
git commit -m "feat(web): add video card component"
```

---

### Task 8: 创建视频列表页面

**Files:**
- Create: `web/src/views/VideoListView.vue`

- [ ] **Step 1: 创建视频列表页面 src/views/VideoListView.vue**

**使用 /frontend-design skill 设计此页面**

```vue
<!-- src/views/VideoListView.vue -->
<template>
  <v-layout>
    <AppHeader title="信界后视镜视频" />

    <v-main>
      <v-container fluid>
        <!-- Tab 切换 -->
        <v-tabs v-model="activeTab" class="mb-4">
          <v-tab value="all">全部视频</v-tab>
          <v-tab value="history">播放历史</v-tab>
        </v-tabs>

        <v-window v-model="activeTab">
          <!-- 全部视频 -->
          <v-window-item value="all">
            <v-row ref="videoGrid">
              <v-col
                v-for="video in videoStore.videoList"
                :key="video.timestamp"
                cols="12"
                sm="6"
                md="4"
                lg="3"
                xl="2"
              >
                <VideoCard
                  :video="video"
                  @click="playVideo(video)"
                />
              </v-col>
            </v-row>

            <div class="text-center mt-4" v-if="videoStore.pagination.totalPages > 1">
              <v-pagination
                v-model="currentPage"
                :length="videoStore.pagination.totalPages"
                :total-visible="7"
                @update:modelValue="loadPage"
              />
            </div>
          </v-window-item>

          <!-- 播放历史 -->
          <v-window-item value="history">
            <v-row v-if="videoStore.history.length > 0">
              <v-col
                v-for="video in videoStore.history"
                :key="video.timestamp"
                cols="12"
                sm="6"
                md="4"
                lg="3"
                xl="2"
              >
                <VideoCard
                  :video="video"
                  @click="playVideo(video)"
                />
              </v-col>
            </v-row>

            <v-empty-state
              v-else
              title="暂无播放历史"
              icon="mdi-history"
            />
          </v-window-item>
        </v-window>
      </v-container>
    </v-main>
  </v-layout>
</template>

<script setup>
import { ref, onMounted, onActivated, nextTick } from 'vue'
import { useRouter } from 'vue-router'
import { useVideoStore } from '../stores/video'
import AppHeader from '../components/AppHeader.vue'
import VideoCard from '../components/VideoCard.vue'

const router = useRouter()
const videoStore = useVideoStore()

const activeTab = ref('all')
const currentPage = ref(1)
const videoGrid = ref(null)

const loadPage = async (page) => {
  await videoStore.fetchVideoList(page)
  window.scrollTo({ top: 0, behavior: 'smooth' })
}

const playVideo = (video) => {
  // 保存滚动位置
  if (videoGrid.value) {
    videoStore.saveScrollPosition(window.scrollY)
  }
  router.push(`/play/${encodeURIComponent(video.timestamp)}`)
}

onMounted(async () => {
  await videoStore.fetchVideoList(videoStore.listPage)
  await videoStore.fetchHistory()

  // 恢复滚动位置
  await nextTick()
  if (videoStore.scrollPosition > 0) {
    window.scrollTo({ top: videoStore.scrollPosition, behavior: 'instant' })
  }

  currentPage.value = videoStore.listPage
})

onActivated(() => {
  // 从播放页返回时恢复滚动位置
  if (videoStore.scrollPosition > 0) {
    window.scrollTo({ top: videoStore.scrollPosition, behavior: 'instant' })
  }
})
</script>
```

- [ ] **Step 2: Commit**

```bash
git add web/src/views/VideoListView.vue
git commit -m "feat(web): add video list page"
```

---

### Task 9: 创建双视频播放器组件

**Files:**
- Create: `web/src/components/VideoPlayer.vue`

- [ ] **Step 1: 创建视频播放器组件 src/components/VideoPlayer.vue**

**使用 /frontend-design skill 设计此组件**

```vue
<!-- src/components/VideoPlayer.vue -->
<template>
  <div class="video-player">
    <!-- PC 端左右布局 / 移动端上下布局 -->
    <div :class="['video-container', isMobile ? 'mobile' : 'desktop']">
      <div class="video-wrapper">
        <video
          ref="frontVideo"
          :src="frontSrc"
          class="video-element"
          playsinline
          @loadedmetadata="onLoadedMetadata"
          @timeupdate="onTimeUpdate"
          @play="onPlay('front')"
          @pause="onPause('front')"
          @waiting="onWaiting('front')"
          @canplay="onCanPlay('front')"
        />
        <div class="video-label">前视</div>
        <v-progress-circular
          v-if="frontLoading"
          indeterminate
          class="video-loading"
        />
      </div>

      <div class="video-wrapper">
        <video
          ref="rearVideo"
          :src="rearSrc"
          class="video-element"
          playsinline
          @play="onPlay('rear')"
          @pause="onPause('rear')"
          @waiting="onWaiting('rear')"
          @canplay="onCanPlay('rear')"
        />
        <div class="video-label">后视</div>
        <v-progress-circular
          v-if="rearLoading"
          indeterminate
          class="video-loading"
        />
      </div>
    </div>

    <!-- 控制栏 -->
    <v-card class="controls-card mt-2">
      <v-slider
        v-model="progress"
        :max="duration"
        :min="0"
        class="mx-4"
        thumb-label
        :thumb-size="24"
        @update:modelValue="seekTo"
      />

      <v-row align="center" class="px-4 pb-2">
        <v-btn icon @click="togglePlay">
          <v-icon>{{ isPlaying ? 'mdi-pause' : 'mdi-play' }}</v-icon>
        </v-btn>

        <span class="text-caption ml-2">{{ formatTime(currentTime) }} / {{ formatTime(duration) }}</span>

        <v-spacer />

        <v-select
          v-model="playbackSpeed"
          :items="speedOptions"
          density="compact"
          hide-details
          class="speed-select"
          @update:modelValue="changeSpeed"
        />

        <v-btn
          icon
          :disabled="!prevTimestamp"
          @click="$emit('prev', prevTimestamp)"
        >
          <v-icon>mdi-skip-previous</v-icon>
        </v-btn>

        <v-btn
          icon
          :disabled="!nextTimestamp"
          @click="$emit('next', nextTimestamp)"
        >
          <v-icon>mdi-skip-next</v-icon>
        </v-btn>
      </v-row>
    </v-card>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onBeforeUnmount, watch } from 'vue'
import { videoApi } from '../api/video'

const props = defineProps({
  frontFilename: String,
  rearFilename: String,
  prevTimestamp: String,
  nextTimestamp: String,
})

const emit = defineEmits(['prev', 'next'])

const frontVideo = ref(null)
const rearVideo = ref(null)
const frontLoading = ref(false)
const rearLoading = ref(false)
const isPlaying = ref(false)
const currentTime = ref(0)
const duration = ref(0)
const progress = ref(0)
const playbackSpeed = ref(1)
const speedOptions = [0.5, 1, 1.5, 2, 4]

const isMobile = computed(() => window.innerWidth < 768)

const frontSrc = computed(() =>
  props.frontFilename ? videoApi.getStreamUrl(props.frontFilename) : ''
)

const rearSrc = computed(() =>
  props.rearFilename ? videoApi.getStreamUrl(props.rearFilename) : ''
)

const formatTime = (seconds) => {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = Math.floor(seconds % 60)
  if (h > 0) {
    return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
  }
  return `${m}:${s.toString().padStart(2, '0')}`
}

const togglePlay = () => {
  if (!frontVideo.value || !rearVideo.value) return

  if (isPlaying.value) {
    frontVideo.value.pause()
    rearVideo.value.pause()
  } else {
    frontVideo.value.play()
    rearVideo.value.play()
  }
  isPlaying.value = !isPlaying.value
}

const seekTo = (time) => {
  if (!frontVideo.value || !rearVideo.value) return
  frontVideo.value.currentTime = time
  rearVideo.value.currentTime = time
  currentTime.value = time
}

const changeSpeed = (speed) => {
  if (!frontVideo.value || !rearVideo.value) return
  frontVideo.value.playbackRate = speed
  rearVideo.value.playbackRate = speed
}

const onLoadedMetadata = () => {
  if (frontVideo.value) {
    duration.value = frontVideo.value.duration
  }
}

const onTimeUpdate = () => {
  if (!frontVideo.value) return
  currentTime.value = frontVideo.value.currentTime
  progress.value = frontVideo.value.currentTime
}

const onPlay = (source) => {
  // 同步播放另一个视频
  if (source === 'front' && rearVideo.value && rearVideo.value.paused) {
    rearVideo.value.play()
  } else if (source === 'rear' && frontVideo.value && frontVideo.value.paused) {
    frontVideo.value.play()
  }
  isPlaying.value = true
}

const onPause = (source) => {
  // 同步暂停另一个视频
  if (source === 'front' && rearVideo.value && !rearVideo.value.paused) {
    rearVideo.value.pause()
  } else if (source === 'rear' && frontVideo.value && !frontVideo.value.paused) {
    frontVideo.value.pause()
  }
  isPlaying.value = false
}

const onWaiting = (source) => {
  if (source === 'front') {
    frontLoading.value = true
  } else {
    rearLoading.value = true
  }
}

const onCanPlay = (source) => {
  if (source === 'front') {
    frontLoading.value = false
  } else {
    rearLoading.value = false
  }

  // 同步播放进度（如果差异超过 0.5 秒）
  if (frontVideo.value && rearVideo.value) {
    const diff = Math.abs(frontVideo.value.currentTime - rearVideo.value.currentTime)
    if (diff > 0.5) {
      const targetTime = Math.min(frontVideo.value.currentTime, rearVideo.value.currentTime)
      frontVideo.value.currentTime = targetTime
      rearVideo.value.currentTime = targetTime
    }
  }
}

// 键盘快捷键
const handleKeydown = (e) => {
  switch (e.key) {
    case ' ':
      e.preventDefault()
      togglePlay()
      break
    case 'ArrowLeft':
      if (frontVideo.value) {
        seekTo(Math.max(0, currentTime.value - 5))
      }
      break
    case 'ArrowRight':
      if (frontVideo.value) {
        seekTo(Math.min(duration.value, currentTime.value + 5))
      }
      break
  }
}

onMounted(() => {
  window.addEventListener('keydown', handleKeydown)
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', handleKeydown)
})

// 切换视频时重置
watch(() => [props.frontFilename, props.rearFilename], () => {
  isPlaying.value = false
  currentTime.value = 0
  progress.value = 0
  frontLoading.value = true
  rearLoading.value = true
})
</script>

<style scoped>
.video-container {
  display: flex;
  gap: 8px;
  width: 100%;
}

.video-container.desktop {
  flex-direction: row;
}

.video-container.mobile {
  flex-direction: column;
}

.video-wrapper {
  position: relative;
  flex: 1;
  background: #000;
  border-radius: 8px;
  overflow: hidden;
}

.video-element {
  width: 100%;
  height: 100%;
  object-fit: contain;
}

.video-label {
  position: absolute;
  top: 8px;
  left: 8px;
  background: rgba(0, 0, 0, 0.6);
  color: white;
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 12px;
}

.video-loading {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
}

.controls-card {
  border-radius: 8px;
}

.speed-select {
  max-width: 80px;
  margin-right: 16px;
}
</style>
```

- [ ] **Step 2: Commit**

```bash
git add web/src/components/VideoPlayer.vue
git commit -m "feat(web): add dual video player component"
```

---

### Task 10: 创建视频播放页面

**Files:**
- Create: `web/src/views/VideoPlayView.vue`

- [ ] **Step 1: 创建视频播放页面 src/views/VideoPlayView.vue**

**使用 /frontend-design skill 设计此页面**

```vue
<!-- src/views/VideoPlayView.vue -->
<template>
  <v-layout>
    <AppHeader :title="pageTitle">
      <template #prepend>
        <v-btn icon @click="goBack">
          <v-icon>mdi-arrow-left</v-icon>
        </v-btn>
      </template>
    </AppHeader>

    <v-main>
      <v-container fluid>
        <v-skeleton-loader
          v-if="loading"
          type="card"
          class="mb-4"
        />

        <template v-else-if="video">
          <VideoPlayer
            :front-filename="video.front?.filename"
            :rear-filename="video.rear?.filename"
            :prev-timestamp="video.prev"
            :next-timestamp="video.next"
            @prev="goToVideo"
            @next="goToVideo"
          />
        </template>

        <v-alert v-else type="error">
          视频不存在或加载失败
        </v-alert>
      </v-container>
    </v-main>
  </v-layout>
</template>

<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useVideoStore } from '../stores/video'
import AppHeader from '../components/AppHeader.vue'
import VideoPlayer from '../components/VideoPlayer.vue'

const route = useRoute()
const router = useRouter()
const videoStore = useVideoStore()

const loading = ref(true)
const video = ref(null)

const timestamp = computed(() => decodeURIComponent(route.params.timestamp))

const pageTitle = computed(() => {
  if (!video.value) return '视频播放'
  const date = new Date(video.value.timestamp)
  return date.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
})

const loadVideo = async () => {
  loading.value = true
  try {
    video.value = await videoStore.fetchVideoDetail(timestamp.value)
    // 记录播放历史
    await videoStore.addHistory(timestamp.value)
  } catch (err) {
    console.error('Failed to load video:', err)
  } finally {
    loading.value = false
  }
}

const goBack = () => {
  router.push('/')
}

const goToVideo = (newTimestamp) => {
  router.push(`/play/${encodeURIComponent(newTimestamp)}`)
}

onMounted(loadVideo)

watch(() => route.params.timestamp, loadVideo)
</script>
```

- [ ] **Step 2: Commit**

```bash
git add web/src/views/VideoPlayView.vue
git commit -m "feat(web): add video play page"
```

---

### Task 11: 创建管理后台页面

**Files:**
- Create: `web/src/views/AdminView.vue`
- Create: `web/src/views/AdminUsersView.vue`
- Create: `web/src/views/AdminConfigView.vue`

- [ ] **Step 1: 创建管理后台布局 src/views/AdminView.vue**

```vue
<!-- src/views/AdminView.vue -->
<template>
  <v-layout>
    <v-navigation-drawer v-model="drawer" app>
      <v-list>
        <v-list-item to="/admin/users" prepend-icon="mdi-account-group">
          <v-list-item-title>用户管理</v-list-item-title>
        </v-list-item>

        <v-list-item to="/admin/config" prepend-icon="mdi-cog">
          <v-list-item-title>系统配置</v-list-item-title>
        </v-list-item>

        <v-divider class="my-2" />

        <v-list-item to="/" prepend-icon="mdi-video">
          <v-list-item-title>返回首页</v-list-item-title>
        </v-list-item>
      </v-list>
    </v-navigation-drawer>

    <AppHeader title="管理后台" show-menu @update:drawer="drawer = $event" />

    <v-main>
      <v-container fluid>
        <router-view />
      </v-container>
    </v-main>
  </v-layout>
</template>

<script setup>
import { ref } from 'vue'
import AppHeader from '../components/AppHeader.vue'

const drawer = ref(true)
</script>
```

- [ ] **Step 2: 创建用户管理页 src/views/AdminUsersView.vue**

```vue
<!-- src/views/AdminUsersView.vue -->
<template>
  <v-card>
    <v-card-title>
      <v-row align="center">
        <v-col>用户管理</v-col>
        <v-col class="text-right">
          <v-btn color="primary" @click="showAddDialog = true">
            <v-icon left>mdi-plus</v-icon>
            添加用户
          </v-btn>
        </v-col>
      </v-row>
    </v-card-title>

    <v-data-table :headers="headers" :items="users" :loading="loading">
      <template #item.role="{ item }">
        <v-chip :color="item.role === 'admin' ? 'primary' : 'default'" size="small">
          {{ item.role === 'admin' ? '管理员' : '用户' }}
        </v-chip>
      </template>

      <template #item.created_at="{ item }">
        {{ new Date(item.created_at).toLocaleString('zh-CN') }}
      </template>

      <template #item.actions="{ item }">
        <v-btn size="small" variant="text" @click="openResetDialog(item)">
          重置密码
        </v-btn>
        <v-btn
          size="small"
          variant="text"
          color="error"
          @click="openDeleteDialog(item)"
          :disabled="item.id === currentUserId"
        >
          删除
        </v-btn>
      </template>
    </v-data-table>

    <!-- 添加用户对话框 -->
    <v-dialog v-model="showAddDialog" max-width="400">
      <v-card>
        <v-card-title>添加用户</v-card-title>
        <v-card-text>
          <v-form ref="addForm">
            <v-text-field v-model="newUser.username" label="用户名" :rules="[v => !!v || '必填']" />
            <v-text-field v-model="newUser.password" label="密码" type="password" :rules="[v => !!v || '必填']" />
            <v-select v-model="newUser.role" :items="['user', 'admin']" label="角色" />
          </v-form>
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn text @click="showAddDialog = false">取消</v-btn>
          <v-btn color="primary" @click="addUser">确定</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- 重置密码对话框 -->
    <v-dialog v-model="showResetDialog" max-width="400">
      <v-card>
        <v-card-title>重置密码</v-card-title>
        <v-card-text>
          <v-text-field v-model="newPassword" label="新密码" type="password" :rules="[v => !!v || '必填']" />
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn text @click="showResetDialog = false">取消</v-btn>
          <v-btn color="primary" @click="resetPassword">确定</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- 删除确认对话框 -->
    <v-dialog v-model="showDeleteDialog" max-width="400">
      <v-card>
        <v-card-title>确认删除</v-card-title>
        <v-card-text>
          确定要删除用户 "{{ userToDelete?.username }}" 吗？
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn text @click="showDeleteDialog = false">取消</v-btn>
          <v-btn color="error" @click="deleteUser">删除</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </v-card>
</template>

<script setup>
import { ref, onMounted, computed } from 'vue'
import { useAuthStore } from '../stores/auth'
import { adminApi } from '../api/admin'

const authStore = useAuthStore()

const headers = [
  { title: '用户名', key: 'username' },
  { title: '角色', key: 'role' },
  { title: '创建时间', key: 'created_at' },
  { title: '操作', key: 'actions', sortable: false },
]

const users = ref([])
const loading = ref(true)
const currentUserId = computed(() => authStore.user?.id)

const showAddDialog = ref(false)
const showResetDialog = ref(false)
const showDeleteDialog = ref(false)
const addForm = ref(null)

const newUser = ref({ username: '', password: '', role: 'user' })
const newPassword = ref('')
const userToReset = ref(null)
const userToDelete = ref(null)

const loadUsers = async () => {
  loading.value = true
  try {
    const { data } = await adminApi.getUsers()
    users.value = data.list
  } finally {
    loading.value = false
  }
}

const addUser = async () => {
  const { valid } = await addForm.value.validate()
  if (!valid) return

  try {
    await adminApi.addUser(newUser.value.username, newUser.value.password, newUser.value.role)
    showAddDialog.value = false
    newUser.value = { username: '', password: '', role: 'user' }
    loadUsers()
  } catch (err) {
    alert(err.response?.data?.error || '添加失败')
  }
}

const openResetDialog = (user) => {
  userToReset.value = user
  newPassword.value = ''
  showResetDialog.value = true
}

const resetPassword = async () => {
  if (!newPassword.value) return

  try {
    await adminApi.resetPassword(userToReset.value.id, newPassword.value)
    showResetDialog.value = false
    alert('密码重置成功')
  } catch (err) {
    alert(err.response?.data?.error || '重置失败')
  }
}

const openDeleteDialog = (user) => {
  userToDelete.value = user
  showDeleteDialog.value = true
}

const deleteUser = async () => {
  try {
    await adminApi.deleteUser(userToDelete.value.id)
    showDeleteDialog.value = false
    loadUsers()
  } catch (err) {
    alert(err.response?.data?.error || '删除失败')
  }
}

onMounted(loadUsers)
</script>
```

- [ ] **Step 3: 创建系统配置页 src/views/AdminConfigView.vue**

```vue
<!-- src/views/AdminConfigView.vue -->
<template>
  <v-card>
    <v-card-title>系统配置</v-card-title>

    <v-card-text>
      <v-form @submit.prevent="saveConfig">
        <v-text-field
          v-model="config.videoRootDir"
          label="视频根目录"
          outlined
          :rules="[v => !!v || '必填']"
        />

        <v-alert type="info" variant="tonal" class="mb-4">
          缓存大小：{{ config.cacheSize?.mb || 0 }} MB
        </v-alert>

        <v-btn color="error" variant="outlined" class="mr-2" @click="clearCache('all')">
          清理所有缓存
        </v-btn>
        <v-btn color="warning" variant="outlined" class="mr-2" @click="clearCache('mp4')">
          清理 MP4 缓存
        </v-btn>
        <v-btn color="info" variant="outlined" @click="clearCache('covers')">
          清理封面缓存
        </v-btn>

        <v-divider class="my-4" />

        <v-btn type="submit" color="primary" :loading="saving">
          保存配置
        </v-btn>
      </v-form>
    </v-card-text>
  </v-card>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { adminApi } from '../api/admin'

const config = ref({
  videoRootDir: '',
  cacheSize: { bytes: 0, mb: '0' },
})

const saving = ref(false)

const loadConfig = async () => {
  const { data } = await adminApi.getConfig()
  config.value = data
}

const saveConfig = async () => {
  saving.value = true
  try {
    await adminApi.updateConfig({ videoRootDir: config.value.videoRootDir })
    alert('配置保存成功')
  } catch (err) {
    alert(err.response?.data?.error || '保存失败')
  } finally {
    saving.value = false
  }
}

const clearCache = async (type) => {
  if (!confirm(`确定要清理${type === 'all' ? '所有' : type}缓存吗？`)) return

  try {
    await adminApi.clearCache(type)
    await loadConfig()
    alert('缓存清理成功')
  } catch (err) {
    alert(err.response?.data?.error || '清理失败')
  }
}

onMounted(loadConfig)
</script>
```

- [ ] **Step 4: Commit**

```bash
git add web/src/views/AdminView.vue web/src/views/AdminUsersView.vue web/src/views/AdminConfigView.vue
git commit -m "feat(web): add admin pages"
```

---

### Task 12: 添加前端配置和静态资源

**Files:**
- Create: `web/src/config/index.js`
- Create: `web/public/images/default-cover.jpg`

- [ ] **Step 1: 创建前端配置 src/config/index.js**

```javascript
// src/config/index.js
export default {
  apiBase: '/api',

  player: {
    speeds: [0.5, 1, 1.5, 2, 4],
    defaultSpeed: 1,
  },

  pageSize: 50,
}
```

- [ ] **Step 2: 添加默认封面图片**

放置一张默认封面图片到 `web/public/images/default-cover.jpg`

- [ ] **Step 3: Commit**

```bash
git add web/src/config web/public
git commit -m "feat(web): add config and static assets"
```

---

### Task 13: 前端整体测试

- [ ] **Step 1: 启动后端服务**

```bash
cd server
npm run dev
```

- [ ] **Step 2: 启动前端服务**

```bash
cd web
npm run dev
```

- [ ] **Step 3: 测试登录功能**

访问 http://localhost:3000/login，使用 admin/changeme 登录

- [ ] **Step 4: 测试视频列表**

检查视频列表是否正确显示，分页是否正常

- [ ] **Step 5: 测试视频播放**

点击视频进入播放页，检查：
- 前后视视频是否同步播放
- 播放/暂停是否同步
- 进度条拖动是否正常
- 倍速切换是否正常
- 上一集/下一集是否正常

- [ ] **Step 6: 测试播放历史**

切换到播放历史 Tab，检查是否显示已播放视频

- [ ] **Step 7: 测试管理后台**

使用管理员账号登录，访问管理后台：
- 用户管理：添加、删除、重置密码
- 系统配置：修改配置、清理缓存

- [ ] **Step 8: 测试响应式布局**

在浏览器中调整窗口大小，检查移动端/PC 端布局切换

- [ ] **Step 9: 最终 Commit**

```bash
git add .
git commit -m "feat(web): complete frontend implementation"
```

---

## Phase 4 完成标准

- [ ] 登录页面正常显示和登录
- [ ] 视频列表页正常显示视频卡片
- [ ] 视频列表支持分页
- [ ] 播放历史正常显示
- [ ] 视频播放页前后视同步播放
- [ ] 播放控制正常（播放/暂停、进度、倍速）
- [ ] 上一集/下一集功能正常
- [ ] 管理后台用户管理功能正常
- [ ] 管理后台配置管理功能正常
- [ ] 响应式布局适配移动端和 PC 端

## 产出物

- 完整的 Vue3 前端应用
- 响应式 UI 设计
- 视频播放器组件
- 管理后台界面
