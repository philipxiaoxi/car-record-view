# 视频流和封面图认证方案设计

## 背景

当前项目的视频流 (`/api/videos/:filename/stream`) 和封面图 (`/api/videos/:filename/cover`) 接口是公开的，无需认证即可访问。这是因为 HTML 的 `<img>` 和 `<video>` 标签无法自定义请求头（Authorization），所以当初设计时跳过了这两个接口的认证。

## 目标

- 防止未登录用户访问视频流和封面图
- 统一使用 Cookie 存储 JWT，简化认证机制
- 保持用户体验流畅，无需重复登录

## 方案选择

经过评估，选择 **统一 Cookie 认证** 方案：

- 登录后设置 HttpOnly Cookie 存储 JWT
- 所有请求（包括 img/video）浏览器自动携带 Cookie
- 后端统一从 Cookie 验证 JWT

## 架构设计

```
用户登录 → 服务器设置 HttpOnly Cookie (JWT)
                ↓
前端所有请求 → 浏览器自动携带 Cookie
                ↓
后端验证 Cookie 中的 JWT → 处理请求
```

## Cookie 配置

| 属性 | 值 | 说明 |
|------|-----|------|
| httpOnly | true | 防 XSS 窃取 |
| secure | true (生产环境) | 仅 HTTPS 传输 |
| sameSite | 'strict' | 防 CSRF 攻击 |
| path | '/' | 所有路径可用 |
| maxAge | 7天 | 与 JWT 过期时间一致 |

## 文件改动

### 后端改动

#### 1. `app/controller/auth.js` - 登录/登出

**改动内容**：
- 登录成功时设置 Cookie，不再在响应体中返回 token
- 登出时清除 Cookie

**关键代码**：
```javascript
// 登录时设置 Cookie
ctx.cookies.set('token', token, {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'strict',
  path: '/',
  maxAge: 7 * 24 * 60 * 60 * 1000, // 7天
});

// 登出时清除 Cookie
ctx.cookies.set('token', null, { maxAge: 0 });
```

#### 2. `app/middleware/jwt.js` - 认证中间件

**改动内容**：
- 从 Cookie 读取 token，移除 Header 验证
- 移除视频流/封面图的公开路径例外

**关键代码**：
```javascript
// 从 Cookie 读取 token
const token = ctx.cookies.get('token');

if (!token) {
  ctx.status = 401;
  ctx.body = { error: '未登录' };
  return;
}
```

### 前端改动

#### 1. `src/api/index.js` - axios 配置

**改动内容**：
- 移除 axios 拦截器中的 Authorization header 逻辑
- 配置 `withCredentials: true`（如果需要跨域）

#### 2. `src/stores/auth.js` - 认证状态管理

**改动内容**：
- 移除 localStorage 存储 token 的逻辑
- 登录状态检查改为调用 `/api/auth/me` 接口

#### 3. `src/views/LoginView.vue` - 登录页面

**改动内容**：
- 移除 localStorage 存储逻辑
- 登录成功后直接跳转，不再处理 token

## 错误处理

### 未登录访问

| 场景 | 行为 |
|------|------|
| API 接口 | 返回 401，前端跳转登录页 |
| 视频流 | 返回 401，视频无法播放 |
| 封面图 | 返回 401，显示加载失败 |

### Cookie 过期

- 后端返回 401
- 前端检测到 401 后跳转登录页

## 安全考虑

1. **XSS 防护**：HttpOnly Cookie 防止 JavaScript 窃取
2. **CSRF 防护**：sameSite: 'strict' 防止跨站请求伪造
3. **传输安全**：生产环境强制 HTTPS（secure: true）

## 测试计划

1. 登录后访问视频流/封面，验证可以正常访问
2. 未登录访问视频流/封面，验证返回 401
3. 清除 Cookie 后访问，验证跳转登录页
4. Cookie 过期后访问，验证跳转登录页
