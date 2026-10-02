import './style.css'
import { deliver, type Mail, type MxRecord, type Server } from './engine'
import { isStageClear, stageSetup, type StageNumber } from './game'

type GameState = { stage: StageNumber; cleared: boolean; records: MxRecord[]; servers: Server[]; inbox: Mail[]; logs: string[]; lastError?: string }
const storageKey = 'mail-routing-lab-state'

function newState(stage: StageNumber = 1): GameState {
  const setup = stageSetup(stage)
  return { stage, cleared: false, records: setup.records, servers: setup.servers, inbox: [], logs: [setup.log] }
}
function load(): GameState {
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey) ?? '') as Partial<GameState>
    return typeof saved.stage === 'number' && typeof saved.cleared === 'boolean' ? saved as GameState : newState()
  } catch { return newState() }
}
let state = load()
const app = document.querySelector<HTMLDivElement>('#app')!
const save = () => localStorage.setItem(storageKey, JSON.stringify(state))
const escape = (value: string) => value.replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[char]!)

function render() {
  const setup = stageSetup(state.stage)
  const finalClear = state.stage === 3 && state.cleared
  app.innerHTML = `
    <header><p class="eyebrow">DNS × SMTP simulation game</p><h1>Mail Routing Lab</h1><p class="lede">メールを正しい受信サーバーへ届けよう。</p></header>
    <main>
      <section class="mission ${state.cleared ? 'done' : ''}">
        <span>${state.cleared ? (finalClear ? '★ GAME CLEAR' : '✓ STAGE CLEAR') : setup.title}</span>
        <strong>${state.cleared ? (finalClear ? '3つの障害を解決し、メール配送網を復旧しました。' : `${setup.objective} を達成しました。`) : setup.objective}</strong>
        <p>${setup.hint}</p>${state.cleared && !finalClear ? '<button id="next-stage">次のミッションへ</button>' : ''}
      </section>
      <div class="grid">
        <section class="panel"><h2>DNS Zone: example.local</h2><p class="hint">数が小さい MX から順に配送先として試します。</p>
          <form id="mx-form" class="stack"><div id="mx-fields">${state.records.map((record, index) => `<div class="mx-row"><label>優先度 <input name="priority-${index}" type="number" min="0" value="${record.priority}" required /></label><label>配送先ホスト <input name="hostname-${index}" value="${escape(record.hostname)}" required /></label></div>`).join('')}</div><div class="actions"><button>MX レコードを保存</button><button type="button" class="secondary" id="add-mx">MX を追加</button></div></form>
          <ul class="records">${state.records.map((record) => `<li><b>${record.priority}</b> ${escape(record.hostname)}</li>`).join('')}</ul></section>
        <section class="panel"><h2>SMTP サーバー</h2><div class="servers">${state.servers.map((server, index) => `<article class="server ${server.online ? '' : 'offline'}"><div><strong>${escape(server.hostname)}</strong><small>${server.online ? '稼働中' : '停止中'} · ${server.used}/${server.capacity} 通</small></div><div class="actions"><button class="secondary" data-toggle="${index}">${server.online ? '停止' : '起動'}</button><button class="secondary" data-expand="${index}">容量 +1</button></div></article>`).join('')}</div></section>
        <section class="panel compose"><h2>メールを送る</h2><form id="mail-form" class="stack"><label>From <input name="from" type="email" value="alice@post.local" required /></label><label>To <input name="to" type="email" value="bob@example.local" required /></label><label>件名 <input name="subject" value="接続テスト" required /></label><label>本文 <textarea name="body" rows="3">こんにちは、配送テストです。</textarea></label><button class="send" ${state.cleared ? 'disabled' : ''}>配送を開始</button></form></section>
        <section class="panel"><h2>配送ログ</h2>${state.lastError ? `<p class="error">失敗: ${escape(state.lastError)}</p>` : ''}<ol class="logs">${state.logs.map((log) => `<li>${escape(log)}</li>`).join('')}</ol></section>
        <section class="panel inbox"><h2>bob の受信ボックス <span>${state.inbox.length}</span></h2>${state.inbox.length ? state.inbox.map((mail) => `<article><strong>${escape(mail.subject)}</strong><small>${escape(mail.from)} → ${escape(mail.to)}</small><p>${escape(mail.body)}</p></article>`).join('') : '<p class="hint">まだメールはありません。</p>'}</section>
      </div>
    </main><footer><button id="reset" class="text-button">ゲームを最初からやり直す</button></footer>`
  bindEvents()
}

function bindEvents() {
  document.querySelector<HTMLFormElement>('#mx-form')!.addEventListener('submit', (event) => {
    event.preventDefault(); const form = new FormData(event.currentTarget as HTMLFormElement)
    state.records = state.records.map((_, index) => ({ priority: Number(form.get(`priority-${index}`)), hostname: String(form.get(`hostname-${index}`)).trim().toLowerCase() }))
    state.logs = ['MX レコードを保存しました。メールを送って配送を確認しましょう。']; state.lastError = undefined; save(); render()
  })
  document.querySelector<HTMLButtonElement>('#add-mx')!.addEventListener('click', () => { state.records.push({ priority: 20, hostname: 'backup.example.local' }); save(); render() })
  document.querySelectorAll<HTMLButtonElement>('[data-toggle]').forEach((button) => button.addEventListener('click', () => {
    const server = state.servers[Number(button.dataset.toggle)]; server.online = !server.online; state.logs = [`${server.hostname} を${server.online ? '起動' : '停止'}しました。`]; save(); render()
  }))
  document.querySelectorAll<HTMLButtonElement>('[data-expand]').forEach((button) => button.addEventListener('click', () => {
    const server = state.servers[Number(button.dataset.expand)]; server.capacity += 1; state.logs = [`${server.hostname} の容量を ${server.capacity} 通に増やしました。`]; save(); render()
  }))
  document.querySelector<HTMLFormElement>('#mail-form')!.addEventListener('submit', (event) => {
    event.preventDefault(); const data = new FormData(event.currentTarget as HTMLFormElement); const to = String(data.get('to')).trim().toLowerCase(); const result = deliver(to, state.records, state.servers)
    state.logs = result.logs; state.lastError = result.error
    if (result.success && result.usedServer) {
      state.servers.find((server) => server.hostname === result.usedServer)!.used += 1
      state.inbox.unshift({ id: crypto.randomUUID(), from: String(data.get('from')), to, subject: String(data.get('subject')), body: String(data.get('body')), deliveredAt: new Date().toISOString() })
      if (isStageClear(state.stage, result.usedServer)) { state.cleared = true; state.logs.push(`${stageSetup(state.stage).title} クリア！`) }
    }
    save(); render()
  })
  document.querySelector<HTMLButtonElement>('#next-stage')?.addEventListener('click', () => { state = newState((state.stage + 1) as StageNumber); save(); render() })
  document.querySelector<HTMLButtonElement>('#reset')!.addEventListener('click', () => { state = newState(); save(); render() })
}
render()
