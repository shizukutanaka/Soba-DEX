#!/bin/bash
# データベース初期化スクリプト
# Usage: npm run init:db

set -e

echo "🔧 Prisma初期化開始..."

# Prisma Client生成
echo "📦 Prisma Client生成中..."
npx prisma generate

# マイグレーション実行
echo "🗄️ マイグレーション実行中..."
npx prisma migrate deploy

# 接続テスト
echo "✅ データベース接続テスト..."
node -e "
const { prisma } = require('./src/db/prisma');
prisma.\$queryRaw\`SELECT 1\`
  .then(() => {
    console.log('✅ データベース接続成功！');
    process.exit(0);
  })
  .catch((err) => {
    console.error('❌ データベース接続失敗:', err.message);
    process.exit(1);
  });
"

echo "🎉 初期化完了！"
