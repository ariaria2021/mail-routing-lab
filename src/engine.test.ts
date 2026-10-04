import { describe, expect, it } from 'vitest'
import { deliver, domainOf, type Server } from './engine'

const online: Server = { hostname: 'mail.example.local', online: true, capacity: 5, used: 0 }

describe('domainOf', () => {
  it('メールアドレスからドメインを取り出す', () => {
    expect(domainOf('bob@Example.Local')).toBe('example.local')
  })
})

describe('deliver', () => {
  it('MX がないと配送に失敗する', () => {
    expect(deliver('bob@example.local', [], [online]).error).toBe('MX レコードが見つかりません。')
  })

  it('優先度順に稼働中のサーバーへ配送する', () => {
    const result = deliver('bob@example.local', [
      { priority: 10, hostname: 'offline.example.local' },
      { priority: 20, hostname: 'mail.example.local' },
    ], [online])
    expect(result.success).toBe(true)
    expect(result.usedServer).toBe('mail.example.local')
    expect(result.steps.map((step) => step.kind)).toEqual([
      'sender', 'dns-query', 'mx-attempt', 'rejected', 'mx-attempt', 'smtp-accepted', 'delivered',
    ])
    expect(result.steps[3]).toMatchObject({ hostname: 'offline.example.local', reason: 'not-found' })
  })

  it('容量切れのサーバーを配送先にしない', () => {
    const result = deliver('bob@example.local', [{ priority: 10, hostname: online.hostname }], [{ ...online, used: 5 }])
    expect(result.success).toBe(false)
    expect(result.steps.at(-2)).toMatchObject({ kind: 'rejected', reason: 'full', hostname: online.hostname })
    expect(result.steps.at(-1)).toMatchObject({ kind: 'failed' })
  })

  it('メールボックス容量不足では予備 MX へ切り替えず、再送を求める', () => {
    const result = deliver('bob@example.local', [
      { priority: 10, hostname: 'mail.example.local' },
      { priority: 20, hostname: 'backup.example.local' },
    ], [
      { ...online, used: 5 },
      { hostname: 'backup.example.local', online: true, capacity: 5, used: 0 },
    ])
    expect(result.success).toBe(false)
    expect(result.steps.some((step) => step.hostname === 'backup.example.local')).toBe(false)
    expect(result.error).toContain('再送')
  })
})
