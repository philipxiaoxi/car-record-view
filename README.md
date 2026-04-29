# Car Record View+ / 流媒体后视镜视频播放器

流媒体后视镜记录仪视频播放系统，支持前后摄像头同步播放、移动端与 PC 端响应式访问。

## 功能特性

- 🎬 **双视频同步播放** - 前后摄像头视频同步播放、暂停、进度跳转、倍速控制
- 📱 **响应式设计** - 移动端上下布局，PC 端左右布局，自适应各种屏幕
- 🔄 **自动转码** - TS 格式自动转码为 MP4，生成视频封面
- ❤️ **收藏功能** - 标记重要视频，快速访问
- 📜 **播放历史** - 记录观看进度，断点续播
- 🔐 **用户认证** - JWT 身份验证，支持多用户管理
- ⚙️ **管理后台** - 视频扫描、转码管理、用户管理

## 技术栈

### 后端
- **框架**: Egg.js
- **数据库**: SQLite (better-sqlite3)
- **认证**: JWT
- **视频处理**: FFmpeg

### 前端
- **框架**: Vue 3 + Vite
- **UI**: Vuetify (Material Design)
- **状态管理**: Pinia
- **路由**: Vue Router

## 快速开始

### 环境要求

- Node.js >= 18
- FFmpeg (用于视频转码)

### 安装

```bash
# 克隆仓库
git clone https://github.com/your-username/car-record-view-plus.git
cd car-record-view-plus

# 安装后端依赖
cd server && npm install

# 安装前端依赖
cd ../web && npm install
```

### 配置

创建本地配置文件 `server/config/config.local.js`：

```javascript
// server/config/config.local.js
module.exports = {
  // 应用密钥
  keys: 'your-secret-keys-here',

  // JWT 密钥
  jwt: {
    secret: 'your-jwt-secret-here',
  },

  // 视频根目录
  video: {
    rootDir: '/path/to/your/videos',
  },

  // 管理员凭据
  admin: {
    username: 'admin',
    password: 'your-password',
  },
};
```

> ⚠️ `config.local.js` 已在 `.gitignore` 中，不会被提交到仓库。

### 运行

```bash
# 启动后端服务 (端口 7001)
cd server && npm run dev

# 启动前端服务 (端口 3000，代理到后端)
cd web && npm run dev
```

访问 http://localhost:3000 即可使用。

## 配置项说明

| 配置项 | 必需 | 说明 |
|--------|------|------|
| `keys` | ✅ | Egg.js 应用密钥，用于加密 Session 等 |
| `jwt.secret` | ✅ | JWT 签名密钥 |
| `admin.username` | ✅ | 管理员用户名 |
| `admin.password` | ✅ | 管理员密码 |
| `video.rootDir` | ✅ | 视频文件根目录路径 |

> 生产环境可使用环境变量：`EGG_KEYS`、`JWT_SECRET`、`ADMIN_USERNAME`、`ADMIN_PASSWORD`、`VIDEO_ROOT_DIR`

## 项目结构

```
.
├── server/                 # 后端服务
│   ├── app/
│   │   ├── controller/     # 控制器
│   │   ├── service/        # 业务逻辑
│   │   ├── middleware/     # 中间件 (JWT 认证)
│   │   └── router.js       # 路由配置
│   ├── config/             # 配置文件
│   ├── database/           # 数据库初始化脚本
│   └── cache/              # 转码缓存目录
│
├── web/                    # 前端应用
│   ├── src/
│   │   ├── views/          # 页面组件
│   │   ├── api/            # API 封装
│   │   ├── stores/         # Pinia 状态管理
│   │   └── router/         # 路由配置
│   └── public/             # 静态资源
│
└── docs/                   # 文档
```

## 视频目录结构

视频文件按以下结构存放：

```
{VIDEO_ROOT_DIR}/
├── F/                      # 前视摄像头视频
│   ├── V20250323-195526F.ts
│   └── ...
└── R/                      # 后视摄像头视频
    ├── V20250323-195526R.ts
    └── ...
```

文件命名格式：`V{YYYYMMDD}-{HHMMSS}{F|R}.ts`

## 截图展示

### 视频列表
![视频列表](screenshots/list.png)

### 双视频同步播放
![播放器](screenshots/player.png)

### 管理后台
![管理后台](screenshots/back.png)

## 许可证

[MIT](LICENSE)
