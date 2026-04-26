// app/service/favorite.js
const { getDatabase } = require('./db');

class FavoriteService {
  async addFavorite(userId, videoTimestamp, config) {
    const db = getDatabase(config);
    db.prepare(`
      INSERT OR IGNORE INTO favorites (user_id, video_timestamp)
      VALUES (?, ?)
    `).run(userId, videoTimestamp);
  }

  async removeFavorite(userId, videoTimestamp, config) {
    const db = getDatabase(config);
    db.prepare(`
      DELETE FROM favorites
      WHERE user_id = ? AND video_timestamp = ?
    `).run(userId, videoTimestamp);
  }

  async getFavorites(userId, config) {
    const db = getDatabase(config);
    const favorites = db.prepare(`
      SELECT
        f.video_timestamp as timestamp,
        f.favorited_at,
        GROUP_CONCAT(CASE WHEN v.type = 'F' THEN v.filename END) as front_filename,
        GROUP_CONCAT(CASE WHEN v.type = 'R' THEN v.filename END) as rear_filename,
        MAX(v.duration) as duration,
        MAX(v.resolution) as resolution
      FROM favorites f
      LEFT JOIN videos v ON f.video_timestamp = v.timestamp
      WHERE f.user_id = ?
      GROUP BY f.video_timestamp
      ORDER BY f.favorited_at DESC
    `).all(userId);

    return favorites.map(f => ({
      timestamp: f.timestamp,
      favoritedAt: f.favorited_at,
      front: f.front_filename,
      rear: f.rear_filename,
      duration: f.duration,
      resolution: f.resolution,
    }));
  }

  async isFavorited(userId, videoTimestamp, config) {
    const db = getDatabase(config);
    const result = db.prepare(`
      SELECT 1 FROM favorites
      WHERE user_id = ? AND video_timestamp = ?
    `).get(userId, videoTimestamp);
    return !!result;
  }
}

module.exports = new FavoriteService();
