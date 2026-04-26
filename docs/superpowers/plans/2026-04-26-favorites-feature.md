# 我的收藏功能实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在播放历史旁边新增"我的收藏"功能，允许用户收藏视频并在收藏列表中查看。

**Architecture:** 后端新增收藏控制器和服务，复用现有数据库表；前端新增 Pinia store 和 API 调用，修改 VideoListView 和 VideoPlayView 添加收藏按钮和标签页。

**Tech Stack:** Egg.js + better-sqlite3（后端），Vue 3 + Vuetify + Pinia（前端）

---

## 文件结构

**新增文件：**
- `server/app/controller/favorite.js` — 收藏控制器
- `server/app/service/favorite.js` — 收藏服务
- `web/src/api/favorite.js` — 收藏 API 调用
- `web/src/stores/favorite.js` — 收藏状态管理

**修改文件：**
- `server/app/router.js` — 添加收藏路由
- `web/src/views/VideoListView.vue` — 新增收藏标签页和视频卡片收藏按钮
- `web/src/views/VideoPlayView.vue` — 添加播放页收藏按钮

---

### Task 1: 创建收藏服务

**Files:**
- Create: `server/app/service/favorite.js`

- [ ] **Step 1: 创建收藏服务文件**

```javascript
// server/app/service/favorite.js
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

- [ ] **Step 2: 提交服务代码**

```bash
git add server/app/service/favorite.js
git commit -m "feat(service): add favorite service"
```

---

### Task 2: 创建收藏控制器

**Files:**
- Create: `server/app/controller/favorite.js`

- [ ] **Step 1: 创建收藏控制器文件**

```javascript
// server/app/controller/favorite.js
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

- [ ] **Step 2: 提交控制器代码**

```bash
git add server/app/controller/favorite.js
git commit -m "feat(controller): add favorite controller"
```

---

### Task 3: 添加收藏路由

**Files:**
- Modify: `server/app/router.js`

- [ ] **Step 1: 在 router.js 中添加收藏路由**

在 `// 播放历史路由` 后面添加收藏路由：

```javascript
  // 收藏路由
  router.get('/api/favorites', controller.favorite.list);
  router.post('/api/favorites', controller.favorite.add);
  router.delete('/api/favorites/:timestamp', controller.favorite.remove);
```

- [ ] **Step 2: 提交路由修改**

```bash
git add server/app/router.js
git commit -m "feat(router): add favorite routes"
```

---

### Task 4: 创建前端收藏 API

**Files:**
- Create: `web/src/api/favorite.js`

- [ ] **Step 1: 创建收藏 API 文件**

```javascript
// web/src/api/favorite.js
import api from './index'

export const favoriteApi = {
  getList: () => api.get('/favorites'),
  add: (timestamp) => api.post('/favorites', { timestamp }),
  remove: (timestamp) => api.delete(`/favorites/${encodeURIComponent(timestamp)}`),
}
```

- [ ] **Step 2: 提交 API 代码**

```bash
git add web/src/api/favorite.js
git commit -m "feat(api): add favorite API methods"
```

---

### Task 5: 创建收藏状态管理

**Files:**
- Create: `web/src/stores/favorite.js`

- [ ] **Step 1: 创建收藏 store 文件**

```javascript
// web/src/stores/favorite.js
import { defineStore } from 'pinia'
import { favoriteApi } from '../api/favorite'

export const useFavoriteStore = defineStore('favorite', {
  state: () => ({
    list: [],
    favoriteSet: new Set(),
    loaded: false,
  }),
  actions: {
    async fetchFavorites() {
      const { data } = await favoriteApi.getList()
      this.list = data.list
      this.favoriteSet = new Set(data.list.map(f => f.timestamp))
      this.loaded = true
    },
    async addFavorite(timestamp) {
      await favoriteApi.add(timestamp)
      this.favoriteSet.add(timestamp)
      await this.fetchFavorites()
    },
    async removeFavorite(timestamp) {
      await favoriteApi.remove(timestamp)
      this.favoriteSet.delete(timestamp)
      this.list = this.list.filter(f => f.timestamp !== timestamp)
    },
    async toggle(timestamp) {
      if (this.favoriteSet.has(timestamp)) {
        await this.removeFavorite(timestamp)
      } else {
        await this.addFavorite(timestamp)
      }
    },
    isFavorited(timestamp) {
      return this.favoriteSet.has(timestamp)
    },
  },
})
```

- [ ] **Step 2: 提交 store 代码**

```bash
git add web/src/stores/favorite.js
git commit -m "feat(store): add favorite store"
```

---

### Task 6: 更新视频列表页面

**Files:**
- Modify: `web/src/views/VideoListView.vue`

- [ ] **Step 1: 导入 favorite store**

在 `<script setup>` 的 import 部分添加：

```javascript
import { useFavoriteStore } from '../stores/favorite'

const favoriteStore = useFavoriteStore()
```

- [ ] **Step 2: 在 onMounted 中加载收藏列表**

修改 `onMounted`：

```javascript
onMounted(async () => {
  await videoStore.fetchVideoList(videoStore.listPage)
  await videoStore.fetchHistory()
  await favoriteStore.fetchFavorites()
  await nextTick()
  if (videoStore.scrollPosition > 0) window.scrollTo({ top: videoStore.scrollPosition, behavior: 'instant' })
  currentPage.value = videoStore.listPage
})
```

- [ ] **Step 3: 添加收藏标签页**

在 `<v-tabs>` 中添加第三个标签页：

```vue
<v-tabs v-model="activeTab" class="mb-4">
  <v-tab value="all">全部视频</v-tab>
  <v-tab value="history">播放历史</v-tab>
  <v-tab value="favorites">我的收藏</v-tab>
</v-tabs>
```

- [ ] **Step 4: 添加收藏列表窗口**

在 `</v-window>` 之前添加收藏列表窗口：

```vue
<v-window-item value="favorites">
  <v-row v-if="favoriteStore.list.length > 0">
    <v-col v-for="video in favoriteStore.list" :key="video.timestamp" cols="12" sm="6" md="4" lg="3" xl="2">
      <v-card hover @click="playVideo(video)" class="video-card">
        <v-img :src="video.front || video.rear ? `/api/videos/${video.front || video.rear}/cover` : ''" aspect-ratio="16/9" cover>
          <div class="video-badge" v-if="video.front && video.rear"><v-chip size="x-small" color="success">前后视</v-chip></div>
        </v-img>
        <v-card-text class="pa-2">
          <div class="text-subtitle-2 text-truncate">{{ formatTime(video.timestamp) }}</div>
          <div class="text-caption text-grey" v-if="video.duration">{{ Math.floor(video.duration / 60) }}:{{ (video.duration % 60).toString().padStart(2, '0') }}</div>
        </v-card-text>
      </v-card>
    </v-col>
  </v-row>
  <v-empty-state v-else title="暂无收藏" icon="mdi-heart-outline" />
</v-window-item>
```

- [ ] **Step 5: 添加视频卡片收藏按钮**

在"全部视频"和"播放历史"标签页的视频卡片 `<v-img>` 中添加收藏按钮，放在 `</v-img>` 之前：

```vue
<v-img :src="video.front || video.rear ? `/api/videos/${video.front || video.rear}/cover` : ''" aspect-ratio="16/9" cover>
  <div class="favorite-btn" @click.stop="favoriteStore.toggle(video.timestamp)">
    <v-icon size="small" :color="favoriteStore.isFavorited(video.timestamp) ? 'red' : 'white'">
      {{ favoriteStore.isFavorited(video.timestamp) ? 'mdi-heart' : 'mdi-heart-outline' }}
    </v-icon>
  </div>
  <div class="video-badge" v-if="video.front && video.rear"><v-chip size="x-small" color="success">前后视</v-chip></div>
</v-img>
```

- [ ] **Step 6: 添加收藏按钮样式**

在 `<style scoped>` 中添加：

```css
.favorite-btn {
  position: absolute;
  top: 8px;
  left: 8px;
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.5);
  border-radius: 50%;
  cursor: pointer;
  transition: background 0.2s;
}
.favorite-btn:hover {
  background: rgba(0, 0, 0, 0.7);
}
```

- [ ] **Step 7: 提交视频列表页面修改**

```bash
git add web/src/views/VideoListView.vue
git commit -m "feat(view): add favorites tab and favorite button to video cards"
```

---

### Task 7: 更新播放页面

**Files:**
- Modify: `web/src/views/VideoPlayView.vue`

- [ ] **Step 1: 导入 favorite store**

在 `<script setup>` 的 import 部分添加：

```javascript
import { useFavoriteStore } from '../stores/favorite'

const favoriteStore = useFavoriteStore()
```

- [ ] **Step 2: 添加收藏按钮到控制栏**

在 `<v-row align="center" class="px-4 pb-2">` 中，在 `<v-spacer />` 之后、`<v-select>` 之前添加收藏按钮：

```vue
<v-btn icon @click="favoriteStore.toggle(video.timestamp)">
  <v-icon :color="favoriteStore.isFavorited(video.timestamp) ? 'red' : undefined">
    {{ favoriteStore.isFavorited(video.timestamp) ? 'mdi-heart' : 'mdi-heart-outline' }}
  </v-icon>
</v-btn>
```

- [ ] **Step 3: 提交播放页面修改**

```bash
git add web/src/views/VideoPlayView.vue
git commit -m "feat(view): add favorite button to video play controls"
```

---

### Task 8: 集成测试与最终提交

- [ ] **Step 1: 启动后端服务测试**

```bash
cd server && npm run dev
```

验证 API 是否正常工作。

- [ ] **Step 2: 启动前端服务测试**

```bash
cd web && npm run dev
```

验证前端功能是否正常：
- 视频卡片显示收藏按钮
- 点击收藏按钮切换状态
- 收藏标签页显示收藏列表
- 播放页面显示收藏按钮

- [ ] **Step 3: 最终提交（如有遗漏）**

```bash
git status
# 如有未提交的修改，进行提交
```
