/**
 * Error Handling Best Practices Template
 * このテンプレートは、商用品質のエラーハンドリングパターンを示します
 *
 * 使用方法:
 * 1. このテンプレートを参考に、各サービスにエラーハンドリングを追加
 * 2. logger は productionLogger から imports
 * 3. すべての非同期処理は try/catch で保護
 * 4. ユーザー向けエラーメッセージと内部ログを分離
 */

const { logger } = require('../utils/productionLogger');

// ============================================================================
// エラーハンドリングのベストプラクティス
// ============================================================================

/**
 * パターン1: 基本的なtry/catch
 */
async function basicErrorHandling() {
  try {
    // メイン処理
    const result = await someAsyncOperation();
    return result;
  } catch (error) {
    // エラーログ
    logger.error('Operation failed', {
      error: error.message,
      stack: error.stack,
      timestamp: new Date().toISOString()
    });
    // エラーを再スロー
    throw error;
  }
}

/**
 * パターン2: リソース初期化でのエラー処理
 */
async function resourceInitialization() {
  let resource = null;
  try {
    resource = await createResource();
    return resource;
  } catch (error) {
    // ユーザー向けメッセージ
    const userMessage = 'Failed to initialize resource';

    // 内部ログ
    logger.error(userMessage, {
      error: error.message,
      stack: error.stack,
      context: { resourceType: 'database' }
    });

    // クリーンアップ
    if (resource) {
      try {
        await resource.cleanup();
      } catch (cleanupError) {
        logger.warn('Cleanup failed', { error: cleanupError.message });
      }
    }

    // カスタムエラーをスロー
    throw new Error(userMessage);
  }
}

/**
 * パターン3: null/undefined チェック
 */
function safeAccess(obj, property, defaultValue = null) {
  try {
    // オプショナルチェーニング
    const value = obj?.[property];
    return value ?? defaultValue;
  } catch (error) {
    logger.warn('Safe access failed', {
      error: error.message,
      property
    });
    return defaultValue;
  }
}

/**
 * パターン4: バリデーション + エラーハンドリング
 */
function validateAndProcess(data) {
  // 入力バリデーション
  if (!data) {
    const error = new Error('Data is required');
    logger.warn('Validation failed', { error: error.message });
    throw error;
  }

  if (typeof data !== 'object') {
    const error = new Error('Data must be an object');
    logger.warn('Type validation failed', {
      error: error.message,
      receivedType: typeof data
    });
    throw error;
  }

  try {
    // 処理
    return process(data);
  } catch (error) {
    logger.error('Processing failed', {
      error: error.message,
      stack: error.stack,
      data: sanitizeForLogging(data)
    });
    throw error;
  }
}

/**
 * パターン5: 複数の非同期操作の管理
 */
async function parallelOperationsWithErrorHandling() {
  const results = [];
  const errors = [];

  try {
    // 複数の非同期操作を実行
    const promises = [
      operation1(),
      operation2(),
      operation3()
    ];

    const responses = await Promise.allSettled(promises);

    responses.forEach((response, index) => {
      if (response.status === 'fulfilled') {
        results.push(response.value);
      } else {
        errors.push({
          index,
          error: response.reason?.message || 'Unknown error'
        });
        logger.warn(`Operation ${index} failed`, {
          error: response.reason?.message
        });
      }
    });

    return { results, errors, success: errors.length === 0 };
  } catch (error) {
    logger.error('Parallel operations failed', {
      error: error.message,
      stack: error.stack
    });
    throw error;
  }
}

/**
 * パターン6: リトライロジック
 */
async function operationWithRetry(fn, maxRetries = 3, delayMs = 1000) {
  let lastError;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      logger.warn(`Attempt ${attempt}/${maxRetries} failed`, {
        error: error.message,
        nextRetryIn: attempt < maxRetries ? delayMs : 'no retry'
      });

      // 最後の試行でなければ待機
      if (attempt < maxRetries) {
        await new Promise(resolve => setTimeout(resolve, delayMs));
      }
    }
  }

  // すべてのリトライが失敗
  logger.error('All retry attempts failed', {
    error: lastError.message,
    attempts: maxRetries
  });
  throw lastError;
}

/**
 * パターン7: タイムアウト処理
 */
async function operationWithTimeout(fn, timeoutMs = 5000) {
  let timeoutId;

  try {
    return await Promise.race([
      fn(),
      new Promise((_, reject) => {
        timeoutId = setTimeout(() => {
          reject(new Error(`Operation timeout after ${timeoutMs}ms`));
        }, timeoutMs);
      })
    ]);
  } catch (error) {
    logger.error('Operation with timeout failed', {
      error: error.message,
      timeoutMs
    });
    throw error;
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
}

/**
 * パターン8: リソースクリーンアップの確保
 */
async function operationWithCleanup() {
  const resources = [];

  try {
    // リソース取得
    const resource1 = await allocateResource();
    resources.push(resource1);

    const resource2 = await allocateResource();
    resources.push(resource2);

    // メイン処理
    return await mainOperation(resource1, resource2);
  } catch (error) {
    logger.error('Operation with cleanup failed', {
      error: error.message,
      resourcesAllocated: resources.length
    });
    throw error;
  } finally {
    // リソースクリーンアップ
    for (const resource of resources) {
      try {
        await resource.cleanup();
      } catch (cleanupError) {
        logger.warn('Resource cleanup failed', {
          error: cleanupError.message
        });
      }
    }
  }
}

/**
 * パターン9: ロギング用データサニタイズ
 */
function sanitizeForLogging(data) {
  const sensitiveKeys = [
    'password', 'token', 'apiKey', 'secret',
    'privateKey', 'creditCard', 'ssn'
  ];

  if (!data || typeof data !== 'object') {
    return data;
  }

  const sanitized = { ...data };

  for (const key of sensitiveKeys) {
    if (key in sanitized) {
      sanitized[key] = '[REDACTED]';
    }
  }

  return sanitized;
}

/**
 * パターン10: コンテキスト付きエラーラッピング
 */
class ContextualError extends Error {
  constructor(message, context = {}) {
    super(message);
    this.name = 'ContextualError';
    this.context = context;
    this.timestamp = new Date().toISOString();
  }

  toJSON() {
    return {
      name: this.name,
      message: this.message,
      context: this.context,
      timestamp: this.timestamp
    };
  }
}

/**
 * 使用例:
 */
async function exampleUsage() {
  try {
    // パターン1: 基本
    await basicErrorHandling();

    // パターン3: null安全
    const value = safeAccess(someObject, 'property', 'default');

    // パターン5: 複数操作
    const { results, errors } = await parallelOperationsWithErrorHandling();

    // パターン6: リトライ
    const result = await operationWithRetry(
      () => callExternalAPI(),
      3,
      1000
    );

    // パターン7: タイムアウト
    const data = await operationWithTimeout(
      () => fetchData(),
      5000
    );

    // パターン10: コンテキスト付きエラー
    throw new ContextualError('Operation failed', {
      userId: 'user123',
      action: 'swap'
    });
  } catch (error) {
    logger.error('Example operation failed', {
      error: error.message,
      context: error.context || {},
      timestamp: new Date().toISOString()
    });
  }
}

module.exports = {
  basicErrorHandling,
  resourceInitialization,
  safeAccess,
  validateAndProcess,
  parallelOperationsWithErrorHandling,
  operationWithRetry,
  operationWithTimeout,
  operationWithCleanup,
  sanitizeForLogging,
  ContextualError,
  exampleUsage
};
