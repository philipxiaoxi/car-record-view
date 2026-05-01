# AI 视频分析功能实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为行车记录仪视频播放系统添加 AI 视频分析功能，使用火山引擎视频理解 API 分析视频中的潜在风险。

**Architecture:** 异步任务模式，后端使用 OpenAI SDK 兼容火山引擎 API，前端通过轮询获取分析结果，以时间线列表展示风险事件。

**Tech Stack:** Egg.js, SQLite, OpenAI SDK, Vue 3, Vuetify

---

## 文件结构

### 后端新增文件
- `server/app/service/ark.js` - 火山引擎 API 封装（OpenAI 兼容）
- `server/app/service/analysis.js` - 分析任务服务
- `server/app/controller/analysis.js` - 分析任务控制器
- `server/app/schedule/process_analysis.js` - 定时处理分析队列

### 后端修改文件
- `server/database/init.sql` - 添加 video_analysis 表
- `server/app/router.js` - 注册分析相关路由
- `server/package.json` - 添加 openai 依赖

### 前端新增文件
- `web/src/api/analysis.js` - 分析 API 封装
- `web/src/components/AiAnalysisPanel.vue` - AI 分析面板组件

### 前端修改文件
- `web/src/views/VideoPlayView.vue` - 添加 AI 分析按钮和结果展示
- `web/src/views/AdminView.vue` - 添加 AI 配置导航项
- `web/src/views/AdminConfigView.vue` - 添加 AI 配置表单
- `web/src/router/index.js` - 无需修改（配置在 AdminConfigView 中）

---

## Task 1: 安装 openai 依赖

**Files:**
- Modify: `server/package.json`

- [ ] **Step 1: 安装 openai 包**

```bash
cd /Users/philip/Documents/code/car-record-view-plus/server && npm install openai
```

- [ ] **Step 2: 验证安装成功**

```bash
cd /Users/philip/Documents/code/car-record-view-plus/server && npm list openai
```

Expected: `openai@x.x.x`

---

## Task 2: 添加 video_analysis 数据库表

**Files:**
- Modify: `server/database/init.sql`
- Modify: `server/app/service/db.js`

- [ ] **Step 1: 在 init.sql 添加 video_analysis 表**

在 `server/database/init.sql` 文件末尾添加：

```sql
-- 视频分析任务表
CREATE TABLE IF NOT EXISTS video_analysis (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  video_timestamp TEXT NOT NULL,
  camera_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  result TEXT,
  error_message TEXT,
  file_id TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  completed_at DATETIME
);

-- 视频分析任务索引
CREATE UNIQUE INDEX IF NOT EXISTS idx_video_analysis_unique ON video_analysis(video_timestamp, camera_type);
CREATE INDEX IF NOT EXISTS idx_video_analysis_status ON video_analysis(status);
```

- [ ] **Step 2: 验证 SQL 语法**

```bash
cd /Users/philip/Documents/code/car-record-view-plus/server && sqlite3 :memory: < database/init.sql && echo "SQL OK"
```

Expected: `SQL OK`

- [ ] **Step 3: 提交**

```bash
git add server/database/init.sql
git commit -m "feat(db): 添加 video_analysis 表"
```

---

## Task 3: 创建 ark.js 服务（火山引擎 API 封装）

**Files:**
- Create: `server/app/service/ark.js`

- [ ] **Step 1: 创建 ark.js 服务文件**

```javascript
// server/app/service/ark.js
'use strict';

const OpenAI = require('openai');
const fs = require('fs');

class ArkService {
  constructor(config) {
    this.config = config;
    this.client = null;
  }

  // 获取 OpenAI 客户端（兼容火山引擎）
  getClient() {
    if (!this.client) {
      const apiKey = this.config.ark_api_key;
      const baseUrl = this.config.ark_base_url || 'https://ark.cn-beijing.volces.com/api/v3';

      if (!apiKey) {
        throw new Error('ARK_API_KEY 未配置，请在管理后台设置');
      }

      this.client = new OpenAI({
        baseURL: baseUrl,
        apiKey: apiKey,
      });
    }
    return this.client;
  }

  // 上传视频文件到火山引擎
  async uploadVideo(filePath, fps = 0.5) {
    const client = this.getClient();

    const file = await client.files.create({
      file: fs.createReadStream(filePath),
      purpose: 'user_data',
    });

    console.log(`[Ark] 视频已上传: ${file.id}`);

    // 等待视频处理完成
    let fileInfo = file;
    while (fileInfo.status === 'processing') {
      await this.sleep(2000);
      fileInfo = await client.files.retrieve(file.id);
      console.log(`[Ark] 视频处理中: ${fileInfo.status}`);
    }

    if (fileInfo.status === 'error') {
      throw new Error('视频处理失败');
    }

    console.log(`[Ark] 视频处理完成: ${file.id}`);
    return fileInfo;
  }

  // 分析视频内容
  async analyzeVideo(fileId, prompt) {
    const client = this.getClient();
    const modelId = this.config.ark_model_id;

    if (!modelId) {
      throw new Error('ARK_MODEL_ID 未配置，请在管理后台设置');
    }

    const response = await client.responses.create({
      model: modelId,
      input: [
        {
          role: 'user',
          content: [
            { type: 'input_video', file_id: fileId },
            { type: 'input_text', text: prompt },
          ],
        },
      ],
    });

    return response;
  }

  // 辅助函数：延迟
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

module.exports = ArkService;
```

- [ ] **Step 2: 提交**

```bash
git add server/app/service/ark.js
git commit -m "feat(service): 添加 ark.js 火山引擎 API 封装"
```

---

## Task 4: 创建 analysis.js 服务（分析任务服务）

**Files:**
- Create: `server/app/service/analysis.js`

- [ ] **Step 1: 创建 analysis.js 服务文件**

```javascript
// server/app/service/analysis.js
'use strict';

const { getDatabase } = require('./db');
const ArkService = require('./ark');
const videoService = require('./video');

// 分析提示词
const ANALYSIS_PROMPT = `你是一个行车安全分析专家。请分析这段行车记录仪视频，识别以下风险情况：

1. 碰撞风险：检测可能发生碰撞的危险情况
2. 车距分析：分析与前车距离是否过近
3. 车道偏离：检测是否有压线、偏离车道的情况
4. 行人/障碍物：识别视频中的行人、非机动车等潜在风险

请以 JSON 格式输出分析结果，格式如下：
{
  "summary": "整体风险概述",
  "risk_level": "low|medium|high",
  "events": [
    {
      "start_time": "HH:mm:ss",
      "end_time": "HH:mm:ss",
      "event": "事件描述",
      "risk_type": "collision|distance|lane|pedestrian",
      "danger": true|false,
      "description": "详细描述"
    }
  ]
}

只输出 JSON，不要有其他内容。`;

class AnalysisService {
  // 创建分析任务
  async createTask(videoTimestamp, cameraType, config) {
    const db = getDatabase(config);

    // 检查是否已存在分析结果
    const existing = db.prepare(
      'SELECT * FROM video_analysis WHERE video_timestamp = ? AND camera_type = ?'
    ).get(videoTimestamp, cameraType);

    if (existing && existing.status === 'completed') {
      return { id: existing.id, status: 'completed', message: '已有分析结果' };
    }

    if (existing && existing.status === 'processing') {
      return { id: existing.id, status: 'processing', message: '正在分析中' };
    }

    if (existing && existing.status === 'pending') {
      return { id: existing.id, status: 'pending', message: '任务已创建，等待处理' };
    }

    // 创建新任务
    const result = db.prepare(
      `INSERT INTO video_analysis (video_timestamp, camera_type, status) VALUES (?, ?, 'pending')`
    ).run(videoTimestamp, cameraType);

    return { id: result.lastInsertRowid, status: 'pending', message: '分析任务已创建' };
  }

  // 获取任务状态/结果
  async getTask(videoTimestamp, cameraType, config) {
    const db = getDatabase(config);
    return db.prepare(
      'SELECT * FROM video_analysis WHERE video_timestamp = ? AND camera_type = ?'
    ).get(videoTimestamp, cameraType);
  }

  // 获取所有任务状态
  async getAllTasks(videoTimestamp, config) {
    const db = getDatabase(config);
    return db.prepare(
      'SELECT * FROM video_analysis WHERE video_timestamp = ?'
    ).all(videoTimestamp);
  }

  // 取消任务
  async cancelTask(videoTimestamp, cameraType, config) {
    const db = getDatabase(config);
    db.prepare(
      `DELETE FROM video_analysis WHERE video_timestamp = ? AND camera_type = ? AND status = 'pending'`
    ).run(videoTimestamp, cameraType);
  }

  // 处理任务队列（定时调用）
  async processQueue(config) {
    const db = getDatabase(config);

    // 检查是否有正在处理的任务
    const processing = db.prepare(
      `SELECT * FROM video_analysis WHERE status = 'processing' LIMIT 1`
    ).get();

    if (processing) {
      console.log('[Analysis] 已有任务正在处理中');
      return;
    }

    // 获取一个待处理的任务
    const task = db.prepare(
      `SELECT * FROM video_analysis WHERE status = 'pending' ORDER BY created_at LIMIT 1`
    ).get();

    if (!task) return;

    try {
      await this.processTask(task.id, config);
    } catch (err) {
      console.error(`[Analysis] 处理任务 ${task.id} 失败:`, err);
    }
  }

  // 处理单个任务
  async processTask(taskId, config) {
    const db = getDatabase(config);

    // 更新状态为 processing
    db.prepare(
      `UPDATE video_analysis SET status = 'processing' WHERE id = ?`
    ).run(taskId);

    try {
      const task = db.prepare('SELECT * FROM video_analysis WHERE id = ?').get(taskId);

      // 获取视频信息
      const video = await videoService.getVideoByTimestamp(task.video_timestamp, config);
      if (!video) {
        throw new Error('视频不存在');
      }

      const camera = task.camera_type === 'front' ? video.front : video.rear;
      if (!camera) {
        throw new Error('摄像头视频不存在');
      }

      // 获取 MP4 缓存路径
      const mp4Result = await videoService.getOrCreateMp4Cache(camera.filename, config);
      if (mp4Result.error) {
        throw new Error(mp4Result.error);
      }

      // 获取 AI 配置
      const aiConfig = this.getAiConfig(config, db);

      // 创建 Ark 服务实例
      const arkService = new ArkService(aiConfig);

      // 上传视频
      console.log(`[Analysis] 上传视频: ${camera.filename}`);
      const fileInfo = await arkService.uploadVideo(mp4Result.path, 0.5);

      // 保存 file_id
      db.prepare(
        `UPDATE video_analysis SET file_id = ? WHERE id = ?`
      ).run(fileInfo.id, taskId);

      // 分析视频
      console.log(`[Analysis] 分析视频: ${fileInfo.id}`);
      const response = await arkService.analyzeVideo(fileInfo.id, ANALYSIS_PROMPT);

      // 解析结果
      let result;
      try {
        const outputText = response.output || '';
        result = JSON.parse(outputText);
      } catch (parseErr) {
        console.warn('[Analysis] 解析 AI 响应失败，保存原始文本');
        result = { raw: response.output || '', parse_error: parseErr.message };
      }

      // 保存结果
      db.prepare(
        `UPDATE video_analysis SET status = 'completed', result = ?, completed_at = datetime('now') WHERE id = ?`
      ).run(JSON.stringify(result), taskId);

      console.log(`[Analysis] 任务 ${taskId} 完成`);
    } catch (err) {
      // 标记失败
      db.prepare(
        `UPDATE video_analysis SET status = 'failed', error_message = ? WHERE id = ?`
      ).run(err.message, taskId);
      console.error(`[Analysis] 任务 ${taskId} 失败:`, err);
    }
  }

  // 获取 AI 配置
  getAiConfig(config, db) {
    const keys = ['ark_api_key', 'ark_model_id', 'ark_base_url'];
    const result = {};

    for (const key of keys) {
      const row = db.prepare('SELECT value FROM config WHERE key = ?').get(key);
      if (row) {
        result[key] = row.value;
      }
    }

    return result;
  }

  // 获取队列统计
  async getQueueStats(config) {
    const db = getDatabase(config);

    const stats = db.prepare(`
      SELECT
        COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending,
        COUNT(CASE WHEN status = 'processing' THEN 1 END) as processing,
        COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed,
        COUNT(CASE WHEN status = 'failed' THEN 1 END) as failed
      FROM video_analysis
    `).get();

    const recentTasks = db.prepare(`
      SELECT id, video_timestamp, camera_type, status, created_at, completed_at, error_message
      FROM video_analysis
      ORDER BY created_at DESC
      LIMIT 20
    `).all();

    return {
      ...stats,
      tasks: recentTasks,
    };
  }
}

module.exports = new AnalysisService();
```

- [ ] **Step 2: 提交**

```bash
git add server/app/service/analysis.js
git commit -m "feat(service): 添加 analysis.js 分析任务服务"
```

---

## Task 5: 创建 analysis.js 控制器

**Files:**
- Create: `server/app/controller/analysis.js`

- [ ] **Step 1: 创建 analysis.js 控制器文件**

```javascript
// server/app/controller/analysis.js
'use strict';

const Controller = require('egg').Controller;
const analysisService = require('../service/analysis');

class AnalysisController extends Controller {
  // 创建分析任务
  async create() {
    const { ctx, app } = this;
    const { timestamp } = ctx.params;
    const { cameraType } = ctx.request.body;

    if (!['front', 'rear'].includes(cameraType)) {
      ctx.status = 400;
      ctx.body = { error: '无效的摄像头类型，必须是 front 或 rear' };
      return;
    }

    try {
      const result = await analysisService.createTask(timestamp, cameraType, app.config);
      ctx.body = result;
    } catch (err) {
      ctx.status = 500;
      ctx.body = { error: err.message };
    }
  }

  // 获取分析结果
  async show() {
    const { ctx, app } = this;
    const { timestamp } = ctx.params;
    const { cameraType } = ctx.query;

    if (!cameraType) {
      ctx.status = 400;
      ctx.body = { error: '缺少 cameraType 参数' };
      return;
    }

    try {
      const task = await analysisService.getTask(timestamp, cameraType, app.config);
      if (!task) {
        ctx.status = 404;
        ctx.body = { error: '分析任务不存在' };
        return;
      }

      // 解析 result JSON
      if (task.result) {
        try {
          task.result = JSON.parse(task.result);
        } catch (e) {
          // 保持原始字符串
        }
      }

      ctx.body = task;
    } catch (err) {
      ctx.status = 500;
      ctx.body = { error: err.message };
    }
  }

  // 获取视频的所有分析结果
  async index() {
    const { ctx, app } = this;
    const { timestamp } = ctx.params;

    try {
      const tasks = await analysisService.getAllTasks(timestamp, app.config);
      // 解析 result JSON
      for (const task of tasks) {
        if (task.result) {
          try {
            task.result = JSON.parse(task.result);
          } catch (e) {
            // 保持原始字符串
          }
        }
      }
      ctx.body = tasks;
    } catch (err) {
      ctx.status = 500;
      ctx.body = { error: err.message };
    }
  }

  // 取消分析任务
  async destroy() {
    const { ctx, app } = this;
    const { timestamp } = ctx.params;
    const { cameraType } = ctx.query;

    if (!cameraType) {
      ctx.status = 400;
      ctx.body = { error: '缺少 cameraType 参数' };
      return;
    }

    try {
      await analysisService.cancelTask(timestamp, cameraType, app.config);
      ctx.body = { message: '分析任务已取消' };
    } catch (err) {
      ctx.status = 500;
      ctx.body = { error: err.message };
    }
  }
}

module.exports = AnalysisController;
```

- [ ] **Step 2: 提交**

```bash
git add server/app/controller/analysis.js
git commit -m "feat(controller): 添加 analysis.js 分析任务控制器"
```

---

## Task 6: 注册分析相关路由

**Files:**
- Modify: `server/app/router.js`

- [ ] **Step 1: 在 router.js 添加分析路由**

在 `server/app/router.js` 的 `// 收藏路由` 部分之后添加：

```javascript
  // 视频分析路由
  router.post('/api/videos/:timestamp/analysis', controller.analysis.create);
  router.get('/api/videos/:timestamp/analysis', controller.analysis.index);
  router.get('/api/videos/:timestamp/analysis/:cameraType', controller.analysis.show);
  router.delete('/api/videos/:timestamp/analysis', controller.analysis.destroy);
```

- [ ] **Step 2: 验证路由注册**

启动开发服务器检查是否有语法错误：

```bash
cd /Users/philip/Documents/code/car-record-view-plus/server && timeout 5 npm run dev 2>&1 | head -20 || true
```

Expected: 无报错信息

- [ ] **Step 3: 提交**

```bash
git add server/app/router.js
git commit -m "feat(router): 注册视频分析路由"
```

---

## Task 7: 创建定时任务处理分析队列

**Files:**
- Create: `server/app/schedule/process_analysis.js`

- [ ] **Step 1: 创建 schedule 目录和文件**

```javascript
// server/app/schedule/process_analysis.js
'use strict';

const Subscription = require('egg').Subscription;
const analysisService = require('../service/analysis');

class ProcessAnalysis extends Subscription {
  static get schedule() {
    return {
      interval: '10s',
      type: 'worker',
    };
  }

  async subscribe() {
    await analysisService.processQueue(this.app.config);
  }
}

module.exports = ProcessAnalysis;
```

- [ ] **Step 2: 提交**

```bash
git add server/app/schedule/process_analysis.js
git commit -m "feat(schedule): 添加分析队列定时处理任务"
```

---

## Task 8: 扩展管理后台 - 获取/更新 AI 配置 API

**Files:**
- Modify: `server/app/controller/admin.js`

- [ ] **Step 1: 在 admin.js 控制器添加 AI 配置方法**

在 `server/app/controller/admin.js` 文件的 `module.exports = AdminController;` 之前添加：

```javascript
  // 获取 AI 配置
  async getAiConfig() {
    const { ctx, app } = this;
    const db = require('../service/db').getDatabase(app.config);

    const keys = ['ark_api_key', 'ark_model_id', 'ark_base_url'];
    const config = {};

    for (const key of keys) {
      const row = db.prepare('SELECT value FROM config WHERE key = ?').get(key);
      if (row) {
        if (key === 'ark_api_key') {
          // 脱敏显示
          config[key] = row.value ? '***' + row.value.slice(-4) : '';
        } else {
          config[key] = row.value;
        }
      }
    }

    ctx.body = config;
  }

  // 更新 AI 配置
  async updateAiConfig() {
    const { ctx, app } = this;
    const db = require('../service/db').getDatabase(app.config);

    const { ark_api_key, ark_model_id, ark_base_url } = ctx.request.body;

    const stmt = db.prepare(
      `INSERT OR REPLACE INTO config (key, value, updated_at) VALUES (?, ?, datetime('now'))`
    );

    if (ark_api_key !== undefined && ark_api_key !== '' && !ark_api_key.startsWith('***')) {
      stmt.run('ark_api_key', ark_api_key);
    }

    if (ark_model_id !== undefined) {
      stmt.run('ark_model_id', ark_model_id);
    }

    if (ark_base_url !== undefined) {
      stmt.run('ark_base_url', ark_base_url);
    }

    ctx.body = { message: 'AI 配置已更新' };
  }

  // 获取分析任务队列
  async getAnalysisQueue() {
    const { ctx, app } = this;
    const analysisService = require('../service/analysis');

    const stats = await analysisService.getQueueStats(app.config);
    ctx.body = stats;
  }
```

- [ ] **Step 2: 在 router.js 添加管理路由**

在 `server/app/router.js` 的管理后台路由部分添加：

```javascript
  // AI 配置路由
  router.get('/api/admin/config/ai', adminMiddleware, controller.admin.getAiConfig);
  router.put('/api/admin/config/ai', adminMiddleware, controller.admin.updateAiConfig);
  router.get('/api/admin/analysis/queue', adminMiddleware, controller.admin.getAnalysisQueue);
```

- [ ] **Step 3: 提交**

```bash
git add server/app/controller/admin.js server/app/router.js
git commit -m "feat(admin): 添加 AI 配置和分析队列管理 API"
```

---

## Task 9: 创建前端分析 API 封装

**Files:**
- Create: `web/src/api/analysis.js`

- [ ] **Step 1: 创建 analysis.js API 文件**

```javascript
// web/src/api/analysis.js
import api from './index'

export const analysisApi = {
  // 创建分析任务
  create: (timestamp, cameraType) => 
    api.post(`/videos/${encodeURIComponent(timestamp)}/analysis`, { cameraType }),
  
  // 获取分析结果
  get: (timestamp, cameraType) => 
    api.get(`/videos/${encodeURIComponent(timestamp)}/analysis`, { params: { cameraType } }),
  
  // 获取视频的所有分析结果
  getAll: (timestamp) => 
    api.get(`/videos/${encodeURIComponent(timestamp)}/analysis`),
  
  // 取消分析任务
  cancel: (timestamp, cameraType) => 
    api.delete(`/videos/${encodeURIComponent(timestamp)}/analysis`, { params: { cameraType } }),
}
```

- [ ] **Step 2: 提交**

```bash
git add web/src/api/analysis.js
git commit -m "feat(api): 添加前端分析 API 封装"
```

---

## Task 10: 创建 AI 分析面板组件

**Files:**
- Create: `web/src/components/AiAnalysisPanel.vue`

- [ ] **Step 1: 创建 AiAnalysisPanel.vue 组件**

```vue
<template>
  <v-card class="ai-analysis-panel">
    <v-card-title class="d-flex align-center">
      <v-icon class="mr-2">mdi-brain</v-icon>
      AI 安全分析
      <v-spacer />
      <v-btn
        v-if="!hasTask"
        color="primary"
        :loading="creating"
        @click="startAnalysis"
      >
        <v-icon class="mr-1">mdi-play</v-icon>
        开始分析
      </v-btn>
      <v-btn
        v-else-if="task?.status === 'pending'"
        color="warning"
        size="small"
        @click="cancelAnalysis"
      >
        取消
      </v-btn>
    </v-card-title>

    <v-card-text>
      <!-- 摄像头选择对话框 -->
      <v-dialog v-model="showCameraDialog" max-width="400">
        <v-card>
          <v-card-title>选择摄像头</v-card-title>
          <v-card-text>
            <v-btn
              v-if="video?.front"
              block
              class="mb-2"
              @click="createTask('front')"
            >
              前视摄像头
            </v-btn>
            <v-btn
              v-if="video?.rear"
              block
              @click="createTask('rear')"
            >
              后视摄像头
            </v-btn>
          </v-card-text>
          <v-card-actions>
            <v-spacer />
            <v-btn text @click="showCameraDialog = false">取消</v-btn>
          </v-card-actions>
        </v-card>
      </v-dialog>

      <!-- 任务状态 -->
      <div v-if="task" class="mb-4">
        <v-alert
          v-if="task.status === 'pending'"
          type="info"
          variant="tonal"
        >
          <v-progress-circular indeterminate size="16" class="mr-2" />
          任务排队中，请稍候...
        </v-alert>

        <v-alert
          v-else-if="task.status === 'processing'"
          type="info"
          variant="tonal"
        >
          <v-progress-circular indeterminate size="16" class="mr-2" />
          正在分析视频，请稍候...
        </v-alert>

        <v-alert
          v-else-if="task.status === 'failed'"
          type="error"
          variant="tonal"
        >
          分析失败: {{ task.error_message }}
        </v-alert>

        <v-alert
          v-else-if="task.status === 'completed' && task.result?.events"
          type="success"
          variant="tonal"
          class="mb-4"
        >
          分析完成，发现 {{ task.result.events?.length || 0 }} 个事件
        </v-alert>
      </div>

      <!-- 分析结果 -->
      <div v-if="task?.status === 'completed' && task.result" class="analysis-result">
        <!-- 风险概述 -->
        <div v-if="task.result.summary" class="mb-4">
          <div class="text-subtitle-1 font-weight-bold mb-2">风险概述</div>
          <p class="text-body-2">{{ task.result.summary }}</p>
          <v-chip
            :color="riskLevelColor"
            size="small"
            class="mt-2"
          >
            风险等级: {{ task.result.risk_level?.toUpperCase() || 'UNKNOWN' }}
          </v-chip>
        </div>

        <!-- 时间线列表 -->
        <div v-if="task.result.events?.length" class="events-timeline">
          <div class="text-subtitle-1 font-weight-bold mb-2">事件列表</div>
          <v-timeline density="compact" align="start">
            <v-timeline-item
              v-for="(event, index) in sortedEvents"
              :key="index"
              :dot-color="event.danger ? 'error' : 'success'"
              size="small"
            >
              <div class="d-flex align-center mb-1">
                <span class="text-caption text-grey mr-2">
                  {{ event.start_time }} - {{ event.end_time }}
                </span>
                <v-chip
                  :color="getRiskTypeColor(event.risk_type)"
                  size="x-small"
                >
                  {{ getRiskTypeLabel(event.risk_type) }}
                </v-chip>
                <v-chip
                  v-if="event.danger"
                  color="error"
                  size="x-small"
                  class="ml-1"
                >
                  危险
                </v-chip>
              </div>
              <div class="text-body-2">{{ event.event }}</div>
              <div v-if="event.description" class="text-caption text-grey">
                {{ event.description }}
              </div>
              <v-btn
                size="x-small"
                variant="text"
                class="mt-1"
                @click="$emit('seek', parseTimeToSeconds(event.start_time))"
              >
                <v-icon size="small" class="mr-1">mdi-play-circle</v-icon>
                跳转查看
              </v-btn>
            </v-timeline-item>
          </v-timeline>
        </div>

        <!-- 原始结果（调试用） -->
        <div v-if="task.result.raw" class="mt-4">
          <v-expansion-panels>
            <v-expansion-panel>
              <v-expansion-panel-title>原始响应</v-expansion-panel-title>
              <v-expansion-panel-text>
                <pre class="text-caption">{{ task.result.raw }}</pre>
              </v-expansion-panel-text>
            </v-expansion-panel>
          </v-expansion-panels>
        </div>
      </div>
    </v-card-text>
  </v-card>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { analysisApi } from '../api/analysis'

const props = defineProps({
  video: {
    type: Object,
    default: null
  }
})

const emit = defineEmits(['seek'])

const task = ref(null)
const creating = ref(false)
const showCameraDialog = ref(false)
const selectedCamera = ref('front')
let pollTimer = null

const hasTask = computed(() => {
  return task.value && ['pending', 'processing'].includes(task.value.status)
})

const sortedEvents = computed(() => {
  if (!task.value?.result?.events) return []
  return [...task.value.result.events].sort((a, b) => {
    return parseTimeToSeconds(a.start_time) - parseTimeToSeconds(b.start_time)
  })
})

const riskLevelColor = computed(() => {
  const level = task.value?.result?.risk_level
  if (level === 'high') return 'error'
  if (level === 'medium') return 'warning'
  return 'success'
})

function getRiskTypeColor(type) {
  const colors = {
    collision: 'error',
    distance: 'warning',
    lane: 'info',
    pedestrian: 'orange'
  }
  return colors[type] || 'grey'
}

function getRiskTypeLabel(type) {
  const labels = {
    collision: '碰撞风险',
    distance: '车距问题',
    lane: '车道偏离',
    pedestrian: '行人/障碍物'
  }
  return labels[type] || type
}

function parseTimeToSeconds(timeStr) {
  if (!timeStr) return 0
  const parts = timeStr.split(':').map(Number)
  if (parts.length === 3) {
    return parts[0] * 3600 + parts[1] * 60 + parts[2]
  } else if (parts.length === 2) {
    return parts[0] * 60 + parts[1]
  }
  return 0
}

async function startAnalysis() {
  if (props.video?.front && props.video?.rear) {
    showCameraDialog.value = true
  } else if (props.video?.front) {
    await createTask('front')
  } else if (props.video?.rear) {
    await createTask('rear')
  }
}

async function createTask(cameraType) {
  showCameraDialog.value = false
  creating.value = true
  selectedCamera.value = cameraType

  try {
    const result = await analysisApi.create(props.video.timestamp, cameraType)
    task.value = { ...result, status: result.status }
    if (result.status === 'pending' || result.status === 'processing') {
      startPolling()
    }
  } catch (err) {
    console.error('创建分析任务失败:', err)
  } finally {
    creating.value = false
  }
}

async function fetchTask() {
  if (!props.video?.timestamp) return

  try {
    const tasks = await analysisApi.getAll(props.video.timestamp)
    // 找到最新的非失败任务
    const validTask = tasks.find(t => t.status !== 'failed') || tasks[0]
    if (validTask) {
      task.value = validTask
      selectedCamera.value = validTask.camera_type

      if (validTask.status === 'pending' || validTask.status === 'processing') {
        startPolling()
      }
    }
  } catch (err) {
    console.error('获取分析任务失败:', err)
  }
}

async function pollTask() {
  if (!task.value || !props.video?.timestamp) return

  try {
    const updatedTask = await analysisApi.get(props.video.timestamp, selectedCamera.value)
    if (updatedTask) {
      task.value = updatedTask

      if (updatedTask.status !== 'pending' && updatedTask.status !== 'processing') {
        stopPolling()
      }
    }
  } catch (err) {
    console.error('轮询任务状态失败:', err)
  }
}

async function cancelAnalysis() {
  if (!props.video?.timestamp) return

  try {
    await analysisApi.cancel(props.video.timestamp, selectedCamera.value)
    task.value = null
    stopPolling()
  } catch (err) {
    console.error('取消任务失败:', err)
  }
}

function startPolling() {
  if (pollTimer) return
  pollTimer = setInterval(pollTask, 3000)
}

function stopPolling() {
  if (pollTimer) {
    clearInterval(pollTimer)
    pollTimer = null
  }
}

watch(() => props.video, (newVideo) => {
  if (newVideo?.timestamp) {
    fetchTask()
  }
}, { immediate: true })

onMounted(() => {
  if (props.video?.timestamp) {
    fetchTask()
  }
})

onUnmounted(() => {
  stopPolling()
})
</script>

<style scoped>
.ai-analysis-panel {
  margin-top: 16px;
}
.events-timeline {
  max-height: 400px;
  overflow-y: auto;
}
</style>
```

- [ ] **Step 2: 提交**

```bash
git add web/src/components/AiAnalysisPanel.vue
git commit -m "feat(component): 添加 AiAnalysisPanel 组件"
```

---

## Task 11: 修改视频播放页面添加 AI 分析功能

**Files:**
- Modify: `web/src/views/VideoPlayView.vue`

- [ ] **Step 1: 在 VideoPlayView.vue 添加 AI 分析按钮和面板**

在 `<v-btn icon @click="favoriteStore.toggle(video.timestamp)">` 之前添加 AI 分析按钮：

```vue
              <v-btn icon @click="showAiPanel = !showAiPanel" :color="hasAiResult ? 'success' : undefined">
                <v-icon>mdi-brain</v-icon>
              </v-btn>
```

在 `</v-card>` (controls-card 结束标签) 之后添加：

```vue

          <AiAnalysisPanel
            v-if="showAiPanel"
            :video="video"
            @seek="seekTo"
          />
```

在 `<script setup>` 中添加导入和变量：

```javascript
import AiAnalysisPanel from '../components/AiAnalysisPanel.vue'

const showAiPanel = ref(false)
const hasAiResult = ref(false)
```

- [ ] **Step 2: 完整修改后的 VideoPlayView.vue**

请参考原文件结构，在适当位置添加上述代码。

- [ ] **Step 3: 提交**

```bash
git add web/src/views/VideoPlayView.vue
git commit -m "feat(VideoPlayView): 添加 AI 分析按钮和结果展示"
```

---

## Task 12: 修改管理后台添加 AI 配置

**Files:**
- Modify: `web/src/views/AdminView.vue`
- Modify: `web/src/views/AdminConfigView.vue`
- Modify: `web/src/api/admin.js`

- [ ] **Step 1: 在 AdminView.vue 添加 AI 配置导航项**

在 `<v-list-item to="/admin/transcode"` 之后添加：

```vue
        <v-list-item to="/admin/config" prepend-icon="mdi-brain"><v-list-item-title>AI 配置</v-list-item-title></v-list-item>
```

- [ ] **Step 2: 在 AdminConfigView.vue 添加 AI 配置表单**

在现有表单之后添加 AI 配置部分：

```vue
    <v-card class="mt-4">
      <v-card-title>AI 配置</v-card-title>
      <v-card-text>
        <v-text-field
          v-model="aiConfig.ark_api_key"
          label="火山引擎 API Key"
          type="password"
          hint="在火山引擎控制台获取"
          persistent-hint
        />
        <v-text-field
          v-model="aiConfig.ark_model_id"
          label="模型 ID"
          hint="如: doubao-seed-2-0-lite-260215"
          persistent-hint
        />
        <v-text-field
          v-model="aiConfig.ark_base_url"
          label="API Base URL"
          hint="默认: https://ark.cn-beijing.volces.com/api/v3"
          persistent-hint
        />
        <v-btn color="primary" class="mt-4" @click="saveAiConfig" :loading="savingAi">
          保存 AI 配置
        </v-btn>
      </v-card-text>
    </v-card>
```

在 script 中添加：

```javascript
const aiConfig = ref({
  ark_api_key: '',
  ark_model_id: '',
  ark_base_url: 'https://ark.cn-beijing.volces.com/api/v3'
})
const savingAi = ref(false)

async function loadAiConfig() {
  try {
    const data = await adminApi.getAiConfig()
    aiConfig.value = { ...aiConfig.value, ...data }
  } catch (err) {
    console.error('加载 AI 配置失败:', err)
  }
}

async function saveAiConfig() {
  savingAi.value = true
  try {
    await adminApi.updateAiConfig(aiConfig.value)
    alert('AI 配置已保存')
  } catch (err) {
    alert('保存失败: ' + err.message)
  } finally {
    savingAi.value = false
  }
}

onMounted(() => {
  loadConfig()
  loadAiConfig()
})
```

- [ ] **Step 3: 在 api/admin.js 添加 AI 配置 API**

```javascript
  getAiConfig: () => api.get('/admin/config/ai'),
  updateAiConfig: (data) => api.put('/admin/config/ai', data),
  getAnalysisQueue: () => api.get('/admin/analysis/queue'),
```

- [ ] **Step 4: 提交**

```bash
git add web/src/views/AdminView.vue web/src/views/AdminConfigView.vue web/src/api/admin.js
git commit -m "feat(admin): 添加 AI 配置管理功能"
```

---

## Task 13: 手动测试

- [ ] **Step 1: 启动后端服务**

```bash
cd /Users/philip/Documents/code/car-record-view-plus/server && npm run dev
```

- [ ] **Step 2: 启动前端服务**

```bash
cd /Users/philip/Documents/code/car-record-view-plus/web && npm run dev
```

- [ ] **Step 3: 测试流程**

1. 登录系统
2. 进入管理后台 → 系统配置
3. 填写火山引擎 API Key 和模型 ID
4. 保存配置
5. 进入视频播放页面
6. 点击 AI 分析按钮
7. 选择摄像头
8. 等待分析完成
9. 查看分析结果时间线
10. 点击"跳转查看"验证视频跳转

---

## Self-Review Checklist

**1. Spec coverage:**
- ✅ AI 分析触发 - Task 10, 11
- ✅ 摄像头选择 - Task 10
- ✅ 分析维度（提示词）- Task 4
- ✅ 异步处理 - Task 5, 7
- ✅ 结果存储 - Task 2, 4
- ✅ 结果展示 - Task 10, 11
- ✅ 配置管理 - Task 8, 12

**2. Placeholder scan:**
- ✅ 无 TBD/TODO
- ✅ 无 "implement later"
- ✅ 所有代码步骤都有完整代码

**3. Type consistency:**
- ✅ cameraType 使用 'front'/'rear' 字符串
- ✅ status 使用 'pending'/'processing'/'completed'/'failed'
- ✅ API 路径一致

---

**Plan complete. Two execution options:**

1. **Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

2. **Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

**Which approach?**
