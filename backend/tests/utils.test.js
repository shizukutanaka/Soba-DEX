/**
 * DEX Platform - ユーティリティ関数テストスイート
 * 軽量で効率的なテスト設計
 */

const { expect } = require('chai');
const sinon = require('sinon');
const { generateId, safeStringify, safeParse } = require('../src/utils/helpers');

describe('Utility Functions Tests', () => {

  describe('Helper Functions', () => {
    describe('generateId', () => {
      it('should generate unique IDs', () => {
        const id1 = generateId();
        const id2 = generateId();

        expect(id1).to.be.a('string');
        expect(id2).to.be.a('string');
        expect(id1).to.not.equal(id2);
        expect(id1).to.have.length(16);
        expect(id2).to.have.length(16);
      });

      it('should generate IDs with custom length', () => {
        const id = generateId(32);
        expect(id).to.have.length(32);
      });

      it('should generate IDs with prefix', () => {
        const id = generateId(8, 'TEST');
        expect(id).to.match(/^TEST/);
        expect(id).to.have.length(12); // 4 + 8
      });
    });

    describe('safeStringify', () => {
      it('should stringify regular objects', () => {
        const obj = { a: 1, b: 'test' };
        const result = safeStringify(obj);
        expect(result).to.equal(JSON.stringify(obj));
      });

      it('should handle circular references', () => {
        const obj = { a: 1 };
        obj.self = obj;

        const result = safeStringify(obj);
        expect(result).to.equal('[Circular Reference]');
      });

      it('should handle functions', () => {
        const obj = {
          func: function test() {},
          arrow: () => {}
        };

        const result = safeStringify(obj);
        expect(result).to.contain('[Function]');
      });

      it('should handle undefined and null', () => {
        expect(safeStringify(undefined)).to.equal('undefined');
        expect(safeStringify(null)).to.equal('null');
      });
    });

    describe('safeParse', () => {
      it('should parse valid JSON', () => {
        const json = '{"a": 1, "b": "test"}';
        const result = safeParse(json);
        expect(result).to.deep.equal({ a: 1, b: 'test' });
      });

      it('should handle invalid JSON', () => {
        const invalidJson = '{"a": 1, invalid}';
        const result = safeParse(invalidJson);
        expect(result).to.be.null;
      });

      it('should handle empty strings', () => {
        const result = safeParse('');
        expect(result).to.be.null;
      });

      it('should handle null input', () => {
        const result = safeParse(null);
        expect(result).to.be.null;
      });
    });
  });

  describe('Logger Tests', () => {
    let sandbox;

    beforeEach(() => {
      sandbox = sinon.createSandbox();
    });

    afterEach(() => {
      sandbox.restore();
    });

    it('should log info messages', () => {
      const consoleSpy = sandbox.spy(console, 'log');
      unifiedLogger.info('Test info message', { userId: 123 });

      expect(consoleSpy.called).to.be.true;
      const logCall = consoleSpy.getCall(0);
      expect(logCall.args[0]).to.contain('INFO');
      expect(logCall.args[0]).to.contain('Test info message');
    });

    it('should log error messages', () => {
      const consoleSpy = sandbox.spy(console, 'error');
      const error = new Error('Test error');
      unifiedLogger.error('Test error message', error, { context: 'test' });

      expect(consoleSpy.called).to.be.true;
      const logCall = consoleSpy.getCall(0);
      expect(logCall.args[0]).to.contain('ERROR');
      expect(logCall.args[0]).to.contain('Test error message');
    });

    it('should log warn messages', () => {
      const consoleSpy = sandbox.spy(console, 'warn');
      unifiedLogger.warn('Test warning message', { warning: true });

      expect(consoleSpy.called).to.be.true;
      const logCall = consoleSpy.getCall(0);
      expect(logCall.args[0]).to.contain('WARN');
      expect(logCall.args[0]).to.contain('Test warning message');
    });

    it('should log debug messages', () => {
      const consoleSpy = sandbox.spy(console, 'debug');
      unifiedLogger.debug('Test debug message', { debug: true });

      expect(consoleSpy.called).to.be.true;
      const logCall = consoleSpy.getCall(0);
      expect(logCall.args[0]).to.contain('DEBUG');
      expect(logCall.args[0]).to.contain('Test debug message');
    });

    it('should respect log levels', () => {
      const consoleSpy = sandbox.spy(console, 'log');

      // Set log level to ERROR
      process.env.LOG_LEVEL = 'ERROR';

      unifiedLogger.info('This should not log');
      unifiedLogger.debug('This should not log');
      unifiedLogger.warn('This should not log');

      expect(consoleSpy.called).to.be.false;

      // Reset log level
      delete process.env.LOG_LEVEL;
    });
  });

  describe('Error Manager Tests', () => {
    let sandbox;

    beforeEach(() => {
      sandbox = sinon.createSandbox();
    });

    afterEach(() => {
      sandbox.restore();
    });

    it('should handle validation errors', () => {
      const error = errorManager.createValidationError('Invalid input', 'email', 'invalid-email');
      expect(error).to.be.instanceOf(Error);
      expect(error.statusCode).to.equal(400);
      expect(error.code).to.equal('VALIDATION_ERROR');
      expect(error.details).to.deep.equal({ field: 'email', value: 'invalid-email' });
    });

    it('should handle not found errors', () => {
      const error = errorManager.createNotFoundError('User');
      expect(error).to.be.instanceOf(Error);
      expect(error.statusCode).to.equal(404);
      expect(error.code).to.equal('NOT_FOUND');
      expect(error.message).to.equal('User not found');
    });

    it('should handle internal errors', () => {
      const originalError = new Error('Database connection failed');
      const error = errorManager.createInternalError('Database error', originalError);
      expect(error).to.be.instanceOf(Error);
      expect(error.statusCode).to.equal(500);
      expect(error.code).to.equal('INTERNAL_ERROR');
      expect(error.cause).to.equal(originalError);
    });

    it('should handle rate limit errors', () => {
      const error = errorManager.createRateLimitError('Too many requests');
      expect(error).to.be.instanceOf(Error);
      expect(error.statusCode).to.equal(429);
      expect(error.code).to.equal('RATE_LIMIT_EXCEEDED');
      expect(error.message).to.equal('Too many requests');
    });

    it('should handle timeout errors', () => {
      const error = errorManager.createTimeoutError('Operation timed out');
      expect(error).to.be.instanceOf(Error);
      expect(error.statusCode).to.equal(408);
      expect(error.code).to.equal('TIMEOUT_ERROR');
      expect(error.message).to.equal('Operation timed out');
    });

    it('should format error responses', () => {
      const error = errorManager.createValidationError('Invalid input', 'email', 'invalid-email');
      const formatted = errorManager.formatError(error);

      expect(formatted).to.have.property('error', 'Validation Error');
      expect(formatted).to.have.property('message', 'Invalid input');
      expect(formatted).to.have.property('code', 'VALIDATION_ERROR');
      expect(formatted).to.have.property('field', 'email');
      expect(formatted).to.have.property('timestamp');
    });
  });

  // Note: The following test sections are disabled because the corresponding
  // utility modules have not been implemented yet:
  // - asyncHelpers.js (asyncTimeout, asyncRetry, asyncBatch)
  // - securityHelpers.js (hashPassword, verifyPassword, sanitizeInput, generateToken, verifyToken)
  // - performanceHelpers.js (measureExecutionTime, createCircuitBreaker)
  //
  // Re-enable these tests once the modules are implemented.
});
