// app/controller/video.js
const Controller = require('egg').Controller;
const videoService = require('../service/video');
const fs = require('fs');
const path = require('path');

class VideoController extends Controller {
  async list() {
    const { ctx } = this;
    const { page = 1, pageSize = 50 } = ctx.query;
    const result = await videoService.getVideoList(
      ctx.app.config,
      parseInt(page),
      parseInt(pageSize)
    );
    ctx.body = result;
  }

  async detail() {
    const { ctx } = this;
    const { timestamp } = ctx.params;
    const video = await videoService.getVideoByTimestamp(timestamp, ctx.app.config);

    if (!video) {
      ctx.status = 404;
      ctx.body = { error: '视频不存在' };
      return;
    }

    const adjacent = await videoService.getAdjacentVideos(timestamp, ctx.app.config);
    video.prev = adjacent.prev;
    video.next = adjacent.next;

    ctx.body = video;
  }

  async stream() {
    const { ctx } = this;
    const { filename } = ctx.params;

    try {
      const result = await videoService.getOrCreateMp4Cache(filename, ctx.app.config);

      if (result.error) {
        ctx.status = 404;
        ctx.body = { error: result.error };
        return;
      }

      const mp4Path = result.path;
      const stat = fs.statSync(mp4Path);
      const fileSize = stat.size;
      const range = ctx.header.range;

      let stream;
      if (range) {
        const parts = range.replace(/bytes=/, '').split('-');
        const start = parseInt(parts[0], 10);
        const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
        const chunkSize = end - start + 1;

        ctx.status = 206;
        ctx.set('Content-Range', `bytes ${start}-${end}/${fileSize}`);
        ctx.set('Accept-Ranges', 'bytes');
        ctx.set('Content-Length', chunkSize);
        ctx.set('Content-Type', 'video/mp4');

        stream = fs.createReadStream(mp4Path, { start, end });
      } else {
        ctx.set('Content-Length', fileSize);
        ctx.set('Content-Type', 'video/mp4');
        stream = fs.createReadStream(mp4Path);
      }

      stream.on('error', (err) => {
        if (err.code === 'EPIPE') return;
        ctx.logger.error('[Stream] 读取错误:', err.message);
      });

      ctx.body = stream;
    } catch (err) {
      ctx.status = 500;
      ctx.body = { error: '视频处理失败', message: err.message };
    }
  }

  async cover() {
    const { ctx } = this;
    const { filename } = ctx.params;

    try {
      const coverPath = await videoService.getOrCreateCover(filename, ctx.app.config);

      if (!coverPath) {
        const defaultPath = path.join(__dirname, '../../public/images/default-cover.jpg');
        ctx.set('Content-Type', 'image/jpeg');
        ctx.body = fs.createReadStream(defaultPath);
        return;
      }

      ctx.set('Content-Type', 'image/jpeg');
      ctx.body = fs.createReadStream(coverPath);
    } catch (err) {
      ctx.status = 500;
      ctx.body = { error: '封面生成失败' };
    }
  }
}

module.exports = VideoController;
