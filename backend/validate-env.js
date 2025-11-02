#!/usr/bin/env node

/**
 * Environment Validation Script
 * Validates environment configuration before startup
 */

const { EnvValidator } = require('./src/utils/envValidator');

function validateEnvironment() {
  const validator = new EnvValidator();
  const isProduction = process.env.NODE_ENV === 'production';

  console.log('🔍 Validating environment configuration...\n');

  // Required security secrets
  validator.secret('JWT_SECRET', {
    description: 'Used for JWT token signing and verification'
  });

  validator.secret('API_KEY_HMAC_SECRET', {
    description: 'Used for API key HMAC generation and verification'
  });

  // CORS configuration
  validator.corsOrigins('CORS_ORIGINS');

  // Database configuration (optional but recommended)
  validator.url('DB_HOST', {
    optional: true,
    description: 'Database host URL'
  });

  validator.string('DB_PASSWORD', {
    optional: true,
    minLength: 8,
    description: 'Database password (should be strong)'
  });

  // Redis configuration (optional)
  validator.url('REDIS_URL', {
    optional: true,
    description: 'Redis connection URL'
  });

  // Rate limiting
  validator.number('RATE_LIMIT_MAX', {
    optional: true,
    min: 10,
    max: 10000,
    default: 100,
    description: 'Maximum requests per rate limit window'
  });

  // Production readiness checks
  validator.validateProductionReadiness();

  // Get results
  const results = validator.getResults();

  // Display errors
  if (results.errors.length > 0) {
    console.error('🚨 Critical Configuration Issues:');
    results.errors.forEach(error => {
      console.error(`  ❌ ${error.variable}: ${error.message}`);
      if (error.description) {
        console.error(`     ${error.description}`);
      }
    });
  }

  // Display warnings
  if (results.warnings.length > 0) {
    console.warn('\n⚠️  Configuration Warnings:');
    results.warnings.forEach(warning => {
      console.warn(`  ⚠️  ${warning.variable}: ${warning.message}`);
      if (warning.description) {
        console.warn(`     ${warning.description}`);
      }
    });
  }

  // Summary
  console.log(`\n📊 Validation Summary:`);
  console.log(`   Errors: ${results.errors.length}`);
  console.log(`   Warnings: ${results.warnings.length}`);

  if (results.valid) {
    console.log('\n✅ Environment validation passed');
    if (isProduction && results.warnings.length > 0) {
      console.log('   (Warnings should be addressed for production deployment)');
    }
  } else {
    console.log('\n❌ Environment validation failed');
    console.log('   Fix the critical issues above before starting the application');
    process.exit(1);
  }
}

// Run validation if called directly
if (require.main === module) {
  validateEnvironment();
}

module.exports = { validateEnvironment };
