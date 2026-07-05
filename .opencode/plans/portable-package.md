# 便携包打包方案（替代 pkg）

## 背景

原 pkg 打包方案因 `better-sqlite3` 原生模块在虚拟 FS 中无法加载、`node:sqlite` 内建模块识别、`nanoid` exports 字段等问题受阻。改用便携包：将 Node.js 运行时 + 应用代码 + ffmpeg 打包成文件夹，用户解压后双击启动脚本即可运行，自动打开浏览器。

## 与 pkg 方案的关系

**保留** 之前为打包做的应用层改动（这些改动对便携包同样需要）：
- `web/vite.config.js` — build 输出到 `server/app/public/`
- `server/app/controller/home.js` — SPA 兜底
- `server/app/router.js` — 末尾 SPA 路由
- `server/app/service/ffmpeg.js` — 检测同目录 ffmpeg
- `server/app.js` — 自动打开浏览器
- `server/app/middleware/jwt.js` — 非 API 路由跳过认证
- `server/config/config.default.js` — 支持环境变量覆盖路径
- `server/app/service/transcoder.js` / `video.js` / `admin.js` — `CACHE_DIR` 环境变量

**删除** pkg 专属内容：
- `server/package.json` 中的 `pkg` 配置段
- `server/package.json` 中的 `@yao-pkg/pkg` devDependency
- `server/start.js` 中的 `process.pkg` 判断和 nanoid 猴补丁
- `server/node_modules/@yao-pkg/pkg/lib-es5/walker.js` 的 isBuiltin 补丁（重装 pkg 会消失，不用管）
- `server/scripts/fetch-ffmpeg.js`（替换为新的构建脚本）

## 产物结构

```
car-record-view-plus-portable/
├── 启动.bat                  # Windows 双击启动
├── 启动.command              # macOS 双击启动
├── 启动.sh                   # Linux 启动
├── node                     # Node.js 运行时（对应平台）
├── ffmpeg                   # ffmpeg 二进制（对应平台）
├── server/
│   ├── app/                 # 应用代码（含 app/public/ 前端构建产物）
│   ├── config/
│   ├── database/
│   ├── node_modules/        # 完整依赖（含 better-sqlite3 原生模块）
│   ├── package.json
│   └── start.js             # 启动入口
└── data/                    # 运行时自动创建（首次启动）
    ├── car-record.db
    ├── logs/
    └── cache/
        ├── mp4/
        ├── covers/
        └── remote/
```

总大小约 90MB（node ~40MB + ffmpeg ~40MB + app ~10MB）。

## 实施步骤

### 第 1 步：准备 start.js（应用入口）

`server/start.js` 修改为不依赖 `process.pkg` 的版本。用 `process.execPath` 是否以 `node` 结尾来判断是否为开发模式，否则视为便携包模式：

```js
const path = require('path');
const fs = require('fs');

process.env.NODE_ENV = 'production';

// 便携包模式：start.js 与 node 可执行文件在不同目录
// 当便携包启动时，工作目录是 portable/ 根目录
const isPortable = !path.basename(process.execPath).startsWith('node');

if (isPortable) {
  // portable 根目录 = start.js 向上两级
  const rootDir = path.join(__dirname, '..');
  const dataDir = path.join(rootDir, 'data');
  fs.mkdirSync(path.join(dataDir, 'cache/mp4'), { recursive: true });
  fs.mkdirSync(path.join(dataDir, 'cache/covers'), { recursive: true });
  fs.mkdirSync(path.join(dataDir, 'cache/remote'), { recursive: true });
  fs.mkdirSync(path.join(dataDir, 'logs'), { recursive: true });

  process.env.SQLITE_FILENAME = path.join(dataDir, 'car-record.db');
  process.env.LOG_DIR = path.join(dataDir, 'logs');
  process.env.CACHE_DIR = dataDir;
}

const { Application } = require('egg');
const app = new Application({ baseDir: __dirname, mode: 'single' });
app.ready().then(() => {
  const port = process.env.PORT || 7001;
  app.listen(port, '0.0.0.0', () => {
    console.log(`> Server started at http://localhost:${port}`);
  });
}).catch(err => { console.error(err); process.exit(1); });
```

> **注意**：`isPortable` 的判断逻辑由 dsf 根据启动脚本的实际调用方式调整。如果启动脚本直接用便携包内的 `node` 二进制执行 `server/start.js`，则 `process.execPath` 指向便携包内的 node，与开发环境的 node 路径不同，可以据此判断。更可靠的方式是启动脚本设置一个环境变量如 `PORTABLE_MODE=1`，start.js 据此判断。

### 第 2 步：创建启动脚本

#### `启动.bat`（Windows）

```bat
@echo off
cd /d "%~dp0"
set PORTABLE_MODE=1
set PORT=7001
"node\bin\node.exe" "server\start.js"
pause
```

> Windows 下 node 解压后通常在 `node\node.exe`（单文件）或 `node\bin\node.exe`，具体路径由下载的 node 分发格式决定，dsf 按实际调整。

#### `启动.command`（macOS）

```bash
#!/bin/bash
cd "$(dirname "$0")"
export PORTABLE_MODE=1
export PORT=7001
./node/bin/node server/start.js
```

> macOS 的 `.command` 文件双击即可在终端执行。需 `chmod +x 启动.command`。

#### `启动.sh`（Linux）

```bash
#!/bin/bash
cd "$(dirname "$0")"
export PORTABLE_MODE=1
export PORT=7001
./node/bin/node server/start.js
```

### 第 3 步：修改 app.js 自动开浏览器逻辑

当前 `server/app.js` 中用 `process.pkg` 判断是否为打包模式。改为用环境变量：

```js
// 在 app.ready() 内部，原有代码之后
if (process.env.PORTABLE_MODE) {
  try {
    const open = require('open');
    open(`http://localhost:${config.port || 7001}`);
  } catch (e) {
    app.logger.warn('[App] 打开浏览器失败:', e.message);
  }
}
```

### 第 4 步：ffmpeg 检测逻辑调整

`server/app/service/ffmpeg.js` 当前的检测逻辑是检测 `process.execPath` 同目录的 ffmpeg。便携包中 ffmpeg 在根目录，与 node 在同级。保持现有逻辑即可：

```js
const execDir = path.dirname(process.execPath);
const ffmpegBin = path.join(execDir, process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg');
if (fs.existsSync(ffmpegBin)) {
  ffmpeg.setFfmpegPath(ffmpegBin);
}
```

> 如果便携包中 node 在 `node/bin/node`，则 `execDir` 是 `node/bin/`，ffmpeg 不在那里。需要向上找。由 dsf 确定最终路径逻辑。更简单的方式：检测 `ffmpeg-static` 包提供的路径作为 fallback。

### 第 5 步：创建构建脚本

`server/scripts/build-portable.js`：

```js
const fs = require('fs-extra');
const path = require('path');
const { execSync } = require('child_process');

const rootDir = path.join(__dirname, '../..');
const outDir = path.join(rootDir, 'dist/portable');

// 1. 清空输出目录
fs.removeSync(outDir);
fs.ensureDirSync(outDir);

// 2. 构建 frontend
console.log('> Building frontend...');
execSync('npm run build:web', { cwd: rootDir, stdio: 'inherit' });

// 3. 复制 server（含 node_modules）
console.log('> Copying server...');
fs.copySync(path.join(rootDir, 'server'), path.join(outDir, 'server'), {
  filter: (src) => {
    // 排除 logs, run, cache, typings, .git
    const rel = path.relative(path.join(rootDir, 'server'), src);
    if (rel.startsWith('logs') || rel.startsWith('run') || rel.startsWith('cache') || rel.startsWith('typings')) return false;
    return true;
  },
});

// 4. 复制 ffmpeg
console.log('> Copying ffmpeg...');
const ffmpegPath = require('ffmpeg-static');
const ext = process.platform === 'win32' ? '.exe' : '';
fs.copyFileSync(ffmpegPath, path.join(outDir, `ffmpeg${ext}`));
if (process.platform !== 'win32') fs.chmodSync(path.join(outDir, 'ffmpeg'), 0o755);

// 5. 下载/复制 node 运行时
// 方式 A：用 @nodejs/binaries 或直接从 nodejs.org 下载
// 方式 B：复制当前系统的 node（开发用，不保证生产环境一致）
// dsf 选择实现方式，以下为方式 B 示例：
console.log('> Copying node runtime...');
const nodeDir = path.join(outDir, 'node');
fs.ensureDirSync(nodeDir);
fs.copyFileSync(process.execPath, path.join(nodeDir, 'node' + ext));
if (process.platform !== 'win32') fs.chmodSync(path.join(nodeDir, 'node'), 0o755);

// 6. 创建启动脚本
console.log('> Creating launcher scripts...');
// Windows
fs.writeFileSync(path.join(outDir, '启动.bat'), `@echo off\r\ncd /d "%~dp0"\r\nset PORTABLE_MODE=1\r\nset PORT=7001\r\n"node\\node.exe" "server\\start.js"\r\npause\r\n`);
// macOS
fs.writeFileSync(path.join(outDir, '启动.command'), `#!/bin/bash\ncd "$(dirname "$0")"\nexport PORTABLE_MODE=1\nexport PORT=7001\n./node/bin/node server/start.js\n`);
fs.chmodSync(path.join(outDir, '启动.command'), 0o755);
// Linux
fs.writeFileSync(path.join(outDir, '启动.sh'), `#!/bin/bash\ncd "$(dirname "$0")"\nexport PORTABLE_MODE=1\nexport PORT=7001\n./node/bin/node server/start.js\n`);
fs.chmodSync(path.join(outDir, '启动.sh'), 0o755);

// 7. 创建空的 data 目录（首次启动会自动填充）
fs.ensureDirSync(path.join(outDir, 'data'));

console.log('> Portable package built at:', outDir);
```

### 第 6 步：根 package.json 构建命令

```json
{
  "name": "car-record-view-plus",
  "private": true,
  "scripts": {
    "dev": "bash dev.sh",
    "build:web": "cd web && npm run build",
    "build:portable": "node server/scripts/build-portable.js"
  }
}
```

删除原来的 `build:pkg`、`package:win`、`package:mac`、`package:linux`。

### 第 7 步：清理 pkg 残留

- `server/package.json`：删除 `pkg` 配置段、`@yao-pkg/pkg` devDependency
- `server/start.js`：删除 nanoid 猴补丁和 `process.pkg` 判断
- `server/scripts/fetch-ffmpeg.js`：删除（被 `build-portable.js` 替代）

## 验证清单

dsf 完成后请验证以下功能：

1. `npm run build:portable` 成功生成 `dist/portable/`
2. 双击 `启动.command`（macOS）或 `启动.bat`（Windows）启动服务
3. 浏览器自动打开 `http://localhost:7001`
4. 登录页正常显示
5. 用默认凭据（admin / changeme）登录成功
6. 视频列表页正常加载
7. `data/` 目录正确创建，数据库文件存在
8. 关闭终端窗口后服务退出

## 注意事项

1. **Node.js 运行时**：方式 B（复制当前 node）最简单但只适用于当前平台。如需跨平台分发，方式 A 下载指定平台的 node 二进制更好。`node` 二进制约 40MB。

2. **node_modules 体积**：`server/node_modules` 当前 244MB（含 devDependencies）。便携包只需 production 依赖，建议构建时执行 `npm prune --production` 或只复制 dependencies。

3. **better-sqlite3 平台绑定**：`better-sqlite3` 的 `.node` 文件是平台特定的。在 macOS 构建的便携包不能在 Windows 运行。需在目标平台上构建，或用 `prebuild-install` 下载目标平台的预编译文件。

4. **ffmpeg 体积优化**：`ffmpeg-static` 的二进制约 40MB，功能完整。如只用 `-c copy` 转码和截图，可换成更小的 ffmpeg 构建版本。

5. **首次配置**：用户首次启动需配置 `VIDEO_ROOT_DIR`。可通过管理后台配置，或创建 `config.json` 文件。当前管理后台已支持配置，无需额外开发。

6. **端口冲突**：启动脚本固定 7001 端口。如需自定义，用户可修改启动脚本中的 `PORT` 环境变量。

## 替代实现：用 nexe 而非手动复制 node

如果希望产生单文件 `.exe` 而非文件夹，可用 [nexe](https://github.com/nexe/nexe) 替代手动复制 node。nexe 会将 Node.js + 应用编译成单个可执行文件，但对原生模块的支持方式与 pkg 不同（nexe 会将 `.node` 文件放到可执行文件同目录）。

推荐先用便携包方案验证功能跑通，后续如需单文件再尝试 nexe。