const path = require('path');
const { getDatabase } = require('../db');
const LocalDriver = require('./drivers/local');
const WebDAVDriver = require('./drivers/webdav');

let driver = null;

function buildStorageConfig(appConfig) {
  const db = getDatabase(appConfig);
  const rows = db.prepare('SELECT key, value FROM config').all();
  const dbConfig = {};
  for (const row of rows) {
    dbConfig[row.key] = row.value;
  }

  const type = dbConfig.storageType || process.env.STORAGE_TYPE || 'local';

  const base = {
    type,
    tempDir: path.join(__dirname, '../../../cache/remote'),
  };

  if (type === 'webdav') {
    base.webdav = {
      url: dbConfig.webdavUrl || process.env.WEBDAV_URL || '',
      username: dbConfig.webdavUsername || process.env.WEBDAV_USERNAME || '',
      password: dbConfig.webdavPassword || process.env.WEBDAV_PASSWORD || '',
      rootDir: dbConfig.webdavRootDir || '',
    };
  }

  return base;
}

function getStorageDriver(appConfig) {
  if (driver) return driver;

  const config = buildStorageConfig(appConfig);

  if (config.type === 'webdav') {
    driver = new WebDAVDriver(config.webdav);
  } else {
    driver = new LocalDriver(appConfig);
  }

  return driver;
}

function resetStorageDriver() {
  driver = null;
}

module.exports = {
  getStorageDriver,
  resetStorageDriver,
};
