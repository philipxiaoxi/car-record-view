# 视频转码功能设计文档

## 概述

新增后台视频转码功能，支持一键批量转码 TS 视频为 MP4 并生成封面图。功能参照现有扫描服务设计，具备进度显示、暂停/继续、停止、增量转码、失败重试等能力。

## 背景

- 视频原始目录位于移动硬盘，启动时不应自动执行扫描和转码
- 当前转码是按需触发（用户播放时才转码），需要改为可批量预转码
- 转码后可完全不依赖原始目录播放

## 需求

1. **批量转码**：一键转码所有视频（F 和 R）并生成封面
2. **进度显示**：显示进度百分比、已处理/总数、成功/失败数量、当前文件、已用时间
3. **任务控制**：支持暂停、继续、停止
4. **增量转码**：跳过已转码文件（数据库标记 + 文件存在性双重检查）
5. **错误处理**：跳过失败文件，记录错误信息，支持重试
6. **任务互斥**：扫描和转码任务互斥，同一时间只能运行其中一个
7. **独立页面**：转码功能在管理后台有独立页面

## 数据库设计

### transcode_tasks 表

```sql
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
```

### transcode_errors 表

```sql
CREATE TABLE IF NOT EXISTS transcode_errors (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id INTEGER NOT NULL,
  filename TEXT NOT NULL,
  error_message TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (task_id) REFERENCES transcode_tasks(id)
);
```

## 后端设计

### 服务层

创建 `server/app/service/transcoder.js`，参照 `scanner.js` 设计模式：

```javascript
class TranscoderService {
  // 任务管理
  getTaskStatus(config)
  createTask(config)
  updateTaskProgress(taskId, data, config)
  getTaskDetail(taskId, config)

  // 任务控制
  startTranscode(config)
  pauseTranscode(config)
  resumeTranscode(config)
  stopTranscode(config)

  // 执行逻辑
  runTranscode(taskId, config)
  processFile(filename, config)

  // 错误处理
  getFailedFiles(taskId, config)
  retryFailed(config)
}
```

### 核心逻辑

1. 从 `videos` 表读取所有文件
2. 过滤已转码文件：`mp4_cached = 1` 且缓存文件存在
3. 每个文件执行：
   - 调用 `ffmpeg.convertTsToMp4()` 转码
   - 调用 `ffmpeg.extractCover()` 生成封面
   - 更新 `videos.mp4_cached = 1`
4. 错误记录到 `transcode_errors` 表
5. 更新任务进度

### API 设计

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/admin/transcode` | 启动转码 |
| GET | `/api/admin/transcode/status` | 获取转码状态 |
| POST | `/api/admin/transcode/pause` | 暂停转码 |
| POST | `/api/admin/transcode/resume` | 恢复转码 |
| POST | `/api/admin/transcode/stop` | 停止转码 |
| GET | `/api/admin/transcode/errors` | 获取失败文件列表 |
| POST | `/api/admin/transcode/retry` | 重试失败文件 |

### 控制器

在 `server/app/controller/admin.js` 中新增转码相关方法。

### 路由

在 `server/app/router.js` 中新增转码路由，需要管理员权限。

## 前端设计

### 新增页面

创建 `web/src/views/AdminTranscodeView.vue`：

**UI 布局**：
```
┌─────────────────────────────────────────────────┐
│ 视频转码                                         │
├─────────────────────────────────────────────────┤
│ 状态：空闲 / 转码中 / 已暂停 / 已完成 / 出错      │
│                                                 │
│ 进度：75%  ████████████████░░░░░░               │
│ 150 / 200 个文件                                │
│ 成功：148  失败：2                               │
│ 当前：V20240101-120000F.ts                      │
│ 已用时：5分30秒                                  │
│                                                 │
│ [开始转码]  [重新转码]  [暂停]  [继续]  [停止]   │
└─────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────┐
│ 失败文件                          [重试全部]    │
├─────────────────────────────────────────────────┤
│ V20240101-120000F.ts  - 磁盘空间不足            │
│ V20240102-080000R.ts  - 文件损坏                │
└─────────────────────────────────────────────────┘
```

### 路由配置

在 `web/src/router/index.js` 添加：
- 路径：`/admin/transcode`
- 组件：`AdminTranscodeView`
- 元信息：需要登录

### API 封装

在 `web/src/api/admin.js` 中新增转码相关 API 方法。

## 任务互斥逻辑

在控制器层实现：

```javascript
// 启动转码前检查
async startTranscode() {
  const scanTask = scannerService.getTaskStatus(config);
  if (scanTask && scanTask.status === 'running') {
    ctx.status = 400;
    ctx.body = { error: '扫描任务正在进行中，请等待完成后再启动转码' };
    return;
  }
  // ... 启动转码
}

// 启动扫描前检查（修改现有代码）
async startScan() {
  const transcodeTask = transcoderService.getTaskStatus(config);
  if (transcodeTask && transcodeTask.status === 'running') {
    ctx.status = 400;
    ctx.body = { error: '转码任务正在进行中，请等待完成后再启动扫描' };
    return;
  }
  // ... 启动扫描
}
```

## 存储位置

- MP4 缓存：`server/cache/mp4/`
- 封面缓存：`server/cache/covers/`

与现有按需转码使用相同目录，保持一致性。

## 文件清单

### 后端新增/修改

| 文件 | 操作 | 说明 |
|------|------|------|
| `server/app/service/transcoder.js` | 新增 | 转码服务 |
| `server/app/controller/admin.js` | 修改 | 新增转码相关方法 |
| `server/app/router.js` | 修改 | 新增转码路由 |
| `server/database/init.sql` | 修改 | 新增转码相关表 |

### 前端新增/修改

| 文件 | 操作 | 说明 |
|------|------|------|
| `web/src/views/AdminTranscodeView.vue` | 新增 | 转码管理页面 |
| `web/src/router/index.js` | 修改 | 新增转码页面路由 |
| `web/src/api/admin.js` | 修改 | 新增转码 API 方法 |

## 风险与缓解

| 风险 | 缓解措施 |
|------|----------|
| 磁盘空间不足 | 转码前检查可用空间，失败时记录错误 |
| 原始文件不存在 | 检查文件存在性，跳过不存在的文件 |
| 转码进程卡死 | 设置 FFmpeg 超时，支持停止操作 |
