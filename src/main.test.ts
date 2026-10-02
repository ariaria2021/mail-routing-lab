import { beforeEach, describe, expect, it, vi } from 'vitest'

async function mount() {
  vi.resetModules()
  localStorage.clear()
  document.body.innerHTML = '<div id="app"></div>'
  await import('./main')
}

function submit(selector: string) {
  document.querySelector<HTMLFormElement>(selector)!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
}

describe('ゲーム進行', () => {
  beforeEach(async () => { await mount() })

  it('3つのミッションを操作してゲームクリアできる', () => {
    const mxHost = document.querySelector<HTMLInputElement>('[name="hostname-0"]')!
    mxHost.value = 'mail.example.local'
    submit('#mx-form')
    submit('#mail-form')
    expect(document.body.textContent).toContain('STAGE CLEAR')

    document.querySelector<HTMLButtonElement>('#next-stage')!.click()
    document.querySelector<HTMLButtonElement>('[data-toggle="1"]')!.click()
    submit('#mail-form')
    expect(document.body.textContent).toContain('STAGE CLEAR')
    expect(document.body.textContent).toContain('backup.example.local がメールを受理しました。配送成功。')

    document.querySelector<HTMLButtonElement>('#next-stage')!.click()
    document.querySelector<HTMLButtonElement>('[data-expand="0"]')!.click()
    submit('#mail-form')
    expect(document.body.textContent).toContain('GAME CLEAR')
    expect(document.body.textContent).toContain('mail.example.local がメールを受理しました。配送成功。')
  })
})
