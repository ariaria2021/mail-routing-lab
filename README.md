# Mail Routing Lab

DNS と SMTP によるメール配送を、実ネットワークを使わずに体験するブラウザゲームです。メール事業者として MX レコードを設定し、受信サーバーの状態を管理してメールを届けます。

## 遊び方

6つのミッションを順に解きます。前半では MX、フェイルオーバー、容量不足を扱い、後半では SPF、DKIM、DMARC を段階的に学びます。配送経路パネルでは、DNS 検索、SMTP 接続、送信者認証の順序を自動再生できます。

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

仕様と今後の拡張方針は [docs/specification.md](docs/specification.md)、テストの実行・追加方法は [docs/testing.md](docs/testing.md) を参照してください。
