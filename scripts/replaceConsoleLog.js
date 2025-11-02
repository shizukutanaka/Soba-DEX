#!/usr/bin/env node
/**
 * Script to replace all console.log calls with structured logging
 * This will improve performance and provide better log management
 */

const fs = require('fs').promises;
const path = require('path');
const glob = require('glob');

// Configuration
const config = {
  rootDir: path.join(__dirname, '../backend/src'),
  filePattern: '**/*.js',
  excludePatterns: [
    'node_modules/**',
    '**/*.test.js',
    '**/*.spec.js',
    '**/tests/**',
    '**/logger*.js',
    '**/productionLogger.js'
  ],
  loggerImportPath: '../utils/logger',
  backupDir: path.join(__dirname, '../backup/console-logs'),
  dryRun: false // Set to true for preview
};

// Log level mapping
const logLevelMap = {
  'console.log': 'info',
  'console.info': 'info',
  'console.warn': 'warn',
  'console.error': 'error',
  'console.debug': 'debug',
  'console.trace': 'trace'
};

// Statistics
const stats = {
  filesProcessed: 0,
  logsReplaced: 0,
  byType: {},
  errors: []
};

/**
 * Find all JavaScript files to process
 */
async function findFiles() {
  return new Promise((resolve, reject) => {
    glob(config.filePattern, {
      cwd: config.rootDir,
      ignore: config.excludePatterns
    }, (err, files) => {
      if (err) reject(err);
      else resolve(files.map(f => path.join(config.rootDir, f)));
    });
  });
}

/**
 * Create backup of original file
 */
async function backupFile(filePath) {
  const relativePath = path.relative(config.rootDir, filePath);
  const backupPath = path.join(config.backupDir, relativePath);
  const backupDir = path.dirname(backupPath);

  await fs.mkdir(backupDir, { recursive: true });
  await fs.copyFile(filePath, backupPath);
}

/**
 * Check if file already has logger import
 */
function hasLoggerImport(content) {
  return content.includes("require('./utils/logger')") ||
         content.includes('require("./utils/logger")') ||
         content.includes("from './utils/logger'") ||
         content.includes('from "./utils/logger"') ||
         content.includes('logger');
}

/**
 * Add logger import to file
 */
function addLoggerImport(content, filePath) {
  // Calculate relative path to logger
  const fileDir = path.dirname(filePath);
  const loggerPath = path.relative(fileDir, path.join(config.rootDir, 'utils/logger.js'));
  const importPath = loggerPath.startsWith('.') ? loggerPath : './' + loggerPath;

  // Remove .js extension
  const cleanPath = importPath.replace(/\.js$/, '');

  const loggerImport = `const { logger } = require('${cleanPath}');\n`;

  // Find the best position to add import
  const lines = content.split('\n');
  let insertIndex = 0;

  // Look for existing requires
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes('require(') || lines[i].includes('import ')) {
      insertIndex = i + 1;
    } else if (insertIndex > 0 && lines[i].trim() === '') {
      break;
    }
  }

  // Insert logger import
  lines.splice(insertIndex, 0, loggerImport);
  return lines.join('\n');
}

/**
 * Replace console.log statements with logger calls
 */
function replaceConsoleLogs(content, filePath) {
  let modified = content;
  let replacements = 0;
  const fileName = path.basename(filePath);

  // Replace each type of console call
  for (const [consoleMethod, logLevel] of Object.entries(logLevelMap)) {
    const regex = new RegExp(`${consoleMethod}\\s*\\(`, 'g');
    const matches = modified.match(regex);

    if (matches) {
      const count = matches.length;
      replacements += count;

      if (!stats.byType[consoleMethod]) {
        stats.byType[consoleMethod] = 0;
      }
      stats.byType[consoleMethod] += count;

      // Advanced replacement with context
      modified = modified.replace(regex, (match) => {
        return `logger.${logLevel}(`;
      });

      // Add context to logger calls
      modified = enhanceLoggerCalls(modified, fileName);
    }
  }

  return { modified, replacements };
}

/**
 * Enhance logger calls with context
 */
function enhanceLoggerCalls(content, fileName) {
  // Pattern to match logger calls with single string argument
  const simpleLogPattern = /logger\.(info|debug|warn|error|trace)\s*\(\s*(['"`])([^'"`]*)\2\s*\)/g;

  content = content.replace(simpleLogPattern, (match, level, quote, message) => {
    // Extract meaningful context from message
    const context = extractContext(message);

    if (context) {
      return `logger.${level}('[${fileName}] ${message}', ${context})`;
    }
    return `logger.${level}('[${fileName}] ${message}')`;
  });

  // Pattern to match logger calls with multiple arguments
  const multiArgPattern = /logger\.(info|debug|warn|error|trace)\s*\(\s*([^,]+),\s*(.+)\s*\)/g;

  content = content.replace(multiArgPattern, (match, level, message, args) => {
    // Check if message is a string
    if (message.match(/^['"`].*['"`]$/)) {
      const cleanMessage = message.slice(1, -1);
      return `logger.${level}('[${fileName}] ${cleanMessage}', ${args})`;
    }
    return match;
  });

  return content;
}

/**
 * Extract context from log message
 */
function extractContext(message) {
  const contextPatterns = [
    { pattern: /user[:\s]+(\w+)/i, key: 'userId' },
    { pattern: /error[:\s]+(.+)/i, key: 'error' },
    { pattern: /transaction[:\s]+(\w+)/i, key: 'transactionId' },
    { pattern: /request[:\s]+(\w+)/i, key: 'requestId' },
    { pattern: /failed[:\s]+(.+)/i, key: 'reason' }
  ];

  const context = {};

  for (const { pattern, key } of contextPatterns) {
    const match = message.match(pattern);
    if (match) {
      context[key] = match[1].trim();
    }
  }

  return Object.keys(context).length > 0 ? JSON.stringify(context) : null;
}

/**
 * Process a single file
 */
async function processFile(filePath) {
  try {
    // Read file content
    const content = await fs.readFile(filePath, 'utf8');

    // Skip if no console statements
    if (!content.includes('console.')) {
      return false;
    }

    // Backup original file
    if (!config.dryRun) {
      await backupFile(filePath);
    }

    let modified = content;

    // Add logger import if needed
    if (!hasLoggerImport(content)) {
      modified = addLoggerImport(modified, filePath);
    }

    // Replace console statements
    const { modified: finalContent, replacements } = replaceConsoleLogs(modified, filePath);

    if (replacements > 0) {
      stats.logsReplaced += replacements;

      // Write modified content
      if (!config.dryRun) {
        await fs.writeFile(filePath, finalContent, 'utf8');
      }

      console.log(`✅ Processed ${path.relative(config.rootDir, filePath)}: ${replacements} replacements`);
      return true;
    }

    return false;
  } catch (error) {
    stats.errors.push({
      file: filePath,
      error: error.message
    });
    console.error(`❌ Error processing ${filePath}: ${error.message}`);
    return false;
  }
}

/**
 * Create the unified logger if it doesn't exist
 */
async function createUnifiedLogger() {
  const loggerPath = path.join(config.rootDir, 'utils/logger.js');

  try {
    await fs.access(loggerPath);
    console.log('✅ Logger already exists');
  } catch {
    console.log('📝 Creating unified logger...');

    const loggerContent = `/**
 * Unified Logger Service
 * Structured logging for the entire application
 */

const winston = require('winston');
const path = require('path');

// Create logger instance
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  defaultMeta: {
    service: 'soba-dex',
    environment: process.env.NODE_ENV || 'development'
  },
  transports: [
    // Console output for development
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      ),
      silent: process.env.NODE_ENV === 'test'
    })
  ]
});

// Add file transport in production
if (process.env.NODE_ENV === 'production') {
  logger.add(new winston.transports.File({
    filename: path.join(__dirname, '../../logs/error.log'),
    level: 'error',
    maxsize: 10485760, // 10MB
    maxFiles: 5
  }));

  logger.add(new winston.transports.File({
    filename: path.join(__dirname, '../../logs/combined.log'),
    maxsize: 10485760, // 10MB
    maxFiles: 10
  }));
}

// Performance monitoring
logger.profile = (id, meta = {}) => {
  return logger.profile(id, { ...meta, timestamp: Date.now() });
};

// Request logging helper
logger.logRequest = (req, res, duration) => {
  logger.info('HTTP Request', {
    method: req.method,
    url: req.originalUrl,
    status: res.statusCode,
    duration,
    ip: req.ip,
    userAgent: req.get('user-agent')
  });
};

// Error logging helper
logger.logError = (error, context = {}) => {
  logger.error('Application Error', {
    message: error.message,
    stack: error.stack,
    code: error.code,
    ...context
  });
};

// Metrics logging helper
logger.metric = (name, value, tags = {}) => {
  logger.info('Metric', {
    metric: name,
    value,
    tags,
    timestamp: Date.now()
  });
};

module.exports = { logger };
`;

    // Ensure directory exists
    await fs.mkdir(path.dirname(loggerPath), { recursive: true });

    // Write logger file
    await fs.writeFile(loggerPath, loggerContent, 'utf8');
    console.log('✅ Created unified logger');
  }
}

/**
 * Main execution
 */
async function main() {
  console.log('🚀 Starting console.log replacement process...');
  console.log(`📁 Root directory: ${config.rootDir}`);
  console.log(`🔍 Dry run: ${config.dryRun}`);

  try {
    // Create unified logger first
    await createUnifiedLogger();

    // Create backup directory
    if (!config.dryRun) {
      await fs.mkdir(config.backupDir, { recursive: true });
    }

    // Find all files
    const files = await findFiles();
    console.log(`📋 Found ${files.length} JavaScript files to process`);

    // Process each file
    for (const file of files) {
      const processed = await processFile(file);
      if (processed) {
        stats.filesProcessed++;
      }
    }

    // Print statistics
    console.log('\n📊 Replacement Statistics:');
    console.log(`✅ Files processed: ${stats.filesProcessed}`);
    console.log(`✅ Total replacements: ${stats.logsReplaced}`);
    console.log('\n📈 Replacements by type:');
    for (const [type, count] of Object.entries(stats.byType)) {
      console.log(`  ${type}: ${count}`);
    }

    if (stats.errors.length > 0) {
      console.log('\n❌ Errors encountered:');
      for (const error of stats.errors) {
        console.log(`  ${error.file}: ${error.error}`);
      }
    }

    if (config.dryRun) {
      console.log('\n⚠️  This was a dry run. Set dryRun: false to apply changes.');
    } else {
      console.log('\n✅ All console.log statements have been replaced!');
      console.log(`📁 Backups saved to: ${config.backupDir}`);
    }

  } catch (error) {
    console.error('❌ Fatal error:', error);
    process.exit(1);
  }
}

// Run if executed directly
if (require.main === module) {
  main();
}

module.exports = { main, processFile, replaceConsoleLogs };