# Phase 3: 后端管理功能实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 实现管理员用户管理和系统配置功能。

**Architecture:** 管理员专用 API，使用 admin 中间件验证权限，SQLite 存储配置。

**Tech Stack:** better-sqlite3, bcryptjs

**前置条件:** Phase 1、Phase 2 已完成

---

## 文件结构

```
server/
├── app/
│   ├── controller/
│   │   └── admin.js        # 管理后台控制器
│   ├── service/
│   │   └── admin.js        # 管理服务
│   └── router.js           # 更新路由
```

---

### Task 1: 创建管理服务

**Files:**
- Create: `server/app/service/admin.js`

- [ ] **Step 1: 创建管理服务 app/service/admin.js**

```javascript
// app/service/admin.js
const { getDatabase } = require('./db');
const bcrypt = require('bcryptjs');
const fs = require('fs-extra');
const path = require('path');

class AdminService {
  /**
   * 获取用户列表
   */
  async getUserList(config) {
    const db = getDatabase(config);
    const users = db.prepare(`
      SELECT id, username, role, created_at FROM users ORDER BY created_at DESC
    `).all();
    return users;
  }

  /**
   * 添加用户
   */
  async addUser(username, password, role, config) {
    const db = getDatabase(config);

    // 检查用户名是否已存在
    const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
    if (existing) {
      return { error: '用户名已存在' };
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const result = db.prepare(
      'INSERT INTO users (username, password, role) VALUES (?, ?, ?)'
    ).run(username, hashedPassword, role || 'user');

    return { id: result.lastInsertRowid, username, role: role || 'user' };
  }

  /**
   * 删除用户
   */
  async deleteUser(userId, config) {
    const db = getDatabase(config);

    // 检查用户是否存在
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
    if (!user) {
      return { error: '用户不存在' };
    }

    // 不能删除自己
    // 注意：调用方需要传入当前用户 ID 进行验证

    // 删除用户的播放历史
    db.prepare('DELETE FROM play_history WHERE user_id = ?').run(userId);

    // 删除用户
    db.prepare('DELETE FROM users WHERE id = ?').run(userId);

    return { message: '删除成功' };
  }

  /**
   * 重置用户密码
   */
  async resetPassword(userId, newPassword, config) {
    const db = getDatabase(config);

    // 检查用户是否存在
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
    if (!user) {
      return { error: '用户不存在' };
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    db.prepare('UPDATE users SET password = ? WHERE id = ?').run(hashedPassword, userId);

    return { message: '密码重置成功' };
  }

  /**
   * 获取系统配置
   */
  async getConfig(config) {
    const db = getDatabase(config);

    const configs = db.prepare('SELECT key, value FROM config').all();
    const result = {};

    for (const c of configs) {
      result[c.key] = c.value;
    }

    // 合并默认配置
    return {
      videoRootDir: result.videoRootDir || config.video.rootDir,
      cacheSize: await this.getCacheSize(),
    };
  }

  /**
   * 更新系统配置
   */
  async updateConfig(key, value, config) {
    const db = getDatabase(config);

    db.prepare(`
      INSERT INTO config (key, value, updated_at) VALUES (?, ?, datetime('now'))
      ON CONFLICT(key) DO UPDATE SET value = ?, updated_at = datetime('now')
    `).run(key, value, value);

    return { message: '配置更新成功' };
  }

  /**
   * 获取缓存大小
   */
  async getCacheSize() {
    const cacheDir = path.join(__dirname, '../../cache');

    const getDirSize = async (dir) => {
      let size = 0;
      if (await fs.pathExists(dir)) {
        const files = await fs.readdir(dir);
        for (const file of files) {
          const filePath = path.join(dir, file);
          const stat = await fs.stat(filePath);
          if (stat.isDirectory()) {
            size += await getDirSize(filePath);
          } else {
            size += stat.size;
          }
        }
      }
      return size;
    };

    const bytes = await getDirSize(cacheDir);
    return {
      bytes,
      mb: (bytes / 1024 / 1024).toFixed(2),
    };
  }

  /**
   * 清理缓存
   */
  async clearCache(type, config) {
    const db = getDatabase(config);
    const cacheDir = path.join(__dirname, '../../cache');

    if (type === 'covers' || type === 'all') {
      const coversDir = path.join(cacheDir, 'covers');
      await fs.emptyDir(coversDir);
    }

    if (type === 'mp4' || type === 'all') {
      const mp4Dir = path.join(cacheDir, 'mp4');
      await fs.emptyDir(mp4Dir);

      // 更新数据库缓存状态
      db.prepare('UPDATE videos SET mp4_cached = 0').run();
    }

    return { message: '缓存清理成功' };
  }
}

module.exports = new AdminService();
```

- [ ] **Step 2: Commit**

```bash
git add server/app/service/admin.js
git commit -m "feat(server): add admin service"
```

---

### Task 2: 创建管理控制器

**Files:**
- Create: `server/app/controller/admin.js`
- Modify: `server/app/router.js`

- [ ] **Step 1: 创建管理控制器 app/controller/admin.js**

```javascript
// app/controller/admin.js
const adminService = require('../service/admin');

class AdminController {
  /**
   * 获取用户列表
   */
  async getUsers(ctx) {
    const users = await adminService.getUserList(ctx.app.config);
    ctx.body = { list: users };
  }

  /**
   * 添加用户
   */
  async addUser(ctx) {
    const { username, password, role } = ctx.request.body;

    if (!username || !password) {
      ctx.status = 400;
      ctx.body = { error: '用户名和密码不能为空' };
      return;
    }

    const result = await adminService.addUser(username, password, role, ctx.app.config);

    if (result.error) {
      ctx.status = 400;
      ctx.body = { error: result.error };
      return;
    }

    ctx.body = result;
  }

  /**
   * 删除用户
   */
  async deleteUser(ctx) {
    const { id } = ctx.params;
    const currentUserId = ctx.state.user.id;

    // 不能删除自己
    if (parseInt(id) === currentUserId) {
      ctx.status = 400;
      ctx.body = { error: '不能删除自己' };
      return;
    }

    const result = await adminService.deleteUser(parseInt(id), ctx.app.config);

    if (result.error) {
      ctx.status = 404;
      ctx.body = { error: result.error };
      return;
    }

    ctx.body = result;
  }

  /**
   * 重置用户密码
   */
  async resetPassword(ctx) {
    const { id } = ctx.params;
    const { password } = ctx.request.body;

    if (!password) {
      ctx.status = 400;
      ctx.body = { error: '密码不能为空' };
      return;
    }

    const result = await adminService.resetPassword(parseInt(id), password, ctx.app.config);

    if (result.error) {
      ctx.status = 404;
      ctx.body = { error: result.error };
      return;
    }

    ctx.body = result;
  }

  /**
   * 获取系统配置
   */
  async getConfig(ctx) {
    const config = await adminService.getConfig(ctx.app.config);
    ctx.body = config;
  }

  /**
   * 更新系统配置
   */
  async updateConfig(ctx) {
    const { videoRootDir } = ctx.request.body;

    if (videoRootDir) {
      await adminService.updateConfig('videoRootDir', videoRootDir, ctx.app.config);
      // 更新运行时配置
      ctx.app.config.video.rootDir = videoRootDir;
    }

    ctx.body = { message: '配置更新成功' };
  }

  /**
   * 清理缓存
   */
  async clearCache(ctx) {
    const { type = 'all' } = ctx.request.body;

    const result = await adminService.clearCache(type, ctx.app.config);
    ctx.body = result;
  }
}

module.exports = new AdminController();
```

- [ ] **Step 2: 更新路由 app/router.js**

```javascript
// app/router.js
module.exports = app => {
  const { router, controller } = app;
  const adminMiddleware = app.middleware.admin({}, app);

  // 认证路由
  router.post('/api/auth/login', controller.auth.login);
  router.post('/api/auth/logout', controller.auth.logout);
  router.get('/api/auth/me', controller.auth.me);

  // 视频路由（需要认证）
  router.get('/api/videos', controller.video.list);
  router.get('/api/videos/:timestamp', controller.video.detail);
  router.get('/api/videos/:filename/stream', controller.video.stream);
  router.get('/api/videos/:filename/cover', controller.video.cover);

  // 播放历史路由（需要认证）
  router.get('/api/history', controller.history.list);
  router.post('/api/history', controller.history.add);

  // 管理后台路由（需要管理员权限）
  router.get('/api/admin/users', adminMiddleware, controller.admin.getUsers);
  router.post('/api/admin/users', adminMiddleware, controller.admin.addUser);
  router.delete('/api/admin/users/:id', adminMiddleware, controller.admin.deleteUser);
  router.put('/api/admin/users/:id/password', adminMiddleware, controller.admin.resetPassword);
  router.get('/api/admin/config', adminMiddleware, controller.admin.getConfig);
  router.put('/api/admin/config', adminMiddleware, controller.admin.updateConfig);
  router.post('/api/admin/cache/clear', adminMiddleware, controller.admin.clearCache);
};
```

- [ ] **Step 3: Commit**

```bash
git add server/app/controller/admin.js server/app/router.js
git commit -m "feat(server): add admin controller and routes"
```

---

### Task 3: 测试管理 API

**Files:**
- Create: `server/test/admin.test.js`

- [ ] **Step 1: 手动测试用户管理 API**

```bash
# 获取 admin token
TOKEN=$(curl -s -X POST http://127.0.0.1:7001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"changeme"}' | jq -r '.token')

# 获取用户列表
curl http://127.0.0.1:7001/api/admin/users \
  -H "Authorization: Bearer $TOKEN"

# 添加用户
curl -X POST http://127.0.0.1:7001/api/admin/users \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"username":"testuser","password":"test123","role":"user"}'

# 重置密码
curl -X PUT http://127.0.0.1:7001/api/admin/users/2/password \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"password":"newpassword"}'

# 删除用户
curl -X DELETE http://127.0.0.1:7001/api/admin/users/2 \
  -H "Authorization: Bearer $TOKEN"
```

- [ ] **Step 2: 手动测试配置管理 API**

```bash
# 获取配置
curl http://127.0.0.1:7001/api/admin/config \
  -H "Authorization: Bearer $TOKEN"

# 更新配置
curl -X PUT http://127.0.0.1:7001/api/admin/config \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"videoRootDir":"/new/path/to/videos"}'
```

- [ ] **Step 3: 手动测试缓存清理 API**

```bash
# 清理所有缓存
curl -X POST http://127.0.0.1:7001/api/admin/cache/clear \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"type":"all"}'

# 仅清理 MP4 缓存
curl -X POST http://127.0.0.1:7001/api/admin/cache/clear \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"type":"mp4"}'
```

- [ ] **Step 4: 测试非管理员访问被拒绝**

```bash
# 创建普通用户并登录
curl -X POST http://127.0.0.1:7001/api/admin/users \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"username":"normaluser","password":"normal123"}'

USER_TOKEN=$(curl -s -X POST http://127.0.0.1:7001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"normaluser","password":"normal123"}' | jq -r '.token')

# 尝试访问管理 API（应该返回 403）
curl http://127.0.0.1:7001/api/admin/users \
  -H "Authorization: Bearer $USER_TOKEN"
```

预期：返回 403 错误

- [ ] **Step 5: Commit**

```bash
git add server/test/admin.test.js
git commit -m "test(server): add admin API tests"
```

---

## Phase 3 完成标准

- [ ] 管理员可以查看用户列表
- [ ] 管理员可以添加新用户
- [ ] 管理员可以删除用户（不能删除自己）
- [ ] 管理员可以重置用户密码
- [ ] 管理员可以查看系统配置
- [ ] 管理员可以修改视频根目录
- [ ] 管理员可以清理缓存
- [ ] 非管理员访问管理 API 返回 403

## 产出物

- 完整的用户管理 API
- 系统配置管理 API
- 缓存管理功能
- 权限验证中间件
