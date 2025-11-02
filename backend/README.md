# Soba DEX Backend / Soba DEXバックエンド

## Overview / 概要
- **[English]** Hardened Node.js REST API for swap simulation, token discovery, and health monitoring with low operational overhead.
- **[日本語]** スワップシミュレーション、トークン情報、ヘルス監視を低コストで提供する堅牢なNode.js製REST APIです。

## Feature Highlights / 主な特徴
- **[Security / セキュリティ]** `utils/secureAuth.js` がJWT強制検証を実施し、`middleware/security.js` がHelmetヘッダー・IPブロック・入力サニタイズ・HTTPS強制を提供します。
- **[Performance / 性能]** `middleware/cache.js` によるNodeCache活用、`database/pool.js` の効率的なPostgreSQLプール、`app.js` のgzip圧縮とリクエスト上限制御を備えます。
- **[Observability / 可観測性]** `utils/lifecycle.js` の状態管理、`utils/productionLogger.js` の構造化ログ、`routes/health.js` の詳細ヘルス診断で運用可視性を確保します。
- **[Maintainability / 保守性]** `utils/configValidator.js` が起動時に環境変数の整合性を検証し、警告とエラーを記録します。

## Quick Start / クイックスタート
### Development / 開発
- **[Install / インストール]**
  ```bash
  npm install
  ```
- **[Configure / 設定]**
  ```bash
  # macOS / Linux
  cp .env.example .env
  # Windows PowerShell
  Copy-Item .env.example .env
  ```
- **[Run / 実行]**
  ```bash
  npm run dev
  ```

### Production / 本番
- **[Node.js]**
  ```bash
  NODE_ENV=production npm start
  ```
- **[PM2]**
  ```bash
  pm2 start ecosystem.config.js --env production
  pm2 monit
  ```
- **[Docker]**
  ```bash
  docker-compose up -d
  ```

## Configuration / 設定
- **[NODE_ENV]** `development` / `production` / `test` (default `development`).
- **[PORT / HOST]** HTTPリスン設定。既定値 `3001` / `0.0.0.0`。
- **[JWT_SECRET]** 32文字以上の強力なシークレット。弱い値は起動時に拒否されます。
- **[CORS_ORIGINS / CORS_HTTP_WHITELIST]** `middleware/cors.js` が本番のHTTPSオリジンと開発用HTTPホストを検証します。
- **[RATE_LIMIT_MAX / RATE_LIMIT_WINDOW_MS]** `/api/`配下のレート制限。`app.js` 内 `rateLimitBypassPaths` により `/health*` は常に許可されます。
- **[REQUEST_BODY_LIMIT_BYTES]** JSONボディ上限 (default 102400 bytes)。
- **[ENFORCE_HTTPS]** `true` でGET/HEADリクエストをHTTPSにリダイレクト。他メソッドは403。
- **[SERVER_KEEP_ALIVE_TIMEOUT_MS / SERVER_HEADERS_TIMEOUT_MS / SERVER_REQUEST_TIMEOUT_MS]** HTTPサーバーのタイムアウト制御。
- **[REQUEST_ID_TRUST_HEADER / X_REQUEST_ID_HEADER]** `middleware/requestContext.js` が相関IDを設定します。
- **[LOG_LEVEL / LOG_DIR]** `productionLogger` のログ出力レベルと保存先。

## API Endpoints / APIエンドポイント
### Metadata / メタデータ
- **[GET `/`]** サービス概要、利用可能なエンドポイント、レート制限、CORS設定を返却します。
- **[GET `/api`]** 機械可読なAPIカタログを返却します。

### Health / ヘルスチェック
- **[GET `/health`]** `lifecycle.getStatus()` に基づくサービス状態。
- **[GET `/health`]** ではDEX統計サマリー (プール数、スワップ回数、ペア数、最終スワップ時刻) も提供します。
- **[GET `/health/detailed`]** DB接続、キャッシュ統計、エラースタッツ、ライフサイクル履歴を返却します。
- **[GET `/health/detailed`]** は `services.dex` セクションでスワップ統計および上位ペアを返します。
- **[GET `/health/ready`]** DBヘルスとシャットダウン状態を確認するレディネスプローブ。
- **[GET `/health/live`]** サービスの生存確認。

### DEX Core / DEXコア
- **[GET `/api/dex/pool/:poolId`]** プール情報を取得し、短期キャッシュします。
- **[GET `/api/dex/pools`]** 登録済みプールのスナップショット一覧を返却します。
- **[POST `/api/dex/swap`]** バリデーション済み模擬スワップを作成し、履歴と統計を更新します。
- **[POST `/api/dex/liquidity/add`]** 流動性情報を登録し、プール状態を更新します。
- **[GET `/api/dex/swaps/recent`]** 直近最大50件のスワップ履歴を降順で返却します (デフォルト20件)。
- **[GET `/api/dex/swaps/stats`]** トークンペア別の集計統計 (回数・合計・平均など) を返却し、クエリでフィルタ可能です。
- **[State Persistence / 状態永続化]** `services/dexState.js` が `services/dataStore.js` を用いてプールとスワップ履歴をディスクへスナップショット保存し、再起動後に復元します。

### Tokens / トークン
- **[GET `/api/tokens`]** ページング対応のトークン一覧。`validatePagination()` を適用します。
- **[GET `/api/tokens/:address`]** アドレス指定トークン情報を返却します。
- **[GET `/api/tokens/list`]** キャッシュ付きのトークンリストを返却します。

## Operations & Observability / 運用と可視化
- **[Logging / ログ]** `productionLogger.logRequest()` が相関ID、所要時間、クライアント情報を構造化JSONで記録し、ファイルローテーションを行います。
- **[Lifecycle / ライフサイクル]** `utils/lifecycle.js` が状態遷移履歴を保持し、`server-final.js` のヘルス判定やシャットダウン手順を支援します。
- **[Graceful Shutdown / 優雅な停止]** `server-final.js` の `shutdown()` がHTTPサーバー、DBプール、トークン管理の順に停止し、タイムアウト時は強制終了します。
- **[Rate Limiting / レート制限]** `/health*` ルートは無制限で、その他の `/api/` ルートはHTTP 429と`Retry-After`ヘッダーでバックオフを指示します。
- **[Swap Metrics / スワップ統計]** `GET /api/dex/swaps/stats` がペア別統計を提供し、`X-Swap-Count`・`X-Swap-Pairs` ヘッダーで総件数とペア数を露出します。
- **[Health Integration / ヘルス連携]** `health.js` がDEXサマリーを基本・詳細ヘルス応答に組み込み、`services.dex` で上位ペアとトランザクションダッシュボードの材料を提供します。

## Security Guidance / セキュリティガイダンス
- **[Secret Management / シークレット管理]** `.env` はバージョン管理から除外し、シークレットストアやCI経由で配布します。
- **[Transport Security / 通信安全性]** 本番では `ENFORCE_HTTPS=true` とTLS終端を組み合わせて利用します。
- **[Input Hardening / 入力防御]** `middleware/validation.js` と `middleware/security.js` を通じてサニタイズと型検証を実施します。
- **[Token Hygiene / トークン衛生]** 侵害対応時は `secureAuth.revokeToken()` と `secureAuth.revokeAllUserTokens()` を使用します。

## Troubleshooting / トラブルシューティング
- **[Startup Failure / 起動失敗]** `configValidator` のエラーログを確認し、`.env` の値を修正します。
- **[Database Issues / DB障害]** `/health/detailed` の `services.database` セクションで状態とエラーを確認します。
- **[Cache Effectiveness / キャッシュ効果]** `cacheService.getStats()` を参照し、TTLやキー戦略を再調整します。
- **[Rate Limit Tuning / レート制限調整]** 429レスポンスの `Retry-After` を参考に `RATE_LIMIT_MAX` や `RATE_LIMIT_WINDOW_MS` を更新します。

## Development & Quality / 開発と品質
- **[Lint]** `npm run lint`
- **[Unit Tests]** `npm test`
- **[Coverage]** `npm run test:coverage`
- **[Documentation]** 追加資料は `docs/` ディレクトリ (API, SECURITY, Postmanコレクション) を参照します。

## License / ライセンス
- **MIT License / MITライセンス**