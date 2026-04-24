// app/controller/history.js
const Controller = require('egg').Controller;
const historyService = require('../service/history');

class HistoryController extends Controller {
  async list() {
    const { ctx } = this;
    const userId = ctx.state.user.id;
    const history = await historyService.getHistory(userId, ctx.app.config);
    ctx.body = { list: history };
  }

  async add() {
    const { ctx } = this;
    const userId = ctx.state.user.id;
    const { timestamp } = ctx.request.body;

    if (!timestamp) {
      ctx.status = 400;
      ctx.body = { error: '时间戳不能为空' };
      return;
    }

    await historyService.addHistory(userId, timestamp, ctx.app.config);
    ctx.body = { message: '记录成功' };
  }
}

module.exports = HistoryController;
