const fs = require('fs');
const path = require('path');
const swaggerJSDoc = require('swagger-jsdoc');

// Swagger definition
const swaggerDefinition = {
  openapi: '3.0.0',
  info: {
    title: 'DEX Platform API',
    version: '1.0.0',
    description: 'Comprehensive API documentation for the DEX/DeFi platform',
    contact: {
      name: 'API Support',
      email: 'support@soba.com',
    },
  },
  servers: [
    {
      url: process.env.API_BASE_URL || 'http://localhost:4000',
      description: 'Development server',
    },
    {
      url: 'https://api.soba.com',
      description: 'Production server',
    },
  ],
  components: {
    securitySchemes: {
      bearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
      },
      apiKey: {
        type: 'apiKey',
        in: 'header',
        name: 'X-API-Key',
      },
    },
    schemas: {
      Error: {
        type: 'object',
        properties: {
          error: {
            type: 'string',
            description: 'Error message',
          },
          code: {
            type: 'string',
            description: 'Error code',
          },
          timestamp: {
            type: 'string',
            format: 'date-time',
            description: 'Error timestamp',
          },
        },
      },
      HealthStatus: {
        type: 'object',
        properties: {
          status: {
            type: 'string',
            enum: ['healthy', 'degraded', 'unhealthy'],
          },
          timestamp: {
            type: 'string',
            format: 'date-time',
          },
          services: {
            type: 'object',
            additionalProperties: {
              type: 'object',
              properties: {
                status: { type: 'string' },
                responseTime: { type: 'number' },
                lastCheck: { type: 'string', format: 'date-time' },
              },
            },
          },
        },
      },
      SecurityStats: {
        type: 'object',
        properties: {
          metrics: {
            type: 'object',
            properties: {
              blockedRequests: { type: 'number' },
              suspiciousActivity: { type: 'number' },
              maliciousAttempts: { type: 'number' },
              securityScans: { type: 'number' },
            },
          },
          blockedIPs: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                ip: { type: 'string' },
                reason: { type: 'string' },
                blockedAt: { type: 'string', format: 'date-time' },
                expiresAt: { type: 'string', format: 'date-time' },
              },
            },
          },
        },
      },
      PerformanceMetrics: {
        type: 'object',
        properties: {
          responseTime: {
            type: 'object',
            properties: {
              avg: { type: 'number' },
              min: { type: 'number' },
              max: { type: 'number' },
              p95: { type: 'number' },
            },
          },
          memoryUsage: {
            type: 'object',
            properties: {
              used: { type: 'number' },
              total: { type: 'number' },
              percentage: { type: 'number' },
            },
          },
          requestCount: { type: 'number' },
          errorRate: { type: 'number' },
        },
      },
    },
  },
  tags: [
    {
      name: 'Health',
      description: 'Health monitoring and system status endpoints',
    },
    {
      name: 'Security',
      description: 'Security monitoring and management endpoints',
    },
    {
      name: 'Performance',
      description: 'Performance metrics and monitoring',
    },
    {
      name: 'System',
      description: 'System information and diagnostics',
    },
    {
      name: 'DEX',
      description: 'Decentralized exchange functionality',
    },
  ],
};

// Options for the swagger docs
const options = {
  swaggerDefinition,
  apis: [
    './src/routes/*.js',
    './src/controllers/*.js',
    './src/middleware/*.js',
    './src/services/*.js',
  ],
};

class DocumentationGenerator {
  constructor() {
    this.outputDir = path.join(__dirname, '../docs');
    this.ensureOutputDir();
  }

  ensureOutputDir() {
    if (!fs.existsSync(this.outputDir)) {
      fs.mkdirSync(this.outputDir, { recursive: true });
    }
  }

  generateSwaggerSpec() {
    console.log('Generating Swagger/OpenAPI specification...');

    const specs = swaggerJSDoc(options);

    // Write the swagger spec to a JSON file
    const specPath = path.join(this.outputDir, 'swagger.json');
    fs.writeFileSync(specPath, JSON.stringify(specs, null, 2));

    console.log(`Swagger specification generated: ${specPath}`);
    return specs;
  }

  generateMarkdownDocs() {
    console.log('Generating Markdown documentation...');

    const markdownContent = this.createMarkdownFromRoutes();
    const markdownPath = path.join(this.outputDir, 'API.md');

    fs.writeFileSync(markdownPath, markdownContent);
    console.log(`Markdown documentation generated: ${markdownPath}`);
  }

  createMarkdownFromRoutes() {
    const routesDir = path.join(__dirname, '../src/routes');
    let markdown = `# DEX Platform API Documentation

Generated on: ${new Date().toISOString()}

## Overview

This document provides comprehensive API documentation for the DEX Platform backend services.

## Base URL

- Development: \`http://localhost:4000\`
- Production: \`https://api.soba.com\`

## Authentication

The API supports multiple authentication methods:

- **Bearer Token**: Include \`Authorization: Bearer <token>\` header
- **API Key**: Include \`X-API-Key: <key>\` header

## Rate Limiting

API requests are rate-limited to prevent abuse:

- Standard endpoints: 100 requests per 15 minutes per IP
- Authentication endpoints: 10 requests per 15 minutes per IP
- Admin endpoints: 50 requests per 15 minutes per IP

## Error Handling

All API responses follow a consistent error format:

\`\`\`json
{
  "error": "Error message",
  "code": "ERROR_CODE",
  "timestamp": "2024-01-01T00:00:00.000Z"
}
\`\`\`

## API Endpoints

`;

    // Parse route files and extract endpoint information
    if (fs.existsSync(routesDir)) {
      const routeFiles = fs
        .readdirSync(routesDir)
        .filter(file => file.endsWith('.js'));

      routeFiles.forEach(file => {
        const filePath = path.join(routesDir, file);
        const content = fs.readFileSync(filePath, 'utf8');

        markdown += this.parseRouteFile(file, content);
      });
    }

    markdown += `
## Response Codes

| Code | Description |
|------|-------------|
| 200  | OK - Request successful |
| 201  | Created - Resource created successfully |
| 400  | Bad Request - Invalid request parameters |
| 401  | Unauthorized - Authentication required |
| 403  | Forbidden - Access denied |
| 404  | Not Found - Resource not found |
| 429  | Too Many Requests - Rate limit exceeded |
| 500  | Internal Server Error - Server error |

## WebSocket Events

The platform supports real-time updates via WebSocket connections:

- \`price_update\` - Real-time price updates
- \`trade_executed\` - Trade execution notifications
- \`order_status\` - Order status changes
- \`system_alert\` - System alerts and notifications

## SDK and Examples

For implementation examples and SDK usage, refer to:

- [JavaScript SDK](./examples/javascript.md)
- [Python SDK](./examples/python.md)
- [cURL Examples](./examples/curl.md)

---

*This documentation is automatically generated. For updates or corrections, please contact the development team.*
`;

    return markdown;
  }

  parseRouteFile(filename, content) {
    let markdown = `\n### ${filename.replace('.js', '').toUpperCase()} Routes\n\n`;

    // Extract route definitions using regex
    const routePattern =
      /router\.(get|post|put|delete|patch)\s*\(\s*['"`]([^'"`]+)['"`]/g;
    const routes = [];
    let match;

    while ((match = routePattern.exec(content)) !== null) {
      routes.push({
        method: match[1].toUpperCase(),
        path: match[2],
      });
    }

    if (routes.length === 0) {
      return '';
    }

    routes.forEach(route => {
      markdown += `#### ${route.method} ${route.path}\n\n`;

      // Try to extract comments or documentation from the route
      const routeDoc = this.extractRouteDocumentation(content, route.path);
      if (routeDoc) {
        markdown += `${routeDoc}\n\n`;
      } else {
        markdown += `Endpoint for ${route.path}\n\n`;
      }

      markdown += `**Method:** \`${route.method}\`\n`;
      markdown += `**Path:** \`${route.path}\`\n\n`;
    });

    return markdown;
  }

  extractRouteDocumentation(content, routePath) {
    // Look for comments above route definitions
    const lines = content.split('\n');
    const routeLineIndex = lines.findIndex(line => line.includes(routePath));

    if (routeLineIndex === -1) return null;

    // Look for comments in the lines above the route
    for (let i = routeLineIndex - 1; i >= 0; i--) {
      const line = lines[i].trim();
      if (line.startsWith('//') || line.startsWith('*')) {
        return line.replace(/^\/\/\s*|\*\s*/g, '');
      }
      if (line && !line.startsWith('//') && !line.startsWith('*')) {
        break;
      }
    }

    return null;
  }

  generatePostmanCollection() {
    console.log('Generating Postman collection...');

    const collection = {
      info: {
        name: 'DEX Platform API',
        description: 'API collection for DEX Platform',
        schema:
          'https://schema.getpostman.com/json/collection/v2.1.0/collection.json',
      },
      item: [],
      variable: [
        {
          key: 'baseUrl',
          value: 'http://localhost:4000',
          type: 'string',
        },
      ],
    };

    // Add basic endpoints to the collection
    const endpoints = [
      { name: 'Health Check', method: 'GET', url: '/health' },
      { name: 'System Info', method: 'GET', url: '/api/system/info' },
      {
        name: 'Performance Metrics',
        method: 'GET',
        url: '/api/metrics/performance',
      },
      { name: 'Security Stats', method: 'GET', url: '/api/security/stats' },
      {
        name: 'Comprehensive Health',
        method: 'GET',
        url: '/api/health/comprehensive',
      },
    ];

    endpoints.forEach(endpoint => {
      collection.item.push({
        name: endpoint.name,
        request: {
          method: endpoint.method,
          header: [
            {
              key: 'Content-Type',
              value: 'application/json',
              type: 'text',
            },
          ],
          url: {
            raw: '{{baseUrl}}' + endpoint.url,
            host: ['{{baseUrl}}'],
            path: endpoint.url.split('/').filter(p => p),
          },
        },
      });
    });

    const collectionPath = path.join(this.outputDir, 'postman-collection.json');
    fs.writeFileSync(collectionPath, JSON.stringify(collection, null, 2));

    console.log(`Postman collection generated: ${collectionPath}`);
  }

  generateSecurityDocs() {
    console.log('Generating security documentation...');

    const securityDocs = `# Security Documentation

## Overview

The DEX Platform implements comprehensive security measures to protect against various attack vectors.

## Security Features

### Input Validation
- XSS protection with pattern detection
- SQL injection prevention
- Command injection blocking
- Path traversal protection

### Rate Limiting
- Adaptive rate limiting based on system load
- Multiple algorithms: token bucket, sliding window, fixed window
- IP-based and user-based limits
- Geographic rate limiting support

### IP Protection
- Automatic IP blocking for suspicious behavior
- Whitelist/blacklist management
- Geographic IP filtering
- Proxy detection

### Request Analysis
- Pattern-based threat detection
- Bot and scanner identification
- Behavioral analysis
- Real-time threat monitoring

### Security Headers
- CORS validation
- Header injection protection
- Content-Type validation
- Secure headers enforcement

## Security Monitoring

The platform provides real-time security monitoring through:

- \`/api/security/stats\` - Security metrics and statistics
- Real-time alerting for security events
- Comprehensive logging of security incidents
- Integration with external security services

## Security Configuration

Security settings can be configured through environment variables:

\`\`\`env
SECURITY_RATE_LIMIT_WINDOW=900000
SECURITY_RATE_LIMIT_MAX=100
SECURITY_IP_BLOCK_DURATION=3600000
SECURITY_ENABLE_GEO_BLOCKING=true
\`\`\`

## Incident Response

In case of security incidents:

1. Monitor \`/api/security/stats\` for anomalies
2. Review security logs for details
3. Use \`/api/security/unblock-ip\` for IP management
4. Contact security team for serious threats

---

*Keep this documentation updated with security policy changes.*
`;

    const securityPath = path.join(this.outputDir, 'SECURITY.md');
    fs.writeFileSync(securityPath, securityDocs);

    console.log(`Security documentation generated: ${securityPath}`);
  }

  generateAll() {
    console.log('Starting comprehensive documentation generation...');

    try {
      this.generateSwaggerSpec();
      this.generateMarkdownDocs();
      this.generatePostmanCollection();
      this.generateSecurityDocs();

      console.log('\n✅ Documentation generation completed successfully!');
      console.log(`📁 Documentation available in: ${this.outputDir}`);
      console.log('📄 Generated files:');
      console.log('   - swagger.json (OpenAPI specification)');
      console.log('   - API.md (Markdown documentation)');
      console.log('   - postman-collection.json (Postman collection)');
      console.log('   - SECURITY.md (Security documentation)');
    } catch (error) {
      console.error('❌ Error generating documentation:', error.message);
      process.exit(1);
    }
  }
}

// Run documentation generation
if (require.main === module) {
  const generator = new DocumentationGenerator();
  generator.generateAll();
}

module.exports = DocumentationGenerator;
