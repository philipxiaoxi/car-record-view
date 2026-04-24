// app/service/auth.js
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { getDatabase } = require('./db');

class AuthService {
  async login(username, password, config) {
    const db = getDatabase(config);
    const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);

    if (!user) {
      return { error: '用户不存在' };
    }

    const isValid = await bcrypt.compare(password, user.password);
    if (!isValid) {
      return { error: '密码错误' };
    }

    const token = jwt.sign(
      { id: user.id, username: user.username, role: user.role },
      config.jwt.secret,
      { expiresIn: config.jwt.expiresIn }
    );

    return {
      token,
      user: {
        id: user.id,
        username: user.username,
        role: user.role,
      },
    };
  }

  async getCurrentUser(userId, config) {
    const db = getDatabase(config);
    const user = db.prepare('SELECT id, username, role, created_at FROM users WHERE id = ?').get(userId);

    if (!user) {
      return { error: '用户不存在' };
    }

    return { user };
  }
}

module.exports = new AuthService();
