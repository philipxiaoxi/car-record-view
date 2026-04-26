# 我的收藏功能设计文档

**日期**: 2026-04-26
**状态**: 设计阶段

## 概述

在播放历史旁边新增"我的收藏"功能，允许用户收藏喜欢的视频，并在收藏列表中快速访问。

## 功能需求

### 用户操作入口
1. **视频列表**：每个视频卡片上有收藏按钮
2. **播放页面**：视频播放器控制栏上有收藏按钮
3. **收藏列表**：独立的标签页展示所有收藏的视频

### 交互行为
- 收藏按钮：空心图标（`mdi-heart-outline`）表示未收藏，实心图标（`mdi-heart`，红色）表示已收藏
- 点击已收藏按钮时，弹出确认对话框后再取消收藏
- 收藏列表按收藏时间倒序排列（最新收藏在前）

## 数据库设计

### favorites 表

```sql
CREATE TABLE IF NOT EXISTS favorites (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  video_timestamp DATETIME NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id),
  UNIQUE(user_id, video_timestamp)
);

CREATE INDEX IF NOT EXISTS idx_favorites_user ON favorites(user_id, created_at DESC);
```

**设计要点**：
- `UNIQUE(user_id, video_timestamp)` 防止重复收藏
- 索引优化收藏列表查询性能

## API 设计

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/favorites` | 获取用户收藏列表 |
| POST | `/api/favorites` | 添加收藏 |
| DELETE | `/api/favorites/:timestamp` | 取消收藏 |

### 响应格式

**GET /api/favorites**:
```json
{
  "list": [
    {
      "timestamp": "2026-04-26T10:30:00.000Z",
      "front": "front_20240426103000.mp4",
      "rear": "rear_20240426103000.mp4",
      "duration": 300,
      "resolution": "1080p",
      "createdAt": "2026-04-26T15:20:00.000Z"
    }
  ]
}
```

**POST /api/favorites**:
```json
{
  "message": "收藏成功"
}
```

**DELETE /api/favorites/:timestamp**:
```json
{
  "message": "已取消收藏"
}
```

## 前端设计

### 页面结构

**VideoListView 标签页**：
```
全部视频 | 播放历史 | 我的收藏
```

**收藏按钮**：
- 位置：视频卡片右上角、播放页面控制栏
- 图标：`mdi-heart-outline` / `mdi-heart`（红色）

**收藏列表**：
- 复用现有视频卡片布局
- 显示封面、时间戳、时长等信息
- 空状态：`v-empty-state` 组件显示"暂无收藏"

### 组件架构

**后端新增文件**：
- `server/app/controller/favorite.js` — 收藏控制器
- `server/app/service/favorite.js` — 收藏服务
- `server/database/init.sql` — 添加 favorites 表定义

**前端新增/修改文件**：
- `web/src/api/favorite.js` — 收藏 API 调用
- `web/src/stores/favorite.js` — 收藏状态管理
- `web/src/components/FavoriteButton.vue` — 收藏按钮组件（复用）
- `web/src/views/VideoListView.vue` — 新增收藏标签页
- `web/src/views/VideoPlayView.vue` — 添加收藏按钮

## 数据流与交互

### 状态同步流程
1. 用户点击收藏按钮 → 调用 `favoriteStore.toggle(timestamp)`
2. 发送 API 请求 → 成功后更新本地收藏列表
3. 按钮状态立即反映变化

### 页面加载
1. `VideoListView` 挂载时并行加载：视频列表 + 播放历史 + 收藏列表
2. 切换标签页时显示已加载的数据
3. `VideoPlayView` 加载时检查收藏状态，初始化按钮

### 错误处理
- 收藏失败（重复收藏、网络错误）→ 显示 toast 提示
- 取消收藏失败 → 保持收藏状态不变

### 性能优化
- 收藏列表缓存到 Pinia store
- 使用 `Set` 快速判断收藏状态

## 安全与权限

- 所有收藏 API 需要用户登录（JWT 认证）
- `user_id` 从 JWT token 获取，不允许跨用户操作
- 数据库 `UNIQUE` 约束防止重复收藏

## 技术栈

- **后端**: Egg.js + better-sqlite3
- **前端**: Vue 3 + Vuetify + Pinia
- **样式**: Vuetify 组件 + 自定义 CSS
