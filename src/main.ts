import './style.css'
import { deliver, type Mail, type MxRecord, type Server } from './engine'

type GameState = {
  records: MxRecord[]
  servers: Server[]
  inbox: Mail[]
  logs: string[]
  lastError?: string
}

const storageKey = 'mail-routing-lab-state'
const initialState = (): GameState => ({
  records: [{ priority: 10, hostname: 'mail-broken.example.local' }],
  servers: [
    { hostname: 'mail.example.local', online: true, capacity: 3, used: 0 },
    { hostname: 'backup.example.local', online: false, capacity: 3, used: 0 },
  ],
  inbox: [],
  logs: ['ミッション 1: example.local の MX を正しい受信サーバーへ向け、bob@example.local に配送しよう。'],
})

function load(): GameState {
  try {
    const saved = localStorage.getItem(storageKey)
    return saved ? JSON.parse(saved) as GameState : initialState()
  } catch {
    return initialState()
  }
}

let state = load()
const app = document.querySelector<HTMLDivElement>('#app')!

function save() {
  localStorage.setItem(storageKey, JSON.stringify(state))
}

function escape(value: string) {
  return value.replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[character]!)
}

function render() {
  const missionDone = state.inbox.length > 0
  app.innerHTML = `
    <header>
      <p class="eyebrow">DNS × SMTP simulation game</p>
      <h1>Mail Routing Lab</h1>
      <p class="lede">メールを正しい受信サーバーへ届けよう。</p>
    </header>
    <main>
      <section class="mission ${missionDone ? 'done' : ''}">
        <span>${missionDone ? '✓ クリア' : 'MISSION 01'}</span>
        <strong>${missionDone ? 'メールを配送できました。次は予備MXを試そう。' : 'bob@example.local にメールを届ける'}</strong>
        <p>正しい受信サーバーは <code>mail.example.local</code> です。</p>
      </section>
      <div class="grid">
        <section class="panel">
          <h2>DNS Zone: example.local</h2>
          <p class="hint">MX レコードは「このドメイン宛メールの配送先」を表します。数が小さいほど優先されます。</p>
          <form id="mx-form" class="stack">
            <label>優先度 <input name="priority" type="number" min="0" value="${state.records[0]?.priority ?? 10}" required /></label>
            <label>配送先ホスト <input name="hostname" value="${escape(state.records[0]?.hostname ?? '')}" placeholder="mail.example.local" required /></label>
            <button>MX レコードを保存</button>
          </form>
          <ul class="records">${state.records.map((record) => `<li><b>${record.priority}</b> ${escape(record.hostname)}</li>`).join('')}</ul>
        </section>
        <section class="panel">
          <h2>SMTP サーバー</h2>
          <div class="servers">${state.servers.map((server, index) => `
            <article class="server ${server.online ? '' : 'offline'}">
              <div><strong>${escape(server.hostname)}</strong><small>${server.online ? '稼働中' : '停止中'} · ${server.used}/${server.capacity} 通</small></div>
              <button class="secondary" data-toggle="${index}">${server.online ? '停止' : '起動'}</button>
            </article>`).join('')}</div>
        </section>
        <section class="panel compose">
          <h2>メールを送る</h2>
          <form id="mail-form" class="stack">
            <label>From <input name="from" type="email" value="alice@post.local" required /></label>
            <label>To <input name="to" type="email" value="bob@example.local" required /></label>
            <label>件名 <input name="subject" value="接続テスト" required /></label>
            <label>本文 <textarea name="body" rows="3">こんにちは、配送テストです。</textarea></label>
            <button class="send">配送を開始</button>
          </form>
        </section>
        <section class="panel">
          <h2>配送ログ</h2>
          ${state.lastError ? `<p class="error">失敗: ${escape(state.lastError)}</p>` : ''}
          <ol class="logs">${state.logs.map((log) => `<li>${escape(log)}</li>`).join('')}</ol>
        </section>
        <section class="panel inbox">
          <h2>bob の受信ボックス <span>${state.inbox.length}</span></h2>
          ${state.inbox.length ? state.inbox.map((mail) => `<article><strong>${escape(mail.subject)}</strong><small>${escape(mail.from)} → ${escape(mail.to)}</small><p>${escape(mail.body)}</p></article>`).join('') : '<p class="hint">まだメールはありません。</p>'}
        </section>
      </div>
    </main>
    <footer><button id="reset" class="text-button">ゲームを最初からやり直す</button></footer>
  `
  bindEvents()
}

function bindEvents() {
  document.querySelector<HTMLFormElement>('#mx-form')!.addEventListener('submit', (event) => {
    event.preventDefault()
    const data = new FormData(event.currentTarget as HTMLFormElement)
    state.records = [{ priority: Number(data.get('priority')), hostname: String(data.get('hostname')).trim().toLowerCase() }]
    state.logs = ['MX レコードを保存しました。メールを送って配送を確認しましょう。']
    state.lastError = undefined
    save(); render()
  })
  document.querySelectorAll<HTMLButtonElement>('[data-toggle]').forEach((button) => button.addEventListener('click', () => {
    const server = state.servers[Number(button.dataset.toggle)]
    server.online = !server.online
    state.logs = [`${server.hostname} を${server.online ? '起動' : '停止'}しました。`]
    save(); render()
  }))
  document.querySelector<HTMLFormElement>('#mail-form')!.addEventListener('submit', (event) => {
    event.preventDefault()
    const data = new FormData(event.currentTarget as HTMLFormElement)
    const to = String(data.get('to')).trim().toLowerCase()
    const result = deliver(to, state.records, state.servers)
    state.logs = result.logs
    state.lastError = result.error
    if (result.success && result.usedServer) {
      const server = state.servers.find((candidate) => candidate.hostname === result.usedServer)!
      server.used += 1
      state.inbox.unshift({ id: crypto.randomUUID(), from: String(data.get('from')), to, subject: String(data.get('subject')), body: String(data.get('body')), deliveredAt: new Date().toISOString() })
    }
    save(); render()
  })
  document.querySelector<HTMLButtonElement>('#reset')!.addEventListener('click', () => {
    state = initialState(); save(); render()
  })
}

render()
