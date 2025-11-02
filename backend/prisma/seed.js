/**
 * Database Seed Script
 * Version: 2.6.1
 *
 * Populates database with initial data for development/testing
 */

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Starting database seed...\n');

  // Clear existing data (development only!)
  if (process.env.NODE_ENV !== 'production') {
    console.log('🗑️  Clearing existing data...');
    await prisma.notification.deleteMany();
    await prisma.portfolioAsset.deleteMany();
    await prisma.portfolio.deleteMany();
    await prisma.transaction.deleteMany();
    await prisma.apiKey.deleteMany();
    await prisma.session.deleteMany();
    await prisma.priceHistory.deleteMany();
    await prisma.gasHistory.deleteMany();
    await prisma.auditLog.deleteMany();
    await prisma.systemConfig.deleteMany();
    await prisma.user.deleteMany();
    console.log('✅ Data cleared\n');
  }

  // Create test users
  console.log('👤 Creating test users...');
  const user1 = await prisma.user.create({
    data: {
      address: '0x742d35cc6634c0532925a3b844bc9e7595f0beb',
      role: 'USER',
      username: 'alice',
      email: 'alice@example.com',
      lastLoginAt: new Date()
    }
  });

  const user2 = await prisma.user.create({
    data: {
      address: '0x5c6b0f7bf3e7ce046039bd8fabdfb3f9f81651d4',
      role: 'USER',
      username: 'bob',
      email: 'bob@example.com',
      lastLoginAt: new Date()
    }
  });

  const admin = await prisma.user.create({
    data: {
      address: '0x1234567890123456789012345678901234567890',
      role: 'ADMIN',
      username: 'admin',
      email: 'admin@sobadex.com',
      lastLoginAt: new Date()
    }
  });

  console.log(`✅ Created ${3} users\n`);

  // Create sample transactions
  console.log('💱 Creating sample transactions...');
  const transactions = [];

  for (let i = 0; i < 10; i++) {
    const tx = await prisma.transaction.create({
      data: {
        userId: i % 2 === 0 ? user1.id : user2.id,
        txHash: `0x${Math.random().toString(16).substr(2, 64)}`,
        type: ['SWAP', 'LIQUIDITY_ADD', 'LIQUIDITY_REMOVE'][i % 3],
        status: ['CONFIRMED', 'PENDING', 'FAILED'][i % 3],
        fromToken: 'ETH',
        toToken: 'USDC',
        fromAmount: (Math.random() * 5).toString(),
        toAmount: (Math.random() * 10000).toString(),
        gasPrice: (20 + Math.random() * 30).toString(),
        gasFee: (0.001 + Math.random() * 0.01).toString(),
        slippage: (0.1 + Math.random() * 0.4).toString(),
        confirmedAt: i % 3 === 0 ? new Date() : null,
        blockNumber: i % 3 === 0 ? BigInt(17000000 + i * 100) : null
      }
    });
    transactions.push(tx);
  }

  console.log(`✅ Created ${transactions.length} transactions\n`);

  // Create portfolios
  console.log('💼 Creating portfolios...');

  const portfolio1 = await prisma.portfolio.create({
    data: {
      userId: user1.id,
      totalValueUsd: '12345.67',
      totalPnlUsd: '234.56',
      totalPnlPercent: '1.94',
      lastUpdatedAt: new Date()
    }
  });

  const portfolio2 = await prisma.portfolio.create({
    data: {
      userId: user2.id,
      totalValueUsd: '8765.43',
      totalPnlUsd: '-123.45',
      totalPnlPercent: '-1.39',
      lastUpdatedAt: new Date()
    }
  });

  console.log(`✅ Created ${2} portfolios\n`);

  // Create portfolio assets
  console.log('📊 Creating portfolio assets...');

  await prisma.portfolioAsset.createMany({
    data: [
      {
        portfolioId: portfolio1.id,
        tokenSymbol: 'ETH',
        tokenAddress: '0x0000000000000000000000000000000000000000',
        balance: '5.25',
        valueUsd: '12321.52',
        averageBuyPrice: '2300.00',
        currentPrice: '2345.67',
        pnlUsd: '239.76',
        pnlPercent: '1.98',
        lastUpdatedAt: new Date()
      },
      {
        portfolioId: portfolio1.id,
        tokenSymbol: 'USDC',
        tokenAddress: '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48',
        balance: '24.15',
        valueUsd: '24.15',
        averageBuyPrice: '1.00',
        currentPrice: '1.00',
        pnlUsd: '0',
        pnlPercent: '0',
        lastUpdatedAt: new Date()
      },
      {
        portfolioId: portfolio2.id,
        tokenSymbol: 'BTC',
        tokenAddress: '0x2260fac5e5542a773aa44fbcfedf7c193bc2c599',
        balance: '0.15',
        valueUsd: '6850.35',
        averageBuyPrice: '46000.00',
        currentPrice: '45669.00',
        pnlUsd: '-49.65',
        pnlPercent: '-0.72',
        lastUpdatedAt: new Date()
      }
    ]
  });

  console.log(`✅ Created portfolio assets\n`);

  // Create price history
  console.log('💹 Creating price history...');

  const now = Date.now();
  const priceHistoryData = [];

  // ETH-USDC price history (last 24 hours)
  for (let i = 0; i < 24; i++) {
    priceHistoryData.push({
      tokenPair: 'ETH-USDC',
      price: (2300 + Math.random() * 100).toFixed(2),
      volume24h: (1000000 + Math.random() * 500000).toFixed(2),
      high24h: '2400.00',
      low24h: '2250.00',
      priceChange24h: (Math.random() * 5 - 2.5).toFixed(2),
      source: 'mock',
      timestamp: new Date(now - i * 3600000)
    });
  }

  // BTC-USDT price history
  for (let i = 0; i < 24; i++) {
    priceHistoryData.push({
      tokenPair: 'BTC-USDT',
      price: (45000 + Math.random() * 2000).toFixed(2),
      volume24h: (5000000 + Math.random() * 1000000).toFixed(2),
      high24h: '47000.00',
      low24h: '44000.00',
      priceChange24h: (Math.random() * 4 - 2).toFixed(2),
      source: 'mock',
      timestamp: new Date(now - i * 3600000)
    });
  }

  await prisma.priceHistory.createMany({ data: priceHistoryData });
  console.log(`✅ Created ${priceHistoryData.length} price history records\n`);

  // Create gas history
  console.log('⛽ Creating gas history...');

  const gasHistoryData = [];
  for (let i = 0; i < 48; i++) {
    const baseFee = 20 + Math.random() * 30 + Math.sin(i / 4) * 10;
    gasHistoryData.push({
      baseFee: baseFee.toFixed(2),
      slow: (baseFee * 0.8).toFixed(2),
      standard: baseFee.toFixed(2),
      fast: (baseFee * 1.2).toFixed(2),
      instant: (baseFee * 1.5).toFixed(2),
      congestion: Math.floor(Math.min(100, Math.max(0, ((baseFee - 20) / 30) * 100))),
      timestamp: new Date(now - i * 3600000)
    });
  }

  await prisma.gasHistory.createMany({ data: gasHistoryData });
  console.log(`✅ Created ${gasHistoryData.length} gas history records\n`);

  // Create system config
  console.log('⚙️  Creating system config...');

  await prisma.systemConfig.createMany({
    data: [
      {
        key: 'maintenance_mode',
        value: { enabled: false },
        description: 'Enable/disable maintenance mode'
      },
      {
        key: 'max_slippage',
        value: { value: 5.0 },
        description: 'Maximum allowed slippage percentage'
      },
      {
        key: 'min_swap_amount',
        value: { eth: 0.001, usdc: 1 },
        description: 'Minimum swap amounts by token'
      },
      {
        key: 'supported_tokens',
        value: {
          tokens: ['ETH', 'USDC', 'USDT', 'DAI', 'WBTC', 'WETH']
        },
        description: 'List of supported tokens'
      }
    ]
  });

  console.log(`✅ Created system config\n`);

  // Create notifications
  console.log('🔔 Creating notifications...');

  await prisma.notification.createMany({
    data: [
      {
        userId: user1.id,
        type: 'SWAP_COMPLETED',
        title: 'Swap Completed',
        message: 'Your swap of 1.5 ETH to USDC has been completed',
        read: false
      },
      {
        userId: user1.id,
        type: 'PRICE_ALERT',
        title: 'Price Alert',
        message: 'ETH price has reached your target of $2400',
        read: true,
        readAt: new Date()
      },
      {
        userId: user2.id,
        type: 'GAS_ALERT',
        title: 'Gas Price Alert',
        message: 'Gas price is now below 20 Gwei',
        read: false
      }
    ]
  });

  console.log(`✅ Created notifications\n`);

  // Create audit logs
  console.log('📋 Creating audit logs...');

  await prisma.auditLog.createMany({
    data: [
      {
        userId: user1.id,
        action: 'USER_LOGIN',
        resourceType: 'User',
        resourceId: user1.id,
        metadata: { method: 'wallet_signature' },
        ipAddress: '192.168.1.100',
        userAgent: 'Mozilla/5.0...'
      },
      {
        userId: user1.id,
        action: 'SWAP_EXECUTED',
        resourceType: 'Transaction',
        resourceId: transactions[0].id,
        metadata: { fromToken: 'ETH', toToken: 'USDC', amount: 1.5 },
        ipAddress: '192.168.1.100'
      },
      {
        userId: admin.id,
        action: 'CONFIG_UPDATED',
        resourceType: 'SystemConfig',
        resourceId: 'maintenance_mode',
        metadata: { oldValue: true, newValue: false },
        ipAddress: '192.168.1.1'
      }
    ]
  });

  console.log(`✅ Created audit logs\n`);

  console.log('✅ Database seed completed successfully!\n');

  // Print summary
  console.log('📊 Summary:');
  console.log(`   Users: ${await prisma.user.count()}`);
  console.log(`   Transactions: ${await prisma.transaction.count()}`);
  console.log(`   Portfolios: ${await prisma.portfolio.count()}`);
  console.log(`   Portfolio Assets: ${await prisma.portfolioAsset.count()}`);
  console.log(`   Price History: ${await prisma.priceHistory.count()}`);
  console.log(`   Gas History: ${await prisma.gasHistory.count()}`);
  console.log(`   Notifications: ${await prisma.notification.count()}`);
  console.log(`   System Config: ${await prisma.systemConfig.count()}`);
  console.log(`   Audit Logs: ${await prisma.auditLog.count()}`);
  console.log('');
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error('❌ Error seeding database:', e);
    await prisma.$disconnect();
    process.exit(1);
  });
