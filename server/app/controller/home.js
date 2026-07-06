const Controller = require('egg').Controller;
const path = require('path');
const fs = require('fs');

class HomeController extends Controller {
  async index() {
    const { ctx } = this;
    if (ctx.path.startsWith('/api/') || ctx.path.startsWith('/public/')) {
      ctx.status = 404;
      ctx.body = { code: 404, message: 'Not Found' };
      return;
    }
    ctx.type = 'html';
    ctx.body = fs.createReadStream(path.join(__dirname, '../public/index.html'));
  }
}

module.exports = HomeController;
