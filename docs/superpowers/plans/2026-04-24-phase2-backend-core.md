# Phase 2: 后端核心功能实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 实现视频扫描、TS 转 MP4 缓存、视频流播放、封面生成和播放历史功能。

**Architecture:** FFmpeg 处理视频转换和封面截取，better-sqlite3 存储元数据，流式响应支持 Range 请求。

**Tech Stack:** fluent-ffmpeg, fs-extra

**前置条件:** Phase 1 已完成

---

## 文件结构

```
server/
├── app/
│   ├── controller/
│   │   ├── video.js        # 视频控制器
│   │   └── history.js      # 播放历史控制器
│   ├── service/
│   │   ├── video.js        # 视频服务
│   │   ├── scanner.js      # 视频扫描服务
│   │   ├── ffmpeg.js       # FFmpeg 处理服务
│   │   └── history.js      # 播放历史服务
│   └── router.js           # 更新路由
├── cache/
│   ├── covers/             # 视频封面缓存
│   └── mp4/                # MP4 缓存
└── public/
    └── images/
        └── default-cover.jpg  # 默认封面
```

---

### Task 1: 安装依赖并创建缓存目录

**Files:**
- Create: `server/cache/covers/.gitkeep`
- Create: `server/cache/mp4/.gitkeep`
- Create: `server/public/images/default-cover.jpg`

- [ ] **Step 1: 安装 FFmpeg 相关依赖**

```bash
cd server
npm install fluent-ffmpeg fs-extra --save
```

- [ ] **Step 2: 确保系统已安装 FFmpeg**

```bash
ffmpeg -version
ffprobe -version
```

如果未安装，macOS 使用：
```bash
brew install ffmpeg
```

- [ ] **Step 3: 创建缓存目录结构**

```bash
mkdir -p server/cache/covers server/cache/mp4 server/public/images
touch server/cache/covers/.gitkeep server/cache/mp4/.gitkeep
```

- [ ] **Step 4: 创建一个简单的默认封面图片**

创建 `server/public/images/default-cover.jpg`（可使用任意占位图，或后续替换）

临时方案：创建一个 SVG 转换的占位图

```bash
# 使用 ImageMagick 创建简单占位图（如果已安装）
convert -size 320x180 xc:#2c3e50 -gravity center -pointsize 24 -fill white -annotate 0 "No Cover" server/public/images/default-cover.jpg
```

或者手动放置一张默认图片。

- [ ] **Step 5: 更新 .gitignore**

在 `server/.gitignore` 添加：
```
cache/covers/*
cache/mp4/*
!cache/covers/.gitkeep
!cache/mp4/.gitkeep
database/*.db
```

- [ ] **Step 6: Commit**

```bash
git add server/cache server/public server/.gitignore
git commit -m "feat(server): add cache directories and default cover image"
```

---

### Task 2: 创建 FFmpeg 处理服务

**Files:**
- Create: `server/app/service/ffmpeg.js`

- [ ] **Step 1: 创建 FFmpeg 服务 app/service/ffmpeg.js**

```javascript
// app/service/ffmpeg.js
const ffmpeg = require('fluent-ffmpeg');
const path = require('path');
const fs = require('fs-extra');

class FFmpegService {
  /**
   * 获取视频元数据
   */
  async getMetadata(videoPath) {
    return new Promise((resolve, reject) => {
      ffmpeg.ffprobe(videoPath, (err, metadata) => {
        if (err) {
          reject(err);
          return;
        }

        const videoStream = metadata.streams.find(s => s.codec_type === 'video');
        const audioStream = metadata.streams.find(s => s.codec_type === 'audio');

        resolve({
          duration: metadata.format.duration,
          resolution: videoStream ? `${videoStream.width}x${videoStream.height}` : null,
          bitrate: Math.round((metadata.format.bit_rate || 0) / 1000),
          hasAudio: !!audioStream,
        });
      });
    });
  }

  /**
   * 将 TS 文件转换为 MP4（仅改容器，不重编码）
   */
  async convertTsToMp4(inputPath, outputPath) {
    await fs.ensureDir(path.dirname(outputPath));

    return new Promise((resolve, reject) => {
      ffmpeg(inputPath)
        .outputOptions('-c copy') // 仅复制流，不重编码
        .output(outputPath)
        .on('end', () => resolve(outputPath))
        .on('error', reject)
        .run();
    });
  }

  /**
   * 截取视频第一帧作为封面
   */
  async extractCover(videoPath, outputPath) {
    await fs.ensureDir(path.dirname(outputPath));

    return new Promise((resolve, reject) => {
      ffmpeg(videoPath)
        .screenshots({
          timestamps: ['0'],
          filename: path.basename(outputPath),
          folder: path.dirname(outputPath),
          size: '320x180',
        })
        .on('end', () => resolve(outputPath))
        .on('error', reject);
    });
  }
}

module.exports = new FFmpegService();
```

- [ ] **Step 2: Commit**

```bash
git add server/app/service/ffmpeg.js
git commit -m "feat(server): add FFmpeg processing service"
```

---

### Task 3: 创建视频扫描服务

**Files:**
- Create: `server/app/service/scanner.js`

- [ ] **Step 1: 创建扫描服务 app/service/scanner.js**

```javascript
// app/service/scanner.js
const fs = require('fs-extra');
const path = require('path');
const { getDatabase } = require('./db');
const ffmpegService = require('./ffmpeg');

class ScannerService {
  /**
   * 扫描视频目录，更新数据库
   */
  async scanVideos(config) {
    const db = getDatabase(config);
    const rootDir = config.video.rootDir;
    const fDir = path.join(rootDir, 'F');
    const rDir = path.join(rootDir, 'R');

    const results = {
      added: 0,
      updated: 0,
      removed: 0,
      errors: [],
    };

    // 获取数据库中已有的文件
    const existingFiles = db.prepare('SELECT filename FROM videos').all();
    const existingSet = new Set(existingFiles.map(f => f.filename));
    const foundFiles = new Set();

    // 扫描 F 目录
    if (await fs.pathExists(fDir)) {
      await this.scanDirectory(fDir, 'F', db, existingSet, foundFiles, results);
    }

    // 扫描 R 目录
    if (await fs.pathExists(rDir)) {
      await this.scanDirectory(rDir, 'R', db, existingSet, foundFiles, results);
    }

    // 标记已删除的文件
    for (const filename of existingSet) {
      if (!foundFiles.has(filename)) {
        db.prepare('DELETE FROM videos WHERE filename = ?').run(filename);
        results.removed++;
      }
    }

    return results;
  }

  async scanDirectory(dirPath, type, db, existingSet, foundFiles, results) {
    const files = await fs.readdir(dirPath);
    const tsFiles = files.filter(f => f.endsWith('.ts'));

    for (const filename of tsFiles) {
      foundFiles.add(filename);
      const filePath = path.join(dirPath, filename);

      try {
        // 解析文件名获取时间戳
        const timestamp = this.parseFilename(filename);
        if (!timestamp) {
          results.errors.push({ filename, error: '无效的文件名格式' });
          continue;
        }

        // 检查是否已存在
        if (existingSet.has(filename)) {
          continue;
        }

        // 获取视频元数据
        const metadata = await ffmpegService.getMetadata(filePath);

        // 插入数据库
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

        results.added++;
      } catch (err) {
        results.errors.push({ filename, error: err.message });
      }
    }
  }

  /**
   * 解析文件名获取时间戳
   * 格式: V{YYYYMMDD}-{HHMMSS}{F|R}.ts
   */
  parseFilename(filename) {
    const match = filename.match(/^V(\d{8})-(\d{6})([FR])\.ts$/);
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
}

module.exports = new ScannerService();
```

- [ ] **Step 2: Commit**

```bash
git add server/app/service/scanner.js
git commit -m "feat(server): add video scanner service"
```

---

### Task 4: 更新应用启动逻辑

**Files:**
- Modify: `server/app.js`

- [ ] **Step 1: 更新 app.js 添加启动扫描**

```javascript
// app.js
const { getDatabase, closeDatabase } = require('./app/service/db');
const scannerService = require('./app/service/scanner');
const bcrypt = require('bcryptjs');

module.exports = app => {
  const config = app.config;

  // 应用启动时初始化数据库
  app.beforeStart(async () => {
    const db = getDatabase(config);
    app.logger.info('[Database] SQLite initialized');

    // 检查是否需要创建初始管理员
    const admin = config.admin;
    const existingAdmin = db.prepare('SELECT id FROM users WHERE username = ?').get(admin.username);

    if (!existingAdmin) {
      const hashedPassword = await bcrypt.hash(admin.password, 10);
      db.prepare(
        'INSERT INTO users (username, password, role) VALUES (?, ?, ?)'
      ).run(admin.username, hashedPassword, 'admin');
      app.logger.info('[Database] Initial admin user created');
    }

    // 扫描视频目录
    app.logger.info('[Scanner] Starting video scan...');
    const results = await scannerService.scanVideos(config);
    app.logger.info('[Scanner] Scan completed: added=%d, removed=%d, errors=%d',
      results.added, results.removed, results.errors.length);

    if (results.errors.length > 0) {
      app.logger.warn('[Scanner] Errors:', results.errors);
    }
  });

  // 应用关闭时关闭数据库连接
  app.beforeClose(async () => {
    closeDatabase();
    app.logger.info('[Database] SQLite connection closed');
  });
};
```

- [ ] **Step 2: Commit**

```bash
git add server/app.js
git commit -m "feat(server): add video scan on startup"
```

---

### Task 5: 创建视频服务

**Files:**
- Create: `server/app/service/video.js`

- [ ] **Step 1: 创建视频服务 app/service/video.js**

```javascript
// app/service/video.js
const path = require('path');
const fs = require('fs-extra');
const { getDatabase } = require('./db');
const ffmpegService = require('./ffmpeg');

class VideoService {
  /**
   * 获取视频列表（分页）
   */
  async getVideoList(config, page = 1, pageSize = 50) {
    const db = getDatabase(config);
    const offset = (page - 1) * pageSize;

    // 获取按时间戳分组的视频
    const videos = db.prepare(`
      SELECT
        timestamp,
        GROUP_CONCAT(CASE WHEN type = 'F' THEN filename END) as front_filename,
        GROUP_CONCAT(CASE WHEN type = 'R' THEN filename END) as rear_filename,
        MAX(duration) as duration,
        MAX(resolution) as resolution
      FROM videos
      GROUP BY timestamp
      ORDER BY timestamp DESC
      LIMIT ? OFFSET ?
    `).all(pageSize, offset);

    // 获取总数
    const total = db.prepare('SELECT COUNT(DISTINCT timestamp) as count FROM videos').get().count;

    return {
      list: videos.map(v => ({
        timestamp: v.timestamp,
        front: v.front_filename,
        rear: v.rear_filename,
        duration: v.duration,
        resolution: v.resolution,
      })),
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      },
    };
  }

  /**
   * 获取某时间戳的视频详情
   */
  async getVideoByTimestamp(timestamp, config) {
    const db = getDatabase(config);

    const videos = db.prepare(`
      SELECT * FROM videos WHERE timestamp = ?
    `).all(timestamp);

    if (videos.length === 0) {
      return null;
    }

    const result = { timestamp };
    for (const v of videos) {
      if (v.type === 'F') {
        result.front = {
          filename: v.filename,
          duration: v.duration,
          resolution: v.resolution,
          mp4Cached: v.mp4_cached === 1,
        };
      } else {
        result.rear = {
          filename: v.filename,
          duration: v.duration,
          resolution: v.resolution,
          mp4Cached: v.mp4_cached === 1,
        };
      }
    }

    return result;
  }

  /**
   * 获取视频文件路径
   */
  getVideoPath(filename, config) {
    const type = filename.includes('F.ts') ? 'F' : 'R';
    return path.join(config.video.rootDir, type, filename);
  }

  /**
   * 获取或创建 MP4 缓存
   */
  async getOrCreateMp4Cache(filename, config) {
    const cacheDir = path.join(__dirname, '../../cache/mp4');
    const mp4Filename = filename.replace('.ts', '.mp4');
    const mp4Path = path.join(cacheDir, mp4Filename);

    // 检查缓存是否存在
    if (await fs.pathExists(mp4Path)) {
      return { path: mp4Path, cached: true };
    }

    // 转换视频
    const tsPath = this.getVideoPath(filename, config);

    if (!await fs.pathExists(tsPath)) {
      return { error: '视频文件不存在' };
    }

    await ffmpegService.convertTsToMp4(tsPath, mp4Path);

    // 更新数据库缓存状态
    const db = getDatabase(config);
    db.prepare('UPDATE videos SET mp4_cached = 1 WHERE filename = ?').run(filename);

    return { path: mp4Path, cached: false };
  }

  /**
   * 获取或创建视频封面
   */
  async getOrCreateCover(filename, config) {
    const cacheDir = path.join(__dirname, '../../cache/covers');
    const coverFilename = filename.replace('.ts', '.jpg');
    const coverPath = path.join(cacheDir, coverFilename);

    // 检查缓存是否存在
    if (await fs.pathExists(coverPath)) {
      return coverPath;
    }

    // 从 TS 文件截取封面
    const tsPath = this.getVideoPath(filename, config);

    if (!await fs.pathExists(tsPath)) {
      return null;
    }

    try {
      await ffmpegService.extractCover(tsPath, coverPath);
      return coverPath;
    } catch (err) {
      // 截取失败，返回默认封面
      return path.join(__dirname, '../../public/images/default-cover.jpg');
    }
  }

  /**
   * 获取相邻时间戳的视频
   */
  async getAdjacentVideos(timestamp, config) {
    const db = getDatabase(config);

    const prev = db.prepare(`
      SELECT DISTINCT timestamp FROM videos
      WHERE timestamp < ?
      ORDER BY timestamp DESC
      LIMIT 1
    `).get(timestamp);

    const next = db.prepare(`
      SELECT DISTINCT timestamp FROM videos
      WHERE timestamp > ?
      ORDER BY timestamp ASC
      LIMIT 1
    `).get(timestamp);

    return {
      prev: prev ? prev.timestamp : null,
      next: next ? next.timestamp : null,
    };
  }
}

module.exports = new VideoService();
```

- [ ] **Step 2: Commit**

```bash
git add server/app/service/video.js
git commit -m "feat(server): add video service"
```

---

### Task 6: 创建视频控制器

**Files:**
- Create: `server/app/controller/video.js`
- Modify: `server/app/router.js`

- [ ] **Step 1: 创建视频控制器 app/controller/video.js**

```javascript
// app/controller/video.js
const videoService = require('../service/video');
const fs = require('fs');
const path = require('path');

class VideoController {
  /**
   * 获取视频列表
   */
  async list(ctx) {
    const { page = 1, pageSize = 50 } = ctx.query;
    const result = await videoService.getVideoList(
      ctx.app.config,
      parseInt(page),
      parseInt(pageSize)
    );
    ctx.body = result;
  }

  /**
   * 获取视频详情
   */
  async detail(ctx) {
    const { timestamp } = ctx.params;
    const video = await videoService.getVideoByTimestamp(timestamp, ctx.app.config);

    if (!video) {
      ctx.status = 404;
      ctx.body = { error: '视频不存在' };
      return;
    }

    // 获取相邻视频
    const adjacent = await videoService.getAdjacentVideos(timestamp, ctx.app.config);
    video.prev = adjacent.prev;
    video.next = adjacent.next;

    ctx.body = video;
  }

  /**
   * 视频流播放
   */
  async stream(ctx) {
    const { filename } = ctx.params;

    try {
      const result = await videoService.getOrCreateMp4Cache(filename, ctx.app.config);

      if (result.error) {
        ctx.status = 404;
        ctx.body = { error: result.error };
        return;
      }

      const mp4Path = result.path;
      const stat = fs.statSync(mp4Path);
      const fileSize = stat.size;
      const range = ctx.header.range;

      if (range) {
        const parts = range.replace(/bytes=/, '').split('-');
        const start = parseInt(parts[0], 10);
        const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
        const chunkSize = end - start + 1;

        ctx.status = 206;
        ctx.set('Content-Range', `bytes ${start}-${end}/${fileSize}`);
        ctx.set('Accept-Ranges', 'bytes');
        ctx.set('Content-Length', chunkSize);
        ctx.set('Content-Type', 'video/mp4');

        ctx.body = fs.createReadStream(mp4Path, { start, end });
      } else {
        ctx.set('Content-Length', fileSize);
        ctx.set('Content-Type', 'video/mp4');
        ctx.body = fs.createReadStream(mp4Path);
      }
    } catch (err) {
      ctx.status = 500;
      ctx.body = { error: '视频处理失败', message: err.message };
    }
  }

  /**
   * 获取视频封面
   */
  async cover(ctx) {
    const { filename } = ctx.params;

    try {
      const coverPath = await videoService.getOrCreateCover(filename, ctx.app.config);

      if (!coverPath) {
        // 返回默认封面
        const defaultPath = path.join(__dirname, '../../public/images/default-cover.jpg');
        ctx.set('Content-Type', 'image/jpeg');
        ctx.body = fs.createReadStream(defaultPath);
        return;
      }

      ctx.set('Content-Type', 'image/jpeg');
      ctx.body = fs.createReadStream(coverPath);
    } catch (err) {
      ctx.status = 500;
      ctx.body = { error: '封面生成失败' };
    }
  }
}

module.exports = new VideoController();
```

- [ ] **Step 2: 更新路由 app/router.js**

```javascript
// app/router.js
module.exports = app => {
  const { router, controller } = app;

  // 认证路由
  router.post('/api/auth/login', controller.auth.login);
  router.post('/api/auth/logout', controller.auth.logout);
  router.get('/api/auth/me', controller.auth.me);

  // 视频路由（需要认证）
  router.get('/api/videos', controller.video.list);
  router.get('/api/videos/:timestamp', controller.video.detail);
  router.get('/api/videos/:filename/stream', controller.video.stream);
  router.get('/api/videos/:filename/cover', controller.video.cover);
};
```

- [ ] **Step 3: Commit**

```bash
git add server/app/controller/video.js server/app/router.js
git commit -m "feat(server): add video controller and routes"
```

---

### Task 7: 创建播放历史服务

**Files:**
- Create: `server/app/service/history.js`

- [ ] **Step 1: 创建播放历史服务 app/service/history.js**

```javascript
// app/service/history.js
const { getDatabase } = require('./db');

class HistoryService {
  /**
   * 添加播放历史
   */
  async addHistory(userId, videoTimestamp, config) {
    const db = getDatabase(config);
    const maxRecords = config.history.maxRecords || 50;

    // 删除该用户同一视频的旧记录
    db.prepare('DELETE FROM play_history WHERE user_id = ? AND video_timestamp = ?').run(userId, videoTimestamp);

    // 插入新记录
    db.prepare('INSERT INTO play_history (user_id, video_timestamp) VALUES (?, ?)').run(userId, videoTimestamp);

    // 清理超过限制的旧记录
    db.prepare(`
      DELETE FROM play_history
      WHERE user_id = ? AND id NOT IN (
        SELECT id FROM play_history
        WHERE user_id = ?
        ORDER BY played_at DESC
        LIMIT ?
      )
    `).run(userId, userId, maxRecords);
  }

  /**
   * 获取播放历史
   */
  async getHistory(userId, config) {
    const db = getDatabase(config);
    const maxRecords = config.history.maxRecords || 50;

    const history = db.prepare(`
      SELECT
        h.video_timestamp as timestamp,
        h.played_at,
        GROUP_CONCAT(CASE WHEN v.type = 'F' THEN v.filename END) as front_filename,
        GROUP_CONCAT(CASE WHEN v.type = 'R' THEN v.filename END) as rear_filename,
        MAX(v.duration) as duration,
        MAX(v.resolution) as resolution
      FROM play_history h
      LEFT JOIN videos v ON h.video_timestamp = v.timestamp
      WHERE h.user_id = ?
      GROUP BY h.video_timestamp
      ORDER BY h.played_at DESC
      LIMIT ?
    `).all(userId, maxRecords);

    return history.map(h => ({
      timestamp: h.timestamp,
      playedAt: h.played_at,
      front: h.front_filename,
      rear: h.rear_filename,
      duration: h.duration,
      resolution: h.resolution,
    }));
  }
}

module.exports = new HistoryService();
```

- [ ] **Step 2: Commit**

```bash
git add server/app/service/history.js
git commit -m "feat(server): add play history service"
```

---

### Task 8: 创建播放历史控制器

**Files:**
- Create: `server/app/controller/history.js`
- Modify: `server/app/router.js`

- [ ] **Step 1: 创建播放历史控制器 app/controller/history.js**

```javascript
// app/controller/history.js
const historyService = require('../service/history');

class HistoryController {
  async list(ctx) {
    const userId = ctx.state.user.id;
    const history = await historyService.getHistory(userId, ctx.app.config);
    ctx.body = { list: history };
  }

  async add(ctx) {
    const userId = ctx.state.user.id;
    const { timestamp } = ctx.request.body;

    if (!timestamp) {
      ctx.status = 400;
      ctx.body = { error: '时间戳不能为空' };
      return;
    }

    await historyService.addHistory(userId, timestamp, ctx.app.config);
    ctx.body = { message: '记录成功' };
  }
}

module.exports = new HistoryController();
```

- [ ] **Step 2: 更新路由 app/router.js**

```javascript
// app/router.js
module.exports = app => {
  const { router, controller } = app;

  // 认证路由
  router.post('/api/auth/login', controller.auth.login);
  router.post('/api/auth/logout', controller.auth.logout);
  router.get('/api/auth/me', controller.auth.me);

  // 视频路由（需要认证）
  router.get('/api/videos', controller.video.list);
  router.get('/api/videos/:timestamp', controller.video.detail);
  router.get('/api/videos/:filename/stream', controller.video.stream);
  router.get('/api/videos/:filename/cover', controller.video.cover);

  // 播放历史路由（需要认证）
  router.get('/api/history', controller.history.list);
  router.post('/api/history', controller.history.add);
};
```

- [ ] **Step 3: Commit**

```bash
git add server/app/controller/history.js server/app/router.js
git commit -m "feat(server): add play history controller and routes"
```

---

### Task 9: 测试核心 API

**Files:**
- Create: `server/test/video.test.js`

- [ ] **Step 1: 手动测试视频列表 API**

```bash
# 先获取 token
TOKEN=$(curl -s -X POST http://127.0.0.1:7001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"changeme"}' | jq -r '.token')

# 获取视频列表
curl http://127.0.0.1:7001/api/videos \
  -H "Authorization: Bearer $TOKEN"
```

预期输出：包含视频列表和分页信息的 JSON

- [ ] **Step 2: 手动测试视频详情 API**

```bash
# 使用视频列表中的某个时间戳
curl "http://127.0.0.1:7001/api/videos/2025-03-23T19:55:26.000Z" \
  -H "Authorization: Bearer $TOKEN"
```

- [ ] **Step 3: 手动测试封面 API**

```bash
# 获取封面
curl "http://127.0.0.1:7001/api/videos/V20250323-195526F.ts/cover" \
  -H "Authorization: Bearer $TOKEN" \
  --output test-cover.jpg
```

- [ ] **Step 4: 手动测试视频流 API**

```bash
# 在浏览器中打开或使用 VLC 播放
# http://127.0.0.1:7001/api/videos/V20250323-195526F.ts/stream
```

- [ ] **Step 5: 手动测试播放历史 API**

```bash
# 添加历史
curl -X POST http://127.0.0.1:7001/api/history \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"timestamp":"2025-03-23T19:55:26.000Z"}'

# 获取历史
curl http://127.0.0.1:7001/api/history \
  -H "Authorization: Bearer $TOKEN"
```

- [ ] **Step 6: Commit**

```bash
git add server/test/video.test.js
git commit -m "test(server): add video API tests"
```

---

## Phase 2 完成标准

- [ ] 服务启动时自动扫描视频目录
- [ ] 视频列表 API 返回分页数据
- [ ] 视频详情 API 返回前后视信息
- [ ] 视频流 API 支持 Range 请求
- [ ] 封面 API 自动生成并缓存封面
- [ ] 播放历史 API 正确记录和返回
- [ ] TS 文件首次请求时转换为 MP4 缓存

## 产出物

- 完整的视频管理 API
- 视频元数据库
- MP4 缓存系统
- 封面生成系统
- 播放历史功能
