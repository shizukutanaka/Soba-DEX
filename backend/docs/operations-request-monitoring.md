# Request Lifecycle Monitoring Operations Guide / リクエストライフサイクル監視運用ガイド

## 日本語 (Japanese)

### 目的
このドキュメントは、`/api/health` 系エンドポイントと新設された `/api/health/requests` を用いたリクエスト監視の運用手順をまとめたものです。運用担当者が日常的な健全性チェックや障害検知を効率的に実施できるよう設計されています。

### 主要エンドポイント
- **`GET /api/health`**: サービス全体の状態、および `requestLifecycle.stats` を含むサマリを取得します。
- **`GET /api/health/dependencies`**: キャッシュや WebSocket など主要依存関係と `requestLifecycle` の要約を確認します。
- **`GET /healthz`**: 軽量なレディネスチェック。JSON を受理するクライアントには `requestLifecycle` のハイライトを返します。
- **`GET /api/health/requests`**: 詳細なリクエストスナップショット。クエリパラメータで出力内容を制御できます。

### 推奨監視項目
- **`requestLifecycle.stats.errorRate`**: 10% を超えた場合は早急に調査します。
- **`requestLifecycle.stats.longestActiveRequest`**: 30,000ms (30秒) 以上が続く場合、バックエンドのハングや外部依存の遅延が疑われます。
- **`snapshot.activeRequests`**: 200 を上回る場合、スロークエリや外部サービス停滞の兆候です。

### 設定パラメータ
- **`REQUEST_HISTORY_LIMIT`**: 保存するリクエスト履歴件数を制御します。既定は 1000 件です。メモリ節約やレスポンスサイズ削減が必要な場合に調整してください。
- **しきい値環境変数 (`REQUEST_THRESHOLD_*`)**: エラーレートや最長アクティブ時間、アクティブリクエスト数の判定値を変更します。数値以外または 0 以下を設定すると警告ログが出力され、既存値が維持されます。

### `/api/health/requests` クエリ例
```bash
curl -s "https://api.dex-platform.com/api/health/requests?includeHistory=true&historyLimit=10"
```

#### 主なクエリパラメータ
- `active=false`: アクティブリクエスト一覧を省略して応答サイズを削減。
- `slowThresholdMs=2000`: しきい値を 2 秒に変更し、より早期に遅延兆候を検出。
- `includeErrors=false`: エラーサンプルを除外し、主要統計のみを取得。

### アラート運用ガイドライン
- **警告レベル (Warning)**: `errorRate > 5` または `longestActiveRequest > 15000`。担当者に調査依頼。
- **重大レベル (Critical)**: `errorRate > 10` または `longestActiveRequest > 30000` または `activeRequests > 200`。PagerDuty/Slack などで即時通知。

### ダッシュボード連携
1. 運用ツールから `/api/health/requests` を 60 秒間隔で取得。
2. `snapshot.summary.stats` をタイムシリーズで保存し、トレンドを可視化。
3. スローレスポンス検知のため `snapshot.slowRequests.completed` をヒートマップ表示。

### 運用チェックリスト
- **日次**: `errorRate`, `longestActiveRequest` の推移を確認。
- **週次**: `requestLifecycle.summary.historySize` をレビューし、履歴保持量とクリーンアップ設定を調整。
- **障害時**: `recentHistory` を 100 件取得して直近の失敗リクエストを解析。

### ベストプラクティス
- API ゲートウェイや外部監視にも同一閾値でアラートを設定し、重複検知を避ける。
- `includeHistory=true` の利用は必要時に限定し、レスポンスサイズ増大と機密データ露出に注意。
- 監視データは保存期間を設け、個人情報やセッション ID の取り扱いに留意する。

## English (英語)

### Purpose
This guide explains how to operate the request lifecycle monitoring endpoints (`/api/health` family and `/api/health/requests`). It is written for site reliability engineers who need actionable procedures for daily health checks and incident response.

### Key Endpoints
- **`GET /api/health`**: Provides holistic service health together with `requestLifecycle.stats`.
- **`GET /api/health/dependencies`**: Surfaces cache/WebSocket dependency status plus request lifecycle summary.
- **`GET /healthz`**: Lightweight readiness probe; returns a compact `requestLifecycle` highlight when JSON is accepted.
- **`GET /api/health/requests`**: Returns detailed request snapshots with configurable sections via query parameters.

### Recommended Signals
- **`requestLifecycle.stats.errorRate`**: Investigate immediately when it exceeds 10%.
- **`requestLifecycle.stats.longestActiveRequest`**: Durations above 30,000ms indicate potential backend stalls or external latency.
- **`snapshot.activeRequests`**: Counts beyond 200 suggest heavy queuing or blocked workers.

### Configuration Parameters
- **`REQUEST_HISTORY_LIMIT`**: Controls the number of request history entries retained. Default is 1,000. Lower the value to conserve memory or reduce payload sizes when exporting history.
- **Threshold variables (`REQUEST_THRESHOLD_*`)**: Adjust the error-rate, longest-active, and active-request degradation thresholds. Invalid or non-positive values trigger warning logs and the previous configuration remains in effect.

### `/api/health/requests` Examples
```bash
curl -s "https://api.dex-platform.com/api/health/requests?includeHistory=true&historyLimit=10"
```

#### Key Query Parameters
- `active=false`: Exclude the active request list to reduce payload size.
- `slowThresholdMs=2000`: Lower the slow-request threshold to catch latency patterns earlier.
- `includeErrors=false`: Focus on headline statistics without error samples.

### Alerting Guidelines
- **Warning**: `errorRate > 5` or `longestActiveRequest > 15000`. Notify on-call analyst for triage.
- **Critical**: `errorRate > 10`, `longestActiveRequest > 30000`, or `activeRequests > 200`. Trigger immediate PagerDuty/Slack escalation.

### Dashboard Integration
1. Poll `/api/health/requests` every 60 seconds from your monitoring platform.
2. Persist `snapshot.summary.stats` as time-series data for trend analysis.
3. Display `snapshot.slowRequests.completed` as a heatmap to highlight latency clusters.

### Operational Checklist
- **Daily**: Review `errorRate` and `longestActiveRequest` trends.
- **Weekly**: Evaluate `requestLifecycle.summary.historySize` and adjust cleanup thresholds if necessary.
- **During incidents**: Fetch `recentHistory` (e.g., `historyLimit=100`) to inspect the latest failed requests.

### Best Practices
- Align alert thresholds with upstream API gateways to avoid duplicate incident noise.
- Use `includeHistory=true` only when needed to mitigate payload size and sensitive data exposure.
- Maintain retention policies for exported monitoring data and handle user/session identifiers securely.
