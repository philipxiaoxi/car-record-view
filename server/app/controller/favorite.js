// app/controller/favorite.js
const Controller = require('egg').Controller;
const favoriteService = require('../service/favorite');

class FavoriteController extends Controller {
  async list() {
    const { ctx } = this;
    const userId = ctx.state.user.id;
    const favorites = await favoriteService.getFavorites(userId, ctx.app.config);
    ctx.body = { list: favorites };
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

    await favoriteService.addFavorite(userId, timestamp, ctx.app.config);
    ctx.body = { message: '收藏成功' };
  }

  async remove() {
    const { ctx } = this;
    const userId = ctx.state.user.id;
    const { timestamp } = ctx.params;

    await favoriteService.removeFavorite(userId, timestamp, ctx.app.config);
    ctx.body = { message: '已取消收藏' };
  }
}

module.exports = FavoriteController;
