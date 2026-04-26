# 视频转码功能实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 实现后台视频批量转码功能，支持进度显示、暂停/继续、停止、增量转码、失败重试。

**Architecture:** 参照现有 ScannerService 模式，创建独立的 TranscoderService，通过数据库表管理任务状态，前端新增独立管理页面。

**Tech Stack:** Node.js, Egg.js, SQLite (better-sqlite3), FFmpeg, Vue 3, Vuetify

---

## 文件结构

| 文件 | 操作 | 职责 |
|------|------|------|
| `server/database/init.sql` | 修改 | 新增 transcode_tasks 和 transcode_errors 表 |
| `server/app/service/transcoder.js` | 新增 | 转码任务服务，核心业务逻辑 |
| `server/app/controller/admin.js` | 修改 | 新增转码相关控制器方法 |
| `server/app/router.js` | 修改 | 新增转码 API 路由 |
| `web/src/api/admin.js` | 修改 | 新增转码 API 封装 |
| `web/src/router/index.js` | 修改 | 新增转码页面路由 |
| `web/src/views/AdminTranscodeView.vue` | 新增 | 转码管理页面 |

---

### Task 1: 数据库表结构

**Files:**
- Modify: `server/database/init.sql`

- [ ] **Step 1: 添加 transcode_tasks 和 transcode_errors 表**

在 `server/database/init.sql` 文件末尾添加：

```sql
-- 转码任务表
CREATE TABLE IF NOT EXISTS transcode_tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  status TEXT NOT NULL DEFAULT 'pending',  -- pending/running/paused/completed/error
  total_files INTEGER DEFAULT 0,
  processed_files INTEGER DEFAULT 0,
  success_count INTEGER DEFAULT 0,
  failed_count INTEGER DEFAULT 0,
  current_file TEXT,
  started_at DATETIME,
  finished_at DATETIME,
  error_message TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 转码错误记录表
CREATE TABLE IF NOT EXISTS transcode_errors (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id INTEGER NOT NULL,
  filename TEXT NOT NULL,
  error_message TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (task_id) REFERENCES transcode_tasks(id)
);

-- 索引
CREATE INDEX IF NOT EXISTS idx_transcode_errors_task ON transcode_errors(task_id);
```

- [ ] **Step 2: 提交数据库变更**

```bash
git add server/database/init.sql
git commit -m "feat(db): add transcode_tasks and transcode_errors tables

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 2: 转码服务 - 基础结构

**Files:**
- Create: `server/app/service/transcoder.js`

- [ ] **Step 1: 创建 TranscoderService 基础结构**

创建 `server/app/service/transcoder.js`：

```javascript
// app/service/transcoder.js
const fs = require('fs-extra');
const path = require('path');
const { getDatabase } = require('./db');
const ffmpegService = require('./ffmpeg');

class TranscoderService {
  constructor() {
    this.currentTask = null;
    this.pauseRequested = false;
    this.stopRequested = false;
  }

  // 获取当前任务状态
  getTaskStatus(config) {
    const db = getDatabase(config);
    const task = db.prepare(`
      SELECT * FROM transcode_tasks
      WHERE status IN ('running', 'paused')
      ORDER BY id DESC LIMIT 1
    `).get();
    return task || null;
  }

  // 创建新任务
  createTask(config) {
    const db = getDatabase(config);
    const result = db.prepare(`
      INSERT INTO transcode_tasks (status, started_at)
      VALUES ('running', datetime('now'))
    `).run();
    return result.lastInsertRowid;
  }

  // 更新任务进度
  updateTaskProgress(taskId, data, config) {
    const db = getDatabase(config);
    const sets = [];
    const values = [];

    for (const [key, value] of Object.entries(data)) {
      sets.push(`${key} = ?`);
      values.push(value);
    }
    values.push(taskId);

    db.prepare(`UPDATE transcode_tasks SET ${sets.join(', ')} WHERE id = ?`).run(...values);
  }

  // 获取任务详情（用于 API 响应）
  getTaskDetail(taskId, config) {
    const db = getDatabase(config);
    const task = db.prepare('SELECT * FROM transcode_tasks WHERE id = ?').get(taskId);
    if (!task) return null;

    const elapsed = task.started_at
      ? Math.floor((Date.now() - new Date(task.started_at).getTime()) / 1000)
      : 0;

    return {
      taskId: task.id,
      status: task.status,
      totalFiles: task.total_files,
      processedFiles: task.processed_files,
      successCount: task.success_count,
      failedCount: task.failed_count,
      currentFile: task.current_file,
      progress: task.total_files > 0 ? Math.round((task.processed_files / task.total_files) * 100) : 0,
      startedAt: task.started_at,
      finishedAt: task.finished_at,
      elapsedSeconds: elapsed,
      errorMessage: task.error_message,
    };
  }
}

module.exports = new TranscoderService();
```

- [ ] **Step 2: 提交基础结构**

```bash
git add server/app/service/transcoder.js
git commit -m "feat(service): add TranscoderService basic structure

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 3: 转码服务 - 核心转码逻辑

**Files:**
- Modify: `server/app/service/transcoder.js`

- [ ] **Step 1: 添加缓存路径和文件检查方法**

在 `TranscoderService` 类中添加方法（在 `getTaskDetail` 方法后）：

```javascript
  // 获取缓存路径
  getCachePaths(filename) {
    const cacheDir = path.join(__dirname, '../../cache');
    return {
      mp4Path: path.join(cacheDir, 'mp4', filename.replace('.ts', '.mp4')),
      coverPath: path.join(cacheDir, 'covers', filename.replace('.ts', '.jpg')),
    };
  }

  // 检查文件是否已转码
  async isAlreadyTranscoded(filename, config) {
    const db = getDatabase(config);
    const video = db.prepare('SELECT mp4_cached FROM videos WHERE filename = ?').get(filename);
    
    if (!video || video.mp4_cached !== 1) return false;
    
    const { mp4Path, coverPath } = this.getCachePaths(filename);
    return await fs.pathExists(mp4Path) && await fs.pathExists(coverPath);
  }

  // 记录转码错误
  recordError(taskId, filename, errorMessage, config) {
    const db = getDatabase(config);
    db.prepare(`
      INSERT INTO transcode_errors (task_id, filename, error_message)
      VALUES (?, ?, ?)
    `).run(taskId, filename, errorMessage);
  }
```

- [ ] **Step 2: 添加单文件处理方法**

在 `recordError` 方法后添加：

```javascript
  // 处理单个视频文件
  async processFile(filename, config) {
    const db = getDatabase(config);
    
    // 获取视频信息
    const video = db.prepare('SELECT * FROM videos WHERE filename = ?').get(filename);
    if (!video) {
      return { error: '视频记录不存在' };
    }

    // 检查源文件是否存在
    const type = filename.includes('F.ts') ? 'F' : 'R';
    const sourcePath = path.join(config.video.rootDir, type, filename);
    
    if (!await fs.pathExists(sourcePath)) {
      return { error: '源文件不存在' };
    }

    const { mp4Path, coverPath } = this.getCachePaths(filename);

    try {
      // 转码 MP4
      await ffmpegService.convertTsToMp4(sourcePath, mp4Path);
      
      // 生成封面
      await ffmpegService.extractCover(sourcePath, coverPath);
      
      // 更新数据库
      db.prepare('UPDATE videos SET mp4_cached = 1 WHERE filename = ?').run(filename);
      
      return { success: true };
    } catch (err) {
      // 清理可能已创建的部分文件
      await fs.remove(mp4Path).catch(() => {});
      await fs.remove(coverPath).catch(() => {});
      
      return { error: err.message };
    }
  }
```

- [ ] **Step 3: 提交核心转码逻辑**

```bash
git add server/app/service/transcoder.js
git commit -m "feat(service): add transcode core logic to TranscoderService

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 4: 转码服务 - 任务控制

**Files:**
- Modify: `server/app/service/transcoder.js`

- [ ] **Step 1: 添加启动转码方法**

在 `processFile` 方法后添加：

```javascript
  // 启动转码任务
  async startTranscode(config) {
    // 检查是否有运行中的任务
    const existingTask = this.getTaskStatus(config);
    if (existingTask) {
      return this.getTaskDetail(existingTask.id, config);
    }

    const taskId = this.createTask(config);
    this.currentTask = taskId;
    this.pauseRequested = false;
    this.stopRequested = false;

    // 异步执行转码
    this.runTranscode(taskId, config).catch(err => {
      console.error('Transcode error:', err);
      const db = getDatabase(config);
      db.prepare(`
        UPDATE transcode_tasks
        SET status = 'error', error_message = ?, finished_at = datetime('now')
        WHERE id = ?
      `).run(err.message, taskId);
    });

    return this.getTaskDetail(taskId, config);
  }
```

- [ ] **Step 2: 添加执行转码方法**

在 `startTranscode` 方法后添加：

```javascript
  // 执行转码
  async runTranscode(taskId, config) {
    const db = getDatabase(config);

    // 获取所有需要转码的视频
    const videos = db.prepare('SELECT filename FROM videos ORDER BY timestamp DESC').all();
    
    // 过滤已转码文件
    const filesToTranscode = [];
    for (const v of videos) {
      if (!await this.isAlreadyTranscoded(v.filename, config)) {
        filesToTranscode.push(v.filename);
      }
    }

    const totalFiles = filesToTranscode.length;
    this.updateTaskProgress(taskId, { total_files: totalFiles }, config);

    let processed = 0;
    let successCount = 0;
    let failedCount = 0;

    for (const filename of filesToTranscode) {
      // 检查暂停/停止请求
      if (this.stopRequested) {
        this.updateTaskProgress(taskId, {
          status: 'error',
          error_message: '用户停止',
          finished_at: new Date().toISOString()
        }, config);
        return;
      }

      if (this.pauseRequested) {
        this.updateTaskProgress(taskId, { status: 'paused' }, config);
        return;
      }

      this.updateTaskProgress(taskId, { current_file: filename }, config);

      try {
        const result = await this.processFile(filename, config);
        
        if (result.success) {
          successCount++;
        } else {
          failedCount++;
          this.recordError(taskId, filename, result.error, config);
        }
      } catch (err) {
        failedCount++;
        this.recordError(taskId, filename, err.message, config);
      }

      processed++;
      this.updateTaskProgress(taskId, {
        processed_files: processed,
        success_count: successCount,
        failed_count: failedCount
      }, config);
    }

    // 完成
    this.updateTaskProgress(taskId, {
      status: 'completed',
      current_file: null,
      finished_at: new Date().toISOString()
    }, config);
  }
```

- [ ] **Step 3: 添加暂停/恢复/停止方法**

在 `runTranscode` 方法后添加：

```javascript
  // 暂停转码
  pauseTranscode(config) {
    const task = this.getTaskStatus(config);
    if (!task || task.status !== 'running') {
      return { error: '没有运行中的任务' };
    }
    this.pauseRequested = true;
    return { message: '正在暂停' };
  }

  // 恢复转码
  resumeTranscode(config) {
    const db = getDatabase(config);
    const task = db.prepare(`
      SELECT * FROM transcode_tasks
      WHERE status = 'paused'
      ORDER BY id DESC LIMIT 1
    `).get();

    if (!task) {
      return { error: '没有暂停的任务' };
    }

    this.currentTask = task.id;
    this.pauseRequested = false;
    this.stopRequested = false;

    db.prepare(`UPDATE transcode_tasks SET status = 'running' WHERE id = ?`).run(task.id);

    // 继续转码
    this.runTranscode(task.id, config).catch(err => {
      console.error('Resume transcode error:', err);
      db.prepare(`
        UPDATE transcode_tasks
        SET status = 'error', error_message = ?, finished_at = datetime('now')
        WHERE id = ?
      `).run(err.message, task.id);
    });

    return this.getTaskDetail(task.id, config);
  }

  // 停止转码
  stopTranscode(config) {
    const task = this.getTaskStatus(config);
    if (!task) {
      return { error: '没有运行中的任务' };
    }
    this.stopRequested = true;
    return { message: '正在停止' };
  }
```

- [ ] **Step 4: 提交任务控制逻辑**

```bash
git add server/app/service/transcoder.js
git commit -m "feat(service): add transcode task control methods

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 5: 转码服务 - 错误处理与重试

**Files:**
- Modify: `server/app/service/transcoder.js`

- [ ] **Step 1: 添加获取失败文件和重试方法**

在 `stopTranscode` 方法后添加：

```javascript
  // 获取失败文件列表
  getFailedFiles(config) {
    const db = getDatabase(config);
    
    // 获取最近一个任务
    const task = db.prepare(`
      SELECT id FROM transcode_tasks
      ORDER BY id DESC LIMIT 1
    `).get();
    
    if (!task) return [];

    return db.prepare(`
      SELECT filename, error_message, created_at
      FROM transcode_errors
      WHERE task_id = ?
      ORDER BY created_at DESC
    `).all(task.id);
  }

  // 重试失败文件
  async retryFailed(config) {
    const db = getDatabase(config);
    
    // 获取最近一个任务的失败文件
    const task = db.prepare(`
      SELECT id FROM transcode_tasks
      WHERE status = 'completed'
      ORDER BY id DESC LIMIT 1
    `).get();
    
    if (!task) {
      return { error: '没有已完成的任务' };
    }

    const failedFiles = db.prepare(`
      SELECT filename FROM transcode_errors
      WHERE task_id = ?
    `).all(task.id);

    if (failedFiles.length === 0) {
      return { message: '没有失败文件需要重试' };
    }

    // 创建新任务
    const newTaskId = this.createTask(config);
    this.currentTask = newTaskId;
    this.pauseRequested = false;
    this.stopRequested = false;

    // 清除这些文件的错误记录
    db.prepare('DELETE FROM transcode_errors WHERE task_id = ?').run(task.id);

    // 异步执行重试
    this.retryFiles(newTaskId, failedFiles.map(f => f.filename), config).catch(err => {
      console.error('Retry error:', err);
      db.prepare(`
        UPDATE transcode_tasks
        SET status = 'error', error_message = ?, finished_at = datetime('now')
        WHERE id = ?
      `).run(err.message, newTaskId);
    });

    return this.getTaskDetail(newTaskId, config);
  }

  // 重试指定文件
  async retryFiles(taskId, filenames, config) {
    const db = getDatabase(config);
    
    const totalFiles = filenames.length;
    this.updateTaskProgress(taskId, { total_files: totalFiles }, config);

    let processed = 0;
    let successCount = 0;
    let failedCount = 0;

    for (const filename of filenames) {
      // 检查暂停/停止请求
      if (this.stopRequested) {
        this.updateTaskProgress(taskId, {
          status: 'error',
          error_message: '用户停止',
          finished_at: new Date().toISOString()
        }, config);
        return;
      }

      if (this.pauseRequested) {
        this.updateTaskProgress(taskId, { status: 'paused' }, config);
        return;
      }

      this.updateTaskProgress(taskId, { current_file: filename }, config);

      try {
        const result = await this.processFile(filename, config);
        
        if (result.success) {
          successCount++;
        } else {
          failedCount++;
          this.recordError(taskId, filename, result.error, config);
        }
      } catch (err) {
        failedCount++;
        this.recordError(taskId, filename, err.message, config);
      }

      processed++;
      this.updateTaskProgress(taskId, {
        processed_files: processed,
        success_count: successCount,
        failed_count: failedCount
      }, config);
    }

    // 完成
    this.updateTaskProgress(taskId, {
      status: 'completed',
      current_file: null,
      finished_at: new Date().toISOString()
    }, config);
  }
```

- [ ] **Step 2: 提交错误处理逻辑**

```bash
git add server/app/service/transcoder.js
git commit -m "feat(service): add failed files retry functionality

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 6: 控制器 - 转码方法

**Files:**
- Modify: `server/app/controller/admin.js`

- [ ] **Step 1: 引入 transcoder 服务**

在 `server/app/controller/admin.js` 文件顶部添加引入：

```javascript
// app/controller/admin.js
const Controller = require('egg').Controller;
const adminService = require('../service/admin');
const scannerService = require('../service/scanner');
const transcoderService = require('../service/transcoder');  // 新增
```

- [ ] **Step 2: 添加转码控制器方法**

在 `AdminController` 类的末尾（`rescan` 方法后）添加：

```javascript
  async startTranscode() {
    const { ctx } = this;
    
    // 检查是否有运行中的扫描任务
    const scanTask = scannerService.getTaskStatus(ctx.app.config);
    if (scanTask && scanTask.status === 'running') {
      ctx.status = 400;
      ctx.body = { error: '扫描任务正在进行中，请等待完成后再启动转码' };
      return;
    }
    
    const result = await transcoderService.startTranscode(ctx.app.config);
    ctx.body = result;
  }

  async getTranscodeStatus() {
    const { ctx } = this;
    const task = transcoderService.getTaskStatus(ctx.app.config);
    if (!task) {
      ctx.body = { status: 'idle' };
      return;
    }
    ctx.body = transcoderService.getTaskDetail(task.id, ctx.app.config);
  }

  async pauseTranscode() {
    const { ctx } = this;
    const result = transcoderService.pauseTranscode(ctx.app.config);
    ctx.body = result;
  }

  async resumeTranscode() {
    const { ctx } = this;
    const result = transcoderService.resumeTranscode(ctx.app.config);
    ctx.body = result;
  }

  async stopTranscode() {
    const { ctx } = this;
    const result = transcoderService.stopTranscode(ctx.app.config);
    ctx.body = result;
  }

  async getTranscodeErrors() {
    const { ctx } = this;
    const errors = transcoderService.getFailedFiles(ctx.app.config);
    ctx.body = { list: errors };
  }

  async retryTranscode() {
    const { ctx } = this;
    const result = await transcoderService.retryFailed(ctx.app.config);
    ctx.body = result;
  }
```

- [ ] **Step 3: 修改 startScan 方法添加互斥检查**

找到 `startScan` 方法，在开头添加检查：

```javascript
  async startScan() {
    const { ctx } = this;
    
    // 检查是否有运行中的转码任务
    const transcodeTask = transcoderService.getTaskStatus(ctx.app.config);
    if (transcodeTask && transcodeTask.status === 'running') {
      ctx.status = 400;
      ctx.body = { error: '转码任务正在进行中，请等待完成后再启动扫描' };
      return;
    }
    
    const result = await scannerService.startScan(ctx.app.config);
    ctx.body = result;
  }
```

- [ ] **Step 4: 提交控制器变更**

```bash
git add server/app/controller/admin.js
git commit -m "feat(controller): add transcode API methods with mutual exclusion

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 7: 路由配置

**Files:**
- Modify: `server/app/router.js`

- [ ] **Step 1: 添加转码路由**

在 `server/app/router.js` 中，在扫描路由后添加转码路由：

```javascript
  // 扫描路由
  router.post('/api/admin/scan', adminMiddleware, controller.admin.startScan);
  router.get('/api/admin/scan/status', adminMiddleware, controller.admin.getScanStatus);
  router.post('/api/admin/scan/pause', adminMiddleware, controller.admin.pauseScan);
  router.post('/api/admin/scan/resume', adminMiddleware, controller.admin.resumeScan);
  router.post('/api/admin/scan/stop', adminMiddleware, controller.admin.stopScan);
  router.post('/api/admin/scan/rescan', adminMiddleware, controller.admin.rescan);
  
  // 转码路由
  router.post('/api/admin/transcode', adminMiddleware, controller.admin.startTranscode);
  router.get('/api/admin/transcode/status', adminMiddleware, controller.admin.getTranscodeStatus);
  router.post('/api/admin/transcode/pause', adminMiddleware, controller.admin.pauseTranscode);
  router.post('/api/admin/transcode/resume', adminMiddleware, controller.admin.resumeTranscode);
  router.post('/api/admin/transcode/stop', adminMiddleware, controller.admin.stopTranscode);
  router.get('/api/admin/transcode/errors', adminMiddleware, controller.admin.getTranscodeErrors);
  router.post('/api/admin/transcode/retry', adminMiddleware, controller.admin.retryTranscode);
  
  // 用户管理路由
```

- [ ] **Step 2: 提交路由配置**

```bash
git add server/app/router.js
git commit -m "feat(router): add transcode API routes

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 8: 前端 API 封装

**Files:**
- Modify: `web/src/api/admin.js`

- [ ] **Step 1: 添加转码 API 方法**

在 `web/src/api/admin.js` 文件中，在扫描相关 API 后添加：

```javascript
  // 扫描相关
  startScan: () => api.post('/admin/scan'),
  getScanStatus: () => api.get('/admin/scan/status'),
  pauseScan: () => api.post('/admin/scan/pause'),
  resumeScan: () => api.post('/admin/scan/resume'),
  stopScan: () => api.post('/admin/scan/stop'),
  rescan: () => api.post('/admin/scan/rescan'),

  // 转码相关
  startTranscode: () => api.post('/admin/transcode'),
  getTranscodeStatus: () => api.get('/admin/transcode/status'),
  pauseTranscode: () => api.post('/admin/transcode/pause'),
  resumeTranscode: () => api.post('/admin/transcode/resume'),
  stopTranscode: () => api.post('/admin/transcode/stop'),
  getTranscodeErrors: () => api.get('/admin/transcode/errors'),
  retryTranscode: () => api.post('/admin/transcode/retry'),
}
```

- [ ] **Step 2: 提交前端 API 封装**

```bash
git add web/src/api/admin.js
git commit -m "feat(api): add transcode API methods

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 9: 前端路由配置

**Files:**
- Modify: `web/src/router/index.js`

- [ ] **Step 1: 添加转码页面路由**

修改 `web/src/router/index.js`，在 Admin 子路由中添加：

```javascript
const routes = [
  { path: '/login', name: 'Login', component: () => import('../views/LoginView.vue'), meta: { public: true } },
  { path: '/', name: 'VideoList', component: () => import('../views/VideoListView.vue') },
  { path: '/play/:timestamp', name: 'VideoPlay', component: () => import('../views/VideoPlayView.vue') },
  { path: '/admin', name: 'Admin', component: () => import('../views/AdminView.vue'), meta: { admin: true },
    children: [
      { path: 'users', name: 'AdminUsers', component: () => import('../views/AdminUsersView.vue') },
      { path: 'config', name: 'AdminConfig', component: () => import('../views/AdminConfigView.vue') },
      { path: 'transcode', name: 'AdminTranscode', component: () => import('../views/AdminTranscodeView.vue') },
    ]
  },
]
```

- [ ] **Step 2: 提交路由配置**

```bash
git add web/src/router/index.js
git commit -m "feat(router): add transcode page route

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 10: 转码管理页面

**Files:**
- Create: `web/src/views/AdminTranscodeView.vue`

- [ ] **Step 1: 创建转码管理页面**

创建 `web/src/views/AdminTranscodeView.vue`：

```vue
<template>
  <v-card>
    <v-card-title>视频转码</v-card-title>
    <v-card-text>
      <!-- 转码控制区域 -->
      <v-card variant="outlined" class="mb-4">
        <v-card-title class="text-h6">转码任务</v-card-title>
        <v-card-text>
          <div v-if="transcodeStatus.status === 'idle' || transcodeStatus.status === 'completed'">
            <v-btn color="primary" @click="startTranscode" :loading="starting">开始转码</v-btn>
            <v-btn 
              v-if="transcodeStatus.status === 'completed' && transcodeStatus.failedCount > 0"
              color="warning" 
              variant="outlined" 
              class="ml-2" 
              @click="retryFailed"
              :loading="retrying"
            >重试失败文件</v-btn>
          </div>

          <div v-else>
            <!-- 进度条 -->
            <div class="mb-2">
              <span class="text-body-2">进度：{{ transcodeStatus.progress }}%</span>
              <v-progress-linear :model-value="transcodeStatus.progress" color="primary" class="mt-1" height="8" />
            </div>

            <!-- 详细信息 -->
            <div class="text-body-2 mb-2">
              {{ transcodeStatus.processedFiles }} / {{ transcodeStatus.totalFiles }} 个文件
            </div>
            <div class="text-body-2 mb-2">
              成功：{{ transcodeStatus.successCount }}  失败：{{ transcodeStatus.failedCount }}
            </div>
            <div class="text-body-2 mb-2" v-if="transcodeStatus.currentFile">
              当前：{{ transcodeStatus.currentFile }}
            </div>
            <div class="text-body-2 mb-2">
              已用时：{{ formatTime(transcodeStatus.elapsedSeconds) }}
            </div>

            <!-- 错误信息 -->
            <v-alert v-if="transcodeStatus.status === 'error'" type="error" density="compact" class="mb-2">
              {{ transcodeStatus.errorMessage }}
            </v-alert>

            <!-- 控制按钮 -->
            <div class="mt-3">
              <v-btn
                v-if="transcodeStatus.status === 'running'"
                color="warning"
                variant="outlined"
                @click="pauseTranscode"
                class="mr-2"
              >暂停</v-btn>
              <v-btn
                v-if="transcodeStatus.status === 'paused'"
                color="success"
                variant="outlined"
                @click="resumeTranscode"
                class="mr-2"
              >继续</v-btn>
              <v-btn
                v-if="transcodeStatus.status === 'running' || transcodeStatus.status === 'paused' || transcodeStatus.status === 'error'"
                color="error"
                variant="outlined"
                @click="stopTranscode"
              >停止</v-btn>
            </div>
          </div>
        </v-card-text>
      </v-card>

      <!-- 失败文件列表 -->
      <v-card variant="outlined" v-if="failedFiles.length > 0">
        <v-card-title class="text-h6 d-flex justify-space-between align-center">
          <span>失败文件</span>
          <v-btn color="warning" variant="outlined" size="small" @click="retryFailed" :loading="retrying">
            重试全部
          </v-btn>
        </v-card-title>
        <v-card-text>
          <v-list density="compact">
            <v-list-item v-for="file in failedFiles" :key="file.filename">
              <v-list-item-title>{{ file.filename }}</v-list-item-title>
              <v-list-item-subtitle class="text-error">{{ file.error_message }}</v-list-item-subtitle>
            </v-list-item>
          </v-list>
        </v-card-text>
      </v-card>
    </v-card-text>
  </v-card>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue'
import { adminApi } from '../api/admin'

const transcodeStatus = ref({ status: 'idle' })
const failedFiles = ref([])
const starting = ref(false)
const retrying = ref(false)
let pollTimer = null

const loadTranscodeStatus = async () => {
  try {
    const { data } = await adminApi.getTranscodeStatus()
    transcodeStatus.value = data
  } catch (err) {
    console.error('Failed to load transcode status:', err)
  }
}

const loadFailedFiles = async () => {
  try {
    const { data } = await adminApi.getTranscodeErrors()
    failedFiles.value = data.list || []
  } catch (err) {
    console.error('Failed to load failed files:', err)
  }
}

const startPolling = () => {
  if (pollTimer) return
  pollTimer = setInterval(() => {
    loadTranscodeStatus()
    loadFailedFiles()
  }, 2000)
}

const stopPolling = () => {
  if (pollTimer) {
    clearInterval(pollTimer)
    pollTimer = null
  }
}

const startTranscode = async () => {
  starting.value = true
  try {
    const { data } = await adminApi.startTranscode()
    transcodeStatus.value = data
    startPolling()
  } catch (err) {
    alert(err.response?.data?.error || '启动失败')
  } finally {
    starting.value = false
  }
}

const pauseTranscode = async () => {
  try {
    await adminApi.pauseTranscode()
    await loadTranscodeStatus()
  } catch (err) {
    alert(err.response?.data?.error || '暂停失败')
  }
}

const resumeTranscode = async () => {
  try {
    const { data } = await adminApi.resumeTranscode()
    transcodeStatus.value = data
    startPolling()
  } catch (err) {
    alert(err.response?.data?.error || '继续失败')
  }
}

const stopTranscode = async () => {
  try {
    await adminApi.stopTranscode()
    stopPolling()
    await loadTranscodeStatus()
  } catch (err) {
    alert(err.response?.data?.error || '停止失败')
  }
}

const retryFailed = async () => {
  retrying.value = true
  try {
    const { data } = await adminApi.retryTranscode()
    transcodeStatus.value = data
    startPolling()
  } catch (err) {
    alert(err.response?.data?.error || '重试失败')
  } finally {
    retrying.value = false
  }
}

const formatTime = (seconds) => {
  if (!seconds) return '0秒'
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return m > 0 ? `${m}分${s}秒` : `${s}秒`
}

onMounted(async () => {
  await loadTranscodeStatus()
  await loadFailedFiles()
  if (transcodeStatus.value.status === 'running') {
    startPolling()
  }
})

onUnmounted(stopPolling)
</script>
```

- [ ] **Step 2: 提交转码页面**

```bash
git add web/src/views/AdminTranscodeView.vue
git commit -m "feat(view): add AdminTranscodeView page

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 11: 更新管理后台导航

**Files:**
- Modify: `web/src/views/AdminView.vue`

- [ ] **Step 1: 添加转码导航项**

修改 `web/src/views/AdminView.vue`，在用户管理和系统配置之间添加转码管理导航：

```vue
<template>
  <v-layout>
    <v-navigation-drawer v-model="drawer" app>
      <v-list>
        <v-list-item to="/admin/users" prepend-icon="mdi-account-group"><v-list-item-title>用户管理</v-list-item-title></v-list-item>
        <v-list-item to="/admin/config" prepend-icon="mdi-cog"><v-list-item-title>系统配置</v-list-item-title></v-list-item>
        <v-list-item to="/admin/transcode" prepend-icon="mdi-video-outline"><v-list-item-title>视频转码</v-list-item-title></v-list-item>
        <v-divider class="my-2" />
        <v-list-item to="/" prepend-icon="mdi-video"><v-list-item-title>返回首页</v-list-item-title></v-list-item>
      </v-list>
    </v-navigation-drawer>

    <v-app-bar app color="primary" dark>
      <v-app-bar-nav-icon @click="drawer = !drawer" />
      <v-toolbar-title>管理后台</v-toolbar-title>
    </v-app-bar>

    <v-main>
      <v-container fluid>
        <router-view />
      </v-container>
    </v-main>
  </v-layout>
</template>

<script setup>
import { ref } from 'vue'
const drawer = ref(true)
</script>
```

- [ ] **Step 2: 提交导航更新**

```bash
git add web/src/views/AdminView.vue
git commit -m "feat(view): add transcode navigation item

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 12: 集成测试

- [ ] **Step 1: 启动后端服务测试**

```bash
cd server && npm run dev
```

- [ ] **Step 2: 测试 API 端点**

使用 curl 或 Postman 测试：
- POST `/api/admin/transcode` - 启动转码
- GET `/api/admin/transcode/status` - 获取状态
- POST `/api/admin/transcode/pause` - 暂停
- POST `/api/admin/transcode/resume` - 恢复
- POST `/api/admin/transcode/stop` - 停止
- GET `/api/admin/transcode/errors` - 获取失败列表
- POST `/api/admin/transcode/retry` - 重试

- [ ] **Step 3: 启动前端服务测试**

```bash
cd web && npm run dev
```

- [ ] **Step 4: 测试前端页面**

访问 `/admin/transcode` 测试完整流程。

- [ ] **Step 5: 提交最终版本**

```bash
git add -A
git commit -m "feat: complete video transcode feature

- Add transcode_tasks and transcode_errors database tables
- Add TranscoderService with task control and retry support
- Add transcode API endpoints with mutual exclusion
- Add AdminTranscodeView page with progress UI

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```
