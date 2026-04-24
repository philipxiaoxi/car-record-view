# 信界流媒体后视镜记录仪视频播放器设计文档

## 项目概述

信界流媒体后视镜记录仪录制的视频为 TS 格式，前视视频存放在 F 目录，后视视频存放在 R 目录，无法同时播放观看。本项目旨在开发一个 Web 应用，支持移动端和 PC 端，实现前后视视频同步播放。

## 技术栈

| 层级 | 技术选型 |
|------|----------|
| 后端框架 | egg.js |
| 数据库 | SQLite |
| 前端框架 | Vite + Vue3 |
| UI 框架 | Vuetify |
| 状态管理 | Pinia |
| 视频处理 | FFmpeg |
| 认证方式 | JWT |

## 项目目录结构

```
car-record-view-plus/
├── server/                     # 后端 egg.js 项目
│   ├── app/
│   │   ├── controller/        # 控制器
│   │   ├── service/           # 业务逻辑
│   │   ├── model/             # 数据模型
│   │   ├── middleware/        # 中间件（JWT 认证等）
│   │   └── router.js          # 路由
│   ├── config/
│   │   ├── config.default.js  # 默认配置
│   │   └── config.prod.js     # 生产配置
│   ├── cache/                 # 缓存目录
│   │   ├── covers/            # 视频封面
│   │   └── mp4/               # MP4 缓存
│   ├── database/              # SQLite 数据库文件
│   └── package.json
│
├── web/                        # 前端 Vue3 项目
│   ├── src/
│   │   ├── views/             # 页面组件
│   │   ├── components/        # 通用组件
│   │   ├── api/               # API 请求
│   │   ├── stores/            # Pinia 状态管理
│   │   └── router/            # 路由配置
│   └── package.json
│
└── docs/                       # 文档
```

## 视频存储结构

```
{视频根目录}/                    # 配置指定，如 /path/to/videos/...
├── F/                          # 前视摄像头视频
│   ├── V20250323-195526F.ts
│   └── ...
└── R/                          # 后视摄像头视频
    ├── V20250323-195526R.ts
    └── ...

文件命名规则：V{YYYYMMDD}-{HHMMSS}{F|R}.ts
- YYYYMMDD：录制日期
- HHMMSS：录制时间
- F：前视摄像头，R：后视摄像头
```

## 数据库设计

### 用户表 (users)

| 字段 | 类型 | 说明 |
|------|------|------|
| id | INTEGER | 主键，自增 |
| username | TEXT | 用户名，唯一 |
| password | TEXT | 密码，bcrypt 加密 |
| role | TEXT | 角色：'admin' \| 'user' |
| created_at | DATETIME | 创建时间 |

### 视频元数据表 (videos)

| 字段 | 类型 | 说明 |
|------|------|------|
| id | INTEGER | 主键，自增 |
| filename | TEXT | 文件名，如 V20250323-195526F.ts |
| timestamp | DATETIME | 录制时间戳 |
| type | TEXT | 类型：'F' \| 'R' |
| duration | INTEGER | 时长（秒） |
| resolution | TEXT | 分辨率，如 1920x1080 |
| bitrate | INTEGER | 码率 (kbps) |
| mp4_cached | INTEGER | 是否已转 MP4 缓存：0 \| 1 |
| created_at | DATETIME | 创建时间 |

### 播放历史表 (play_history)

| 字段 | 类型 | 说明 |
|------|------|------|
| id | INTEGER | 主键，自增 |
| user_id | INTEGER | 用户 ID，外键 |
| video_timestamp | DATETIME | 视频时间戳（关联前后视） |
| played_at | DATETIME | 播放时间 |

### 索引

```sql
CREATE INDEX idx_videos_timestamp ON videos(timestamp);
CREATE INDEX idx_videos_type ON videos(type);
CREATE INDEX idx_play_history_user ON play_history(user_id, played_at);
```

## API 设计

### 认证相关

| 方法 | 路径 | 说明 | 权限 |
|------|------|------|------|
| POST | `/api/auth/login` | 用户登录，返回 JWT | 公开 |
| POST | `/api/auth/logout` | 用户登出 | 需登录 |
| GET | `/api/auth/me` | 获取当前用户信息 | 需登录 |

### 视频相关

| 方法 | 路径 | 说明 | 权限 |
|------|------|------|------|
| GET | `/api/videos` | 视频列表（分页） | 需登录 |
| GET | `/api/videos/:timestamp` | 获取某时间戳的视频详情 | 需登录 |
| GET | `/api/videos/:filename/stream` | 视频流播放（支持 Range） | 需登录 |
| GET | `/api/videos/:filename/cover` | 获取视频封面 | 需登录 |

**参数格式说明：**
- `:timestamp` — URL 编码的 ISO 格式，如 `2025-03-23T19:55:26`
- `:filename` — 完整文件名，如 `V20250323-195526F.ts`

### 播放历史

| 方法 | 路径 | 说明 | 权限 |
|------|------|------|------|
| GET | `/api/history` | 获取播放历史（最近50条） | 需登录 |
| POST | `/api/history` | 记录播放历史 | 需登录 |

### 管理后台

| 方法 | 路径 | 说明 | 权限 |
|------|------|------|------|
| GET | `/api/admin/users` | 用户列表 | 仅管理员 |
| POST | `/api/admin/users` | 添加用户 | 仅管理员 |
| DELETE | `/api/admin/users/:id` | 删除用户 | 仅管理员 |
| PUT | `/api/admin/users/:id/password` | 重置用户密码 | 仅管理员 |
| GET | `/api/admin/config` | 获取系统配置 | 仅管理员 |
| PUT | `/api/admin/config` | 修改系统配置 | 仅管理员 |
| POST | `/api/admin/cache/clear` | 清理缓存 | 仅管理员 |

## 核心流程

### 1. 服务启动与视频扫描

```
服务启动
    │
    ▼
初始化数据库、检查配置
    │
    ▼
扫描 {视频根目录}/F/*.ts
扫描 {视频根目录}/R/*.ts
    │
    ▼
解析文件名提取时间戳
    │
    ▼
对每个新文件：
  ├── FFprobe 读取元数据（时长、分辨率、码率）
  └── 写入 videos 表
    │
    ▼
标记已删除的文件（数据库有但文件不存在）
```

### 2. 视频播放流程

```
用户点击视频
    │
    ▼
前端请求 GET /api/videos/:timestamp
    │
    ▼
后端返回：{ front: {...}, rear: {...} }
    │
    ▼
前端请求视频流 GET /api/videos/:filename/stream
    │
    ▼
后端检查 cache/mp4/:filename.mp4 是否存在
    │
    ├── 存在 → 直接返回文件流（支持 Range）
    │
    └── 不存在 →
          ├── 返回 202 状态（准备中）
          ├── 后台启动 TS → MP4 容器转换
          ├── 转换完成写入缓存
          └── 前端轮询重试
    │
    ▼
<video> 标签播放 MP4
```

### 3. 封面生成流程

```
请求封面 GET /api/videos/:filename/cover
    │
    ▼
检查 cache/covers/:filename.jpg 是否存在
    │
    ├── 存在 → 直接返回图片
    │
    └── 不存在 →
          ├── FFmpeg 截取视频第一帧
          ├── 保存到 cache/covers/
          └── 返回图片
```

### 4. 双视频同步播放

```
前端 VideoPlayer 组件
    │
    ├── frontVideo <video> 元素
    ├── rearVideo <video> 元素
    │
    ▼
同步控制逻辑：
  ├── 播放/暂停 → 两个视频同时操作
  ├── 进度跳转 → 两个视频同时 seek
  ├── 倍速变化 → 两个视频同时设置 playbackRate
  │
    ▼
事件监听：
  ├── 任一视频 pause → 暂停另一个
  ├── 任一视频 play → 播放另一个
  └── 进度差异 > 0.5s → 同步到较早的时间点
```

## 前端页面设计

### 路由配置

| 路径 | 页面 | 权限 |
|------|------|------|
| `/login` | 登录页 | 公开 |
| `/` | 视频列表 | 需登录 |
| `/play/:timestamp` | 视频播放 | 需登录 |
| `/admin` | 管理后台首页 | 仅管理员 |
| `/admin/users` | 用户管理 | 仅管理员 |
| `/admin/config` | 系统配置 | 仅管理员 |

### 视频列表页

- 响应式网格布局，flex 实现
- 每个卡片显示封面 + 录制时间
- 分页：每页 50 条
- 点击进入播放页
- 返回时恢复滚动位置和页码

### 视频播放页

**PC 端（左右布局）：**
- 两个视频并排显示
- 底部统一控制栏

**移动端（上下布局）：**
- 前视视频在上
- 后视视频在下
- 底部控制栏

**控制功能：**
- 播放/暂停
- 进度条拖动
- 倍速：0.5x、1x、1.5x、2x、4x
- 上一集/下一集

### 管理后台

**用户管理：**
- 用户列表
- 添加用户
- 删除用户
- 重置密码

**系统配置：**
- 修改视频根目录
- 清理缓存

## 配置设计

### 后端配置

```javascript
// config/config.default.js
module.exports = {
  port: 7001,

  jwt: {
    secret: 'your-jwt-secret-change-in-production',
    expiresIn: '7d',
  },

  video: {
    rootDir: '/path/to/videos',
    defaultCover: '/public/images/default-cover.jpg',
  },

  admin: {
    username: 'admin',
    password: 'changeme',
  },

  pagination: {
    defaultPageSize: 50,
    maxPageSize: 100,
  },

  history: {
    maxRecords: 50,
  },

  sqlite: {
    filename: 'database/car-record.db',
  },
};
```

### 前端配置

```javascript
// src/config/index.js
export default {
  apiBase: '/api',

  player: {
    speeds: [0.5, 1, 1.5, 2, 4],
    defaultSpeed: 1,
  },

  pageSize: 50,
};
```

## 功能清单

| 模块 | 功能 | 优先级 |
|------|------|--------|
| 用户认证 | 登录/登出 | P0 |
| 视频列表 | 分页展示、封面显示 | P0 |
| 视频播放 | 前后视同步播放 | P0 |
| 视频播放 | 播放/暂停、进度控制 | P0 |
| 视频播放 | 倍速控制 | P0 |
| 视频播放 | 上下集切换 | P0 |
| 视频列表 | 滚动位置记忆 | P1 |
| 播放历史 | 记录/显示最近 50 条 | P1 |
| 管理后台 | 用户管理 | P1 |
| 管理后台 | 系统配置 | P1 |
| 管理后台 | 清理缓存 | P1 |
| 视频列表 | 日期筛选 | P2 |

