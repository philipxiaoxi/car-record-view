const fs = require('fs-extra');
const path = require('path');
const { execSync } = require('child_process');

const rootDir = path.join(__dirname, '../..');
const serverDir = path.join(rootDir, 'server');
const outDir = path.join(rootDir, 'dist/portable');

function main() {
  // 1. Build frontend
  console.log('[1/6] 构建前端...');
  execSync('npm run build:web', { cwd: rootDir, stdio: 'inherit' });

  // 2. Clean output
  console.log('[2/6] 准备输出目录...');
  fs.removeSync(outDir);
  fs.ensureDirSync(outDir);

  // 3. Copy server code (without node_modules)
  console.log('[3/6] 复制服务端代码...');
  const serverOut = path.join(outDir, 'server');
  fs.copySync(serverDir, serverOut, {
    filter: (src) => {
      const rel = path.relative(serverDir, src);
      if (rel.startsWith('node_modules') && rel !== 'node_modules') return false;
      if (rel.startsWith('logs') || rel.startsWith('run') || rel.startsWith('cache')) return false;
      return true;
    },
  });

  // Install production dependencies
  console.log('[3/6] 安装生产依赖...');
  execSync('npm install --production --no-audit --no-fund', { cwd: serverOut, stdio: 'inherit' });

  // 4. Copy ffmpeg
  console.log('[4/6] 复制 ffmpeg...');
  const ffmpegPath = require('ffmpeg-static');
  const ext = process.platform === 'win32' ? '.exe' : '';
  const ffmpegTarget = path.join(outDir, `ffmpeg${ext}`);
  fs.copyFileSync(ffmpegPath, ffmpegTarget);
  if (process.platform !== 'win32') fs.chmodSync(ffmpegTarget, 0o755);

  // 5. Copy node runtime
  console.log('[5/6] 复制 Node.js 运行时...');
  const nodeOut = path.join(outDir, 'node');
  fs.ensureDirSync(nodeOut);
  const nodeTarget = path.join(nodeOut, `node${ext}`);
  fs.copyFileSync(process.execPath, nodeTarget);
  if (process.platform !== 'win32') fs.chmodSync(nodeTarget, 0o755);

  // 6. Create launcher scripts
  console.log('[6/6] 创建启动脚本...');
  fs.writeFileSync(path.join(outDir, '启动.bat'),
    '@echo off\r\n' +
    'cd /d "%~dp0"\r\n' +
    'set PORTABLE_MODE=1\r\n' +
    'set PORT=7001\r\n' +
    '"node\\node.exe" "server\\start.js"\r\n' +
    'pause\r\n'
  );
  fs.writeFileSync(path.join(outDir, '启动.command'),
    '#!/bin/bash\n' +
    'cd "$(dirname "$0")"\n' +
    'export PORTABLE_MODE=1\n' +
    'export PORT=7001\n' +
    './node/node server/start.js\n'
  );
  fs.chmodSync(path.join(outDir, '启动.command'), 0o755);
  fs.writeFileSync(path.join(outDir, '启动.sh'),
    '#!/bin/bash\n' +
    'cd "$(dirname "$0")"\n' +
    'export PORTABLE_MODE=1\n' +
    'export PORT=7001\n' +
    './node/node server/start.js\n'
  );
  fs.chmodSync(path.join(outDir, '启动.sh'), 0o755);

  // Data directory placeholder
  fs.ensureDirSync(path.join(outDir, 'data'));

  console.log(`\n完成！便携包位于: ${outDir}`);
  console.log('双击 启动.command (macOS) 或 启动.bat (Windows) 启动。');
}

main();
