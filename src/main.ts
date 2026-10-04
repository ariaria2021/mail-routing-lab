import './style.css'
import { deliver, type DeliveryResult, type DeliveryStep, type Mail, type MxRecord, type Server } from './engine'
import { isStageClear, stageSetup, type StageNumber } from './game'

type GameState = { stage: StageNumber; cleared: boolean; records: MxRecord[]; servers: Server[]; inbox: Mail[]; logs: string[]; lastError?: string; lastDelivery?: DeliveryResult }
type MailDraft = Pick<Mail, 'from' | 'to' | 'subject' | 'body'>
type Playback = { result: DeliveryResult; cursor: number; draft?: MailDraft; timer?: ReturnType<typeof setTimeout> }

const storageKey = 'mail-routing-lab-state'
const playbackDelay = 650
let playback: Playback | undefined

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
const reducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false

function stepStatus(step: DeliveryStep | undefined, index: number, cursor: number) {
  if (index < 0 || index > cursor) return 'pending'
  if (index === cursor) return 'active'
  return step?.kind === 'rejected' || step?.kind === 'failed' ? 'failed' : step?.kind === 'delivered' ? 'success' : 'done'
}

function serverStatus(hostname: string, delivery: DeliveryResult | undefined, cursor: number) {
  if (!delivery) return 'pending'
  const indexes = delivery.steps.map((step, index) => ({ step, index })).filter(({ step }) => step.hostname === hostname)
  const latest = indexes.at(-1)
  return latest ? stepStatus(latest.step, latest.index, cursor) : 'pending'
}

function flowNode(label: string, detail: string, status: string) {
  return `<article class="route-node ${status}"><span class="node-dot"></span><small>${escape(detail)}</small><strong>${escape(label)}</strong></article>`
}

function renderRoute() {
  const delivery = playback?.result ?? state.lastDelivery
  const cursor = playback ? playback.cursor : (delivery ? delivery.steps.length - 1 : -1)
  const sender = flowNode('alice@post.local', '送信者', stepStatus(delivery?.steps[0], 0, cursor))
  const dnsIndex = delivery?.steps.findIndex((step) => step.kind === 'dns-query') ?? -1
  const dns = flowNode('DNS', 'MXを照会', stepStatus(delivery?.steps[dnsIndex], dnsIndex, cursor))
  const servers = [...state.records].sort((a, b) => a.priority - b.priority).map((record) => flowNode(record.hostname, `MX 優先度 ${record.priority}`, serverStatus(record.hostname, delivery, cursor)))
  const deliveredIndex = delivery?.steps.findIndex((step) => step.kind === 'delivered') ?? -1
  const receiverStatus = delivery && !delivery.success && cursor === delivery.steps.length - 1 ? 'failed' : stepStatus(delivery?.steps[deliveredIndex], deliveredIndex, cursor)
  const receiver = flowNode('bob の受信箱', '受信者', receiverStatus)
  const currentMessage = cursor >= 0 && delivery ? delivery.steps[cursor]?.message : 'メールを送ると、配送経路がここで再生されます。'
  return `<section class="route-panel" aria-label="配送経路"><div class="route-heading"><div><p class="eyebrow">DELIVERY ROUTE</p><h2>配送経路</h2></div>${delivery && !playback ? '<button class="secondary" id="replay-route">もう一度見る</button>' : ''}</div><div class="route-track">${sender}<span class="route-arrow">→</span>${dns}<span class="route-arrow">→</span>${servers.join('<span class="route-arrow">→</span>')}<span class="route-arrow">→</span>${receiver}</div><p class="route-message" aria-live="polite">${escape(currentMessage ?? '')}</p></section>`
}

function render() {
  const setup = stageSetup(state.stage)
  const finalClear = state.stage === 3 && state.cleared
  const controlsDisabled = playback ? 'disabled' : ''
  app.innerHTML = `
    <header><p class="eyebrow">DNS × SMTP simulation game</p><h1>Mail Routing Lab</h1><p class="lede">メールを正しい受信サーバーへ届けよう。</p></header>
    <main>
      <section class="mission ${state.cleared ? 'done' : ''}">
        <span>${state.cleared ? (finalClear ? '★ GAME CLEAR' : '✓ STAGE CLEAR') : setup.title}</span>
        <strong>${state.cleared ? (finalClear ? '3つの障害を解決し、メール配送網を復旧しました。' : `${setup.objective} を達成しました。`) : setup.objective}</strong>
        <p>${setup.hint}</p>${state.cleared && !finalClear ? '<button id="next-stage">次のミッションへ</button>' : ''}
      </section>
      ${renderRoute()}
      <div class="grid">
        <section class="panel"><h2>DNS Zone: example.local</h2><p class="hint">数が小さい MX から順に配送先として試します。</p>
          <form id="mx-form" class="stack"><div id="mx-fields">${state.records.map((record, index) => `<div class="mx-row"><label>優先度 <input name="priority-${index}" type="number" min="0" value="${record.priority}" required ${controlsDisabled} /></label><label>配送先ホスト <input name="hostname-${index}" value="${escape(record.hostname)}" required ${controlsDisabled} /></label></div>`).join('')}</div><div class="actions"><button ${controlsDisabled}>MX レコードを保存</button><button type="button" class="secondary" id="add-mx" ${controlsDisabled}>MX を追加</button></div></form>
          <ul class="records">${state.records.map((record) => `<li><b>${record.priority}</b> ${escape(record.hostname)}</li>`).join('')}</ul></section>
        <section class="panel"><h2>SMTP サーバー</h2><div class="servers">${state.servers.map((server, index) => `<article class="server ${server.online ? '' : 'offline'}"><div><strong>${escape(server.hostname)}</strong><small>${server.online ? '稼働中' : '停止中'} · ${server.used}/${server.capacity} 通</small></div><div class="actions"><button class="secondary" data-toggle="${index}" ${controlsDisabled}>${server.online ? '停止' : '起動'}</button><button class="secondary" data-expand="${index}" ${controlsDisabled}>容量 +1</button></div></article>`).join('')}</div></section>
        <section class="panel compose"><h2>メールを送る</h2><form id="mail-form" class="stack"><label>From <input name="from" type="email" value="alice@post.local" required ${controlsDisabled} /></label><label>To <input name="to" type="email" value="bob@example.local" required ${controlsDisabled} /></label><label>件名 <input name="subject" value="接続テスト" required ${controlsDisabled} /></label><label>本文 <textarea name="body" rows="3" ${controlsDisabled}>こんにちは、配送テストです。</textarea></label><button class="send" ${state.cleared || playback ? 'disabled' : ''}>${playback ? '配送中…' : '配送を開始'}</button></form></section>
        <section class="panel"><h2>配送ログ</h2>${state.lastError ? `<p class="error">失敗: ${escape(state.lastError)}</p>` : ''}<ol class="logs">${state.logs.map((log) => `<li>${escape(log)}</li>`).join('')}</ol></section>
        <section class="panel inbox"><h2>bob の受信ボックス <span>${state.inbox.length}</span></h2>${state.inbox.length ? state.inbox.map((mail) => `<article><strong>${escape(mail.subject)}</strong><small>${escape(mail.from)} → ${escape(mail.to)}</small><p>${escape(mail.body)}</p></article>`).join('') : '<p class="hint">まだメールはありません。</p>'}</section>
      </div>
    </main><footer><button id="reset" class="text-button">ゲームを最初からやり直す</button></footer>`
  bindEvents()
}

function completePlayback() {
  const completed = playback
  if (!completed) return
  if (completed.timer) clearTimeout(completed.timer)
  playback = undefined
  if (completed.draft) {
    const { result, draft } = completed
    state.lastDelivery = result
    state.logs = result.logs
    state.lastError = result.error
    if (result.success && result.usedServer) {
      state.servers.find((server) => server.hostname === result.usedServer)!.used += 1
      state.inbox.unshift({ id: crypto.randomUUID(), ...draft, deliveredAt: new Date().toISOString() })
      if (isStageClear(state.stage, result.usedServer)) { state.cleared = true; state.logs.push(`${stageSetup(state.stage).title} クリア！`) }
    }
    save()
  }
  render()
}

function startPlayback(result: DeliveryResult, draft?: MailDraft) {
  playback = { result, cursor: 0, draft }
  render()
  if (reducedMotion()) { completePlayback(); return }
  const advance = () => {
    if (!playback) return
    if (playback.cursor >= playback.result.steps.length - 1) { completePlayback(); return }
    playback.cursor += 1
    render()
    playback.timer = setTimeout(advance, playbackDelay)
  }
  playback.timer = setTimeout(advance, playbackDelay)
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
    event.preventDefault(); const data = new FormData(event.currentTarget as HTMLFormElement)
    const draft: MailDraft = { from: String(data.get('from')), to: String(data.get('to')).trim().toLowerCase(), subject: String(data.get('subject')), body: String(data.get('body')) }
    startPlayback(deliver(draft.to, state.records, state.servers), draft)
  })
  document.querySelector<HTMLButtonElement>('#replay-route')?.addEventListener('click', () => { if (state.lastDelivery) startPlayback(state.lastDelivery) })
  document.querySelector<HTMLButtonElement>('#next-stage')?.addEventListener('click', () => { state = newState((state.stage + 1) as StageNumber); save(); render() })
  document.querySelector<HTMLButtonElement>('#reset')!.addEventListener('click', () => { if (playback?.timer) clearTimeout(playback.timer); playback = undefined; state = newState(); save(); render() })
}
render()
