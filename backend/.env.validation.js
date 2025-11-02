/**
 * 環境変数バリデーションスクリプト
 * 本番環境デプロイ前に実行して設定漏れを防ぐ
 */

const requiredEnvVars = {
  // 必須環境変数
  required: [
    { name: 'NODE_ENV', values: ['development', 'production', 'test'] },
    { name: 'PORT', type: 'number', min: 1, max: 65535 },
    { name: 'JWT_SECRET', minLength: 32 },
  ],

  // 本番環境で必須
  productionRequired: [
    { name: 'CORS_ORIGINS', pattern: /^https?:\/\/.+/ },
    { name: 'ALLOWED_ORIGINS', pattern: /^https?:\/\/.+/ },
    { name: 'LOG_LEVEL', values: ['error', 'warn', 'info', 'debug'] },
  ],

  // 推奨（警告のみ）
  recommended: [
    { name: 'RATE_LIMIT_MAX', type: 'number', default: 100 },
    { name: 'RATE_LIMIT_WINDOW_MS', type: 'number', default: 60000 },
    { name: 'SESSION_SECRET', minLength: 32 },
    { name: 'DATABASE_URL', pattern: /^postgres:\/\/.+/ },
    { name: 'REDIS_URL', pattern: /^redis:\/\/.+/ },
  ],
};

class EnvValidator {
  constructor() {
    this.errors = [];
    this.warnings = [];
    this.info = [];
  }

  validate(envVar, value, isProduction = false) {
    const { name, type, min, max, minLength, maxLength, pattern, values } = envVar;

    // 値が存在しない
    if (value === undefined || value === null || value === '') {
      return { valid: false, error: `${name} is not defined` };
    }

    // 型チェック
    if (type === 'number') {
      const num = Number(value);
      if (isNaN(num)) {
        return { valid: false, error: `${name} must be a number, got: ${value}` };
      }
      if (min !== undefined && num < min) {
        return { valid: false, error: `${name} must be >= ${min}, got: ${num}` };
      }
      if (max !== undefined && num > max) {
        return { valid: false, error: `${name} must be <= ${max}, got: ${num}` };
      }
    }

    // 長さチェック
    if (minLength !== undefined && value.length < minLength) {
      return { valid: false, error: `${name} must be at least ${minLength} characters, got: ${value.length}` };
    }
    if (maxLength !== undefined && value.length > maxLength) {
      return { valid: false, error: `${name} must be at most ${maxLength} characters, got: ${value.length}` };
    }

    // パターンチェック
    if (pattern && !pattern.test(value)) {
      return { valid: false, error: `${name} does not match required pattern: ${pattern}` };
    }

    // 値の選択肢チェック
    if (values && !values.includes(value)) {
      return { valid: false, error: `${name} must be one of: ${values.join(', ')}, got: ${value}` };
    }

    return { valid: true };
  }

  checkRequired() {
    for (const envVar of requiredEnvVars.required) {
      const value = process.env[envVar.name];
      const result = this.validate(envVar, value);

      if (!result.valid) {
        this.errors.push(`❌ ${result.error}`);
      } else {
        this.info.push(`✅ ${envVar.name}: OK`);
      }
    }
  }

  checkProduction() {
    const isProduction = process.env.NODE_ENV === 'production';

    if (!isProduction) {
      this.info.push('ℹ️  Not in production mode, skipping production-specific checks');
      return;
    }

    for (const envVar of requiredEnvVars.productionRequired) {
      const value = process.env[envVar.name];
      const result = this.validate(envVar, value, true);

      if (!result.valid) {
        this.errors.push(`❌ [PRODUCTION] ${result.error}`);
      } else {
        this.info.push(`✅ [PRODUCTION] ${envVar.name}: OK`);
      }
    }
  }

  checkRecommended() {
    for (const envVar of requiredEnvVars.recommended) {
      const value = process.env[envVar.name];

      if (value === undefined || value === null || value === '') {
        this.warnings.push(`⚠️  ${envVar.name} is not set (recommended)`);
        if (envVar.default !== undefined) {
          this.warnings.push(`   Default will be used: ${envVar.default}`);
        }
      } else {
        const result = this.validate(envVar, value);
        if (!result.valid) {
          this.warnings.push(`⚠️  ${result.error}`);
        } else {
          this.info.push(`✅ ${envVar.name}: OK`);
        }
      }
    }
  }

  checkSecurity() {
    // JWT_SECRETの強度チェック
    const jwtSecret = process.env.JWT_SECRET;
    if (jwtSecret) {
      const hasUpperCase = /[A-Z]/.test(jwtSecret);
      const hasLowerCase = /[a-z]/.test(jwtSecret);
      const hasNumber = /[0-9]/.test(jwtSecret);
      const hasSpecial = /[^A-Za-z0-9]/.test(jwtSecret);

      const entropy = [hasUpperCase, hasLowerCase, hasNumber, hasSpecial].filter(Boolean).length;

      if (entropy < 3) {
        this.warnings.push('⚠️  JWT_SECRET should contain uppercase, lowercase, numbers, and special characters');
      }

      // 弱いパターンの検出
      const weakPatterns = [
        /^(password|secret|test|dev|demo|example)/i,
        /^(.)\1{5,}/, // 同じ文字の繰り返し
        /^(123|abc|qwerty)/i,
      ];

      for (const pattern of weakPatterns) {
        if (pattern.test(jwtSecret)) {
          this.warnings.push('⚠️  JWT_SECRET appears to be weak or follows a common pattern');
          break;
        }
      }
    }

    // 本番環境でのデバッグモードチェック
    if (process.env.NODE_ENV === 'production') {
      if (process.env.DEBUG === 'true' || process.env.DEBUG === '1') {
        this.warnings.push('⚠️  DEBUG mode is enabled in production');
      }

      if (process.env.LOG_LEVEL === 'debug') {
        this.warnings.push('⚠️  LOG_LEVEL is set to debug in production (may impact performance)');
      }
    }
  }

  generateReport() {
    console.log('\n' + '='.repeat(80));
    console.log('🔍 Environment Variables Validation Report');
    console.log('='.repeat(80) + '\n');

    console.log(`Environment: ${process.env.NODE_ENV || 'undefined'}\n`);

    if (this.errors.length > 0) {
      console.log('❌ ERRORS (Must Fix):');
      console.log('-'.repeat(80));
      this.errors.forEach(err => console.log(err));
      console.log();
    }

    if (this.warnings.length > 0) {
      console.log('⚠️  WARNINGS (Should Review):');
      console.log('-'.repeat(80));
      this.warnings.forEach(warn => console.log(warn));
      console.log();
    }

    if (this.info.length > 0 && this.errors.length === 0) {
      console.log('✅ All Required Variables:');
      console.log('-'.repeat(80));
      this.info.forEach(info => console.log(info));
      console.log();
    }

    console.log('='.repeat(80));

    if (this.errors.length > 0) {
      console.log(`\n❌ Validation FAILED: ${this.errors.length} error(s) found`);
      console.log('\nPlease fix the errors before deploying to production.\n');
      return false;
    } else if (this.warnings.length > 0) {
      console.log(`\n⚠️  Validation PASSED with ${this.warnings.length} warning(s)`);
      console.log('\nReview warnings to ensure optimal configuration.\n');
      return true;
    } else {
      console.log('\n✅ Validation PASSED: All checks successful!\n');
      return true;
    }
  }

  run() {
    this.checkRequired();
    this.checkProduction();
    this.checkRecommended();
    this.checkSecurity();
    return this.generateReport();
  }
}

// スクリプトとして実行された場合
if (require.main === module) {
  require('dotenv').config();

  const validator = new EnvValidator();
  const isValid = validator.run();

  process.exit(isValid ? 0 : 1);
}

module.exports = EnvValidator;
