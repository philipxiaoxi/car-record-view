-- server/database/init.sql

-- 用户表
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL,
  password TEXT NOT NULL,
  role TEXT DEFAULT 'user',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 视频元数据表
CREATE TABLE IF NOT EXISTS videos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  filename TEXT NOT NULL,
  timestamp DATETIME NOT NULL,
  type TEXT NOT NULL,
  duration INTEGER,
  resolution TEXT,
  bitrate INTEGER,
  mp4_cached INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 播放历史表
CREATE TABLE IF NOT EXISTS play_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  video_timestamp DATETIME NOT NULL,
  played_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

-- 索引
CREATE INDEX IF NOT EXISTS idx_videos_timestamp ON videos(timestamp);
CREATE INDEX IF NOT EXISTS idx_videos_type ON videos(type);
CREATE INDEX IF NOT EXISTS idx_play_history_user ON play_history(user_id, played_at);

-- 配置表
CREATE TABLE IF NOT EXISTS config (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 扫描任务表
CREATE TABLE IF NOT EXISTS scan_tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  status TEXT NOT NULL DEFAULT 'pending',  -- pending/running/paused/completed/error
  total_files INTEGER DEFAULT 0,
  processed_files INTEGER DEFAULT 0,
  current_file TEXT,
  started_at DATETIME,
  finished_at DATETIME,
  error_message TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 转码任务表
CREATE TABLE IF NOT EXISTS transcode_tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  status TEXT NOT NULL DEFAULT 'pending',  -- pending/running/paused/completed/error
  total_files INTEGER DEFAULT 0,
  processed_files INTEGER DEFAULT 0,
  success_count INTEGER DEFAULT 0,
  failed_count INTEGER DEFAULT 0,
  current_file TEXT,
  started_at DATETIME,
  finished_at DATETIME,
  error_message TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 转码错误记录表
CREATE TABLE IF NOT EXISTS transcode_errors (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id INTEGER NOT NULL,
  filename TEXT NOT NULL,
  error_message TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (task_id) REFERENCES transcode_tasks(id)
);

-- 转码错误索引
CREATE INDEX IF NOT EXISTS idx_transcode_errors_task ON transcode_errors(task_id);
