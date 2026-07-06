// config/config.default.js
const path = require('path');

module.exports = {
  // 应用密钥 - 生产环境必须设置 EGG_KEYS 环境变量
  keys: process.env.EGG_KEYS || 'CHANGE-ME-IN-PRODUCTION',

  security: {
    csrf: {
      enable: false, // JWT 认证，禁用 CSRF
    },
  },

  // CORS 配置 - 生产环境建议设置 CORS_ORIGIN 环境变量
  cors: {
    origin: process.env.CORS_ORIGIN || '*',
    allowMethods: 'GET,HEAD,PUT,POST,DELETE,PATCH,OPTIONS',
  },

  // JWT 配置 - 生产环境必须设置 JWT_SECRET 环境变量
  jwt: {
    secret: process.env.JWT_SECRET || 'CHANGE-ME-IN-PRODUCTION',
    expiresIn: '7d',
  },

  // 视频配置 - 可通过 VIDEO_ROOT_DIR 环境变量配置
  video: {
    rootDir: process.env.VIDEO_ROOT_DIR || '/path/to/videos',
    defaultCover: '/public/images/default-cover.jpg',
  },

  // 存储配置 - 可通过 STORAGE_TYPE 环境变量配置（local | webdav）
  storage: {
    type: process.env.STORAGE_TYPE || 'local',
    tempDir: path.join(__dirname, '../cache/remote'),
    keepTemp: process.env.STORAGE_KEEP_TEMP === 'true',
  },

  // 管理员凭据 - 生产环境必须设置 ADMIN_USERNAME 和 ADMIN_PASSWORD 环境变量
  admin: {
    username: process.env.ADMIN_USERNAME || 'admin',
    password: process.env.ADMIN_PASSWORD || 'changeme',
  },

  pagination: {
    defaultPageSize: 50,
    maxPageSize: 100,
  },

  history: {
    maxRecords: 50,
  },

  sqlite: {
    filename: path.join(__dirname, '../database/car-record.db'),
  },

  // 中间件配置
  middleware: ['jwt'],
};
