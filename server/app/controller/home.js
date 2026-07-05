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
