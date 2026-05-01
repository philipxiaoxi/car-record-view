# Cookie 认证实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 JWT 认证从 Header 方式改为 Cookie 方式，使视频流和封面图接口也能受到认证保护。

**Architecture:** 登录时服务器设置 HttpOnly Cookie 存储 JWT，所有请求（包括 img/video）浏览器自动携带 Cookie，后端统一从 Cookie 验证 JWT。

**Tech Stack:** Egg.js (后端), Vue 3 + Pinia (前端), JWT + Cookie (认证)

---

## 文件结构

| 文件 | 操作 | 说明 |
|------|------|------|
| `server/app/controller/auth.js` | 修改 | 登录设置 Cookie，登出清除 Cookie |
| `server/app/middleware/jwt.js` | 修改 | 从 Cookie 读取 token 验证 |
| `web/src/api/index.js` | 修改 | 移除 Authorization header 逻辑 |
| `web/src/stores/auth.js` | 修改 | 移除 localStorage 存储，改用 Cookie |
| `web/src/views/LoginView.vue` | 修改 | 适配新的登录流程 |

---

## Task 1: 后端 - 登录时设置 Cookie

**Files:**
- Modify: `server/app/controller/auth.js:23-24`

- [ ] **Step 1: 修改 login 方法，设置 HttpOnly Cookie**

将原来的 `ctx.body = result;` 改为设置 Cookie 并返回用户信息：

```javascript
// app/controller/auth.js
async login() {
  const { ctx } = this;
  const { username, password } = ctx.request.body;

  if (!username || !password) {
    ctx.status = 400;
    ctx.body = { error: '用户名和密码不能为空' };
    return;
  }

  const result = await authService.login(username, password, ctx.app.config);

  if (result.error) {
    ctx.status = 401;
    ctx.body = { error: result.error };
    return;
  }

  // 设置 HttpOnly Cookie
  ctx.cookies.set('token', result.token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/',
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7天
  });

  // 只返回用户信息，不返回 token
  ctx.body = { user: result.user };
}
```

- [ ] **Step 2: 提交后端登录改动**

```bash
git add server/app/controller/auth.js
git commit -m "feat(auth): 登录时设置 HttpOnly Cookie 存储 JWT

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 2: 后端 - 登出时清除 Cookie

**Files:**
- Modify: `server/app/controller/auth.js:27-29`

- [ ] **Step 1: 修改 logout 方法，清除 Cookie**

```javascript
// app/controller/auth.js
async logout() {
  const { ctx } = this;
  // 清除 Cookie
  ctx.cookies.set('token', null, {
    path: '/',
    maxAge: 0,
  });
  ctx.body = { message: '登出成功' };
}
```

- [ ] **Step 2: 提交后端登出改动**

```bash
git add server/app/controller/auth.js
git commit -m "feat(auth): 登出时清除 Cookie

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 3: 后端 - 修改 JWT 中间件从 Cookie 验证

**Files:**
- Modify: `server/app/middleware/jwt.js`

- [ ] **Step 1: 重写 JWT 中间件，从 Cookie 读取 token**

完全替换文件内容：

```javascript
// app/middleware/jwt.js
const jwt = require('jsonwebtoken');

module.exports = (options, app) => {
  return async function jwtMiddleware(ctx, next) {
    // 跳过登录接口
    if (ctx.path === '/api/auth/login') {
      return await next();
    }

    // 从 Cookie 读取 token
    const token = ctx.cookies.get('token');

    if (!token) {
      ctx.status = 401;
      ctx.body = { error: '未登录' };
      return;
    }

    try {
      const decoded = jwt.verify(token, app.config.jwt.secret);
      ctx.state.user = decoded;
      await next();
    } catch (err) {
      ctx.status = 401;
      ctx.body = { error: '登录已过期，请重新登录' };
    }
  };
};
```

- [ ] **Step 2: 提交中间件改动**

```bash
git add server/app/middleware/jwt.js
git commit -m "feat(auth): JWT 中间件从 Cookie 读取 token

移除公开路径例外，所有接口统一从 Cookie 验证 JWT

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 4: 前端 - 移除 axios 拦截器中的 Authorization header

**Files:**
- Modify: `web/src/api/index.js`

- [ ] **Step 1: 移除 Authorization header 逻辑，简化拦截器**

```javascript
// web/src/api/index.js
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
```

- [ ] **Step 2: 提交前端 API 改动**

```bash
git add web/src/api/index.js
git commit -m "feat(frontend): 移除 Authorization header，改用 Cookie 认证

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 5: 前端 - 修改 auth store 移除 localStorage 存储 token

**Files:**
- Modify: `web/src/stores/auth.js`

- [ ] **Step 1: 重写 auth store，移除 token 存储，使用 Cookie 认证**

```javascript
// web/src/stores/auth.js
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
        this.logout()
      }
    },
  },
})
```

- [ ] **Step 2: 提交 auth store 改动**

```bash
git add web/src/stores/auth.js
git commit -m "feat(frontend): auth store 移除 token 存储，改用 Cookie 认证

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 6: 验证测试

**Files:**
- 无文件改动

- [ ] **Step 1: 启动后端服务**

```bash
cd /Users/philip/Documents/code/car-record-view-plus/server && npm run dev
```

- [ ] **Step 2: 启动前端服务**

```bash
cd /Users/philip/Documents/code/car-record-view-plus/web && npm run dev
```

- [ ] **Step 3: 手动测试验证**

测试用例：

1. **未登录访问视频流** - 直接访问 `http://localhost:3000/api/videos/xxx/stream`，应返回 401
2. **未登录访问封面图** - 直接访问 `http://localhost:3000/api/videos/xxx/cover`，应返回 401
3. **登录流程** - 访问登录页，输入用户名密码登录，检查：
   - Cookie 中是否设置了 token
   - 登录后能否正常访问视频列表
   - 登录后能否正常播放视频和显示封面
4. **登出流程** - 点击登出，检查：
   - Cookie 是否被清除
   - 是否跳转到登录页
   - 再次访问视频流是否返回 401

---

## Task 7: 最终提交（如有未提交的改动）

- [ ] **Step 1: 确认所有改动已提交**

```bash
git status
git log --oneline -5
```

---

## 自检清单

- [ ] 后端登录时设置 HttpOnly Cookie
- [ ] 后端登出时清除 Cookie
- [ ] JWT 中间件从 Cookie 读取 token
- [ ] 前端移除 Authorization header 逻辑
- [ ] 前端 auth store 移除 token 存储
- [ ] 视频流接口需要认证
- [ ] 封面图接口需要认证
- [ ] 登录流程正常
- [ ] 登出流程正常
