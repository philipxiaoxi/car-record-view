# 我的收藏功能设计文档

**日期**: 2026-04-26
**状态**: 设计完成，待实现

## 概述

在播放历史旁边新增"我的收藏"功能，允许用户收藏喜欢的视频，并在收藏列表中快速访问。

## 功能需求

### 用户操作入口

1. **视频列表页 - 视频卡片**：每个视频卡片左上角显示收藏按钮
2. **播放页面**：控制栏右侧显示收藏按钮（在上一曲/下一曲按钮旁边）
3. **收藏列表**：VideoListView 新增独立标签页展示所有收藏的视频

### 交互行为

- 收藏按钮样式：
  - 未收藏：`mdi-heart-outline`（空心爱心）
  - 已收藏：`mdi-heart`（实心红色爱心）
- 点击收藏按钮：直接切换状态，无需确认对话框
- 收藏列表排序：按收藏时间倒序排列（最新收藏在前）
- 空状态：显示 `v-empty-state` 组件，提示"暂无收藏"

## 数据库设计

### favorites 表（已存在）

```sql
CREATE TABLE favorites (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  video_timestamp DATETIME NOT NULL,
  favorited_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id),
  UNIQUE(user_id, video_timestamp)
);

CREATE INDEX idx_favorites_user ON favorites(user_id, favorited_at DESC);
```

**设计要点**：
- `UNIQUE(user_id, video_timestamp)` 防止重复收藏
- 索引优化收藏列表查询性能
- 数据库表已创建，无需修改

## API 设计

### 接口列表

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/favorites` | 获取用户收藏列表 |
| POST | `/api/favorites` | 添加收藏 |
| DELETE | `/api/favorites/:timestamp` | 取消收藏 |

### 请求/响应格式

**GET /api/favorites**

响应：
```json
{
  "list": [
    {
      "timestamp": "2026-04-26T10:30:00.000Z",
      "front": "front_20240426103000.mp4",
      "rear": "rear_20240426103000.mp4",
      "duration": 300,
      "resolution": "1080p",
      "favoritedAt": "2026-04-26T15:20:00.000Z"
    }
  ]
}
```

**POST /api/favorites**

请求体：
```json
{
  "timestamp": "2026-04-26T10:30:00.000Z"
}
```

响应：
```json
{
  "message": "收藏成功"
}
```

**DELETE /api/favorites/:timestamp**

响应：
```json
{
  "message": "已取消收藏"
}
```

### 错误处理

- 400：参数缺失（timestamp 为空）
- 401：未登录
- 500：服务器错误

## 前端设计

### 页面结构

**VideoListView 标签页**：
```
全部视频 | 播放历史 | 我的收藏
```

**视频卡片收藏按钮**：
- 位置：视频卡片左上角（与右上角的"前后视"徽章错开）
- 样式：悬浮在封面图上，半透明背景

**播放页面收藏按钮**：
- 位置：控制栏右侧，上一曲/下一曲按钮旁边
- 样式：与其他控制按钮一致

### 组件架构

**新增文件**：
- `web/src/api/favorite.js` — 收藏 API 调用
- `web/src/stores/favorite.js` — 收藏状态管理

**修改文件**：
- `web/src/views/VideoListView.vue` — 新增收藏标签页，视频卡片添加收藏按钮
- `web/src/views/VideoPlayView.vue` — 控制栏添加收藏按钮

### 状态管理

**favorite store 设计**：
```javascript
// stores/favorite.js
export const useFavoriteStore = defineStore('favorite', {
  state: () => ({
    list: [],           // 收藏列表
    favoriteSet: new Set(),  // 快速判断是否已收藏
    loaded: false,
  }),
  actions: {
    async fetchFavorites()           // 获取收藏列表
    async addFavorite(timestamp)     // 添加收藏
    async removeFavorite(timestamp)  // 取消收藏
    toggle(timestamp)                // 切换收藏状态
    isFavorited(timestamp)           // 检查是否已收藏
  }
})
```

## 后端设计

### 文件结构

**新增文件**：
- `server/app/controller/favorite.js` — 收藏控制器
- `server/app/service/favorite.js` — 收藏服务

**修改文件**：
- `server/app/router.js` — 添加收藏路由

### 控制器设计

```javascript
// controller/favorite.js
const Controller = require('egg').Controller;
const favoriteService = require('../service/favorite');

class FavoriteController extends Controller {
  async list() {
    const { ctx } = this;
    const userId = ctx.state.user.id;
    const favorites = await favoriteService.getFavorites(userId, ctx.app.config);
    ctx.body = { list: favorites };
  }

  async add() {
    const { ctx } = this;
    const userId = ctx.state.user.id;
    const { timestamp } = ctx.request.body;
    
    if (!timestamp) {
      ctx.status = 400;
      ctx.body = { error: '时间戳不能为空' };
      return;
    }
    
    await favoriteService.addFavorite(userId, timestamp, ctx.app.config);
    ctx.body = { message: '收藏成功' };
  }

  async remove() {
    const { ctx } = this;
    const userId = ctx.state.user.id;
    const { timestamp } = ctx.params;
    
    await favoriteService.removeFavorite(userId, timestamp, ctx.app.config);
    ctx.body = { message: '已取消收藏' };
  }
}

module.exports = FavoriteController;
```

### 服务设计

```javascript
// service/favorite.js
const { getDatabase } = require('./db');

class FavoriteService {
  async addFavorite(userId, videoTimestamp, config) {
    const db = getDatabase(config);
    db.prepare(`
      INSERT OR IGNORE INTO favorites (user_id, video_timestamp)
      VALUES (?, ?)
    `).run(userId, videoTimestamp);
  }

  async removeFavorite(userId, videoTimestamp, config) {
    const db = getDatabase(config);
    db.prepare(`
      DELETE FROM favorites
      WHERE user_id = ? AND video_timestamp = ?
    `).run(userId, videoTimestamp);
  }

  async getFavorites(userId, config) {
    const db = getDatabase(config);
    const favorites = db.prepare(`
      SELECT
        f.video_timestamp as timestamp,
        f.favorited_at,
        GROUP_CONCAT(CASE WHEN v.type = 'F' THEN v.filename END) as front_filename,
        GROUP_CONCAT(CASE WHEN v.type = 'R' THEN v.filename END) as rear_filename,
        MAX(v.duration) as duration,
        MAX(v.resolution) as resolution
      FROM favorites f
      LEFT JOIN videos v ON f.video_timestamp = v.timestamp
      WHERE f.user_id = ?
      GROUP BY f.video_timestamp
      ORDER BY f.favorited_at DESC
    `).all(userId);

    return favorites.map(f => ({
      timestamp: f.timestamp,
      favoritedAt: f.favorited_at,
      front: f.front_filename,
      rear: f.rear_filename,
      duration: f.duration,
      resolution: f.resolution,
    }));
  }

  async isFavorited(userId, videoTimestamp, config) {
    const db = getDatabase(config);
    const result = db.prepare(`
      SELECT 1 FROM favorites
      WHERE user_id = ? AND video_timestamp = ?
    `).get(userId, videoTimestamp);
    return !!result;
  }
}

module.exports = new FavoriteService();
```

### 路由配置

```javascript
// router.js 中添加
router.get('/favorites', controller.favorite.list);
router.post('/favorites', controller.favorite.add);
router.delete('/favorites/:timestamp', controller.favorite.remove);
```

## 数据流与交互

### 页面加载流程

```
VideoListView mounted
    │
    ├── fetchVideoList()      // 并行
    ├── fetchHistory()        // 并行
    └── fetchFavorites()      // 并行
            │
            └── 存入 store.list + store.favoriteSet
```

### 收藏/取消收藏流程

```
用户点击收藏按钮
    │
    ├── favoriteStore.toggle(timestamp)
    │       │
    │       ├── 已收藏 → removeFavorite(timestamp)
    │       │              │
    │       │              ├── API DELETE /api/favorites/:timestamp
    │       │              │
    │       │              └── 成功：从 Set 和 list 中移除
    │       │                  失败：toast 错误提示
    │       │
    │       └── 未收藏 → addFavorite(timestamp)
    │                      │
    │                      ├── API POST /api/favorites
    │                      │
    │                      └── 成功：添加到 Set 和 list
    │                          失败：toast 错误提示
    │
    └── 按钮状态立即更新（乐观更新）
```

### 播放页面加载

```
VideoPlayView mounted
    │
    ├── loadVideo()
    │       │
    │       └── fetchVideoDetail()
    │
    └── 检查收藏状态：favoriteStore.isFavorited(timestamp)
            │
            └── 初始化按钮状态
```

## 安全与权限

- 所有收藏 API 需要 JWT 认证
- `user_id` 从 JWT token 获取，不允许跨用户操作
- 数据库 `UNIQUE` 约束防止重复收藏

## 技术栈

- **后端**: Egg.js + better-sqlite3
- **前端**: Vue 3 + Vuetify + Pinia
- **样式**: Vuetify 组件 + 自定义 CSS
