/**
 * ミドルウェア設定ユーティリティ
 * John Carmack, Robert C. Martin, Rob Pikeの設計原則に基づく
 * - 単一責任の原則（SRP）
 * - 関数の明確な分離
 * - 軽量で効率的な実装
 */

const createMiddlewareManager = (app, logger, logSystemMessage) => {
  /**
   * 基本的なセキュリティミドルウェアを設定
   */
  const setupSecurityMiddleware = () => {
    app.disable('x-powered-by');
    logSystemMessage('info', 'Disabled X-Powered-By header');

    // Trust proxy設定
    const trustProxySetting = (() => {
      const rawValue = process.env.TRUST_PROXY;

      if (!rawValue) {
        return false;
      }

      if (rawValue === 'true') {
        return true;
      }

      if (rawValue === 'false') {
        return false;
      }

      const parsedNumber = Number(rawValue);
      if (!Number.isNaN(parsedNumber)) {
        return parsedNumber;
      }

      return rawValue;
    })();

    if (trustProxySetting !== false) {
      app.set('trust proxy', trustProxySetting);
      logSystemMessage('info', 'Trust proxy enabled', { value: trustProxySetting });
    } else {
      logSystemMessage('info', 'Trust proxy disabled');
    }
  };

  /**
   * HTTPS強制ミドルウェアを設定
   */
  const setupHttpsEnforcement = () => {
    if (process.env.ENFORCE_HTTPS === 'true') {
      logSystemMessage('info', 'HTTPS enforcement middleware enabled');
      app.use((req, res, next) => {
        const forwardedProto = req.get('x-forwarded-proto');
        const isSecure = req.secure || (Array.isArray(forwardedProto) ? forwardedProto.includes('https') : forwardedProto === 'https');

        if (isSecure) {
          res.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
          return next();
        }

        logSystemMessage('warn', 'Insecure request blocked or redirected', {
          host: req.headers.host,
          path: req.originalUrl,
          method: req.method
        });

        if (req.method === 'GET' || req.method === 'HEAD') {
          const redirectUrl = `https://${req.headers.host}${req.originalUrl}`;
          return res.redirect(301, redirectUrl);
        }

        return res.status(403).json({
          error: 'HTTPS Required',
          message: 'Please use HTTPS when accessing this service.',
          timestamp: new Date().toISOString()
        });
      });
    } else {
      logSystemMessage('info', 'HTTPS enforcement middleware disabled');
    }
  };

  /**
   * 基本的なミドルウェアを設定
   */
  const setupBasicMiddleware = () => {
    const helmet = require('helmet');
    const compression = require('compression');
    const cors = require('cors');
    const morgan = require('morgan');
    const express = require('express');
    const qs = require('qs');

    // セキュリティとパフォーマンス
    app.use(helmet());
    app.use(compression());

    // カスタムクエリパーサー
    app.set('query parser', (queryString = '') => {
      const parsed = qs.parse(queryString, {
        allowDots: true,
        depth: 5,
        arrayLimit: 10,
        allowPrototypes: false
      });

      const sanitizeValue = (value) => {
        if (Array.isArray(value)) {
          return value.length > 0 ? value[0] : undefined;
        }
        return value;
      };

      return Object.fromEntries(
        Object.entries(parsed).map(([key, value]) => [key, sanitizeValue(value)])
      );
    });
    logSystemMessage('info', 'Custom query parser configured to mitigate parameter pollution');

    // CORS設定
    try {
      const { createCorsMiddleware } = require('./middleware/corsConfig');
      app.use(createCorsMiddleware());
      logSystemMessage('info', 'Enhanced CORS configured');
    } catch (error) {
      logSystemMessage('error', 'Failed to set up CORS', { error: error.message });
      // フォールバック
      app.use(cors());
    }

    // ログとJSONパーサー
    app.use(morgan('combined'));
    app.use(express.json({ limit: '1mb' }));
    app.use(express.urlencoded({ extended: true, limit: '1mb', parameterLimit: 100 }));
  };

  /**
   * エラーハンドリングミドルウェアを設定
   */
  const setupErrorHandling = () => {
    // JSONパースエラー処理
    app.use((err, req, res, next) => {
      if (err instanceof SyntaxError && 'body' in err) {
        logSystemMessage('error', 'Malformed JSON payload received', {
          path: req.originalUrl,
          method: req.method,
          error: err.message
        });

        return res.status(400).json({
          error: 'Invalid JSON payload',
          message: 'Request body contains malformed JSON. Please verify the syntax.',
          timestamp: new Date().toISOString()
        });
      }

      if (err && err.type === 'entity.too.large') {
        logSystemMessage('warn', 'Payload rejected due to size limit', {
          path: req.originalUrl,
          method: req.method,
          limit: err.limit
        });

        return res.status(413).json({
          error: 'Payload Too Large',
          message: 'Request entity exceeds the allowed limit. Reduce payload size and retry.',
          limit: err.limit,
          timestamp: new Date().toISOString()
        });
      }

      next(err);
    });

    // シャットダウン中のリクエスト拒否
    app.use((req, res, next) => {
      // このチェックは後で行うため、ここではスキップ
      next();
    });
  };

  /**
   * レート制限を設定
   */
  const setupRateLimiting = () => {
    try {
      logSystemMessage('info', 'Setting up rate limiting');
      const { createRateLimiter, createStrictRateLimiter } = require('./middleware/rateLimiter');

      // 一般APIレート制限
      app.use('/api/', createRateLimiter(15 * 60 * 1000, 100, 'Too many API requests'));

      // 機密エンドポイントの厳格なレート制限
      app.use('/api/dex/trading/', createStrictRateLimiter(60 * 1000, 10));

      logSystemMessage('info', 'Rate limiting configured');
    } catch (error) {
      logSystemMessage('error', 'Failed to set up rate limiting', { error: error.message });
    }
  };

  /**
   * 入力検証を設定
   */
  const setupInputValidation = () => {
    try {
      logSystemMessage('info', 'Setting up input validation');
      const { sanitizationMiddleware } = require('./middleware/inputValidator');

      // 全てのAPIルートに適用
      app.use('/api/', sanitizationMiddleware.sanitizeInput);
      app.use('/api/', sanitizationMiddleware.preventSqlInjection);

      logSystemMessage('info', 'Input validation configured');
    } catch (error) {
      logSystemMessage('error', 'Failed to set up input validation', { error: error.message });
    }
  };

  /**
   * レスポンスキャッシュを設定
   */
  const setupResponseCaching = () => {
    try {
      logSystemMessage('info', 'Setting up response caching');
      const responseCache = require('./middleware/responseCache');
      app.use('/api/', responseCache.middleware());
      logSystemMessage('info', 'Response caching configured');
    } catch (error) {
      logSystemMessage('error', 'Failed to set up response caching', { error: error.message });
    }
  };

  /**
   * 全てのミドルウェアを設定
   */
  const setupAllMiddleware = () => {
    setupSecurityMiddleware();
    setupHttpsEnforcement();
    setupBasicMiddleware();
    setupErrorHandling();
    setupRateLimiting();
    setupInputValidation();
    setupResponseCaching();

    logSystemMessage('info', 'All middleware configured');
  };

  return {
    setupSecurityMiddleware,
    setupHttpsEnforcement,
    setupBasicMiddleware,
    setupErrorHandling,
    setupRateLimiting,
    setupInputValidation,
    setupResponseCaching,
    setupAllMiddleware
  };
};
