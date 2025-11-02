const swaggerJsdoc = require('swagger-jsdoc');

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'DEX Trading Platform API',
      version: '2.0.0',
      description: 'Enterprise-grade DEX API with comprehensive trading, liquidity, and security features',
      contact: {
        name: 'Soba DEX Platform Team'
      },
      license: {
        name: 'MIT',
        url: 'https://opensource.org/licenses/MIT'
      }
    },
    servers: [
      {
        url: process.env.API_BASE_URL || 'http://localhost:3001',
        description: process.env.NODE_ENV === 'production' ? 'Production server' : 'Development server'
      }
    ],
    tags: [
      {
        name: 'Authentication',
        description: 'User authentication and authorization endpoints'
      },
      {
        name: 'Trading',
        description: 'Trading operations including orders, swaps, and market data'
      },
      {
        name: 'Liquidity',
        description: 'Liquidity pool management'
      },
      {
        name: 'Wallet',
        description: 'Wallet connection and balance operations'
      },
      {
        name: 'Market Data',
        description: 'Real-time market data and price feeds'
      },
      {
        name: 'Health',
        description: 'System health and monitoring'
      }
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description: 'JWT authentication token'
        },
        sessionToken: {
          type: 'apiKey',
          in: 'header',
          name: 'X-Session-Token',
          description: 'Session token for authenticated requests'
        }
      },
      schemas: {
        User: {
          type: 'object',
          properties: {
            id: {
              type: 'string',
              description: 'User unique identifier'
            },
            username: {
              type: 'string',
              description: 'Username/email'
            },
            createdAt: {
              type: 'string',
              format: 'date-time'
            }
          }
        },
        AuthResponse: {
          type: 'object',
          properties: {
            success: {
              type: 'boolean'
            },
            data: {
              type: 'object',
              properties: {
                accessToken: {
                  type: 'string',
                  description: 'JWT access token (24h validity)'
                },
                refreshToken: {
                  type: 'string',
                  description: 'JWT refresh token (7d validity)'
                },
                sessionToken: {
                  type: 'string',
                  description: 'Session identifier'
                },
                expiresAt: {
                  type: 'integer',
                  description: 'Token expiration timestamp'
                },
                user: {
                  $ref: '#/components/schemas/User'
                }
              }
            }
          }
        },
        Order: {
          type: 'object',
          properties: {
            id: {
              type: 'string'
            },
            pair: {
              type: 'string',
              example: 'ETH/USDT'
            },
            side: {
              type: 'string',
              enum: ['buy', 'sell']
            },
            type: {
              type: 'string',
              enum: ['market', 'limit']
            },
            amount: {
              type: 'number',
              minimum: 0
            },
            price: {
              type: 'number',
              minimum: 0
            },
            status: {
              type: 'string',
              enum: ['pending', 'filled', 'cancelled']
            },
            createdAt: {
              type: 'string',
              format: 'date-time'
            }
          },
          required: ['pair', 'side', 'type', 'amount']
        },
        Error: {
          type: 'object',
          properties: {
            success: {
              type: 'boolean',
              example: false
            },
            error: {
              type: 'string',
              description: 'Error message'
            },
            code: {
              type: 'string',
              description: 'Error code'
            }
          }
        },
        HealthStatus: {
          type: 'object',
          properties: {
            status: {
              type: 'string',
              enum: ['healthy', 'degraded', 'unhealthy']
            },
            uptime: {
              type: 'number',
              description: 'Server uptime in seconds'
            },
            memory: {
              type: 'object',
              properties: {
                heapUsed: {
                  type: 'number',
                  description: 'Heap memory used (MB)'
                },
                heapTotal: {
                  type: 'number',
                  description: 'Total heap memory (MB)'
                },
                rss: {
                  type: 'number',
                  description: 'Resident set size (MB)'
                }
              }
            },
            timestamp: {
              type: 'string',
              format: 'date-time'
            }
          }
        }
      },
      responses: {
        UnauthorizedError: {
          description: 'Authentication required',
          content: {
            'application/json': {
              schema: {
                $ref: '#/components/schemas/Error'
              }
            }
          }
        },
        ForbiddenError: {
          description: 'Insufficient permissions',
          content: {
            'application/json': {
              schema: {
                $ref: '#/components/schemas/Error'
              }
            }
          }
        },
        NotFoundError: {
          description: 'Resource not found',
          content: {
            'application/json': {
              schema: {
                $ref: '#/components/schemas/Error'
              }
            }
          }
        },
        ValidationError: {
          description: 'Invalid request data',
          content: {
            'application/json': {
              schema: {
                $ref: '#/components/schemas/Error'
              }
            }
          }
        },
        RateLimitError: {
          description: 'Rate limit exceeded',
          content: {
            'application/json': {
              schema: {
                $ref: '#/components/schemas/Error'
              }
            }
          }
        }
      }
    },
    security: [
      {
        bearerAuth: []
      }
    ]
  },
  apis: ['./src/routes/*.js', './src/server-final.js']
};

const swaggerSpec = swaggerJsdoc(options);

module.exports = swaggerSpec;
