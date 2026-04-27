# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目概述

流媒体后视镜记录仪视频播放系统，前后端分离架构，用于管理和播放行车记录仪视频。

## 开发命令

```bash
# 后端开发 (server 目录)
cd server && npm run dev      # 启动开发服务器 (端口 7001)
cd server && npm test         # 运行测试

# 前端开发 (web 目录)
cd web && npm run dev         # 启动开发服务器 (端口 3000，代理到后端 7001)
cd web && npm run build       # 构建生产版本
```

## 架构

### 后端 (server/)
- **框架**: Egg.js
- **数据库**: SQLite (better-sqlite3)，初始化脚本在 `database/init.sql`
- **认证**: JWT，中间件在 `app/middleware/`
- **视频处理**: FFmpeg (fluent-ffmpeg)，用于元数据提取、转码、封面生成

**核心服务**:
- `scanner.js`: 扫描视频目录，解析文件名获取时间戳，提取元数据入库
- `transcoder.js`: 将 .ts 视频转码为 .mp4，生成封面图，支持暂停/恢复
- `ffmpeg.js`: FFmpeg 操作封装

**目录约定**:
- 视频根目录通过 `VIDEO_ROOT_DIR` 环境变量配置
- 视频按 `F/` (前摄) 和 `R/` (后摄) 子目录存放
- 文件命名格式: `V{YYYYMMDD}-{HHMMSS}{F|R}.ts`
- 转码缓存存储在 `cache/mp4/` 和 `cache/covers/`

### 前端 (web/)
- **框架**: Vue 3 + Vite
- **UI**: Vuetify (Material Design)
- **状态管理**: Pinia
- **路由**: Vue Router

**目录结构**:
- `views/`: 页面组件 (VideoList, VideoPlay, Login, Admin 及其子页面)
- `api/`: API 调用封装，axios 实例自动携带 JWT token
- `stores/`: Pinia stores (auth, video, favorite)

**路由守卫**:
- `meta.public`: 无需登录
- `meta.admin`: 需要管理员角色

## 环境变量

生产环境必须设置:
- `EGG_KEYS`: 应用密钥
- `JWT_SECRET`: JWT 签名密钥
- `ADMIN_USERNAME` / `ADMIN_PASSWORD`: 管理员凭据
- `VIDEO_ROOT_DIR`: 视频文件根目录

## 数据库迁移

数据库迁移通过在 `db.js` 中执行 ALTER TABLE 实现，使用 try-catch 忽略已存在字段的错误。

## API 结构

- `/api/auth/*`: 认证接口
- `/api/videos/*`: 视频列表、详情、流播放
- `/api/history`: 播放历史
- `/api/favorites`: 收藏
- `/api/admin/*`: 管理接口 (需要 admin 角色)，包含扫描、转码、用户管理
