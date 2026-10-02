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

  it('各ステージは指定された受信サーバーへの配送でのみクリアになる', () => {
    expect(isStageClear(2, 'mail.example.local')).toBe(false)
    expect(isStageClear(2, 'backup.example.local')).toBe(true)
  })
})
