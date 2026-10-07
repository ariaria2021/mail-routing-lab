export type Server = {
  hostname: string
  online: boolean
  capacity: number
  used: number
}

export type MxRecord = { priority: number; hostname: string }

export type Mail = {
  id: string
  from: string
  to: string
  subject: string
  body: string
  deliveredAt: string
  folder: 'inbox' | 'spam'
}

export type AuthConfig = {
  spfAuthorized: boolean
  dkimSigningEnabled: boolean
  dmarcPolicy: 'none' | 'quarantine' | 'reject'
}

export type AuthenticationResult = {
  spf: 'pass' | 'fail'
  dkim: 'pass' | 'fail'
  dmarc: 'pass' | 'fail'
  destination: 'inbox' | 'spam'
}

export type DeliveryResult = {
  success: boolean
  logs: string[]
  steps: DeliveryStep[]
  usedServer?: string
  error?: string
  authentication?: AuthenticationResult
  destination?: 'inbox' | 'spam'
}

export type DeliveryStep = {
  kind: 'sender' | 'dns-query' | 'mx-attempt' | 'rejected' | 'smtp-accepted' | 'auth-spf' | 'auth-dkim' | 'auth-dmarc' | 'quarantined' | 'delivered' | 'failed'
  message: string
  hostname?: string
  priority?: number
  reason?: 'not-found' | 'offline' | 'full'
}

export function domainOf(address: string): string | null {
  const at = address.lastIndexOf('@')
  if (at < 1 || at === address.length - 1) return null
  return address.slice(at + 1).toLowerCase()
}

export function deliver(
  recipient: string,
  records: MxRecord[],
  servers: Server[],
  authConfig?: AuthConfig,
): DeliveryResult {
  const domain = domainOf(recipient)
  const steps: DeliveryStep[] = [{ kind: 'sender', message: `配送開始: ${recipient}` }]
  const result = (success: boolean, options: Omit<DeliveryResult, 'success' | 'logs' | 'steps'> = {}): DeliveryResult => ({
    success,
    steps,
    logs: steps.map((step) => step.message),
    ...options,
  })
  if (!domain) {
    const error = '宛先メールアドレスの形式が正しくありません。'
    steps.push({ kind: 'failed', message: error })
    return result(false, { error })
  }
  steps.push({ kind: 'dns-query', message: `DNSに ${domain} の MX レコードを問い合わせました。` })
  if (records.length === 0) {
    const error = 'MX レコードが見つかりません。'
    steps.push({ kind: 'failed', message: error })
    return result(false, { error })
  }

  for (const record of [...records].sort((a, b) => a.priority - b.priority)) {
    steps.push({ kind: 'mx-attempt', hostname: record.hostname, priority: record.priority, message: `優先度 ${record.priority}: ${record.hostname} へ SMTP 接続を試行。` })
    const server = servers.find((candidate) => candidate.hostname === record.hostname)
    if (!server) {
      steps.push({ kind: 'rejected', hostname: record.hostname, reason: 'not-found', message: `${record.hostname} は解決できませんでした。` })
      continue
    }
    if (!server.online) {
      steps.push({ kind: 'rejected', hostname: record.hostname, reason: 'offline', message: `${record.hostname} は停止中です。次の MX を試します。` })
      continue
    }
    if (server.used >= server.capacity) {
      steps.push({ kind: 'rejected', hostname: record.hostname, reason: 'full', message: `${record.hostname} のメールボックス容量が不足しています。` })
      const error = '受信者のメールボックスが満杯です。容量を増やしてから再送してください。'
      steps.push({ kind: 'failed', message: error })
      return result(false, { error })
    }
    steps.push({ kind: 'smtp-accepted', hostname: record.hostname, message: 'SMTP: MAIL FROM → RCPT TO → DATA' })
    if (authConfig) {
      const spf = authConfig.spfAuthorized ? 'pass' : 'fail'
      const dkim = authConfig.dkimSigningEnabled ? 'pass' : 'fail'
      const dmarc = spf === 'pass' || dkim === 'pass' ? 'pass' : 'fail'
      steps.push({ kind: 'auth-spf', message: `SPF: ${spf === 'pass' ? '送信サーバーを許可しました。' : '送信サーバーが許可されていません。'}` })
      steps.push({ kind: 'auth-dkim', message: `DKIM: ${dkim === 'pass' ? '署名を検証できました。' : '有効な署名を検証できません。'}` })
      steps.push({ kind: 'auth-dmarc', message: `DMARC: ${dmarc === 'pass' ? 'SPF または DKIM が成功しました。' : `認証に失敗し、ポリシー ${authConfig.dmarcPolicy} を適用します。`}` })
      const authentication: AuthenticationResult = { spf, dkim, dmarc, destination: 'inbox' }
      if (dmarc === 'fail' && authConfig.dmarcPolicy === 'reject') {
        const error = 'DMARC ポリシーによりメールを拒否しました。'
        steps.push({ kind: 'failed', message: error })
        return result(false, { error, authentication })
      }
      if (dmarc === 'fail' && authConfig.dmarcPolicy === 'quarantine') {
        authentication.destination = 'spam'
        steps.push({ kind: 'quarantined', message: 'DMARC により迷惑メール箱へ隔離しました。' })
        return result(true, { usedServer: server.hostname, authentication, destination: 'spam' })
      }
      steps.push({ kind: 'delivered', hostname: record.hostname, message: `${record.hostname} がメールを受理しました。配送成功。` })
      return result(true, { usedServer: server.hostname, authentication, destination: 'inbox' })
    }
    steps.push({ kind: 'delivered', hostname: record.hostname, message: `${record.hostname} がメールを受理しました。配送成功。` })
    return result(true, { usedServer: server.hostname, destination: 'inbox' })
  }
  const error = '利用可能な SMTP サーバーがありません。'
  steps.push({ kind: 'failed', message: error })
  return result(false, { error })
}
