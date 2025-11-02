/**
 * Structured Logger with JSON Output
 * ログ集約システム（ELK, CloudWatch, Datadog等）対応
 */

const winston = require('winston');
const path = require('path');

class StructuredLogger {
  constructor(options = {}) {
    const {
      level = process.env.LOG_LEVEL || 'info',
      service = 'soba-backend',
      environment = process.env.NODE_ENV || 'development'
    } = options;

    // カスタムログレベル
    const customLevels = {
      levels: {
        error: 0,
        warn: 1,
        info: 2,
        http: 3,
        debug: 4
      },
      colors: {
        error: 'red',
        warn: 'yellow',
        info: 'green',
        http: 'magenta',
        debug: 'blue'
      }
    };

    // JSON形式のフォーマット（本番環境）
    const jsonFormat = winston.format.combine(
      winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSS' }),
      winston.format.errors({ stack: true }),
      winston.format.metadata(),
      winston.format.json()
    );

    // 人間が読みやすい形式（開発環境）
    const prettyFormat = winston.format.combine(
      winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
      winston.format.colorize({ all: true }),
      winston.format.errors({ stack: true }),
      winston.format.printf(({ timestamp, level, message, ...meta }) => {
        let msg = `${timestamp} [${level}]: ${message}`;

        // メタデータがある場合は追加
        if (Object.keys(meta).length > 0) {
          msg += ` ${JSON.stringify(meta, null, 2)}`;
        }

        return msg;
      })
    );

    // トランスポート設定
    const transports = [];

    // コンソール出力
    transports.push(
      new winston.transports.Console({
        format: environment === 'production' ? jsonFormat : prettyFormat
      })
    );

    // 本番環境ではファイル出力も追加
    if (environment === 'production') {
      const logDir = process.env.LOG_DIR || path.join(__dirname, '../../logs');

      // 全ログ
      transports.push(
        new winston.transports.File({
          filename: path.join(logDir, 'combined.log'),
          format: jsonFormat,
          maxsize: 10 * 1024 * 1024, // 10MB
          maxFiles: 5
        })
      );

      // エラーログのみ
      transports.push(
        new winston.transports.File({
          filename: path.join(logDir, 'error.log'),
          level: 'error',
          format: jsonFormat,
          maxsize: 10 * 1024 * 1024, // 10MB
          maxFiles: 5
        })
      );
    }

    // Winstonロガー作成
    this.logger = winston.createLogger({
      level,
      levels: customLevels.levels,
      defaultMeta: {
        service,
        environment,
        hostname: process.env.HOSTNAME || 'localhost',
        pid: process.pid
      },
      transports,
      exitOnError: false
    });

    winston.addColors(customLevels.colors);
  }

  /**
   * 構造化ログのヘルパーメソッド
   */
  log(level, message, metadata = {}) {
    this.logger.log(level, message, this.sanitizeMetadata(metadata));
  }

  error(message, error = null, metadata = {}) {
    const logData = { ...metadata };

    if (error instanceof Error) {
      logData.error = {
        name: error.name,
        message: error.message,
        stack: error.stack,
        code: error.code
      };
    } else if (error) {
      logData.error = error;
    }

    this.logger.error(message, logData);
  }

  warn(message, metadata = {}) {
    this.logger.warn(message, this.sanitizeMetadata(metadata));
  }

  info(message, metadata = {}) {
    this.logger.info(message, this.sanitizeMetadata(metadata));
  }

  http(message, metadata = {}) {
    this.logger.http(message, this.sanitizeMetadata(metadata));
  }

  debug(message, metadata = {}) {
    this.logger.debug(message, this.sanitizeMetadata(metadata));
  }

  /**
   * HTTPリクエスト/レスポンスのログ
   */
  logRequest(req, res, duration) {
    const metadata = {
      method: req.method,
      url: req.originalUrl || req.url,
      status: res.statusCode,
      duration: `${duration}ms`,
      ip: req.ip || req.connection.remoteAddress,
      userAgent: req.get('user-agent'),
      requestId: req.id || req.headers['x-request-id']
    };

    // クエリパラメータ（機密情報を除く）
    if (req.query && Object.keys(req.query).length > 0) {
      metadata.query = this.sanitizeObject(req.query);
    }

    // リクエストボディ（機密情報を除く）
    if (req.body && Object.keys(req.body).length > 0) {
      metadata.body = this.sanitizeObject(req.body);
    }

    const level = res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'http';

    this.log(level, `${req.method} ${req.originalUrl || req.url}`, metadata);
  }

  /**
   * データベースクエリのログ
   */
  logQuery(query, duration, metadata = {}) {
    this.debug('Database query executed', {
      query: this.sanitizeQuery(query),
      duration: `${duration}ms`,
      ...metadata
    });
  }

  /**
   * ビジネスイベントのログ
   */
  logEvent(eventName, metadata = {}) {
    this.info(`Event: ${eventName}`, {
      event: eventName,
      ...this.sanitizeMetadata(metadata)
    });
  }

  /**
   * セキュリティイベントのログ
   */
  logSecurity(eventType, metadata = {}) {
    this.warn(`Security event: ${eventType}`, {
      securityEvent: eventType,
      ...this.sanitizeMetadata(metadata)
    });
  }

  /**
   * パフォーマンスメトリクスのログ
   */
  logMetric(metricName, value, metadata = {}) {
    this.info(`Metric: ${metricName}`, {
      metric: metricName,
      value,
      ...metadata
    });
  }

  /**
   * メタデータのサニタイズ（機密情報を除去）
   */
  sanitizeMetadata(metadata) {
    if (typeof metadata !== 'object' || metadata === null) {
      return metadata;
    }

    return this.sanitizeObject(metadata);
  }

  sanitizeObject(obj) {
    const sanitized = {};
    const sensitiveKeys = [
      'password',
      'secret',
      'token',
      'apikey',
      'api_key',
      'authorization',
      'cookie',
      'session',
      'jwt',
      'private',
      'privateKey',
      'private_key'
    ];

    for (const [key, value] of Object.entries(obj)) {
      const lowerKey = key.toLowerCase();

      // 機密情報のキーをチェック
      if (sensitiveKeys.some(sensitive => lowerKey.includes(sensitive))) {
        sanitized[key] = '[REDACTED]';
      } else if (typeof value === 'object' && value !== null) {
        sanitized[key] = this.sanitizeObject(value);
      } else {
        sanitized[key] = value;
      }
    }

    return sanitized;
  }

  sanitizeQuery(query) {
    if (typeof query !== 'string') {
      return query;
    }

    // SQLインジェクション対策として、クエリの一部をマスク
    // 実際の値ではなくプレースホルダーのみを表示
    return query.replace(/('[^']*')|("[^"]*")|(\d+)/g, (match) => {
      if (match.startsWith("'") || match.startsWith('"')) {
        return "'[STRING]'";
      }
      return '[NUMBER]';
    });
  }

  /**
   * ロガーのインスタンスを取得
   */
  getWinstonLogger() {
    return this.logger;
  }
}

// シングルトンインスタンスをエクスポート
const structuredLogger = new StructuredLogger();

module.exports = {
  StructuredLogger,
  logger: structuredLogger,
  createLogger: (options) => new StructuredLogger(options)
};
