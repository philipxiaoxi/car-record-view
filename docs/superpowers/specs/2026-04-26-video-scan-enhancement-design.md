# 视频扫描增强设计文档

## 概述

增强视频扫描功能，支持 F/R 文件配对扫描、进度显示、断点续扫和重新扫描。

## 一、数据库设计

新增扫描任务状态表：

```sql
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

**断点续扫原理**：已扫描的文件存储在 `videos` 表中，扫描时逐个检查是否已存在，已存在则跳过。

## 二、扫描流程

```
1. 创建扫描任务记录 (status=running)
2. 遍历 F 目录所有 .ts 文件
3. 对每个 F 文件：
   a. 更新 current_file，检查 videos 表是否已存在
   b. 若已存在 → processed_files++，跳过
   c. 若不存在：
      - 解析时间戳
      - 获取 FFmpeg 元数据
      - 插入 F 视频记录到 videos 表
      - 按文件名查找 R 目录对应文件（V...F.ts → V...R.ts）
      - 若 R 文件存在，同样处理并插入
   d. processed_files++
   e. 检查是否收到暂停/停止信号
4. 清理：删除 videos 表中有但文件系统中不存在的记录
5. 更新任务状态 (status=completed)
```

**文件匹配规则**：按文件名匹配，将 `F.ts` 替换为 `R.ts` 查找对应文件。

## 三、后端 API

| 接口 | 方法 | 描述 |
|------|------|------|
| `/api/admin/scan` | POST | 启动新的扫描任务 |
| `/api/admin/scan/status` | GET | 获取当前扫描进度 |
| `/api/admin/scan/pause` | POST | 暂停当前扫描 |
| `/api/admin/scan/resume` | POST | 恢复暂停的扫描 |
| `/api/admin/scan/stop` | POST | 停止并清除当前任务 |

**进度响应示例**：
```json
{
  "taskId": 1,
  "status": "running",
  "totalFiles": 5000,
  "processedFiles": 2350,
  "currentFile": "V20250323-195526F.ts",
  "progress": 47,
  "startedAt": "2026-04-26T12:30:00Z",
  "elapsedSeconds": 120
}
```

## 四、前端设计

在管理后台配置页面添加扫描控制区域：

```
┌─────────────────────────────────────────────────┐
│ 视频扫描                                         │
├─────────────────────────────────────────────────┤
│ 进度：47% ━━━━━━━━━━░░░░░░░░░░  2350/5000       │
│ 当前文件：V20250323-195526F.ts                   │
│ 已用时：2分30秒  预计剩余：2分50秒                │
├─────────────────────────────────────────────────┤
│ [开始扫描]  [暂停]  [停止]  [重新扫描]            │
└─────────────────────────────────────────────────┘
```

**按钮状态控制**：

| 任务状态 | 开始扫描 | 暂停 | 停止 | 重新扫描 |
|---------|---------|------|------|---------|
| 无任务/已完成 | 启用 | 禁用 | 禁用 | 禁用 |
| running | 禁用 | 启用 | 启用 | 禁用 |
| paused | 禁用 | 禁用 | 启用 | 启用 |
| error | 禁用 | 禁用 | 启用 | 启用 |

**轮询机制**：任务运行时每 2 秒轮询一次进度，非运行状态停止轮询。

## 五、关键技术决策

1. **逐个检查文件是否已扫描**：避免一次性加载大量数据到内存
2. **进度持久化到数据库**：服务重启后可恢复扫描
3. **异步后台任务**：扫描不阻塞其他 API 请求
4. **按文件名匹配 F/R**：简单可靠，符合实际文件命名规则
