/# Soba DEX REST API Guide / Soba DEX REST API ガイド

このドキュメントは、無料公開版 Soba DEX バックエンドが提供する主要RESTエンドポイント、認証要件、代表的なレスポンス形式をまとめた開発者向けガイドです。商用課金・サブスクリプション機能は一切含まれていません。

This document summarises the primary REST endpoints, authentication rules, and representative responses exposed by the free distribution edition of the Soba DEX backend. No paid tiers or subscription mechanisms are provided.

---

## 目次 / Table of Contents

1. [概要とベースURL](#概要とベースurl--base-url)
2. [認証とヘッダー要件](#認証とヘッダー要件--authentication)
3. [共通レスポンスフォーマット](#共通レスポンスフォーマット--common-response-format)
4. [DEX API](#dex-api)
5. [トークンAPI](#トークンapi--token-api)
6. [メトリクスAPI](#メトリクスapi--metrics-api)
7. [ヘルスチェックAPI](#ヘルスチェックapi--health-check-api)
8. [レート制限とエラーハンドリング](#レート制限とエラーハンドリング--rate-limits--errors)
9. [開発者向け補足](#開発者向け補足--developer-notes)

---

## 概要とベースURL / Base URL

- **開発環境 / Development**: `http://localhost:3001`
- **本番例 / Production example**: `https://your-domain.example`

全てのRESTエンドポイントは `/api`、`/health`、`/metrics` の配下で提供されます。

All REST endpoints are provided under `/api`, `/health`, and `/metrics` namespaces.

---

## 認証とヘッダー要件 / Authentication

- 書き込み操作（例: `/api/dex/swap`, `/api/dex/liquidity/add`）は JSON Web Token (JWT) もしくはセッショントークンが必須です。
- 読み取り操作（例: `/api/dex/pools`, `/api/tokens`）は認証無しでも利用できますが、`optionalAuth()` により認証済みリクエストの場合はユーザーコンテキストがサーバ側へ渡されます。

- Mutating operations (e.g. `/api/dex/swap`, `/api/dex/liquidity/add`) require a valid JWT or session token.
- Read-only operations (e.g. `/api/dex/pools`, `/api/tokens`) can be accessed anonymously; when credentials are supplied the server attaches user context via `optionalAuth()`.

**認証ヘッダー例 / Authentication headers**

```http
Authorization: Bearer <access-token>
X-Session-Token: <session-token>
```

---

## 共通レスポンスフォーマット / Common Response Format

成功時 / Success:

```json
{
  "success": true,
  "data": { "...": "payload" },
  "metadata": { "...": "optional" }
}
```

エラー時 / Error:

```json
{
  "success": false,
  "error": "Human readable message",
  "code": "OPTIONAL_MACHINE_CODE"
}
```

---

## DEX API

| メソッド | パス | 説明 / Description | 認証 |
|----------|------|--------------------|------|
| GET | `/api` | 利用可能サービス一覧 / Service index | 任意 / Optional |
| GET | `/api/dex` | DEX機能リンクと統計 | 任意 |
| GET | `/api/dex/pools` | プール一覧とメタデータ | 任意 |
| GET | `/api/dex/pool/:poolId` | 指定プール情報 | 任意 |
| POST | `/api/dex/liquidity/add` | 流動性追加 | 必須 / Required |
| POST | `/api/dex/swap` | スワップ実行 | 必須 |
| GET | `/api/dex/swaps/recent` | 最新スワップ履歴 | 任意 |
| GET | `/api/dex/swaps/stats` | スワップ統計（フィルタ対応） | 任意 |

**POST /api/dex/swap リクエスト例 / Request example**

```json
{
  "tokenIn": "0xTokenA",
  "tokenOut": "0xTokenB",
  "amountIn": 100,
  "slippage": 0.5
}
```

成功レスポンス例 / Response example:

```json
{
  "success": true,
  "data": {
    "id": "swap_12f3b7c8-...",
    "tokenIn": "0xTokenA",
    "tokenOut": "0xTokenB",
    "amountIn": 100,
    "amountOut": 99.4,
    "timestamp": "2025-10-09T04:30:00.000Z"
  }
}
```

---

## トークンAPI / Token API

| Method | Path | 説明 / Description | Auth |
|--------|------|--------------------|------|
| GET | `/api/tokens` | トークン一覧 (ページング対応) | Optional |
| GET | `/api/tokens/list` | キャッシュされたトークンリスト | Optional |
| GET | `/api/tokens/:address` | アドレス指定のトークン詳細 | Optional |

典型レスポンス / Sample response:

```json
{
  "success": true,
  "data": [
    {
      "address": "0x...",
      "symbol": "SOBA",
      "decimals": 18,
      "listedAt": "2025-09-01T00:00:00.000Z"
    }
  ],
  "pagination": {
    "total": 120,
    "page": 1,
    "limit": 25,
    "offset": 0,
    "totalPages": 5,
    "hasNext": true,
    "hasPrev": false
  }
}
```

---

## メトリクスAPI / Metrics API

- `GET /metrics/dex-state`
  - プール数、スワップ統計、スナップショット更新時間を含む状態メトリクス。
  - Includes pool counts, swap metrics, and snapshot timings.
- 追加ヘッダー: `X-Total-Pools`, `X-Total-Swaps`, `X-Total-Pairs` などが付与されます。

---

## ヘルスチェックAPI / Health Check API

| メソッド | パス | 説明 / Description |
|----------|------|--------------------|
| GET | `/health` | 基本ヘルスチェック / Basic status |
| GET | `/health/detailed` | 依存サービス詳細 / Detailed status |
| GET | `/health/ready` | レディネス判定 / Readiness probe |
| GET | `/health/live` | ライブネス判定 / Liveness probe |

`/health/detailed` では DB、キャッシュ、エラーログ統計をまとめて返します。

`/health/detailed` aggregates database, cache, and error statistics.

---

## レート制限とエラーハンドリング / Rate Limits & Errors

- デフォルトのレート制限: 1分あたり100リクエスト（環境変数 `RATE_LIMIT_MAX` で調整可能）。
- 429応答時は `Retry-After` ヘッダーが返却されます。
- すべてのエラーは構造化ロガー経由で記録され、認証済みユーザーの場合 `productionLogger.logRequest()` がユーザーIDと匿名化済みメールを付与します。

- Default limit: 100 requests/minute (configurable via `RATE_LIMIT_MAX`).
- `Retry-After` header is present on 429 responses.
- Structured logging captures each request; authenticated calls include user identifiers with sensitive fields sanitised.

---

## 開発者向け補足 / Developer Notes

- エンドポイント定義は `backend/src/routes/` に実装されています。
- ビジネスロジックは `backend/src/services/`、状態管理は `services/dexState.js` に記録されます。
- 無料公開方針に基づき、有償サポートおよび専用SLAは提供しません。セルフサポートは `README.md`・`ENTERPRISE_GUIDE.md` を参照してください。

- Route definitions reside in `backend/src/routes/`.
- Core business logic and state persistence live in `backend/src/services/`.
- In line with the free distribution policy, no paid support or dedicated SLA is available. Refer to `README.md` and `ENTERPRISE_GUIDE.md` for self-service guidance.

---

最終更新日 / Last updated: 2025年10月09日

