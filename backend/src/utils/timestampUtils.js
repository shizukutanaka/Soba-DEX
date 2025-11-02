/**
 * Timestamp Utilities - Optimized Date/Time Operations
 * Reduces object creation overhead for frequent timestamp operations
 */

class TimestampUtils {
  constructor() {
    this._date = null;
    this._lastUpdate = 0;
    this._updateInterval = 100; // Update every 100ms for reasonable precision
  }

  // Get current ISO timestamp (cached for performance)
  now() {
    const now = Date.now();
    if (now - this._lastUpdate > this._updateInterval || !this._date) {
      this._date = new Date(now).toISOString();
      this._lastUpdate = now;
    }
    return this._date;
  }

  // Get current timestamp in milliseconds
  nowMs() {
    return Date.now();
  }

  // Get fresh timestamp (no caching)
  fresh() {
    return new Date().toISOString();
  }

  // Format duration in milliseconds
  formatDuration(ms) {
    if (ms < 1000) {
      return `${Math.round(ms)}ms`;
    } else if (ms < 60000) {
      return `${(ms / 1000).toFixed(1)}s`;
    } else {
      return `${Math.floor(ms / 60000)}m ${Math.floor((ms % 60000) / 1000)}s`;
    }
  }

  // Check if timestamp is expired
  isExpired(timestamp, ttlMs) {
    return Date.now() - timestamp > ttlMs;
  }

  // Calculate age of timestamp
  getAge(timestamp) {
    return Date.now() - timestamp;
  }
}

// Singleton instance
const timestampUtils = new TimestampUtils();

module.exports = {
  TimestampUtils,
  timestampUtils
};
