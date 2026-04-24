// config/config.default.js
const path = require('path');

module.exports = {
  keys: 'car-record-view-plus-secret-keys',

  security: {
    csrf: {
      enable: false, // JWT 认证，禁用 CSRF
    },
  },

  cors: {
    origin: '*',
    allowMethods: 'GET,HEAD,PUT,POST,DELETE,PATCH,OPTIONS',
  },

  jwt: {
    secret: 'your-jwt-secret-change-in-production',
    expiresIn: '7d',
  },

  video: {
    rootDir: '/path/to/videos',
    defaultCover: '/public/images/default-cover.jpg',
  },

  admin: {
    username: 'admin',
    password: 'changeme',
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
};
