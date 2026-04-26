# 视频扫描增强实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 增强视频扫描功能，支持 F/R 文件配对扫描、进度显示、断点续扫和重新扫描。

**Architecture:** 新增 scan_tasks 表存储任务状态，扫描服务改为异步后台任务，前端通过轮询获取进度。

**Tech Stack:** Node.js, Egg.js, SQLite (better-sqlite3), Vue 3, Vuetify, FFmpeg

---

## 文件结构

| 文件 | 操作 | 职责 |
|------|------|------|
| `server/database/init.sql` | 修改 | 新增 scan_tasks 表 |
| `server/app/service/scanner.js` | 重写 | 异步扫描服务，支持暂停/恢复/停止 |
| `server/app/controller/admin.js` | 修改 | 新增扫描控制 API |
| `server/app/router.js` | 修改 | 新增扫描相关路由 |
| `web/src/api/admin.js` | 修改 | 新增扫描 API 调用 |
| `web/src/views/AdminConfigView.vue` | 修改 | 新增扫描进度 UI |

---

### Task 1: 数据库 - 新增 scan_tasks 表

**Files:**
- Modify: `server/database/init.sql`

- [ ] **Step 1: 添加 scan_tasks 表到 init.sql**

在 `server/database/init.sql` 末尾添加：

```sql
-- 扫描任务表
CREATE TABLE IF NOT EXISTS scan_tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  status TEXT NOT NULL DEFAULT 'pending',  -- pending/running/paused/completed/error
  total_files INTEGER DEFAULT 0,
  processed_files INTEGER DEFAULT 0,
  current_file TEXT,
  started_at DATETIME,
  finished_at DATETIME,
  error_message TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

- [ ] **Step 2: 验证 SQL 语法**

检查 SQL 语法正确，与现有表定义风格一致。

- [ ] **Step 3: 提交**

```bash
git add server/database/init.sql
git commit -m "feat(db): add scan_tasks table for scan progress tracking"
```

---

### Task 2: 重写扫描服务 - 核心逻辑

**Files:**
- Rewrite: `server/app/service/scanner.js`

- [ ] **Step 1: 编写扫描服务框架代码**

完全替换 `server/app/service/scanner.js`：

```javascript
// app/service/scanner.js
const fs = require('fs-extra');
const path = require('path');
const { getDatabase } = require('./db');
const ffmpegService = require('./ffmpeg');

class ScannerService {
  constructor() {
    this.currentTask = null;
    this.pauseRequested = false;
    this.stopRequested = false;
  }

  // 获取当前任务状态
  getTaskStatus(config) {
    const db = getDatabase(config);
    const task = db.prepare(`
      SELECT * FROM scan_tasks 
      WHERE status IN ('running', 'paused') 
      ORDER BY id DESC LIMIT 1
    `).get();
    return task || null;
  }

  // 创建新任务
  createTask(config) {
    const db = getDatabase(config);
    const result = db.prepare(`
      INSERT INTO scan_tasks (status, started_at) 
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
    
    db.prepare(`UPDATE scan_tasks SET ${sets.join(', ')} WHERE id = ?`).run(...values);
  }

  // 获取任务详情（用于 API 响应）
  getTaskDetail(taskId, config) {
    const db = getDatabase(config);
    const task = db.prepare('SELECT * FROM scan_tasks WHERE id = ?').get(taskId);
    if (!task) return null;

    const elapsed = task.started_at 
      ? Math.floor((Date.now() - new Date(task.started_at).getTime()) / 1000)
      : 0;

    return {
      taskId: task.id,
      status: task.status,
      totalFiles: task.total_files,
      processedFiles: task.processed_files,
      currentFile: task.current_file,
      progress: task.total_files > 0 ? Math.round((task.processed_files / task.total_files) * 100) : 0,
      startedAt: task.started_at,
      finishedAt: task.finished_at,
      elapsedSeconds: elapsed,
      errorMessage: task.error_message,
    };
  }

  // 解析文件名获取时间戳
  parseFilename(filename) {
    const match = filename.match(/^V(\d{8})-(\d{6})[FR]\.ts$/);
    if (!match) return null;

    const [, dateStr, timeStr] = match;
    const year = parseInt(dateStr.substring(0, 4));
    const month = parseInt(dateStr.substring(4, 6)) - 1;
    const day = parseInt(dateStr.substring(6, 8));
    const hour = parseInt(timeStr.substring(0, 2));
    const minute = parseInt(timeStr.substring(2, 4));
    const second = parseInt(timeStr.substring(4, 6));

    return new Date(year, month, day, hour, minute, second);
  }

  // 处理单个视频文件
  async processFile(filename, filePath, type, config) {
    const db = getDatabase(config);
    
    // 检查是否已存在
    const exists = db.prepare('SELECT 1 FROM videos WHERE filename = ?').get(filename);
    if (exists) return { skipped: true };

    const timestamp = this.parseFilename(filename);
    if (!timestamp) {
      return { error: '无效的文件名格式' };
    }

    const metadata = await ffmpegService.getMetadata(filePath);

    db.prepare(`
      INSERT INTO videos (filename, timestamp, type, duration, resolution, bitrate)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      filename,
      timestamp.toISOString(),
      type,
      Math.round(metadata.duration),
      metadata.resolution,
      metadata.bitrate
    );

    return { added: true };
  }

  // 启动扫描任务
  async startScan(config) {
    // 检查是否有运行中的任务
    const existingTask = this.getTaskStatus(config);
    if (existingTask) {
      return this.getTaskDetail(existingTask.id, config);
    }

    const taskId = this.createTask(config);
    this.currentTask = taskId;
    this.pauseRequested = false;
    this.stopRequested = false;

    // 异步执行扫描
    this.runScan(taskId, config).catch(err => {
      console.error('Scan error:', err);
      const db = getDatabase(config);
      db.prepare(`
        UPDATE scan_tasks 
        SET status = 'error', error_message = ?, finished_at = datetime('now')
        WHERE id = ?
      `).run(err.message, taskId);
    });

    return this.getTaskDetail(taskId, config);
  }

  // 执行扫描
  async runScan(taskId, config) {
    const db = getDatabase(config);
    const rootDir = config.video.rootDir;
    const fDir = path.join(rootDir, 'F');
    const rDir = path.join(rootDir, 'R');

    // 获取 F 目录所有文件
    let fFiles = [];
    if (await fs.pathExists(fDir)) {
      const files = await fs.readdir(fDir);
      fFiles = files.filter(f => f.endsWith('.ts'));
    }

    const totalFiles = fFiles.length;
    this.updateTaskProgress(taskId, { total_files: totalFiles }, config);

    let processed = 0;

    for (const filename of fFiles) {
      // 检查暂停/停止请求
      if (this.stopRequested) {
        this.updateTaskProgress(taskId, { 
          status: 'error', 
          error_message: '用户停止', 
          finished_at: "datetime('now')" 
        }, config);
        return;
      }

      if (this.pauseRequested) {
        this.updateTaskProgress(taskId, { status: 'paused' }, config);
        return;
      }

      this.updateTaskProgress(taskId, { current_file: filename }, config);

      const fPath = path.join(fDir, filename);

      try {
        // 处理 F 文件
        await this.processFile(filename, fPath, 'F', config);

        // 查找并处理对应的 R 文件
        const rFilename = filename.replace('F.ts', 'R.ts');
        const rPath = path.join(rDir, rFilename);
        
        if (await fs.pathExists(rPath)) {
          await this.processFile(rFilename, rPath, 'R', config);
        }
      } catch (err) {
        console.error(`Error processing ${filename}:`, err);
      }

      processed++;
      this.updateTaskProgress(taskId, { processed_files: processed }, config);
    }

    // 清理不存在的文件
    await this.cleanupMissingFiles(config);

    // 完成
    this.updateTaskProgress(taskId, { 
      status: 'completed', 
      current_file: null,
      finished_at: "datetime('now')" 
    }, config);
  }

  // 清理数据库中不存在的文件
  async cleanupMissingFiles(config) {
    const db = getDatabase(config);
    const rootDir = config.video.rootDir;
    const fDir = path.join(rootDir, 'F');
    const rDir = path.join(rootDir, 'R');

    const videos = db.prepare('SELECT filename FROM videos').all();
    
    for (const v of videos) {
      const type = v.filename.includes('F.ts') ? 'F' : 'R';
      const dir = type === 'F' ? fDir : rDir;
      const filePath = path.join(dir, v.filename);
      
      if (!(await fs.pathExists(filePath))) {
        db.prepare('DELETE FROM videos WHERE filename = ?').run(v.filename);
      }
    }
  }

  // 暂停扫描
  pauseScan(config) {
    const task = this.getTaskStatus(config);
    if (!task || task.status !== 'running') {
      return { error: '没有运行中的任务' };
    }
    this.pauseRequested = true;
    return { message: '正在暂停' };
  }

  // 恢复扫描
  resumeScan(config) {
    const db = getDatabase(config);
    const task = db.prepare(`
      SELECT * FROM scan_tasks 
      WHERE status = 'paused' 
      ORDER BY id DESC LIMIT 1
    `).get();

    if (!task) {
      return { error: '没有暂停的任务' };
    }

    this.currentTask = task.id;
    this.pauseRequested = false;
    this.stopRequested = false;

    db.prepare(`UPDATE scan_tasks SET status = 'running' WHERE id = ?`).run(task.id);

    // 继续扫描
    this.runScan(task.id, config).catch(err => {
      console.error('Resume scan error:', err);
      db.prepare(`
        UPDATE scan_tasks 
        SET status = 'error', error_message = ?, finished_at = datetime('now')
        WHERE id = ?
      `).run(err.message, task.id);
    });

    return this.getTaskDetail(task.id, config);
  }

  // 停止扫描
  stopScan(config) {
    const task = this.getTaskStatus(config);
    if (!task) {
      return { error: '没有运行中的任务' };
    }
    this.stopRequested = true;
    return { message: '正在停止' };
  }

  // 重新扫描（清除已有数据）
  async rescan(config) {
    const db = getDatabase(config);
    
    // 停止当前任务
    this.stopRequested = true;
    
    // 清空视频表
    db.prepare('DELETE FROM videos').run();
    
    // 清空任务表
    db.prepare('DELETE FROM scan_tasks').run();

    // 启动新扫描
    return this.startScan(config);
  }
}

module.exports = new ScannerService();
```

- [ ] **Step 2: 提交**

```bash
git add server/app/service/scanner.js
git commit -m "feat(scanner): rewrite scanner with async task support"
```

---

### Task 3: 更新 Admin Controller

**Files:**
- Modify: `server/app/controller/admin.js`

- [ ] **Step 1: 添加扫描相关控制器方法**

在 `AdminController` 类中添加新方法（在现有方法之后）：

```javascript
  async startScan() {
    const { ctx } = this;
    const result = await scannerService.startScan(ctx.app.config);
    ctx.body = result;
  }

  async getScanStatus() {
    const { ctx } = this;
    const task = scannerService.getTaskStatus(ctx.app.config);
    if (!task) {
      ctx.body = { status: 'idle' };
      return;
    }
    ctx.body = scannerService.getTaskDetail(task.id, ctx.app.config);
  }

  async pauseScan() {
    const { ctx } = this;
    const result = scannerService.pauseScan(ctx.app.config);
    ctx.body = result;
  }

  async resumeScan() {
    const { ctx } = this;
    const result = scannerService.resumeScan(ctx.app.config);
    ctx.body = result;
  }

  async stopScan() {
    const { ctx } = this;
    const result = scannerService.stopScan(ctx.app.config);
    ctx.body = result;
  }

  async rescan() {
    const { ctx } = this;
    const result = await scannerService.rescan(ctx.app.config);
    ctx.body = result;
  }
```

- [ ] **Step 2: 提交**

```bash
git add server/app/controller/admin.js
git commit -m "feat(admin): add scan control API endpoints"
```

---

### Task 4: 更新路由

**Files:**
- Modify: `server/app/router.js`

- [ ] **Step 1: 添加扫描相关路由**

在 `server/app/router.js` 的管理后台路由部分添加：

```javascript
  // 扫描路由
  router.post('/api/admin/scan', adminMiddleware, controller.admin.startScan);
  router.get('/api/admin/scan/status', adminMiddleware, controller.admin.getScanStatus);
  router.post('/api/admin/scan/pause', adminMiddleware, controller.admin.pauseScan);
  router.post('/api/admin/scan/resume', adminMiddleware, controller.admin.resumeScan);
  router.post('/api/admin/scan/stop', adminMiddleware, controller.admin.stopScan);
  router.post('/api/admin/scan/rescan', adminMiddleware, controller.admin.rescan);
```

- [ ] **Step 2: 提交**

```bash
git add server/app/router.js
git commit -m "feat(router): add scan control routes"
```

---

### Task 5: 更新前端 API

**Files:**
- Modify: `web/src/api/admin.js`

- [ ] **Step 1: 添加扫描相关 API 方法**

在 `web/src/api/admin.js` 的 `adminApi` 对象中添加：

```javascript
  // 扫描相关
  startScan: () => api.post('/admin/scan'),
  getScanStatus: () => api.get('/admin/scan/status'),
  pauseScan: () => api.post('/admin/scan/pause'),
  resumeScan: () => api.post('/admin/scan/resume'),
  stopScan: () => api.post('/admin/scan/stop'),
  rescan: () => api.post('/admin/scan/rescan'),
```

- [ ] **Step 2: 提交**

```bash
git add web/src/api/admin.js
git commit -m "feat(api): add scan control API methods"
```

---

### Task 6: 更新前端管理页面

**Files:**
- Modify: `web/src/views/AdminConfigView.vue`

- [ ] **Step 1: 重写 AdminConfigView.vue**

完全替换 `web/src/views/AdminConfigView.vue`：

```vue
<template>
  <v-card>
    <v-card-title>系统配置</v-card-title>
    <v-card-text>
      <!-- 扫描控制区域 -->
      <v-card variant="outlined" class="mb-4">
        <v-card-title class="text-h6">视频扫描</v-card-title>
        <v-card-text>
          <div v-if="scanStatus.status === 'idle' || scanStatus.status === 'completed'">
            <v-btn color="primary" @click="startScan" :loading="starting">开始扫描</v-btn>
            <v-btn color="warning" variant="outlined" class="ml-2" @click="rescan" :loading="rescanning">重新扫描</v-btn>
          </div>
          
          <div v-else>
            <!-- 进度条 -->
            <div class="mb-2">
              <span class="text-body-2">进度：{{ scanStatus.progress }}%</span>
              <v-progress-linear :model-value="scanStatus.progress" color="primary" class="mt-1" height="8" />
            </div>
            
            <!-- 详细信息 -->
            <div class="text-body-2 mb-2">
              {{ scanStatus.processedFiles }} / {{ scanStatus.totalFiles }} 个文件
            </div>
            <div class="text-body-2 mb-2" v-if="scanStatus.currentFile">
              当前：{{ scanStatus.currentFile }}
            </div>
            <div class="text-body-2 mb-2">
              已用时：{{ formatTime(scanStatus.elapsedSeconds) }}
            </div>
            
            <!-- 错误信息 -->
            <v-alert v-if="scanStatus.status === 'error'" type="error" density="compact" class="mb-2">
              {{ scanStatus.errorMessage }}
            </v-alert>
            
            <!-- 控制按钮 -->
            <div class="mt-3">
              <v-btn 
                v-if="scanStatus.status === 'running'" 
                color="warning" 
                variant="outlined" 
                @click="pauseScan"
                class="mr-2"
              >暂停</v-btn>
              <v-btn 
                v-if="scanStatus.status === 'paused'" 
                color="success" 
                variant="outlined" 
                @click="resumeScan"
                class="mr-2"
              >继续</v-btn>
              <v-btn 
                v-if="scanStatus.status === 'running' || scanStatus.status === 'paused'" 
                color="error" 
                variant="outlined" 
                @click="stopScan"
              >停止</v-btn>
            </div>
          </div>
        </v-card-text>
      </v-card>
      
      <!-- 配置表单 -->
      <v-form @submit.prevent="saveConfig">
        <v-text-field v-model="config.videoRootDir" label="视频根目录" outlined :rules="[v => !!v || '必填']" />
        <v-alert type="info" variant="tonal" class="mb-4">缓存大小：{{ config.cacheSize?.mb || 0 }} MB</v-alert>
        <v-btn color="error" variant="outlined" class="mr-2" @click="clearCache('all')">清理所有缓存</v-btn>
        <v-btn color="warning" variant="outlined" class="mr-2" @click="clearCache('mp4')">清理 MP4 缓存</v-btn>
        <v-btn color="info" variant="outlined" @click="clearCache('covers')">清理封面缓存</v-btn>
        <v-divider class="my-4" />
        <v-btn type="submit" color="primary" :loading="saving">保存配置</v-btn>
      </v-form>
    </v-card-text>
  </v-card>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue'
import { adminApi } from '../api/admin'

const config = ref({ videoRootDir: '', cacheSize: { bytes: 0, mb: '0' } })
const saving = ref(false)
const scanStatus = ref({ status: 'idle' })
const starting = ref(false)
const rescanning = ref(false)
let pollTimer = null

const loadConfig = async () => {
  const { data } = await adminApi.getConfig()
  config.value = data
}

const loadScanStatus = async () => {
  try {
    const { data } = await adminApi.getScanStatus()
    scanStatus.value = data
  } catch (err) {
    console.error('Failed to load scan status:', err)
  }
}

const startPolling = () => {
  if (pollTimer) return
  pollTimer = setInterval(loadScanStatus, 2000)
}

const stopPolling = () => {
  if (pollTimer) {
    clearInterval(pollTimer)
    pollTimer = null
  }
}

const startScan = async () => {
  starting.value = true
  try {
    const { data } = await adminApi.startScan()
    scanStatus.value = data
    startPolling()
  } catch (err) {
    alert(err.response?.data?.error || '启动失败')
  } finally {
    starting.value = false
  }
}

const pauseScan = async () => {
  try {
    await adminApi.pauseScan()
    await loadScanStatus()
  } catch (err) {
    alert(err.response?.data?.error || '暂停失败')
  }
}

const resumeScan = async () => {
  try {
    const { data } = await adminApi.resumeScan()
    scanStatus.value = data
    startPolling()
  } catch (err) {
    alert(err.response?.data?.error || '继续失败')
  }
}

const stopScan = async () => {
  try {
    await adminApi.stopScan()
    stopPolling()
    await loadScanStatus()
  } catch (err) {
    alert(err.response?.data?.error || '停止失败')
  }
}

const rescan = async () => {
  if (!confirm('重新扫描将清除所有现有数据，确定继续吗？')) return
  rescanning.value = true
  try {
    const { data } = await adminApi.rescan()
    scanStatus.value = data
    startPolling()
  } catch (err) {
    alert(err.response?.data?.error || '重新扫描失败')
  } finally {
    rescanning.value = false
  }
}

const saveConfig = async () => {
  saving.value = true
  try {
    await adminApi.updateConfig({ videoRootDir: config.value.videoRootDir })
    alert('配置保存成功')
  } catch (err) { 
    alert(err.response?.data?.error || '保存失败') 
  }
  finally { saving.value = false }
}

const clearCache = async (type) => {
  if (!confirm(`确定要清理${type === 'all' ? '所有' : type}缓存吗？`)) return
  try {
    await adminApi.clearCache(type)
    await loadConfig()
    alert('缓存清理成功')
  } catch (err) { alert(err.response?.data?.error || '清理失败') }
}

const formatTime = (seconds) => {
  if (!seconds) return '0秒'
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return m > 0 ? `${m}分${s}秒` : `${s}秒`
}

onMounted(async () => {
  await loadConfig()
  await loadScanStatus()
  if (scanStatus.value.status === 'running') {
    startPolling()
  }
})

onUnmounted(stopPolling)
</script>
```

- [ ] **Step 2: 提交**

```bash
git add web/src/views/AdminConfigView.vue
git commit -m "feat(admin): add scan progress UI with polling"
```

---

### Task 7: 集成测试

- [ ] **Step 1: 重启后端服务**

```bash
# 停止现有服务（如果正在运行）
# 重新启动
cd server && npm run dev
```

- [ ] **Step 2: 验证数据库表创建**

检查 SQLite 数据库中是否创建了 `scan_tasks` 表。

- [ ] **Step 3: 测试扫描 API**

使用 curl 或 Postman 测试：
- POST `/api/admin/scan` - 启动扫描
- GET `/api/admin/scan/status` - 获取进度
- POST `/api/admin/scan/pause` - 暂停
- POST `/api/admin/scan/resume` - 恢复
- POST `/api/admin/scan/stop` - 停止
- POST `/api/admin/scan/rescan` - 重新扫描

- [ ] **Step 4: 测试前端 UI**

访问管理后台配置页面，验证扫描控制 UI 是否正常工作。

- [ ] **Step 5: 最终提交（如有修改）**

```bash
git add -A
git commit -m "fix: integration fixes for scan enhancement"
```

---

## Self-Review Checklist

- [x] Spec coverage: 所有设计文档中的需求都有对应任务
- [x] Placeholder scan: 无 TBD/TODO 等占位符
- [x] Type consistency: API 响应格式前后一致
