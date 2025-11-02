/**
 * Lightweight Helper Functions
 * Fast, memory-efficient utility functions for common operations
 */

// Type checking utilities (faster than lodash)
const isString = (val) => typeof val === 'string';
const isNumber = (val) => typeof val === 'number' && !isNaN(val);
const isObject = (val) => val !== null && typeof val === 'object' && !Array.isArray(val);
const isArray = (val) => Array.isArray(val);
const isEmpty = (val) => {
  if (val === null || val === undefined) {
    return true;
  }
  if (isArray(val) || isString(val)) {
    return val.length === 0;
  }
  if (isObject(val)) {
    return Object.keys(val).length === 0;
  }
  return false;
};

// Performance optimized object operations
const pick = (obj, keys) => {
  const result = {};
  for (let i = 0; i < keys.length; i++) {
    const key = keys[i];
    if (key in obj) {
      result[key] = obj[key];
    }
  }
  return result;
};

const omit = (obj, keys) => {
  const keySet = new Set(keys);
  const result = {};
  for (const key in obj) {
    if (!keySet.has(key)) {
      result[key] = obj[key];
    }
  }
  return result;
};

// Fast deep clone for simple objects (no functions, dates, etc.)
const cloneSimple = (obj) => {
  if (obj === null || typeof obj !== 'object') {
    return obj;
  }
  if (isArray(obj)) {
    return obj.map(cloneSimple);
  }

  const cloned = {};
  for (const key in obj) {
    cloned[key] = cloneSimple(obj[key]);
  }
  return cloned;
};

// Memory-efficient array operations
const chunk = (array, size) => {
  const chunks = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
};

const unique = (array) => [...new Set(array)];

const groupBy = (array, keyFn) => {
  const groups = {};
  for (let i = 0; i < array.length; i++) {
    const key = keyFn(array[i]);
    if (!groups[key]) {
      groups[key] = [];
    }
    groups[key].push(array[i]);
  }
  return groups;
};

// Fast string operations
const capitalize = (str) => str.charAt(0).toUpperCase() + str.slice(1);
const camelCase = (str) => str.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
const snakeCase = (str) => str.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);

// Number utilities
const clamp = (num, min, max) => Math.min(Math.max(num, min), max);
const round = (num, decimals = 0) => {
  const factor = Math.pow(10, decimals);
  return Math.round(num * factor) / factor;
};

// Date utilities (lightweight)
const formatDate = (date = new Date()) => date.toISOString().split('T')[0];
const formatDateTime = (date = new Date()) => date.toISOString();
const isValidDate = (date) => date instanceof Date && !isNaN(date);

// Validation utilities
const isEmail = (email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
const isUUID = (str) => /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(str);
const isNumeric = (str) => /^\d+$/.test(str);

// Async utilities
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const timeout = (promise, ms) => {
  return Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Operation timeout')), ms)
    )
  ]);
};

const retry = async (fn, attempts = 3, delay = 1000) => {
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (error) {
      if (i === attempts - 1) {
        throw error;
      }
      await sleep(delay * Math.pow(2, i)); // Exponential backoff
    }
  }
};

// Error handling utilities
const safeJSONParse = (str, defaultValue = null) => {
  try {
    return JSON.parse(str);
  } catch {
    return defaultValue;
  }
};

const safeStringify = (obj, defaultValue = '{}') => {
  try {
    return JSON.stringify(obj);
  } catch {
    return defaultValue;
  }
};

// Hash and crypto utilities (simple)
const simpleHash = (str) => {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return Math.abs(hash).toString(36);
};

// Generate simple ID
const generateId = () => Date.now().toString(36) + Math.random().toString(36).substr(2);

// Cache utilities
class SimpleCache {
  constructor(maxSize = 100, ttl = 5 * 60 * 1000) { // 5 minutes default
    this.cache = new Map();
    this.maxSize = maxSize;
    this.ttl = ttl;
  }

  set(key, value) {
    // Remove oldest if at capacity
    if (this.cache.size >= this.maxSize) {
      const firstKey = this.cache.keys().next().value;
      this.cache.delete(firstKey);
    }

    this.cache.set(key, {
      value,
      timestamp: Date.now()
    });
  }

  get(key) {
    const item = this.cache.get(key);
    if (!item) {
      return null;
    }

    // Check TTL
    if (Date.now() - item.timestamp > this.ttl) {
      this.cache.delete(key);
      return null;
    }

    return item.value;
  }

  delete(key) {
    return this.cache.delete(key);
  }

  clear() {
    this.cache.clear();
  }

  size() {
    return this.cache.size;
  }

  // Cleanup expired entries
  cleanup() {
    const now = Date.now();
    for (const [key, item] of this.cache) {
      if (now - item.timestamp > this.ttl) {
        this.cache.delete(key);
      }
    }
  }
}

// Rate limiter utility
class SimpleRateLimiter {
  constructor(requests = 100, windowMs = 60000) { // 100 requests per minute
    this.requests = requests;
    this.windowMs = windowMs;
    this.clients = new Map();
  }

  isAllowed(clientId) {
    const now = Date.now();
    const client = this.clients.get(clientId) || { count: 0, resetTime: now + this.windowMs };

    // Reset if window expired
    if (now >= client.resetTime) {
      client.count = 0;
      client.resetTime = now + this.windowMs;
    }

    if (client.count >= this.requests) {
      return false;
    }

    client.count++;
    this.clients.set(clientId, client);
    return true;
  }

  getRemainingRequests(clientId) {
    const client = this.clients.get(clientId);
    if (!client) {
      return this.requests;
    }

    const now = Date.now();
    if (now >= client.resetTime) {
      return this.requests;
    }

    return Math.max(0, this.requests - client.count);
  }

  cleanup() {
    const now = Date.now();
    for (const [clientId, client] of this.clients) {
      if (now >= client.resetTime) {
        this.clients.delete(clientId);
      }
    }
  }
}

// Performance measurement
const measure = (fn, name = 'operation') => {
  return async (...args) => {
    const start = process.hrtime.bigint();
    try {
      const result = await fn(...args);
      const end = process.hrtime.bigint();
      const duration = Number(end - start) / 1000000; // Convert to milliseconds
      console.log(`${name} took ${duration.toFixed(2)}ms`);
      return result;
    } catch (error) {
      const end = process.hrtime.bigint();
      const duration = Number(end - start) / 1000000;
      console.log(`${name} failed after ${duration.toFixed(2)}ms:`, error.message);
      throw error;
    }
  };
};

// Memory usage tracker
const getMemoryUsage = () => {
  const usage = process.memoryUsage();
  return {
    rss: Math.round(usage.rss / 1024 / 1024) + 'MB',
    heapTotal: Math.round(usage.heapTotal / 1024 / 1024) + 'MB',
    heapUsed: Math.round(usage.heapUsed / 1024 / 1024) + 'MB',
    external: Math.round(usage.external / 1024 / 1024) + 'MB'
  };
};

// Export all utilities
module.exports = {
  // Type checking
  isString,
  isNumber,
  isObject,
  isArray,
  isEmpty,

  // Object operations
  pick,
  omit,
  cloneSimple,

  // Array operations
  chunk,
  unique,
  groupBy,

  // String operations
  capitalize,
  camelCase,
  snakeCase,

  // Number operations
  clamp,
  round,

  // Date operations
  formatDate,
  formatDateTime,
  isValidDate,

  // Validation
  isEmail,
  isUUID,
  isNumeric,

  // Async operations
  sleep,
  timeout,
  retry,

  // Error handling
  safeJSONParse,
  safeStringify,

  // Hash and ID
  simpleHash,
  generateId,

  // Utilities classes
  SimpleCache,
  SimpleRateLimiter,

  // Performance
  measure,
  getMemoryUsage
};