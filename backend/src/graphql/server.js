/**
 * GraphQL Server Setup
 * Integrates Apollo Server with Express
 * Includes DataLoaders, caching, and subscriptions
 */

const { ApolloServer } = require('apollo-server-express');
const { makeExecutableSchema } = require('@graphql-tools/schema');
const { WebSocketServer } = require('ws');
const { useServer } = require('graphql-ws/lib/use/ws');
const { PubSub } = require('graphql-subscriptions');

const typeDefs = require('./schema');
const resolvers = require('./resolvers');
const { createDataLoaders } = require('./dataloaders');
const { createDataSources } = require('./datasources');
const { logger } = require('../utils/productionLogger');

/**
 * Create and configure GraphQL server
 */
async function createGraphQLServer(app, httpServer, db, redis) {
  // Create PubSub for subscriptions
  const pubsub = new PubSub();

  // Create executable schema
  const schema = makeExecutableSchema({
    typeDefs,
    resolvers
  });

  // Create Apollo Server
  const apolloServer = new ApolloServer({
    schema,
    context: async ({ req }) => {
      // Create new DataLoader instances per request (important for batching)
      const loaders = createDataLoaders(db, redis);

      // Create data sources
      const dataSources = createDataSources(db, loaders, redis);

      // Get user from authentication middleware (if authenticated)
      const user = req.user || null;

      return {
        db,
        redis,
        loaders,
        dataSources,
        pubsub,
        user
      };
    },
    plugins: [
      // Request logging plugin
      {
        async requestDidStart() {
          const start = Date.now();

          return {
            async willSendResponse(requestContext) {
              const duration = Date.now() - start;
              const operationName = requestContext.request.operationName || 'unknown';
              const operationType = requestContext.operation?.operation || 'query';

              logger.info('[GraphQL] Request completed', {
                operationName,
                operationType,
                duration: `${duration}ms`,
                errors: requestContext.errors?.length || 0
              });
            }
          };
        }
      },

      // Error logging plugin
      {
        async requestDidStart() {
          return {
            async didEncounterErrors(requestContext) {
              requestContext.errors.forEach(error => {
                logger.error('[GraphQL] Error encountered', {
                  message: error.message,
                  path: error.path,
                  operationName: requestContext.request.operationName
                });
              });
            }
          };
        }
      },

      // Performance monitoring plugin
      {
        async requestDidStart() {
          return {
            async executionDidStart() {
              const start = Date.now();

              return {
                async executionDidEnd() {
                  const duration = Date.now() - start;
                  if (duration > 1000) {
                    logger.warn('[GraphQL] Slow query detected', {
                      duration: `${duration}ms`
                    });
                  }
                }
              };
            }
          };
        }
      }
    ],

    // Format errors for client
    formatError: (error) => {
      logger.error('[GraphQL] Formatting error', {
        message: error.message,
        code: error.extensions?.code
      });

      // Don't expose internal errors in production
      if (process.env.NODE_ENV === 'production') {
        if (error.message.includes('database') || error.message.includes('internal')) {
          return {
            message: 'An internal error occurred',
            code: 'INTERNAL_ERROR'
          };
        }
      }

      return error;
    },

    // Enable introspection and playground in development
    introspection: process.env.NODE_ENV !== 'production',
    playground: process.env.NODE_ENV !== 'production'
  });

  // Start Apollo Server
  await apolloServer.start();

  // Apply middleware to Express
  apolloServer.applyMiddleware({
    app,
    path: '/graphql',
    cors: {
      origin: process.env.FRONTEND_URL || 'http://localhost:3000',
      credentials: true
    }
  });

  // WebSocket server for subscriptions
  const wsServer = new WebSocketServer({
    server: httpServer,
    path: '/graphql'
  });

  // Setup subscription handling
  const serverCleanup = useServer(
    {
      schema,
      context: async (ctx) => {
        // Create new DataLoader instances per subscription
        const loaders = createDataLoaders(db, redis);
        const dataSources = createDataSources(db, loaders, redis);

        return {
          db,
          redis,
          loaders,
          dataSources,
          pubsub
        };
      },
      onConnect: async (ctx) => {
        logger.info('[GraphQL] WebSocket connection established');
      },
      onDisconnect: async (ctx) => {
        logger.info('[GraphQL] WebSocket connection closed');
      }
    },
    wsServer
  );

  logger.info('[GraphQL] Server configured', {
    endpoint: apolloServer.graphqlPath,
    subscriptions: '/graphql (WebSocket)'
  });

  return {
    apolloServer,
    wsServer,
    serverCleanup,
    pubsub
  };
}

/**
 * Publish real-time updates
 */
const publishers = {
  /**
   * Publish price update
   */
  async publishPriceUpdate(pubsub, priceData) {
    await pubsub.publish(`PRICE_${priceData.symbol}`, {
      priceUpdate: priceData
    });
    logger.debug('[GraphQL] Published price update', { symbol: priceData.symbol });
  },

  /**
   * Publish order book update
   */
  async publishOrderBookUpdate(pubsub, poolId, orderBookData) {
    await pubsub.publish(`ORDERBOOK_${poolId}`, {
      orderBookUpdate: {
        poolId,
        ...orderBookData,
        timestamp: new Date()
      }
    });
    logger.debug('[GraphQL] Published order book update', { poolId });
  },

  /**
   * Publish transaction update
   */
  async publishTransactionUpdate(pubsub, transaction) {
    await pubsub.publish(`TX_${transaction.userAddress}`, {
      transactionUpdate: transaction
    });
    logger.debug('[GraphQL] Published transaction update', {
      hash: transaction.hash,
      user: transaction.userAddress
    });
  },

  /**
   * Publish pool update
   */
  async publishPoolUpdate(pubsub, pool) {
    await pubsub.publish(`POOL_${pool.id}`, {
      poolUpdate: pool
    });
    logger.debug('[GraphQL] Published pool update', { poolId: pool.id });
  }
};

module.exports = {
  createGraphQLServer,
  publishers
};
