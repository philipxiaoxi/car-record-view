const path = require('path');
const fs = require('fs');

process.env.NODE_ENV = 'production';

if (process.env.PORTABLE_MODE) {
  const rootDir = path.join(__dirname, '..');
  const dataDir = path.join(rootDir, 'data');
  fs.mkdirSync(path.join(dataDir, 'cache/mp4'), { recursive: true });
  fs.mkdirSync(path.join(dataDir, 'cache/covers'), { recursive: true });
  fs.mkdirSync(path.join(dataDir, 'cache/remote'), { recursive: true });
  fs.mkdirSync(path.join(dataDir, 'logs'), { recursive: true });

  process.env.SQLITE_FILENAME = path.join(dataDir, 'car-record.db');
  process.env.LOG_DIR = path.join(dataDir, 'logs');
  process.env.CACHE_DIR = dataDir;
  process.env.FFMPEG_PATH = path.join(rootDir, process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg');
}

const { Application } = require('egg');
const app = new Application({ baseDir: __dirname, mode: 'single' });
app.ready().then(() => {
  const port = process.env.PORT || 7001;
  app.listen(port, '0.0.0.0', () => {
    console.log(`> Server started at http://localhost:${port}`);
  });
}).catch(err => { console.error(err); process.exit(1); });
