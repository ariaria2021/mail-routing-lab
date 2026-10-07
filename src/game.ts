import type { AuthConfig, DeliveryResult, MxRecord, Server } from './engine'

export type StageNumber = 1 | 2 | 3 | 4 | 5 | 6

export type StageSetup = {
  title: string
  objective: string
  firstPrompt: string
  failureHint: string
  takeaway: string
  nextConcept?: string
  records: MxRecord[]
  servers: Server[]
  expectedServer: string
  log: string
  authConfig?: AuthConfig
  authFocus?: 'spf' | 'dkim' | 'dmarc'
  expectedDestination?: 'inbox' | 'spam'
}

export function stageSetup(stage: StageNumber): StageSetup {
  if (stage === 1) return {
    title: 'MISSION 01', objective: '壊れた MX を直してメールを届ける',
    firstPrompt: 'まずは現在の設定のまま配送を試し、どこで止まるか観察しよう。',
    failureHint: '配送ログの失敗したMX候補を確認し、DNS Zoneの配送先を稼働中のサーバーへ直そう。',
    takeaway: 'MXレコードは、ドメイン宛メールを受け取るサーバー候補を示します。',
    nextConcept: '次は、主系が停止したときの予備MXを扱います。',
    records: [{ priority: 10, hostname: 'mail-broken.example.local' }],
    servers: [{ hostname: 'mail.example.local', online: true, capacity: 3, used: 0 }, { hostname: 'backup.example.local', online: false, capacity: 3, used: 0 }],
    expectedServer: 'mail.example.local', log: 'MX レコードを正しい受信サーバーへ向け、bob@example.local に配送しよう。',
  }
  if (stage === 2) return {
    title: 'MISSION 02', objective: '予備 MX へフェイルオーバーする',
    firstPrompt: 'まず配送し、優先度の高い主系が停止している場合の動きを見よう。',
    failureHint: '主系が到達不能です。予備MXに対応するサーバーを起動し、もう一度配送しよう。',
    takeaway: '優先度の小さいMXから試し、到達不能なら次の候補へ切り替えます。',
    nextConcept: '次は、受信者のメールボックス容量を扱います。',
    records: [{ priority: 10, hostname: 'mail.example.local' }, { priority: 20, hostname: 'backup.example.local' }],
    servers: [{ hostname: 'mail.example.local', online: false, capacity: 3, used: 0 }, { hostname: 'backup.example.local', online: false, capacity: 3, used: 0 }],
    expectedServer: 'backup.example.local', log: '主系の mail.example.local が停止しました。予備 MX を使って配送を復旧しよう。',
  }
  if (stage === 3) return {
    title: 'MISSION 03', objective: '容量不足を解消してメールを届ける',
    firstPrompt: 'まず配送し、受信者のメールボックスが満杯の場合の結果を見よう。',
    failureHint: 'メールボックスが満杯です。容量を増やしてから、同じ宛先へ再送しよう。',
    takeaway: '受信者の容量超過は予備MXで回避せず、容量を直してから再送します。',
    records: [{ priority: 10, hostname: 'mail.example.local' }],
    servers: [{ hostname: 'mail.example.local', online: true, capacity: 1, used: 1 }, { hostname: 'backup.example.local', online: false, capacity: 3, used: 0 }],
    expectedServer: 'mail.example.local', log: '受信サーバーのメールボックスが満杯です。容量を増やして復旧しよう。',
  }
  if (stage === 4) return {
    title: 'MISSION 04', objective: 'SPF で送信サーバーを許可する',
    firstPrompt: 'まず配送し、受信側が送信元を確認できないときの結果を見よう。',
    failureHint: 'SPF カードで、この送信サーバーを post.local の許可リストへ追加しよう。',
    takeaway: 'SPF は、ドメインが許可した送信サーバーかどうかを確認します。',
    nextConcept: '次は、メール本文に付けるDKIM署名を扱います。',
    records: [{ priority: 10, hostname: 'mail.example.local' }],
    servers: [{ hostname: 'mail.example.local', online: true, capacity: 3, used: 0 }, { hostname: 'backup.example.local', online: false, capacity: 3, used: 0 }],
    expectedServer: 'mail.example.local', log: 'post.local の送信サーバーはまだ SPF で許可されていません。',
    authConfig: { spfAuthorized: false, dkimSigningEnabled: false, dmarcPolicy: 'reject' }, authFocus: 'spf', expectedDestination: 'inbox',
  }
  if (stage === 5) return {
    title: 'MISSION 05', objective: 'DKIM 署名を有効化する',
    firstPrompt: 'まず配送し、署名のないメールが受信側でどう判定されるか見よう。',
    failureHint: 'DKIM カードで署名鍵を有効化し、メールが本物だと検証できるようにしよう。',
    takeaway: 'DKIM は、メールが送信後に改ざんされていないことを署名で確認します。',
    nextConcept: '最後は、認証に失敗したメールへのDMARCの扱いを決めます。',
    records: [{ priority: 10, hostname: 'mail.example.local' }],
    servers: [{ hostname: 'mail.example.local', online: true, capacity: 3, used: 0 }, { hostname: 'backup.example.local', online: false, capacity: 3, used: 0 }],
    expectedServer: 'mail.example.local', log: 'このメールには SPF の許可も DKIM 署名もありません。',
    authConfig: { spfAuthorized: false, dkimSigningEnabled: false, dmarcPolicy: 'reject' }, authFocus: 'dkim', expectedDestination: 'inbox',
  }
  return {
    title: 'MISSION 06', objective: 'DMARC で認証失敗メールを隔離する',
    firstPrompt: 'まず配送し、SPF と DKIM の両方に失敗したメールを確認しよう。',
    failureHint: 'DMARC カードで quarantine を選び、認証失敗メールを迷惑メール箱へ隔離しよう。',
    takeaway: 'DMARC は SPF/DKIM の結果を使い、失敗メールをどう扱うかを決めます。',
    records: [{ priority: 10, hostname: 'mail.example.local' }],
    servers: [{ hostname: 'mail.example.local', online: true, capacity: 3, used: 0 }, { hostname: 'backup.example.local', online: false, capacity: 3, used: 0 }],
    expectedServer: 'mail.example.local', log: '認証に失敗したメールを、いまは受信箱へ入れています。',
    authConfig: { spfAuthorized: false, dkimSigningEnabled: false, dmarcPolicy: 'none' }, authFocus: 'dmarc', expectedDestination: 'spam',
  }
}

export function isStageClear(stage: StageNumber, result: DeliveryResult): boolean {
  const setup = stageSetup(stage)
  if (!result.success || result.usedServer !== setup.expectedServer || result.destination !== (setup.expectedDestination ?? 'inbox')) return false
  if (setup.authFocus === 'spf') return result.authentication?.spf === 'pass'
  if (setup.authFocus === 'dkim') return result.authentication?.dkim === 'pass'
  if (setup.authFocus === 'dmarc') return result.authentication?.dmarc === 'fail' && result.destination === 'spam'
  return true
}
