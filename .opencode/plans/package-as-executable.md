# 打包为可执行文件方案

## 背景

将 car-record-view-plus 打包为跨平台可执行文件（.exe / macOS / Linux），
双击启动后自动打开浏览器访问，无需手动安装 Node.js 和 npm 依赖。

## 核心思路

以"附加打包功能"为原则，不干扰现有开发流程。在项目根目录新增构建入口，
用 `@yao-pkg/pkg` 将后端打包为可执行文件，`ffmpeg-static` 提供 ffmpeg 二进制，
前端构建为静态文件由 Egg.js 内嵌服务。

## 架构

```
npm run build:pkg (根目录)
├── npm run build:web           # Vue 构建 → server/app/public/
├── node fetch-ffmpeg.js        # 提取 ffmpeg → dist/
└── pkg start.js                # 打包后端 → dist/car-record-server.exe

dist/
├── car-record-server.exe       # 可执行文件
├── ffmpeg.exe                  # ffmpeg 二进制
├── node_modules/
│   └── better-sqlite3/         # 原生模块外置
├── config.json                 # 配置（可选，首次自生成）
└── data/
    ├── car-record.db           # SQLite 数据库
    └── cache/
        ├── mp4/
        └── covers/
```

## 新增文件（5 个）

### 1. 根目录 `package.json`

构建入口统一放根目录，不要求 `cd server`。

```json
{
  "name": "car-record-view-plus",
  "private": true,
  "scripts": {
    "dev": "bash dev.sh",
    "build:web": "cd web && npm run build",
    "build:pkg": "npm run build:web && node server/scripts/fetch-ffmpeg.js && cd server && npx pkg start.js --config package.json --target node18-win-x64 --output ../dist/car-record-server"
  }
}
```

### 2. `server/start.js`

pkg 入口，单进程启动 Egg.js Application。

```js
const path = require('path');
process.env.NODE_ENV = 'production';
const { Application } = require('egg');
const app = new Application({ baseDir: __dirname, mode: 'single' });
app.ready().then(() => {
  const port = process.env.PORT || 7001;
  app.listen(port, '0.0.0.0', () => {
    console.log(`> Server started at http://localhost:${port}`);
  });
}).catch(err => { console.error(err); process.exit(1); });
```

### 3. `server/app/controller/home.js`

SPA 兜底：非 API 请求返回 `index.html`，让 Vue Router 处理客户端路由。

```js
const fs = require('fs');
const path = require('path');

module.exports = app => {
  return class HomeController extends app.Controller {
    async index() {
      this.ctx.type = 'text/html';
      this.ctx.body = fs.createReadStream(
        path.join(app.baseDir, 'app/public/index.html')
      );
    }
  };
};
```

### 4. `server/scripts/fetch-ffmpeg.js`

构建时从 `ffmpeg-static` 中提取当前平台的 ffmpeg 二进制到输出目录。

```js
const ffmpegPath = require('ffmpeg-static');
const fs = require('fs-extra');
const path = require('path');
const outDir = process.argv[2] || path.join(__dirname, '../../dist');
fs.ensureDirSync(outDir);
const ext = process.platform === 'win32' ? '.exe' : '';
const target = path.join(outDir, `ffmpeg${ext}`);
fs.copyFileSync(ffmpegPath, target);
if (process.platform !== 'win32') fs.chmodSync(target, 0o755);
```

### 5. `.gitignore` 追加

```
dist/
```

## 修改现有文件（5 个）

### 6. `web/vite.config.js` — +4 行

```js
build: {
  outDir: '../server/app/public',
  emptyOutDir: true,
}
```

生产构建时直接输出到 Egg.js 静态目录。

### 7. `server/app/router.js` — +1 行

末尾添加 SPA 兜底路由（必须在所有 API 路由之后）：

```js
// SPA fallback - must be last
router.get('/(.*)', controller.home.index);
```

### 8. `server/app/service/ffmpeg.js` — +5 行

在文件顶部 requires 之后，检测可执行文件同目录是否存在 ffmpeg 二进制：

```js
const execDir = path.dirname(process.execPath);
const ffmpegBin = path.join(execDir, process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg');
if (fs.existsSync(ffmpegBin)) {
  ffmpeg.setFfmpegPath(ffmpegBin);
}
```

### 9. `server/app.js` — +4 行

`app.ready()` 内，判断为 pkg 打包模式时自动打开浏览器：

```js
if (process.pkg) {
  try {
    require('open')(`http://localhost:${config.port || 7001}`);
  } catch (e) {
    app.logger.warn('[App] 打开浏览器失败:', e.message);
  }
}
```

### 10. `server/package.json` — 追加依赖和 pkg 配置

```json
{
  "dependencies": {
    "open": "^10.1.0"
  },
  "devDependencies": {
    "@yao-pkg/pkg": "^5.12.0",
    "ffmpeg-static": "^3.1.0"
  },
  "pkg": {
    "assets": [
      "app/**/*",
      "config/**/*",
      "database/**/*"
    ],
    "externals": [
      "better-sqlite3"
    ]
  }
}
```

## 依赖说明

| 包 | 用途 | 来源要求 |
|---|---|---|
| `@yao-pkg/pkg` | 打包为可执行文件 | npm，700+ stars，pkg 社区活跃分支 |
| `ffmpeg-static` | 提供跨平台 ffmpeg 二进制 | npm，GitHub 600+ stars，周下载 200k+ |
| `open` | 跨平台打开浏览器 | npm，GitHub 3k+ stars，周下载 2000w+ |

## 不变的部分

- `server/app/service/` 全部 14 个服务文件
- `server/app/controller/` 除新增 home.js 外全部控制器
- `server/app/middleware/` JWT + admin 中间件
- `server/config/plugin.js`, `config.local.js`
- `server/database/init.sql`
- `web/` 目录下所有 Vue 组件、路由、store、API 封装
- `dev.sh` / `dev.bat` 开发启动脚本
- `npm run dev` 开发流程完全不受影响

## 使用方式

```bash
# 完整打包
npm run build:pkg

# 仅打包 Windows
npm run build:web
cd server && npx pkg start.js --config package.json --target node18-win-x64 --output ../dist/car-record-server.exe

# 仅打包 macOS
cd server && npx pkg start.js --config package.json --target node18-macos-x64 --output ../dist/car-record-server

# 运行
./dist/car-record-server.exe
# 自动打开浏览器 http://localhost:7001
```

## 注意事项

1. **`better-sqlite3` 外置**：打包产物附带 `node_modules/better-sqlite3/` 目录，含预编译的 `.node` 文件
2. **ffmpeg 体积**：约 50MB，是打包产物最大的组成部分
3. **端口**：默认 7001，可通过环境变量 `PORT` 修改
4. **视频目录**：需通过管理后台配置 `VIDEO_ROOT_DIR` 或 config.json
