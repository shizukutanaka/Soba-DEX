/**
 * Internationalization (i18n) - Round 20
 * エラーメッセージの多言語化
 */

class I18n {
  constructor() {
    this.defaultLocale = 'ja'; // デフォルトは日本語
    this.supportedLocales = ['ja', 'en'];

    // 翻訳データ
    this.translations = {
      ja: {
        // 一般エラー
        'error.internal': '内部サーバーエラーが発生しました',
        'error.badRequest': '不正なリクエストです',
        'error.unauthorized': '認証が必要です',
        'error.forbidden': '権限がありません',
        'error.notFound': 'リソースが見つかりません',
        'error.methodNotAllowed': 'このHTTPメソッドは許可されていません',
        'error.timeout': 'リクエストがタイムアウトしました',
        'error.rateLimited': 'リクエスト数が制限を超えています',
        'error.serviceUnavailable': 'サービスが一時的に利用できません',

        // バリデーションエラー
        'validation.required': '{field}は必須です',
        'validation.invalid': '{field}が無効です',
        'validation.tooShort': '{field}が短すぎます（最小{min}文字）',
        'validation.tooLong': '{field}が長すぎます（最大{max}文字）',
        'validation.minValue': '{field}は{min}以上である必要があります',
        'validation.maxValue': '{field}は{max}以下である必要があります',
        'validation.invalidEmail': '有効なメールアドレスを入力してください',
        'validation.invalidAddress': '有効なEthereumアドレスを入力してください',

        // 認証エラー
        'auth.invalidCredentials': 'ユーザー名またはパスワードが正しくありません',
        'auth.tokenExpired': '認証トークンの有効期限が切れています',
        'auth.tokenInvalid': '認証トークンが無効です',
        'auth.sessionExpired': 'セッションの有効期限が切れています',
        'auth.accountLocked': 'アカウントがロックされています',
        'auth.accountDisabled': 'アカウントが無効化されています',

        // DEX関連
        'dex.insufficientBalance': '残高が不足しています',
        'dex.slippageTooHigh': 'スリッページが大きすぎます',
        'dex.pairNotFound': '取引ペアが見つかりません',
        'dex.poolNotFound': '流動性プールが見つかりません',
        'dex.invalidAmount': '数量が無効です',
        'dex.tradingPaused': '取引が一時停止されています',

        // セキュリティ
        'security.xssDetected': 'XSS攻撃の可能性が検知されました',
        'security.sqlInjectionDetected': 'SQLインジェクション攻撃の可能性が検知されました',
        'security.pathTraversalDetected': 'パストラバーサル攻撃の可能性が検知されました',
        'security.mevDetected': 'MEV攻撃の可能性が検知されました',
        'security.suspiciousActivity': '不審なアクティビティが検知されました',

        // 成功メッセージ
        'success.created': '{resource}が作成されました',
        'success.updated': '{resource}が更新されました',
        'success.deleted': '{resource}が削除されました',
        'success.swapExecuted': 'スワップが実行されました',
        'success.liquidityAdded': '流動性が追加されました',
        'success.liquidityRemoved': '流動性が削除されました'
      },
      en: {
        // General errors
        'error.internal': 'Internal server error occurred',
        'error.badRequest': 'Bad request',
        'error.unauthorized': 'Authentication required',
        'error.forbidden': 'Insufficient permissions',
        'error.notFound': 'Resource not found',
        'error.methodNotAllowed': 'Method not allowed',
        'error.timeout': 'Request timeout',
        'error.rateLimited': 'Too many requests',
        'error.serviceUnavailable': 'Service temporarily unavailable',

        // Validation errors
        'validation.required': '{field} is required',
        'validation.invalid': '{field} is invalid',
        'validation.tooShort': '{field} is too short (minimum {min} characters)',
        'validation.tooLong': '{field} is too long (maximum {max} characters)',
        'validation.minValue': '{field} must be at least {min}',
        'validation.maxValue': '{field} must be at most {max}',
        'validation.invalidEmail': 'Please enter a valid email address',
        'validation.invalidAddress': 'Please enter a valid Ethereum address',

        // Authentication errors
        'auth.invalidCredentials': 'Invalid username or password',
        'auth.tokenExpired': 'Authentication token has expired',
        'auth.tokenInvalid': 'Invalid authentication token',
        'auth.sessionExpired': 'Session has expired',
        'auth.accountLocked': 'Account is locked',
        'auth.accountDisabled': 'Account is disabled',

        // DEX related
        'dex.insufficientBalance': 'Insufficient balance',
        'dex.slippageTooHigh': 'Slippage too high',
        'dex.pairNotFound': 'Trading pair not found',
        'dex.poolNotFound': 'Liquidity pool not found',
        'dex.invalidAmount': 'Invalid amount',
        'dex.tradingPaused': 'Trading is paused',

        // Security
        'security.xssDetected': 'Potential XSS attack detected',
        'security.sqlInjectionDetected': 'Potential SQL injection attack detected',
        'security.pathTraversalDetected': 'Potential path traversal attack detected',
        'security.mevDetected': 'Potential MEV attack detected',
        'security.suspiciousActivity': 'Suspicious activity detected',

        // Success messages
        'success.created': '{resource} created successfully',
        'success.updated': '{resource} updated successfully',
        'success.deleted': '{resource} deleted successfully',
        'success.swapExecuted': 'Swap executed successfully',
        'success.liquidityAdded': 'Liquidity added successfully',
        'success.liquidityRemoved': 'Liquidity removed successfully'
      }
    };
  }

  // 翻訳取得
  t(key, locale = null, params = {}) {
    const targetLocale = locale || this.defaultLocale;

    // ロケールが未対応の場合はデフォルトを使用
    if (!this.supportedLocales.includes(targetLocale)) {
      return this.t(key, this.defaultLocale, params);
    }

    // 翻訳取得
    let translation = this.translations[targetLocale]?.[key];

    // 翻訳が見つからない場合
    if (!translation) {
      // 英語にフォールバック
      if (targetLocale !== 'en') {
        translation = this.translations.en?.[key];
      }

      // それでも見つからない場合はキーを返す
      if (!translation) {
        return key;
      }
    }

    // パラメータ置換
    return this.interpolate(translation, params);
  }

  // パラメータ置換
  interpolate(text, params) {
    return text.replace(/{(\w+)}/g, (match, key) => {
      return params[key] !== undefined ? params[key] : match;
    });
  }

  // Accept-Languageヘッダーからロケール検出
  detectLocale(acceptLanguage) {
    if (!acceptLanguage) {
      return this.defaultLocale;
    }

    // Accept-Languageヘッダーをパース
    const languages = acceptLanguage.split(',').map(lang => {
      const parts = lang.trim().split(';');
      const code = parts[0].split('-')[0]; // ja-JP -> ja
      const quality = parts[1] ? parseFloat(parts[1].split('=')[1]) : 1.0;
      return { code, quality };
    });

    // 品質値でソート
    languages.sort((a, b) => b.quality - a.quality);

    // 対応言語を検索
    for (const lang of languages) {
      if (this.supportedLocales.includes(lang.code)) {
        return lang.code;
      }
    }

    return this.defaultLocale;
  }

  // Express用ミドルウェア
  middleware() {
    return (req, res, next) => {
      // ロケール検出
      const locale = this.detectLocale(req.headers['accept-language']);
      req.locale = locale;

      // 翻訳ヘルパー追加
      req.t = (key, params = {}) => {
        return this.t(key, locale, params);
      };

      next();
    };
  }

  // 対応ロケール一覧取得
  getSupportedLocales() {
    return this.supportedLocales;
  }

  // デフォルトロケール設定
  setDefaultLocale(locale) {
    if (this.supportedLocales.includes(locale)) {
      this.defaultLocale = locale;
    }
  }
}

const i18n = new I18n();

module.exports = {
  i18n,
  I18n
};
