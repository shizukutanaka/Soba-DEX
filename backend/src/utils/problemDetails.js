/**
 * RFC 9457 - Problem Details for HTTP APIs
 * 業界標準のエラーレスポンス形式
 * https://www.rfc-editor.org/rfc/rfc9457.html
 */

const { logger } = require('./productionLogger');

class ProblemDetails {
  constructor() {
    this.baseUrl = process.env.API_BASE_URL || 'https://api.example.com';
    this.errorRegistry = new Map();
    this.initializeErrorRegistry();
  }

  // エラーレジストリ初期化
  initializeErrorRegistry() {
    // RFC 9457標準エラータイプ
    this.registerError('validation-error', {
      title: 'Validation Error',
      status: 400,
      category: 'client'
    });

    this.registerError('authentication-required', {
      title: 'Authentication Required',
      status: 401,
      category: 'client'
    });

    this.registerError('insufficient-permissions', {
      title: 'Insufficient Permissions',
      status: 403,
      category: 'client'
    });

    this.registerError('resource-not-found', {
      title: 'Resource Not Found',
      status: 404,
      category: 'client'
    });

    this.registerError('method-not-allowed', {
      title: 'Method Not Allowed',
      status: 405,
      category: 'client'
    });

    this.registerError('conflict', {
      title: 'Conflict',
      status: 409,
      category: 'client'
    });

    this.registerError('rate-limit-exceeded', {
      title: 'Rate Limit Exceeded',
      status: 429,
      category: 'client'
    });

    this.registerError('internal-error', {
      title: 'Internal Server Error',
      status: 500,
      category: 'server'
    });

    this.registerError('service-unavailable', {
      title: 'Service Unavailable',
      status: 503,
      category: 'server'
    });

    // DEX固有のエラータイプ
    this.registerError('insufficient-balance', {
      title: 'Insufficient Balance',
      status: 400,
      category: 'business'
    });

    this.registerError('slippage-exceeded', {
      title: 'Slippage Exceeded',
      status: 400,
      category: 'business'
    });

    this.registerError('pool-not-found', {
      title: 'Liquidity Pool Not Found',
      status: 404,
      category: 'business'
    });

    this.registerError('trading-paused', {
      title: 'Trading Paused',
      status: 503,
      category: 'business'
    });

    // セキュリティエラー
    this.registerError('security-threat-detected', {
      title: 'Security Threat Detected',
      status: 403,
      category: 'security'
    });

    this.registerError('mev-attack-detected', {
      title: 'MEV Attack Detected',
      status: 403,
      category: 'security'
    });

    this.registerError('suspicious-activity', {
      title: 'Suspicious Activity Detected',
      status: 403,
      category: 'security'
    });
  }

  // エラー登録
  registerError(type, metadata) {
    this.errorRegistry.set(type, {
      ...metadata,
      type: `${this.baseUrl}/errors/${type}`
    });
  }

  // RFC 9457形式のProblem Details作成
  create(options) {
    const {
      type = 'internal-error',
      detail = null,
      instance = null,
      extensions = {}
    } = options;

    const errorMeta = this.errorRegistry.get(type);

    if (!errorMeta) {
      logger.warn('[ProblemDetails] Unknown error type', { type });
      return this.create({ type: 'internal-error', detail });
    }

    const problem = {
      type: errorMeta.type,
      title: errorMeta.title,
      status: errorMeta.status
    };

    // オプションフィールド
    if (detail) {
      problem.detail = detail;
    }

    if (instance) {
      problem.instance = instance;
    }

    // 拡張フィールド
    if (Object.keys(extensions).length > 0) {
      Object.assign(problem, extensions);
    }

    // タイムスタンプ追加
    problem.timestamp = new Date().toISOString();

    // カテゴリ追加（デバッグ用）
    if (process.env.NODE_ENV === 'development') {
      problem.category = errorMeta.category;
    }

    return problem;
  }

  // バリデーションエラー作成
  validation(errors, instance = null) {
    return this.create({
      type: 'validation-error',
      detail: 'Request validation failed',
      instance,
      extensions: {
        errors: Array.isArray(errors) ? errors : [errors]
      }
    });
  }

  // 認証エラー作成
  authentication(detail = 'Authentication is required to access this resource', instance = null) {
    return this.create({
      type: 'authentication-required',
      detail,
      instance,
      extensions: {
        authSchemes: ['Bearer']
      }
    });
  }

  // 認可エラー作成
  authorization(detail = 'You do not have permission to access this resource', instance = null) {
    return this.create({
      type: 'insufficient-permissions',
      detail,
      instance
    });
  }

  // リソース未検出エラー作成
  notFound(resource, identifier = null, instance = null) {
    const detail = identifier
      ? `${resource} with identifier '${identifier}' was not found`
      : `${resource} was not found`;

    return this.create({
      type: 'resource-not-found',
      detail,
      instance,
      extensions: {
        resource,
        identifier
      }
    });
  }

  // レート制限エラー作成
  rateLimit(retryAfter, instance = null) {
    return this.create({
      type: 'rate-limit-exceeded',
      detail: 'Too many requests. Please try again later.',
      instance,
      extensions: {
        retryAfter
      }
    });
  }

  // 内部エラー作成
  internal(detail = 'An unexpected error occurred', instance = null, errorId = null) {
    return this.create({
      type: 'internal-error',
      detail,
      instance,
      extensions: {
        errorId
      }
    });
  }

  // サービス利用不可エラー作成
  serviceUnavailable(detail = 'The service is temporarily unavailable', instance = null, retryAfter = null) {
    const extensions = {};
    if (retryAfter) {
      extensions.retryAfter = retryAfter;
    }

    return this.create({
      type: 'service-unavailable',
      detail,
      instance,
      extensions
    });
  }

  // DEX: 残高不足エラー作成
  insufficientBalance(required, available, token, instance = null) {
    return this.create({
      type: 'insufficient-balance',
      detail: `Insufficient ${token} balance. Required: ${required}, Available: ${available}`,
      instance,
      extensions: {
        required: String(required),
        available: String(available),
        token
      }
    });
  }

  // DEX: スリッページ超過エラー作成
  slippageExceeded(expected, actual, threshold, instance = null) {
    return this.create({
      type: 'slippage-exceeded',
      detail: `Slippage exceeded acceptable threshold of ${threshold}%`,
      instance,
      extensions: {
        expectedAmount: String(expected),
        actualAmount: String(actual),
        slippageThreshold: String(threshold)
      }
    });
  }

  // DEX: プール未検出エラー作成
  poolNotFound(tokenA, tokenB, instance = null) {
    return this.create({
      type: 'pool-not-found',
      detail: `No liquidity pool found for pair ${tokenA}/${tokenB}`,
      instance,
      extensions: {
        tokenA,
        tokenB
      }
    });
  }

  // DEX: 取引一時停止エラー作成
  tradingPaused(reason = 'Maintenance', estimatedResume = null, instance = null) {
    const extensions = { reason };
    if (estimatedResume) {
      extensions.estimatedResume = estimatedResume;
    }

    return this.create({
      type: 'trading-paused',
      detail: `Trading is temporarily paused: ${reason}`,
      instance,
      extensions
    });
  }

  // セキュリティ脅威検知エラー作成
  securityThreat(threatType, detail, instance = null) {
    return this.create({
      type: 'security-threat-detected',
      detail,
      instance,
      extensions: {
        threatType,
        action: 'Request blocked for security reasons'
      }
    });
  }

  // MEV攻撃検知エラー作成
  mevAttack(attackType, detail, instance = null) {
    return this.create({
      type: 'mev-attack-detected',
      detail,
      instance,
      extensions: {
        attackType,
        action: 'Transaction blocked to protect users'
      }
    });
  }

  // Express用ミドルウェア
  middleware() {
    return (req, res, next) => {
      // RFC 9457レスポンスヘルパー追加
      res.problem = (problem) => {
        // Content-Typeをapplication/problem+jsonに設定
        res.setHeader('Content-Type', 'application/problem+json; charset=utf-8');

        // リクエストID追加
        if (req.id && !problem.instance) {
          problem.instance = `/requests/${req.id}`;
        }

        // ステータスコード設定
        const status = problem.status || 500;

        // ログ記録
        if (status >= 500) {
          logger.error('[ProblemDetails] Server error', {
            problem,
            requestId: req.id,
            path: req.path,
            method: req.method
          });
        } else if (status >= 400) {
          logger.warn('[ProblemDetails] Client error', {
            problem,
            requestId: req.id,
            path: req.path,
            method: req.method
          });
        }

        return res.status(status).json(problem);
      };

      // 便利なヘルパーメソッド
      res.problemValidation = (errors) => {
        return res.problem(this.validation(errors, req.path));
      };

      res.problemAuthentication = (detail) => {
        return res.problem(this.authentication(detail, req.path));
      };

      res.problemAuthorization = (detail) => {
        return res.problem(this.authorization(detail, req.path));
      };

      res.problemNotFound = (resource, identifier) => {
        return res.problem(this.notFound(resource, identifier, req.path));
      };

      res.problemRateLimit = (retryAfter) => {
        // Retry-Afterヘッダー設定
        res.setHeader('Retry-After', retryAfter);
        return res.problem(this.rateLimit(retryAfter, req.path));
      };

      res.problemInternal = (detail, errorId) => {
        return res.problem(this.internal(detail, req.path, errorId));
      };

      res.problemServiceUnavailable = (detail, retryAfter) => {
        if (retryAfter) {
          res.setHeader('Retry-After', retryAfter);
        }
        return res.problem(this.serviceUnavailable(detail, req.path, retryAfter));
      };

      // DEX固有ヘルパー
      res.problemInsufficientBalance = (required, available, token) => {
        return res.problem(this.insufficientBalance(required, available, token, req.path));
      };

      res.problemSlippageExceeded = (expected, actual, threshold) => {
        return res.problem(this.slippageExceeded(expected, actual, threshold, req.path));
      };

      res.problemPoolNotFound = (tokenA, tokenB) => {
        return res.problem(this.poolNotFound(tokenA, tokenB, req.path));
      };

      res.problemTradingPaused = (reason, estimatedResume) => {
        return res.problem(this.tradingPaused(reason, estimatedResume, req.path));
      };

      res.problemSecurityThreat = (threatType, detail) => {
        return res.problem(this.securityThreat(threatType, detail, req.path));
      };

      res.problemMevAttack = (attackType, detail) => {
        return res.problem(this.mevAttack(attackType, detail, req.path));
      };

      next();
    };
  }

  // エラーレジストリ取得
  getErrorRegistry() {
    return Array.from(this.errorRegistry.entries()).map(([type, meta]) => ({
      type,
      ...meta
    }));
  }

  // エラータイプ検索
  getErrorType(type) {
    return this.errorRegistry.get(type);
  }
}

const problemDetails = new ProblemDetails();

module.exports = {
  problemDetails,
  ProblemDetails
};
