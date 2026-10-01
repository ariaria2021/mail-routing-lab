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
}

export type DeliveryResult = {
  success: boolean
  logs: string[]
  usedServer?: string
  error?: string
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
): DeliveryResult {
  const domain = domainOf(recipient)
  const logs = [`配送開始: ${recipient}`]
  if (!domain) return { success: false, logs, error: '宛先メールアドレスの形式が正しくありません。' }
  logs.push(`DNSに ${domain} の MX レコードを問い合わせました。`)
  if (records.length === 0) return { success: false, logs, error: 'MX レコードが見つかりません。' }

  for (const record of [...records].sort((a, b) => a.priority - b.priority)) {
    logs.push(`優先度 ${record.priority}: ${record.hostname} へ SMTP 接続を試行。`)
    const server = servers.find((candidate) => candidate.hostname === record.hostname)
    if (!server) {
      logs.push(`${record.hostname} は解決できませんでした。`)
      continue
    }
    if (!server.online) {
      logs.push(`${record.hostname} は停止中です。次の MX を試します。`)
      continue
    }
    if (server.used >= server.capacity) {
      logs.push(`${record.hostname} のメールボックス容量が不足しています。`)
      continue
    }
    logs.push(`SMTP: MAIL FROM → RCPT TO → DATA`)
    logs.push(`${record.hostname} がメールを受理しました。配送成功。`)
    return { success: true, logs, usedServer: server.hostname }
  }
  return { success: false, logs, error: '利用可能な SMTP サーバーがありません。' }
}
