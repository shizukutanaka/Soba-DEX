/**
 * API Documentation Generator
 * Auto-generate OpenAPI/Swagger documentation
 * Version: 1.0.0
 */

const { logger } = require('./productionLogger');
const fs = require('fs').promises;
const path = require('path');

/**
 * API Documentation Generator
 */
class APIDocGenerator {
  constructor() {
    this.routes = [];
    this.schemas = new Map();
    this.tags = new Set();
    this.isInitialized = false;

    // OpenAPI version
    this.openApiVersion = '3.0.0';

    // HTTP methods
    this.methods = ['get', 'post', 'put', 'patch', 'delete', 'options', 'head'];
  }

  /**
   * Initialize generator
   */
  async initialize(options = {}) {
    try {
      this.config = {
        title: options.title || 'API Documentation',
        version: options.version || '1.0.0',
        description: options.description || 'Auto-generated API documentation',
        baseUrl: options.baseUrl || 'http://localhost:3000',
        contactEmail: options.contactEmail,
        licenseName: options.licenseName || 'MIT',
        licenseUrl: options.licenseUrl,
        outputPath: options.outputPath || './docs/api',
        enableAutoScan: options.enableAutoScan !== false,
        ...options
      };

      // Create output directory
      await fs.mkdir(this.config.outputPath, { recursive: true });

      this.isInitialized = true;
      logger.info('API Doc Generator initialized', {
        title: this.config.title,
        version: this.config.version
      });
    } catch (error) {
      logger.error('Failed to initialize API Doc Generator', error);
      throw error;
    }
  }

  /**
   * Scan Express app for routes
   */
  scanApp(app) {
    if (!app || !app._router) {
      logger.warn('Invalid Express app provided');
      return;
    }

    const routes = [];

    // Extract routes from Express router
    const stack = app._router.stack;

    stack.forEach(middleware => {
      if (middleware.route) {
        // Route middleware
        this.extractRoute(middleware.route, routes);
      } else if (middleware.name === 'router') {
        // Router middleware
        const routerPath = middleware.regexp.source
          .replace('\\/?', '')
          .replace('(?=\\/|$)', '')
          .replace(/\\\//g, '/');

        if (middleware.handle.stack) {
          middleware.handle.stack.forEach(handler => {
            if (handler.route) {
              this.extractRoute(handler.route, routes, routerPath);
            }
          });
        }
      }
    });

    this.routes = routes;

    logger.info('Scanned routes', { count: routes.length });

    return routes;
  }

  /**
   * Extract route information
   */
  extractRoute(route, routes, basePath = '') {
    const path = basePath + route.path;

    Object.keys(route.methods).forEach(method => {
      if (route.methods[method]) {
        routes.push({
          path,
          method: method.toLowerCase(),
          stack: route.stack
        });
      }
    });
  }

  /**
   * Document route manually
   */
  documentRoute(method, path, documentation) {
    const {
      summary = '',
      description = '',
      tags = [],
      parameters = [],
      requestBody = null,
      responses = {},
      security = [],
      deprecated = false
    } = documentation;

    // Add tags
    tags.forEach(tag => this.tags.add(tag));

    this.routes.push({
      path,
      method: method.toLowerCase(),
      documentation: {
        summary,
        description,
        tags,
        parameters,
        requestBody,
        responses,
        security,
        deprecated
      }
    });

    logger.debug('Route documented', { method, path });
  }

  /**
   * Register schema
   */
  registerSchema(name, schema) {
    this.schemas.set(name, schema);
    logger.debug('Schema registered', { name });
  }

  /**
   * Generate OpenAPI specification
   */
  generateOpenAPI() {
    const spec = {
      openapi: this.openApiVersion,
      info: {
        title: this.config.title,
        version: this.config.version,
        description: this.config.description
      },
      servers: [
        {
          url: this.config.baseUrl,
          description: 'API Server'
        }
      ],
      paths: {},
      components: {
        schemas: Object.fromEntries(this.schemas),
        securitySchemes: this.generateSecuritySchemes()
      },
      tags: Array.from(this.tags).map(tag => ({ name: tag }))
    };

    // Add contact if provided
    if (this.config.contactEmail) {
      spec.info.contact = {
        email: this.config.contactEmail
      };
    }

    // Add license if provided
    if (this.config.licenseName) {
      spec.info.license = {
        name: this.config.licenseName,
        url: this.config.licenseUrl
      };
    }

    // Generate paths
    this.routes.forEach(route => {
      const pathKey = this.normalizePathForOpenAPI(route.path);

      if (!spec.paths[pathKey]) {
        spec.paths[pathKey] = {};
      }

      spec.paths[pathKey][route.method] = this.generateOperation(route);
    });

    return spec;
  }

  /**
   * Generate operation object
   */
  generateOperation(route) {
    const operation = {
      summary: route.documentation?.summary || `${route.method.toUpperCase()} ${route.path}`,
      description: route.documentation?.description || '',
      tags: route.documentation?.tags || ['default'],
      parameters: route.documentation?.parameters || this.extractParameters(route.path),
      responses: route.documentation?.responses || this.generateDefaultResponses()
    };

    // Add request body if provided
    if (route.documentation?.requestBody) {
      operation.requestBody = route.documentation.requestBody;
    } else if (['post', 'put', 'patch'].includes(route.method)) {
      operation.requestBody = this.generateDefaultRequestBody();
    }

    // Add security if provided
    if (route.documentation?.security) {
      operation.security = route.documentation.security;
    }

    // Mark as deprecated if specified
    if (route.documentation?.deprecated) {
      operation.deprecated = true;
    }

    return operation;
  }

  /**
   * Extract parameters from path
   */
  extractParameters(path) {
    const params = [];
    const matches = path.matchAll(/:(\w+)/g);

    for (const match of matches) {
      params.push({
        name: match[1],
        in: 'path',
        required: true,
        schema: {
          type: 'string'
        },
        description: `Path parameter: ${match[1]}`
      });
    }

    return params;
  }

  /**
   * Generate default request body
   */
  generateDefaultRequestBody() {
    return {
      required: true,
      content: {
        'application/json': {
          schema: {
            type: 'object',
            properties: {}
          }
        }
      }
    };
  }

  /**
   * Generate default responses
   */
  generateDefaultResponses() {
    return {
      '200': {
        description: 'Successful response',
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                success: { type: 'boolean' },
                data: { type: 'object' }
              }
            }
          }
        }
      },
      '400': {
        description: 'Bad request',
        content: {
          'application/json': {
            schema: {
              $ref: '#/components/schemas/Error'
            }
          }
        }
      },
      '500': {
        description: 'Internal server error',
        content: {
          'application/json': {
            schema: {
              $ref: '#/components/schemas/Error'
            }
          }
        }
      }
    };
  }

  /**
   * Generate security schemes
   */
  generateSecuritySchemes() {
    return {
      bearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT'
      },
      apiKey: {
        type: 'apiKey',
        in: 'header',
        name: 'X-API-Key'
      }
    };
  }

  /**
   * Normalize path for OpenAPI
   */
  normalizePathForOpenAPI(path) {
    return path.replace(/:(\w+)/g, '{$1}');
  }

  /**
   * Generate Markdown documentation
   */
  generateMarkdown() {
    let markdown = `# ${this.config.title}\n\n`;
    markdown += `${this.config.description}\n\n`;
    markdown += `**Version:** ${this.config.version}\n\n`;
    markdown += `**Base URL:** ${this.config.baseUrl}\n\n`;

    // Group routes by tag
    const routesByTag = this.groupRoutesByTag();

    Object.entries(routesByTag).forEach(([tag, routes]) => {
      markdown += `## ${tag}\n\n`;

      routes.forEach(route => {
        const method = route.method.toUpperCase();
        const path = route.path;
        const summary = route.documentation?.summary || '';

        markdown += `### ${method} ${path}\n\n`;

        if (summary) {
          markdown += `${summary}\n\n`;
        }

        if (route.documentation?.description) {
          markdown += `${route.documentation.description}\n\n`;
        }

        // Parameters
        const params = route.documentation?.parameters || this.extractParameters(path);
        if (params.length > 0) {
          markdown += `**Parameters:**\n\n`;
          params.forEach(param => {
            markdown += `- \`${param.name}\` (${param.in})`;
            if (param.required) markdown += ' *required*';
            if (param.description) markdown += ` - ${param.description}`;
            markdown += '\n';
          });
          markdown += '\n';
        }

        // Request body
        if (route.documentation?.requestBody) {
          markdown += `**Request Body:**\n\n`;
          markdown += '```json\n';
          markdown += JSON.stringify(route.documentation.requestBody, null, 2);
          markdown += '\n```\n\n';
        }

        // Responses
        if (route.documentation?.responses) {
          markdown += `**Responses:**\n\n`;
          Object.entries(route.documentation.responses).forEach(([code, response]) => {
            markdown += `- **${code}**: ${response.description}\n`;
          });
          markdown += '\n';
        }

        markdown += '---\n\n';
      });
    });

    return markdown;
  }

  /**
   * Group routes by tag
   */
  groupRoutesByTag() {
    const grouped = {};

    this.routes.forEach(route => {
      const tags = route.documentation?.tags || ['default'];

      tags.forEach(tag => {
        if (!grouped[tag]) {
          grouped[tag] = [];
        }
        grouped[tag].push(route);
      });
    });

    return grouped;
  }

  /**
   * Generate HTML documentation
   */
  generateHTML() {
    const spec = this.generateOpenAPI();

    return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${this.config.title}</title>
  <link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5/swagger-ui.css">
</head>
<body>
  <div id="swagger-ui"></div>
  <script src="https://unpkg.com/swagger-ui-dist@5/swagger-ui-bundle.js"></script>
  <script>
    window.onload = function() {
      window.ui = SwaggerUIBundle({
        spec: ${JSON.stringify(spec)},
        dom_id: '#swagger-ui',
        deepLinking: true,
        presets: [
          SwaggerUIBundle.presets.apis,
          SwaggerUIBundle.SwaggerUIStandalonePreset
        ],
        layout: "BaseLayout"
      });
    };
  </script>
</body>
</html>
    `;
  }

  /**
   * Export documentation
   */
  async export(format = 'all') {
    const exports = {};

    try {
      if (format === 'openapi' || format === 'all') {
        const spec = this.generateOpenAPI();
        const specPath = path.join(this.config.outputPath, 'openapi.json');
        await fs.writeFile(specPath, JSON.stringify(spec, null, 2));
        exports.openapi = specPath;

        logger.info('OpenAPI spec exported', { path: specPath });
      }

      if (format === 'markdown' || format === 'all') {
        const markdown = this.generateMarkdown();
        const mdPath = path.join(this.config.outputPath, 'API.md');
        await fs.writeFile(mdPath, markdown);
        exports.markdown = mdPath;

        logger.info('Markdown docs exported', { path: mdPath });
      }

      if (format === 'html' || format === 'all') {
        const html = this.generateHTML();
        const htmlPath = path.join(this.config.outputPath, 'index.html');
        await fs.writeFile(htmlPath, html);
        exports.html = htmlPath;

        logger.info('HTML docs exported', { path: htmlPath });
      }

      return exports;
    } catch (error) {
      logger.error('Failed to export documentation', error);
      throw error;
    }
  }

  /**
   * Get documentation statistics
   */
  getStatistics() {
    const documented = this.routes.filter(r => r.documentation).length;
    const undocumented = this.routes.length - documented;

    return {
      totalRoutes: this.routes.length,
      documented,
      undocumented,
      documentationRate: this.routes.length > 0
        ? ((documented / this.routes.length) * 100).toFixed(2) + '%'
        : '0%',
      tags: this.tags.size,
      schemas: this.schemas.size,
      methods: this.getMethodBreakdown()
    };
  }

  /**
   * Get method breakdown
   */
  getMethodBreakdown() {
    const breakdown = {};

    this.routes.forEach(route => {
      const method = route.method.toUpperCase();
      breakdown[method] = (breakdown[method] || 0) + 1;
    });

    return breakdown;
  }

  /**
   * Validate documentation completeness
   */
  validateDocumentation() {
    const issues = [];

    this.routes.forEach((route, index) => {
      const routeId = `${route.method.toUpperCase()} ${route.path}`;

      if (!route.documentation) {
        issues.push({
          route: routeId,
          severity: 'warning',
          message: 'Route has no documentation'
        });
      } else {
        if (!route.documentation.summary) {
          issues.push({
            route: routeId,
            severity: 'info',
            message: 'Missing summary'
          });
        }

        if (!route.documentation.tags || route.documentation.tags.length === 0) {
          issues.push({
            route: routeId,
            severity: 'info',
            message: 'No tags specified'
          });
        }

        if (!route.documentation.responses || Object.keys(route.documentation.responses).length === 0) {
          issues.push({
            route: routeId,
            severity: 'warning',
            message: 'No response documentation'
          });
        }
      }
    });

    return {
      valid: issues.filter(i => i.severity === 'error').length === 0,
      issues,
      summary: {
        errors: issues.filter(i => i.severity === 'error').length,
        warnings: issues.filter(i => i.severity === 'warning').length,
        info: issues.filter(i => i.severity === 'info').length
      }
    };
  }

  /**
   * Clear all documentation
   */
  clear() {
    this.routes = [];
    this.schemas.clear();
    this.tags.clear();

    logger.info('Documentation cleared');
  }

  /**
   * Shutdown
   */
  async shutdown() {
    this.clear();
    this.isInitialized = false;

    logger.info('API Doc Generator shut down');
  }
}

// Create singleton instance
const apiDocGenerator = new APIDocGenerator();

// Register common schemas
apiDocGenerator.registerSchema('Error', {
  type: 'object',
  properties: {
    error: { type: 'string' },
    message: { type: 'string' },
    statusCode: { type: 'number' }
  },
  required: ['error']
});

apiDocGenerator.registerSchema('SuccessResponse', {
  type: 'object',
  properties: {
    success: { type: 'boolean' },
    data: { type: 'object' },
    timestamp: { type: 'string', format: 'date-time' }
  }
});

module.exports = apiDocGenerator;
