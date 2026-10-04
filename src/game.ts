import type { MxRecord, Server } from './engine'

export type StageNumber = 1 | 2 | 3

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
  return {
    title: 'MISSION 03', objective: '容量不足を解消してメールを届ける',
    firstPrompt: 'まず配送し、受信者のメールボックスが満杯の場合の結果を見よう。',
    failureHint: 'メールボックスが満杯です。容量を増やしてから、同じ宛先へ再送しよう。',
    takeaway: '受信者の容量超過は予備MXで回避せず、容量を直してから再送します。',
    records: [{ priority: 10, hostname: 'mail.example.local' }],
    servers: [{ hostname: 'mail.example.local', online: true, capacity: 1, used: 1 }, { hostname: 'backup.example.local', online: false, capacity: 3, used: 0 }],
    expectedServer: 'mail.example.local', log: '受信サーバーのメールボックスが満杯です。容量を増やして復旧しよう。',
  }
}

export function isStageClear(stage: StageNumber, usedServer: string | undefined): boolean {
  return usedServer === stageSetup(stage).expectedServer
}
