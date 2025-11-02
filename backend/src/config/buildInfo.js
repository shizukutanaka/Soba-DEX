const buildInfo = {
  service: process.env.SERVICE_NAME || 'DEX Platform API',
  version: process.env.BUILD_VERSION || process.env.npm_package_version || '1.0.0',
  commit: process.env.BUILD_COMMIT || null,
  buildDate: process.env.BUILD_DATE || null,
  nodeVersion: process.version,
  environment: process.env.NODE_ENV || 'development'
};

module.exports = { buildInfo };
