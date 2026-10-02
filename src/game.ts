import type { MxRecord, Server } from './engine'

export type StageNumber = 1 | 2 | 3

export type StageSetup = {
  title: string
  objective: string
  hint: string
  records: MxRecord[]
  servers: Server[]
  expectedServer: string
  log: string
}

export function stageSetup(stage: StageNumber): StageSetup {
  if (stage === 1) return {
    title: 'MISSION 01', objective: '壊れた MX を直してメールを届ける', hint: '正しい受信サーバーは mail.example.local です。',
    records: [{ priority: 10, hostname: 'mail-broken.example.local' }],
    servers: [{ hostname: 'mail.example.local', online: true, capacity: 3, used: 0 }, { hostname: 'backup.example.local', online: false, capacity: 3, used: 0 }],
    expectedServer: 'mail.example.local', log: 'MX レコードを正しい受信サーバーへ向け、bob@example.local に配送しよう。',
  }
  if (stage === 2) return {
    title: 'MISSION 02', objective: '予備 MX へフェイルオーバーする', hint: '主系は停止中です。backup.example.local を起動して配送しよう。',
    records: [{ priority: 10, hostname: 'mail.example.local' }, { priority: 20, hostname: 'backup.example.local' }],
    servers: [{ hostname: 'mail.example.local', online: false, capacity: 3, used: 0 }, { hostname: 'backup.example.local', online: false, capacity: 3, used: 0 }],
    expectedServer: 'backup.example.local', log: '主系の mail.example.local が停止しました。予備 MX を使って配送を復旧しよう。',
  }
  return {
    title: 'MISSION 03', objective: '容量不足を解消してメールを届ける', hint: 'mail.example.local の容量を増やしてから配送しよう。',
    records: [{ priority: 10, hostname: 'mail.example.local' }],
    servers: [{ hostname: 'mail.example.local', online: true, capacity: 1, used: 1 }, { hostname: 'backup.example.local', online: false, capacity: 3, used: 0 }],
    expectedServer: 'mail.example.local', log: '受信サーバーのメールボックスが満杯です。容量を増やして復旧しよう。',
  }
}

export function isStageClear(stage: StageNumber, usedServer: string | undefined): boolean {
  return usedServer === stageSetup(stage).expectedServer
}
