// app/service/ffmpeg.js
const ffmpeg = require('fluent-ffmpeg');
const path = require('path');
const fs = require('fs-extra');

class FFmpegService {
  async getMetadata(videoPath) {
    return new Promise((resolve, reject) => {
      ffmpeg.ffprobe(videoPath, (err, metadata) => {
        if (err) {
          reject(err);
          return;
        }

        const videoStream = metadata.streams.find(s => s.codec_type === 'video');

        resolve({
          duration: metadata.format.duration,
          resolution: videoStream ? `${videoStream.width}x${videoStream.height}` : null,
          bitrate: Math.round((metadata.format.bit_rate || 0) / 1000),
        });
      });
    });
  }

  async convertTsToMp4(inputPath, outputPath) {
    await fs.ensureDir(path.dirname(outputPath));

    return new Promise((resolve, reject) => {
      ffmpeg(inputPath)
        .outputOptions('-c copy')
        .output(outputPath)
        .on('end', () => resolve(outputPath))
        .on('error', reject)
        .run();
    });
  }

  async extractCover(videoPath, outputPath) {
    await fs.ensureDir(path.dirname(outputPath));

    return new Promise((resolve, reject) => {
      ffmpeg(videoPath)
        .screenshots({
          timestamps: ['0'],
          filename: path.basename(outputPath),
          folder: path.dirname(outputPath),
          size: '320x180',
        })
        .on('end', () => resolve(outputPath))
        .on('error', reject);
    });
  }
}

module.exports = new FFmpegService();
