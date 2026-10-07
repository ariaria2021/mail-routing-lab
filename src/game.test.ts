import { describe, expect, it } from 'vitest'
import { isStageClear, stageSetup } from './game'

describe('stageSetup', () => {
  it('フェイルオーバーステージは主系・予備系の MX を優先度順に用意する', () => {
    expect(stageSetup(2).records).toEqual([
      { priority: 10, hostname: 'mail.example.local' },
      { priority: 20, hostname: 'backup.example.local' },
    ])
    expect(stageSetup(2).servers[0].online).toBe(false)
  })

  it('各ステージは指定された受信サーバーと配信先でのみクリアになる', () => {
    expect(isStageClear(2, { success: true, usedServer: 'mail.example.local', destination: 'inbox', logs: [], steps: [] })).toBe(false)
    expect(isStageClear(2, { success: true, usedServer: 'backup.example.local', destination: 'inbox', logs: [], steps: [] })).toBe(true)
  })

  it('認証ステージは SPF・DKIM・DMARC を順に扱う', () => {
    expect(stageSetup(4).authFocus).toBe('spf')
    expect(stageSetup(5).authFocus).toBe('dkim')
    expect(stageSetup(6).expectedDestination).toBe('spam')
  })
})
