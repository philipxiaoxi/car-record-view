# AI 视频分析功能设计文档

## 概述

为行车记录仪视频播放系统添加 AI 视频分析功能，使用火山引擎视频理解 API 分析视频中的潜在风险情况。

## 需求

### 功能需求

1. **AI 分析触发**：在视频播放页面提供"AI 分析"按钮，用户点击后启动分析任务
2. **摄像头选择**：支持选择前视或后视摄像头进行分析（单摄像头分析）
3. **分析维度**：
   - 碰撞风险检测
   - 车距分析
   - 车道偏离检测
   - 行人/障碍物识别
4. **异步处理**：分析任务在后台异步执行，不阻塞用户操作
5. **结果存储**：分析结果保存到数据库，支持后续查看
6. **结果展示**：以时间线列表形式展示分析结果
7. **配置管理**：在管理后台配置火山引擎 API Key 和模型 ID

### 非功能需求

1. 视频文件最大支持 512MB
2. 分析任务支持取消
3. 错误信息友好展示

## 技术架构

### 整体架构

```
┌─────────────────────────────────────────────────────────────┐
│                         前端 (Vue 3)                         │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐  │
│  │ 视频播放页  │  │ AI分析组件  │  │ 管理后台-AI配置页  │  │
│  └─────────────┘  └─────────────┘  └─────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                      后端 (Egg.js)                           │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐  │
│  │ 分析API     │  │ 任务队列    │  │ OpenAI SDK兼容封装 │  │
│  │ Controller  │  │ Service     │  │ Service             │  │
│  └─────────────┘  └─────────────┘  └─────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                      数据库 (SQLite)                         │
│  ┌─────────────┐  ┌─────────────┐                           │
│  │ video_      │  │ config      │                           │
│  │ analysis    │  │ (AI配置)    │                           │
│  └─────────────┘  └─────────────┘                           │
└─────────────────────────────────────────────────────────────┘
```

### 分析流程

```
1. 用户点击"AI分析"按钮
2. 前端发送 POST /api/videos/:timestamp/analysis 请求
3. 后端创建分析任务（状态: pending），返回任务 ID
4. 后台任务处理器检测到新任务，开始处理
5. 任务状态更新为 processing
6. 调用火山引擎 Files API 上传视频文件
7. 等待视频处理完成
8. 调用火山引擎 Responses API 获取分析结果
9. 保存结果到数据库，状态更新为 completed
10. 前端轮询获取结果，展示时间线列表
```

## 数据库设计

### video_analysis 表

```sql
CREATE TABLE video_analysis (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  video_timestamp TEXT NOT NULL,        -- 视频时间戳标识（与 videos 表关联）
  camera_type TEXT NOT NULL,            -- 摄像头类型: 'front' 或 'rear'
  status TEXT NOT NULL,                 -- 任务状态: 'pending', 'processing', 'completed', 'failed'
  result TEXT,                          -- JSON 格式的分析结果
  error_message TEXT,                   -- 错误信息（失败时）
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  completed_at DATETIME,
  file_id TEXT,                         -- 火山引擎文件 ID
  UNIQUE(video_timestamp, camera_type)  -- 同一视频的同一摄像头只保留一条分析记录
);
```

### config 表扩展

在现有 config 表中添加 AI 相关配置项：

| key | value | 说明 |
|-----|-------|------|
| ark_api_key | string | 火山引擎 API Key |
| ark_model_id | string | 模型 ID（如 doubao-seed-2-0-lite-260215） |
| ark_base_url | https://ark.cn-beijing.volces.com/api/v3 | API 基础 URL |

### 分析结果 JSON 结构

```json
{
  "summary": "整体风险概述",
  "risk_level": "low|medium|high",
  "events": [
    {
      "start_time": "00:00:05",
      "end_time": "00:00:08",
      "event": "前车急刹车",
      "risk_type": "collision",
      "danger": true,
      "description": "前车突然减速，距离快速缩短"
    },
    {
      "start_time": "00:00:15",
      "end_time": "00:00:20",
      "event": "行人横穿马路",
      "risk_type": "pedestrian",
      "danger": true,
      "description": "右侧有行人从路边走入车道"
    }
  ],
  "total_events": 5,
  "dangerous_events": 2
}
```

## API 设计

### 用户 API

#### 创建分析任务

```
POST /api/videos/:timestamp/analysis
Content-Type: application/json

Request:
{
  "cameraType": "front" | "rear"
}

Response:
{
  "id": 1,
  "status": "pending",
  "message": "分析任务已创建"
}
```

#### 获取分析结果

```
GET /api/videos/:timestamp/analysis?cameraType=front

Response:
{
  "id": 1,
  "videoTimestamp": "2024-01-01T12:00:00",
  "cameraType": "front",
  "status": "completed",
  "result": { ... },
  "createdAt": "2024-01-01T12:05:00",
  "completedAt": "2024-01-01T12:06:30"
}
```

#### 取消分析任务

```
DELETE /api/videos/:timestamp/analysis?cameraType=front

Response:
{
  "message": "分析任务已取消"
}
```

### 管理 API

#### 获取 AI 配置

```
GET /api/admin/config/ai

Response:
{
  "ark_api_key": "***",  // 脱敏显示
  "ark_model_id": "doubao-seed-2-0-lite-260215",
  "ark_base_url": "https://ark.cn-beijing.volces.com/api/v3"
}
```

#### 更新 AI 配置

```
PUT /api/admin/config/ai

Request:
{
  "ark_api_key": "your-api-key",
  "ark_model_id": "doubao-seed-2-0-lite-260215",
  "ark_base_url": "https://ark.cn-beijing.volces.com/api/v3"
}

Response:
{
  "message": "AI 配置已更新"
}
```

#### 获取分析任务队列

```
GET /api/admin/analysis/queue

Response:
{
  "pending": 2,
  "processing": 1,
  "completed": 50,
  "failed": 3,
  "tasks": [
    {
      "id": 1,
      "videoTimestamp": "2024-01-01T12:00:00",
      "cameraType": "front",
      "status": "processing",
      "createdAt": "2024-01-01T12:05:00"
    }
  ]
}
```

## 前端设计

### 视频播放页修改

在 `VideoPlayView.vue` 的控制栏中添加：

1. **AI 分析按钮**
   - 位置：收藏按钮旁边
   - 图标：mdi-brain
   - 状态：分析中时显示加载动画

2. **摄像头选择对话框**
   - 当视频有前后两个摄像头时弹出
   - 选择后创建分析任务

3. **分析状态显示**
   - 排队中：显示排队提示
   - 处理中：显示进度指示器
   - 已完成：显示查看结果按钮

4. **分析结果面板**
   - 位置：视频下方可展开面板
   - 内容：时间线列表，按时间排序
   - 交互：点击事件可跳转到对应时间点

### 新增组件

```
web/src/components/
├── AiAnalysisButton.vue      # AI分析按钮组件
├── AiAnalysisResult.vue      # 分析结果展示组件
└── AiAnalysisTimeline.vue    # 时间线列表组件
```

### 管理后台新增

在 `AdminView.vue` 添加导航项：

```
管理后台
├── 用户管理
├── 转码管理
├── 系统配置
├── AI 配置    # 新增
└── 缓存管理
```

创建 `AdminAiConfigView.vue`：
- API Key 输入框（密码类型）
- 模型 ID 选择/输入
- Base URL 输入框
- 保存按钮

## 后端实现

### 依赖安装

```bash
cd server && npm install openai
```

> 火山引擎没有提供 Node.js SDK，使用 OpenAI SDK 兼容方式调用。

### 文件结构

```
server/
├── app/
│   ├── controller/
│   │   └── analysis.js       # 分析任务控制器
│   ├── service/
│   │   ├── analysis.js       # 分析任务服务
│   │   └── ark.js            # 火山引擎 API 封装（OpenAI 兼容）
│   └── router.js             # 路由注册
└── database/
    └── migrations/
        └── 001_add_analysis_table.sql
```

### 核心服务实现

#### ark.js - 火山引擎 API 封装

使用 OpenAI SDK 兼容火山引擎 API：

```javascript
// app/service/ark.js
'use strict';

const Service = require('egg').Service;
const OpenAI = require('openai');
const fs = require('fs');
const path = require('path');

class ArkService extends Service {
  constructor(ctx) {
    super(ctx);
    this.client = null;
  }

  // 获取 OpenAI 客户端（兼容火山引擎）
  getClient() {
    if (!this.client) {
      const { ark_api_key, ark_base_url } = this.config;
      if (!ark_api_key) {
        throw new Error('ARK_API_KEY 未配置');
      }
      this.client = new OpenAI({
        baseURL: ark_base_url || 'https://ark.cn-beijing.volces.com/api/v3',
        apiKey: ark_api_key,
      });
    }
    return this.client;
  }

  // 上传视频文件到火山引擎
  async uploadVideo(filePath, fps = 0.5) {
    const client = this.getClient();

    // 使用 Files API 上传视频
    const file = await client.files.create({
      file: fs.createReadStream(filePath),
      purpose: 'user_data',
    });

    this.ctx.logger.info(`视频已上传: ${file.id}`);

    // 等待视频处理完成
    let fileInfo = file;
    while (fileInfo.status === 'processing') {
      await this.sleep(2000);
      fileInfo = await client.files.retrieve(file.id);
      this.ctx.logger.info(`视频处理中: ${fileInfo.status}`);
    }

    if (fileInfo.status === 'error') {
      throw new Error('视频处理失败');
    }

    this.ctx.logger.info(`视频处理完成: ${file.id}`);
    return fileInfo;
  }

  // 分析视频内容
  async analyzeVideo(fileId, prompt) {
    const client = this.getClient();
    const { ark_model_id } = this.config;

    if (!ark_model_id) {
      throw new Error('ARK_MODEL_ID 未配置');
    }

    const response = await client.responses.create({
      model: ark_model_id,
      input: [
        {
          role: 'user',
          content: [
            {
              type: 'input_video',
              file_id: fileId,
            },
            {
              type: 'input_text',
              text: prompt,
            },
          ],
        },
      ],
    });

    return response;
  }

  // 流式分析（可选，用于长视频）
  async *analyzeVideoStream(fileId, prompt) {
    const client = this.getClient();
    const { ark_model_id } = this.config;

    const stream = await client.responses.create({
      model: ark_model_id,
      input: [
        {
          role: 'user',
          content: [
            { type: 'input_video', file_id: fileId },
            { type: 'input_text', text: prompt },
          ],
        },
      ],
      stream: true,
    });

    for await (const event of stream) {
      yield event;
    }
  }

  // 辅助函数：延迟
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

module.exports = ArkService;
```

#### analysis.js - 分析任务服务

```javascript
// app/service/analysis.js
'use strict';

const Service = require('egg').Service;

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

class AnalysisService extends Service {
  // 创建分析任务
  async createTask(videoTimestamp, cameraType) {
    const { app } = this;

    // 检查是否已存在分析结果
    const existing = await app.db.get(
      'SELECT * FROM video_analysis WHERE video_timestamp = ? AND camera_type = ?',
      [videoTimestamp, cameraType]
    );

    if (existing && existing.status === 'completed') {
      return { id: existing.id, status: 'completed', message: '已有分析结果' };
    }

    if (existing && existing.status === 'processing') {
      return { id: existing.id, status: 'processing', message: '正在分析中' };
    }

    // 创建新任务
    const result = await app.db.run(
      `INSERT INTO video_analysis (video_timestamp, camera_type, status)
       VALUES (?, ?, 'pending')`,
      [videoTimestamp, cameraType]
    );

    return { id: result.lastID, status: 'pending', message: '分析任务已创建' };
  }

  // 获取任务状态/结果
  async getTask(videoTimestamp, cameraType) {
    const { app } = this;
    return await app.db.get(
      'SELECT * FROM video_analysis WHERE video_timestamp = ? AND camera_type = ?',
      [videoTimestamp, cameraType]
    );
  }

  // 取消任务
  async cancelTask(videoTimestamp, cameraType) {
    const { app } = this;
    await app.db.run(
      `DELETE FROM video_analysis WHERE video_timestamp = ? AND camera_type = ? AND status = 'pending'`,
      [videoTimestamp, cameraType]
    );
  }

  // 处理任务队列（定时调用）
  async processQueue() {
    const { app, ctx } = this;

    // 获取一个待处理的任务
    const task = await app.db.get(
      `SELECT * FROM video_analysis WHERE status = 'pending' ORDER BY created_at LIMIT 1`
    );

    if (!task) return;

    try {
      await this.processTask(task.id);
    } catch (err) {
      ctx.logger.error(`处理任务 ${task.id} 失败:`, err);
    }
  }

  // 处理单个任务
  async processTask(taskId) {
    const { app, ctx, service } = this;

    // 更新状态为 processing
    await app.db.run(
      `UPDATE video_analysis SET status = 'processing' WHERE id = ?`,
      [taskId]
    );

    try {
      const task = await app.db.get('SELECT * FROM video_analysis WHERE id = ?', [taskId]);

      // 获取视频文件路径
      const video = await service.video.getVideoByTimestamp(task.video_timestamp, app.config);
      const camera = task.camera_type === 'front' ? video.front : video.rear;

      if (!camera) {
        throw new Error('摄像头视频不存在');
      }

      // 获取 MP4 缓存路径
      const mp4Path = await service.video.getOrCreateMp4Cache(camera.filename, app.config);

      // 上传视频
      const fileInfo = await service.ark.uploadVideo(mp4Path.path, 0.5);

      // 分析视频
      const response = await service.ark.analyzeVideo(fileInfo.id, ANALYSIS_PROMPT);

      // 解析结果
      let result;
      try {
        // 从 response 中提取输出文本
        const outputText = response.output || response.choices?.[0]?.message?.content || '';
        result = JSON.parse(outputText);
      } catch (parseErr) {
        ctx.logger.warn('解析 AI 响应失败，保存原始文本');
        result = { raw: response.output || response };
      }

      // 保存结果
      await app.db.run(
        `UPDATE video_analysis SET status = 'completed', result = ?, completed_at = datetime('now') WHERE id = ?`,
        [JSON.stringify(result), taskId]
      );

      ctx.logger.info(`任务 ${taskId} 完成`);
    } catch (err) {
      // 标记失败
      await app.db.run(
        `UPDATE video_analysis SET status = 'failed', error_message = ? WHERE id = ?`,
        [err.message, taskId]
      );
      ctx.logger.error(`任务 ${taskId} 失败:`, err);
    }
  }
}

module.exports = AnalysisService;
```

### 控制器实现

```javascript
// app/controller/analysis.js
'use strict';

const Controller = require('egg').Controller;

class AnalysisController extends Controller {
  // 创建分析任务
  async create() {
    const { ctx, service } = this;
    const { timestamp } = ctx.params;
    const { cameraType } = ctx.request.body;

    if (!['front', 'rear'].includes(cameraType)) {
      ctx.status = 400;
      ctx.body = { error: '无效的摄像头类型' };
      return;
    }

    const result = await service.analysis.createTask(timestamp, cameraType);
    ctx.body = result;
  }

  // 获取分析结果
  async show() {
    const { ctx, service } = this;
    const { timestamp } = ctx.params;
    const { cameraType } = ctx.query;

    const task = await service.analysis.getTask(timestamp, cameraType);
    if (!task) {
      ctx.status = 404;
      ctx.body = { error: '分析任务不存在' };
      return;
    }

    ctx.body = task;
  }

  // 取消分析任务
  async destroy() {
    const { ctx, service } = this;
    const { timestamp } = ctx.params;
    const { cameraType } = ctx.query;

    await service.analysis.cancelTask(timestamp, cameraType);
    ctx.body = { message: '分析任务已取消' };
  }
}

module.exports = AnalysisController;
```

### 定时任务配置

在 `config/config.default.js` 中添加定时任务，定期处理分析队列：

```javascript
config.schedule = {
  processAnalysisQueue: {
    interval: '10s',  // 每 10 秒检查一次队列
    type: 'worker',   // 只在一个 worker 进程中执行
  },
};
```

```javascript
// app/schedule/process_analysis.js
'use strict';

const Subscription = require('egg').Subscription;

class ProcessAnalysis extends Subscription {
  static get schedule() {
    return {
      interval: '10s',
      type: 'worker',
    };
  }

  async subscribe() {
    await this.ctx.service.analysis.processQueue();
  }
}

module.exports = ProcessAnalysis;
```

## 错误处理

| 错误场景 | 处理方式 |
|---------|---------|
| API Key 未配置 | 提示"请先在管理后台配置 AI" |
| 视频文件不存在 | 提示"视频文件未找到，请确认已转码" |
| 上传失败 | 标记任务失败，记录错误信息 |
| 分析超时 | 设置 5 分钟超时，超时后标记失败 |
| API 配额不足 | 提示"API 调用受限，请稍后重试" |
| 网络错误 | 重试 3 次，失败后标记任务失败 |

## 实现优先级

### 第一阶段（核心功能）

1. 数据库表创建
2. 后端 API 实现
3. OpenAI SDK 兼容集成（调用火山引擎）
4. 前端 AI 分析按钮和结果展示

### 第二阶段（完善）

1. 管理后台 AI 配置页面
2. 任务队列管理
3. 错误处理优化

### 第三阶段（可选增强）

1. 批量分析功能
2. 分析结果导出
3. 风险统计报表

## 测试计划

### 单元测试

- ark.js API 封装测试
- analysis.js 服务测试
- API 控制器测试

### 集成测试

- 完整分析流程测试
- 错误场景测试
- 并发任务测试

### 手动测试

1. 创建分析任务 → 验证状态变化
2. 查看分析结果 → 验证时间线展示
3. 取消任务 → 验证状态更新
4. 配置管理 → 验证配置保存和读取

## 风险与缓解

| 风险 | 影响 | 缓解措施 |
|------|------|---------|
| API 调用成本 | 高 | 设置使用配额，缓存分析结果 |
| 视频文件过大 | 中 | 限制分析的文件大小，提示用户 |
| 分析结果不准确 | 低 | 优化提示词，提供用户反馈机制 |
