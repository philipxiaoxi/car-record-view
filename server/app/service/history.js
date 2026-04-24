// app/service/history.js
const { getDatabase } = require('./db');

class HistoryService {
  async addHistory(userId, videoTimestamp, config) {
    const db = getDatabase(config);
    const maxRecords = config.history.maxRecords || 50;

    db.prepare('DELETE FROM play_history WHERE user_id = ? AND video_timestamp = ?').run(userId, videoTimestamp);
    db.prepare('INSERT INTO play_history (user_id, video_timestamp) VALUES (?, ?)').run(userId, videoTimestamp);

    db.prepare(`
      DELETE FROM play_history
      WHERE user_id = ? AND id NOT IN (
        SELECT id FROM play_history
        WHERE user_id = ?
        ORDER BY played_at DESC
        LIMIT ?
      )
    `).run(userId, userId, maxRecords);
  }

  async getHistory(userId, config) {
    const db = getDatabase(config);
    const maxRecords = config.history.maxRecords || 50;

    const history = db.prepare(`
      SELECT
        h.video_timestamp as timestamp,
        h.played_at,
        GROUP_CONCAT(CASE WHEN v.type = 'F' THEN v.filename END) as front_filename,
        GROUP_CONCAT(CASE WHEN v.type = 'R' THEN v.filename END) as rear_filename,
        MAX(v.duration) as duration,
        MAX(v.resolution) as resolution
      FROM play_history h
      LEFT JOIN videos v ON h.video_timestamp = v.timestamp
      WHERE h.user_id = ?
      GROUP BY h.video_timestamp
      ORDER BY h.played_at DESC
      LIMIT ?
    `).all(userId, maxRecords);

    return history.map(h => ({
      timestamp: h.timestamp,
      playedAt: h.played_at,
      front: h.front_filename,
      rear: h.rear_filename,
      duration: h.duration,
      resolution: h.resolution,
    }));
  }
}

module.exports = new HistoryService();
