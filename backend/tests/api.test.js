/**
 * DEX Platform - Practical API Regression Suite
 */

const request = require('supertest');
const { expect } = require('chai');
const server = require('../src/server-final');

describe('Soba DEX API', () => {
  const TOKEN_A = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
  const TOKEN_B = '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';

  after(async () => {
    if (server && server.close) {
      await new Promise(resolve => server.close(resolve));
    }
  });

  describe('Health endpoints', () => {
    it('returns basic health with dex summary', async () => {
      const res = await request(server)
        .get('/health')
        .expect(200);

      expect(res.body).to.have.property('status');
      expect(res.body).to.have.nested.property('dex.totalPools');
      expect(res.body).to.have.nested.property('runtime.memory.heapUsedMb');
    });

    it('returns detailed health including dex service metadata', async () => {
      const res = await request(server)
        .get('/health/detailed')
        .expect(200);

      expect(res.body).to.have.nested.property('services.dex.status');
      expect(res.body).to.have.nested.property('services.database.status');
      expect(res.body).to.have.nested.property('lifecycle.current.status');
    });
  });

  describe('Tokens API', () => {
    it('lists tokens with pagination metadata', async () => {
      const res = await request(server)
        .get('/api/tokens?page=1&limit=2')
        .expect(200);

      expect(res.body).to.have.property('success', true);
      expect(res.body.data).to.be.an('array').with.lengthOf(2);
      expect(res.body).to.have.nested.property('pagination.page', 1);
      expect(res.body).to.have.nested.property('pagination.limit', 2);
      expect(res.body).to.have.nested.property('pagination.totalPages');
      expect(res.body).to.have.nested.property('pagination.hasNext');
      expect(res.body).to.have.nested.property('pagination.hasPrev');
      expect(res.headers).to.include.keys('etag', 'last-modified', 'x-total-count');
    });

    it('supports conditional requests for token list', async () => {
      const first = await request(server)
        .get('/api/tokens/list?page=1&limit=1')
        .expect(200);

      await request(server)
        .get('/api/tokens/list?page=1&limit=1')
        .set('If-None-Match', first.headers.etag)
        .expect(304);
    });

    it('rejects token list requests exceeding max limit', async () => {
      const res = await request(server)
        .get('/api/tokens?limit=100')
        .expect(400);

      expect(res.body).to.have.property('success', false);
      expect(res.body).to.have.property('code', 'VALIDATION_ERROR');
    });

    it('fetches token by address', async () => {
      const res = await request(server)
        .get('/api/tokens/0x0001')
        .expect(200);

      expect(res.body).to.have.property('success', true);
      expect(res.body.data).to.include({ symbol: 'WETH' });
    });

    it('accepts checksum token address casing', async () => {
      const res = await request(server)
        .get('/api/tokens/0xAbCdEf1234567890ABCdef1234567890abCDef12')
        .expect(200);

      expect(res.body).to.have.property('success', true);
      expect(res.body.data).to.include({ symbol: 'WBTC' });
    });

    it('rejects invalid token address format', async () => {
      const res = await request(server)
        .get('/api/tokens/invalid-address')
        .expect(400);

      expect(res.body).to.have.property('success', false);
      expect(res.body).to.have.property('code', 'VALIDATION_ERROR');
    });
  });

  describe('DEX Core', () => {
    it('describes available dex endpoints with telemetry headers', async () => {
      const res = await request(server)
        .get('/api/dex')
        .expect(200);

      expect(res.body).to.have.property('success', true);
      expect(res.body).to.have.nested.property('data.swap');
      expect(res.body).to.have.nested.property('metadata.totalPools');
      expect(res.headers).to.have.property('x-pool-count');
      expect(res.headers).to.have.property('x-swap-count');
    });

    it('adds liquidity and sets pool headers', async () => {
      const res = await request(server)
        .post('/api/dex/liquidity/add')
        .send({ token0: TOKEN_A, token1: TOKEN_B, amount0: 100, amount1: 200 })
        .expect(201);

      expect(res.body).to.have.property('success', true);
      expect(res.body.data).to.have.property('id');
      expect(res.headers).to.have.property('x-pool-count');
    });

    it('lists pools with metadata', async () => {
      const res = await request(server)
        .get('/api/dex/pools')
        .expect(200);

      expect(res.body).to.have.property('success', true);
      expect(res.body.data).to.be.an('array');
      expect(res.body.metadata).to.have.property('count');
      expect(res.headers).to.have.property('x-pool-count');
    });

    it('executes swap and returns telemetry headers', async () => {
      const res = await request(server)
        .post('/api/dex/swap')
        .send({ tokenIn: TOKEN_A, tokenOut: TOKEN_B, amountIn: 10, slippage: 1 })
        .expect(201);

      expect(res.body).to.have.property('success', true);
      expect(res.body.data).to.have.property('id');
      expect(res.headers).to.have.property('x-swap-count');
      expect(res.headers).to.have.property('x-swap-pairs');
    });

    it('returns recent swaps snapshot', async () => {
      const res = await request(server)
        .get('/api/dex/swaps/recent?limit=5')
        .expect(200);

      expect(res.body).to.have.property('success', true);
      expect(res.body.data).to.be.an('array');
      expect(res.body.metadata).to.include.keys('maxRetention', 'totalTracked');
      expect(res.headers).to.have.property('x-swap-count');
    });

    it('returns aggregated swap stats', async () => {
      const res = await request(server)
        .get('/api/dex/swaps/stats')
        .expect(200);

      expect(res.body).to.have.property('success', true);
      expect(res.body.metadata).to.have.property('totalSwaps');
      expect(res.headers).to.have.property('x-swap-pairs');
    });

    it('limits swap stats size when limit is provided', async () => {
      // ensure enough data
      await request(server)
        .post('/api/dex/liquidity/add')
        .send({ token0: TOKEN_A, token1: TOKEN_B, amount0: 100, amount1: 200 })
        .expect(201);

      await request(server)
        .post('/api/dex/swap')
        .send({ tokenIn: TOKEN_A, tokenOut: TOKEN_B, amountIn: 10, slippage: 1 })
        .expect(201);

      const res = await request(server)
        .get('/api/dex/swaps/stats?limit=1')
        .expect(200);

      expect(res.body).to.have.property('success', true);
      expect(res.body.data).to.be.an('array').with.lengthOf.at.most(1);
    });

    it('returns share metadata when includeMetadata flag is true', async () => {
      await request(server)
        .post('/api/dex/swap')
        .send({ tokenIn: TOKEN_A, tokenOut: TOKEN_B, amountIn: 5, slippage: 1 })
        .expect(201);

      const res = await request(server)
        .get('/api/dex/swaps/stats?includeMetadata=true')
        .expect(200);

      expect(res.body).to.have.property('success', true);
      expect(res.body.data[0]).to.have.property('pair');
      expect(res.body.data[0]).to.have.property('shareOfResults');
    });
  });
});
