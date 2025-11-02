/**
 * Swagger/OpenAPI Configuration
 * API ドキュメント自動生成設定
 */

const swaggerJsdoc = require('swagger-jsdoc');

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Soba DEX API',
      version: '2.1.0',
      description: 'Enterprise-Grade Decentralized Exchange Platform API',
      contact: {
        name: 'Soba DEX Team',
        email: 'support@soba-dex.com',
      },
      license: {
        name: 'MIT',
        url: 'https://opensource.org/licenses/MIT',
      },
    },
    servers: [
      {
        url: 'http://localhost:3001',
        description: 'Development server',
      },
      {
        url: 'https://api.soba-dex.com',
        description: 'Production server',
      },
      {
        url: 'https://staging-api.soba-dex.com',
        description: 'Staging server',
      },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description: 'JWT Authorization header using the Bearer scheme',
        },
        sessionToken: {
          type: 'apiKey',
          in: 'header',
          name: 'X-Session-Token',
          description: 'Session token for authentication',
        },
      },
      schemas: {
        Error: {
          type: 'object',
          properties: {
            success: {
              type: 'boolean',
              example: false,
            },
            error: {
              type: 'object',
              properties: {
                code: {
                  type: 'string',
                  example: 'VALIDATION_ERROR',
                },
                message: {
                  type: 'string',
                  example: 'Invalid input parameters',
                },
                details: {
                  type: 'array',
                  items: {
                    type: 'object',
                  },
                },
              },
            },
          },
        },
        HealthCheck: {
          type: 'object',
          properties: {
            status: {
              type: 'string',
              enum: ['healthy', 'unhealthy', 'degraded'],
              example: 'healthy',
            },
            uptime: {
              type: 'number',
              example: 86400,
              description: 'Server uptime in seconds',
            },
            timestamp: {
              type: 'string',
              format: 'date-time',
              example: '2025-01-01T00:00:00.000Z',
            },
            version: {
              type: 'string',
              example: '2.1.0',
            },
            memory: {
              type: 'object',
              properties: {
                heapUsed: {
                  type: 'number',
                  example: 75,
                  description: 'Heap memory used in MB',
                },
                heapTotal: {
                  type: 'number',
                  example: 120,
                  description: 'Total heap memory in MB',
                },
                rss: {
                  type: 'number',
                  example: 150,
                  description: 'Resident set size in MB',
                },
              },
            },
          },
        },
        User: {
          type: 'object',
          properties: {
            id: {
              type: 'string',
              example: 'user123',
            },
            username: {
              type: 'string',
              example: 'john.doe@example.com',
            },
            createdAt: {
              type: 'string',
              format: 'date-time',
            },
          },
        },
        AuthResponse: {
          type: 'object',
          properties: {
            success: {
              type: 'boolean',
              example: true,
            },
            data: {
              type: 'object',
              properties: {
                accessToken: {
                  type: 'string',
                  example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
                },
                refreshToken: {
                  type: 'string',
                  example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
                },
                sessionToken: {
                  type: 'string',
                  example: 'sess_abc123...',
                },
                expiresAt: {
                  type: 'number',
                  example: 1640995200000,
                },
                user: {
                  $ref: '#/components/schemas/User',
                },
              },
            },
          },
        },
      },
      responses: {
        UnauthorizedError: {
          description: 'Access token is missing or invalid',
          content: {
            'application/json': {
              schema: {
                $ref: '#/components/schemas/Error',
              },
            },
          },
        },
        ValidationError: {
          description: 'Validation error',
          content: {
            'application/json': {
              schema: {
                $ref: '#/components/schemas/Error',
              },
            },
          },
        },
        NotFoundError: {
          description: 'Resource not found',
          content: {
            'application/json': {
              schema: {
                $ref: '#/components/schemas/Error',
              },
            },
          },
        },
        ServerError: {
          description: 'Internal server error',
          content: {
            'application/json': {
              schema: {
                $ref: '#/components/schemas/Error',
              },
            },
          },
        },
      },
    },
    tags: [
      {
        name: 'Health',
        description: 'Health check and monitoring endpoints',
      },
      {
        name: 'Authentication',
        description: 'User authentication and authorization',
      },
      {
        name: 'Trading',
        description: 'Trading and order management',
      },
      {
        name: 'Market',
        description: 'Market data and price feeds',
      },
      {
        name: 'Liquidity',
        description: 'Liquidity pool management',
      },
    ],
  },
  apis: [
    './src/routes/*.js',
    './src/middleware/*.js',
    './src/server-final.js',
  ],
};

const swaggerSpec = swaggerJsdoc(options);

module.exports = swaggerSpec;
