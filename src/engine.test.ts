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
  })

  it('容量切れのサーバーを配送先にしない', () => {
    const result = deliver('bob@example.local', [{ priority: 10, hostname: online.hostname }], [{ ...online, used: 5 }])
    expect(result.success).toBe(false)
  })
})
