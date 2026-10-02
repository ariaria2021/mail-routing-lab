# Mail Routing Lab

DNS と SMTP によるメール配送を、実ネットワークを使わずに体験するブラウザゲームです。メール事業者として MX レコードを設定し、受信サーバーの状態を管理してメールを届けます。

## 遊び方

3つのミッションを順に解きます。最初は `example.local` の壊れた MX を `mail.example.local` に修正します。次に停止した主系から予備 MX へフェイルオーバーし、最後にメールボックス容量不足を解消します。配送ログで DNS 検索と SMTP 接続の順序を確認できます。

ゲームの状態はブラウザの `localStorage` にだけ保存されます。メール送信、DNS 問い合わせ、外部サーバーとの通信は行いません。

## 開発

```bash
npm ci
npm run dev
```

テストと本番ビルド:

```bash
npm test
npm run build
```

仕様と今後の拡張方針は [docs/specification.md](docs/specification.md) を参照してください。
