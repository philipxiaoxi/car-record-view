# WebDAV 远程存储集成方案

## 背景

当前系统所有视频文件操作依赖本地文件系统（`fs` 模块）。视频文件实际存储在 NAS 上，
需要通过 WebDAV 协议远程访问。

**核心约束**：FFmpeg（ffprobe + 转码）需要本地文件路径，无法直接读取远程协议文件。

## 架构设计

### Storage Abstraction Layer

新增 `server/app/service/storage/`，定义统一接口，现有代码通过接口访问，不直接调用 `fs`：

```
server/app/service/storage/
├── index.js          # 工厂函数，根据 config 返回对应驱动 + 单例管理
├── base.js           # 抽象基类，定义接口
└── drivers/
    ├── local.js      # 包装 fs-extra，保持现有行为
    └── webdav.js     # 使用 webdav 包实现远程访问
```

### 统一接口

```js
class StorageDriver {
  async listFiles(remoteDir, pattern)     // 列出目录下匹配的文件
  async fileExists(remotePath)            // 判断文件是否存在
  async getFileStream(remotePath, range?) // 获取可读流（可选 Range）
  async getFileStats(remotePath)          // 获取文件大小等信息
  async downloadFile(remotePath, localPath) // 下载到本地临时文件
  async downloadPartial(remotePath, localPath, maxBytes) // 只下载文件头部（封面优化）
  async removeFile(remotePath)            // 删除远程文件
  close()                                 // 释放连接
}
```

## 后端改动

### 1. 依赖

```bash
npm install webdav
```

`webdav` 包：GitHub Stars 2.6k，周下载 18k，满足成熟开源依赖要求。

### 2. 配置文件 `server/config/config.default.js`

新增 storage 配置段：

```js
storage: {
  type: process.env.STORAGE_TYPE || 'local',
  tempDir: path.join(__dirname, '../cache/remote'),
  keepTemp: process.env.STORAGE_KEEP_TEMP === 'true',
  webdav: {
    url: process.env.WEBDAV_URL || '',
    username: process.env.WEBDAV_USERNAME || '',
    password: process.env.WEBDAV_PASSWORD || '',
  },
},
```

### 3. 管理后台配置接口 `server/app/service/admin.js`

`getConfig()` 返回新增字段：

```js
{
  videoRootDir: '...',
  storageType: 'local' | 'webdav',
  webdavUrl: '***' + url.slice(-20),      // 脱敏
  webdavUsername: '***' + username.slice(-4),
  cacheSize: { bytes, mb },
}
```

`updateConfig()` 接受新增字段并写入 config 表，更新后重置 storage 驱动单例。

### 4. 存储驱动

**`drivers/local.js`**：包装现有 `fs-extra` 操作，行为不变。

**`drivers/webdav.js`**：
- 使用 `webdav` 包的 `createClient()` 创建客户端
- `listFiles` → `client.getDirectoryContents()` 并过滤后缀
- `fileExists` → `client.stat()` 或 `client.exists()`
- `getFileStream` → `client.createReadStream()`（支持 Range 请求）
- `downloadFile` → `fs.createWriteStream()` + `client.createReadStream()` pipe
- `downloadPartial` → 同上但通过 `Range` 请求头只取前 N 字节

### 5. 扫描器 `server/app/service/scanner.js`

| 原代码 | 改为 |
|---|---|
| `fs.readdir(fDir)` | `storage.listFiles('F/', /.ts$/)` |
| `fs.pathExists(fDir)` | `storage.fileExists('F/')` |
| `processFile(filename, fPath, type)` 传入本地路径 | `processFile(filename, type)` 不传路径 |

`processFile`：
- 本地模式：保持 `ffprobe(本地路径)` 提取元数据
- 远程模式：**跳过 ffprobe**，只解析文件名入库，`duration`/`resolution`/`bitrate` 留空

`cleanupMissingFiles`：用 `storage.fileExists()` 替代 `fs.pathExists()`。

### 6. 视频服务 `server/app/service/video.js`

`getOrCreateMp4Cache(filename)`：
- 检查 `cache/mp4/xxx.mp4` 存在 → 直接返回（不变）
- 检查批量转码任务等待（不变）
- 远程模式：`storage.downloadFile(remoteTsPath, cacheTempPath)` → `ffmpeg.convertTsToMp4(cacheTempPath, mp4Path)` → 清理临时文件 → 返回
- 本地模式：不变

`getOrCreateCover(filename)`：
- 检查 `cache/covers/xxx.jpg` 存在 → 直接返回（不变）
- 检查本地 mp4 存在 → 从 mp4 提取（不变）
- 远程模式：`storage.downloadPartial(remoteTsPath, cacheTempPath, 2MB)` → 尝试 FFmpeg 提取封面 → 失败则下载完整文件重试 → 清理临时文件
- 本地模式：不变

### 7. 转码器 `server/app/service/transcoder.js`

`processFile()`：
- 构建远程源路径（由 storage 驱动处理）
- 远程模式：`storage.downloadFile(remotePath, tempPath)` 下载到 `cache/remote/` → FFmpeg 转码 + 封面 → 清理临时文件
- 本地模式：不变

### 8. 启动校验 `server/app.js`

`beforeStart` 中根据 storage 类型测试连接，失败打印警告但不阻塞启动。

## 前端改动

### `web/src/views/AdminConfigView.vue`

在视频根目录输入框上方新增存储配置区域：

```
[存储类型: ┌──────────────────┐ ▼]
          │ 本地文件系统       │
          │ WebDAV            │
          └──────────────────┘

┌─ 仅在 WebDAV 时显示 ─────────────────┐
│  WebDAV URL:  _______________________ │
│  用户名:      _______________________ │
│  密码:        _______________________ │
└──────────────────────────────────────┘

视频根目录:  [___________________________]

[保存配置]
```

- 用 `v-select` 切换类型
- `v-show="storageType === 'webdav'"` 控制 WebDAV 字段显隐
- 密码字段 `type="password"`，支持显隐切换（Vuetify `append-inner-icon`）
- 保存时发送完整配置对象

### `web/src/api/admin.js`

不变，`updateConfig` 和 `getConfig` 已支持任意字段。

## 数据流

### 扫描流程

```
用户点击"开始扫描"
→ scannerService 调用 storage.listFiles('F/') 列出远程文件
→ 解析文件名 → 写入数据库（元数据留空）
→ 完成（无需下载，无需 ffprobe）
```

### 首次播放流程

```
用户点击播放视频
→ 检查 cache/mp4/xxx.mp4 不存在
→ storage.downloadFile(远程.ts, cache/remote/xxx.ts)   ← 局域网 ~0.5s/50MB
→ ffmpeg -c copy cache/remote/xxx.ts → cache/mp4/xxx.mp4
→ ffmpeg 提取封面 → cache/covers/xxx.jpg
→ 删除 cache/remote/xxx.ts
→ 从 cache/mp4/xxx.mp4 流播放
```

### 后续播放流程

```
→ 检查 cache/mp4/xxx.mp4 存在
→ fs.createReadStream(mp4Path, { start, end })  ← 和现在完全一样
```

### 封面请求流程

```
用户浏览视频列表
→ 检查 cache/covers/xxx.jpg
→ 命中 → 直接返回（零网络开销）
→ 未命中 → storage.downloadPartial(远程.ts, 临时, 2MB) → ffmpeg 提取封面 → 清理
```

## 文件变更清单

| 文件 | 操作 | 说明 |
|---|---|---|
| `server/package.json` | 修改 | +`webdav` 依赖 |
| `server/app/service/storage/index.js` | 新建 | 工厂 + 单例 |
| `server/app/service/storage/base.js` | 新建 | 抽象基类 |
| `server/app/service/storage/drivers/local.js` | 新建 | 本地驱动 |
| `server/app/service/storage/drivers/webdav.js` | 新建 | WebDAV 驱动 |
| `server/config/config.default.js` | 修改 | storage 配置段 |
| `server/app/service/admin.js` | 修改 | get/update 配置 |
| `server/app/controller/admin.js` | 修改 | 更新 config 后重置驱动 |
| `server/app/service/scanner.js` | 修改 | 接入 storage 接口 |
| `server/app/service/video.js` | 修改 | 远程源文件下载转码 |
| `server/app/service/transcoder.js` | 修改 | 远程源文件下载转码 |
| `server/app.js` | 修改 | 启动连接校验 |
| `web/src/views/AdminConfigView.vue` | 修改 | 存储配置 UI |

总计：**14 个文件**，新建 4 个，修改 10 个。
