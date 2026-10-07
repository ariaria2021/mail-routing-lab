import './style.css'
import { deliver, type AuthConfig, type DeliveryResult, type DeliveryStep, type Mail, type MxRecord, type Server } from './engine'
import { isStageClear, stageSetup, type StageNumber } from './game'

type MailDraft = Pick<Mail, 'from' | 'to' | 'subject' | 'body'>
type GameState = { stage: StageNumber; cleared: boolean; observedFailure: boolean; records: MxRecord[]; servers: Server[]; inbox: Mail[]; spam: Mail[]; logs: string[]; draft: MailDraft; auth?: AuthConfig; lastError?: string; lastDelivery?: DeliveryResult }
type Playback = { result: DeliveryResult; cursor: number; draft?: MailDraft; timer?: ReturnType<typeof setTimeout> }

const storageKey = 'mail-routing-lab-state'
const playbackDelay = 650
let playback: Playback | undefined

function newState(stage: StageNumber = 1): GameState {
  const setup = stageSetup(stage)
  return { stage, cleared: false, observedFailure: false, records: setup.records, servers: setup.servers, inbox: [], spam: [], logs: [setup.log], draft: { from: 'alice@post.local', to: 'bob@example.local', subject: '接続テスト', body: 'こんにちは、配送テストです。' }, auth: setup.authConfig }
}
function load(): GameState {
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey) ?? '') as Partial<GameState>
    if (typeof saved.stage !== 'number' || typeof saved.cleared !== 'boolean') return newState()
    const defaults = newState(saved.stage as StageNumber)
    return { ...defaults, ...saved, draft: { ...defaults.draft, ...saved.draft } }
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

function flowNode(label: string, detail: string, status: string, extraClass = '') {
  return `<article class="route-node ${status} ${extraClass}"><span class="node-dot"></span><small>${escape(detail)}</small><strong>${escape(label)}</strong></article>`
}

function renderRoute() {
  const setup = stageSetup(state.stage)
  const delivery = playback?.result ?? state.lastDelivery
  const cursor = playback ? playback.cursor : (delivery ? delivery.steps.length - 1 : -1)
  const sender = flowNode(state.draft.from, '送信者', stepStatus(delivery?.steps[0], 0, cursor))
  const dnsIndex = delivery?.steps.findIndex((step) => step.kind === 'dns-query') ?? -1
  const dns = flowNode('DNS', 'MXを照会', stepStatus(delivery?.steps[dnsIndex], dnsIndex, cursor))
  const servers = [...state.records].sort((a, b) => a.priority - b.priority).map((record) => flowNode(record.hostname, `MX 候補・優先度 ${record.priority}`, serverStatus(record.hostname, delivery, cursor), 'route-candidate'))
  const authIndex = delivery?.steps.map((step, index) => ({ step, index })).filter(({ step }) => step.kind === 'auth-spf' || step.kind === 'auth-dkim' || step.kind === 'auth-dmarc').at(-1)?.index ?? -1
  const authResult = delivery?.authentication
  const authNode = setup.authConfig ? flowNode('送信者認証', authResult ? `SPF ${authResult.spf} / DKIM ${authResult.dkim}` : 'SPF・DKIM・DMARC', authResult?.destination === 'spam' ? 'success' : authResult?.dmarc === 'pass' ? 'success' : authResult?.dmarc === 'fail' && cursor >= authIndex ? 'failed' : stepStatus(delivery?.steps[authIndex], authIndex, cursor)) : ''
  const destinationStepIndex = delivery?.steps.findIndex((step) => step.kind === 'delivered' || step.kind === 'quarantined') ?? -1
  const receiverStatus = delivery && !delivery.success && cursor === delivery.steps.length - 1 ? 'failed' : stepStatus(delivery?.steps[destinationStepIndex], destinationStepIndex, cursor)
  const receiver = flowNode(delivery?.destination === 'spam' ? '迷惑メール箱' : 'bob の受信箱', delivery?.destination === 'spam' ? '隔離先' : '受信者', receiverStatus)
  const currentMessage = cursor >= 0 && delivery ? delivery.steps[cursor]?.message : 'メールを送ると、配送経路がここで再生されます。'
  return `<section class="route-panel" aria-label="配送経路"><div class="route-heading"><div><p class="eyebrow">DELIVERY ROUTE</p><h2>配送経路</h2></div>${delivery && !playback ? '<button class="secondary" id="replay-route">もう一度見る</button>' : ''}</div><div class="route-legend"><span><i class="pending"></i>未試行</span><span><i class="active"></i>試行中</span><span><i class="failed"></i>失敗</span><span><i class="success"></i>配送完了</span></div><div class="route-track"><div class="route-origin">${sender}<span class="route-arrow">→</span>${dns}</div><div class="route-branch"><small>DNSが返したMX候補（小さい優先度から試行）</small><div class="route-candidates">${servers.join('')}</div></div>${authNode ? `<span class="route-arrow receiver-arrow">→</span>${authNode}` : ''}<span class="route-arrow receiver-arrow">→</span>${receiver}</div><p class="route-message" aria-live="polite">${escape(currentMessage ?? '')}</p><p class="route-note">DNS は配送先の案内役、MX は受信サーバー候補、SMTP はメールを受け渡す会話です。このゲームでは SMTP が受理した時点を配送成功として扱います。</p></section>`
}

function authCard(name: 'SPF' | 'DKIM' | 'DMARC', detail: string, status: string, control: string) {
  return `<article class="auth-card ${status}"><div><strong>${name}</strong><small>${detail}</small></div>${control}</article>`
}

function renderAuthPanel(controlsDisabled: string) {
  const setup = stageSetup(state.stage)
  if (!setup.authConfig || !state.auth) return ''
  const auth = state.auth
  const latest = state.lastDelivery?.authentication
  const spfStatus = latest?.spf === 'pass' ? 'pass' : latest?.spf === 'fail' ? 'fail' : 'pending'
  const dkimStatus = latest?.dkim === 'pass' ? 'pass' : latest?.dkim === 'fail' ? 'fail' : 'pending'
  const dmarcStatus = latest?.dmarc === 'pass' ? 'pass' : latest?.dmarc === 'fail' ? 'fail' : 'pending'
  const spfControl = setup.authFocus === 'spf' ? `<button class="secondary" data-auth="spf" ${controlsDisabled}>${auth.spfAuthorized ? '送信サーバーを許可済み' : '送信サーバーを許可'}</button>` : `<small>${auth.spfAuthorized ? '許可済み' : 'このミッションでは未設定'}</small>`
  const dkimControl = setup.authFocus === 'dkim' ? `<button class="secondary" data-auth="dkim" ${controlsDisabled}>${auth.dkimSigningEnabled ? '署名鍵を有効済み' : '署名鍵を有効化'}</button>` : `<small>${auth.dkimSigningEnabled ? '署名を有効化済み' : 'このミッションでは未設定'}</small>`
  const dmarcControl = setup.authFocus === 'dmarc' ? `<div class="policy-buttons"><button class="secondary" data-policy="none" ${controlsDisabled}>none</button><button class="secondary" data-policy="quarantine" ${controlsDisabled}>quarantine</button><button class="secondary" data-policy="reject" ${controlsDisabled}>reject</button></div>` : `<small>ポリシー: ${auth.dmarcPolicy}</small>`
  return `<section class="panel auth-panel"><h2>送信者認証</h2><p class="hint">カードを操作して、受信側が送信者をどう判定するかを変えます。</p><div class="auth-cards">${authCard('SPF', '送信サーバーの許可を確認', spfStatus, spfControl)}${authCard('DKIM', 'メール署名を検証', dkimStatus, dkimControl)}${authCard('DMARC', `失敗時の方針: ${auth.dmarcPolicy}`, dmarcStatus, dmarcControl)}</div></section>`
}

function render() {
  const setup = stageSetup(state.stage)
  const finalClear = state.stage === 6 && state.cleared
  const controlsDisabled = playback ? 'disabled' : ''
  const missionGuidance = state.observedFailure ? setup.failureHint : setup.firstPrompt
  app.innerHTML = `
    <header><p class="eyebrow">DNS × SMTP simulation game</p><h1>Mail Routing Lab</h1><p class="lede">メールを正しい受信サーバーへ届けよう。</p></header>
    <main>
      <section class="mission ${state.cleared ? 'done' : ''}">
        <span>${state.cleared ? (finalClear ? '★ GAME CLEAR' : '✓ STAGE CLEAR') : setup.title}</span>
        <strong>${state.cleared ? (finalClear ? '3つの障害を解決し、メール配送網を復旧しました。' : `${setup.objective} を達成しました。`) : setup.objective}</strong>
        <p>${state.cleared ? setup.takeaway : missionGuidance}</p>${state.cleared ? `<aside class="takeaway"><strong>今回の学び</strong><span>${setup.takeaway}</span>${setup.nextConcept ? `<small>${setup.nextConcept}</small>` : ''}</aside>` : ''}${state.cleared && !finalClear ? '<button id="next-stage">次のミッションへ</button>' : ''}
      </section>
      ${renderRoute()}
      <div class="grid">
        <section class="panel"><h2>DNS Zone: example.local</h2><p class="hint">数が小さい MX から順に配送先として試します。</p>
          <form id="mx-form" class="stack"><div id="mx-fields">${state.records.map((record, index) => `<div class="mx-row"><label>優先度 <input name="priority-${index}" type="number" min="0" value="${record.priority}" required ${controlsDisabled} /></label><label>配送先ホスト <input name="hostname-${index}" value="${escape(record.hostname)}" required ${controlsDisabled} /></label></div>`).join('')}</div><div class="actions"><button ${controlsDisabled}>MX レコードを保存</button><button type="button" class="secondary" id="add-mx" ${controlsDisabled}>MX を追加</button></div></form>
          <ul class="records">${state.records.map((record) => `<li><b>${record.priority}</b> ${escape(record.hostname)}</li>`).join('')}</ul></section>
        <section class="panel"><h2>SMTP サーバー</h2><div class="servers">${state.servers.map((server, index) => `<article class="server ${server.online ? '' : 'offline'}"><div><strong>${escape(server.hostname)}</strong><small>${server.online ? '稼働中' : '停止中'} · ${server.used}/${server.capacity} 通</small></div><div class="actions"><button class="secondary" data-toggle="${index}" ${controlsDisabled}>${server.online ? '停止' : '起動'}</button><button class="secondary" data-expand="${index}" ${controlsDisabled}>容量 +1</button></div></article>`).join('')}</div></section>
        ${renderAuthPanel(controlsDisabled)}
        <section class="panel compose"><h2>メールを送る</h2><form id="mail-form" class="stack"><label>From <input name="from" type="email" value="${escape(state.draft.from)}" required ${controlsDisabled} /></label><label>To <input name="to" type="email" value="${escape(state.draft.to)}" readonly aria-describedby="recipient-note" ${controlsDisabled} /></label><small id="recipient-note">このゲームでは example.local 宛の配送のみを扱います。</small><label>件名 <input name="subject" value="${escape(state.draft.subject)}" required ${controlsDisabled} /></label><label>本文 <textarea name="body" rows="3" ${controlsDisabled}>${escape(state.draft.body)}</textarea></label><button class="send" ${state.cleared || playback ? 'disabled' : ''}>${playback ? '配送中…' : '配送を開始'}</button></form></section>
        <section class="panel"><h2>配送ログ</h2>${state.lastError ? `<p class="error">失敗: ${escape(state.lastError)}</p>` : ''}<ol class="logs">${state.logs.map((log) => `<li>${escape(log)}</li>`).join('')}</ol></section>
        <section class="panel inbox"><h2>bob の受信ボックス <span>${state.inbox.length}</span></h2>${state.inbox.length ? state.inbox.map((mail) => `<article><strong>${escape(mail.subject)}</strong><small>${escape(mail.from)} → ${escape(mail.to)}</small><p>${escape(mail.body)}</p></article>`).join('') : '<p class="hint">まだメールはありません。</p>'}</section>
        <section class="panel spam"><h2>迷惑メール箱 <span>${state.spam.length}</span></h2>${state.spam.length ? state.spam.map((mail) => `<article><strong>${escape(mail.subject)}</strong><small>${escape(mail.from)} → ${escape(mail.to)}</small><p>${escape(mail.body)}</p></article>`).join('') : '<p class="hint">隔離されたメールはありません。</p>'}</section>
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
    if (!result.success || result.authentication?.dmarc === 'fail') state.observedFailure = true
    if (result.success && result.usedServer) {
      state.servers.find((server) => server.hostname === result.usedServer)!.used += 1
      const mail: Mail = { id: crypto.randomUUID(), ...draft, deliveredAt: new Date().toISOString(), folder: result.destination ?? 'inbox' }
      if (mail.folder === 'spam') state.spam.unshift(mail)
      else state.inbox.unshift(mail)
      if (isStageClear(state.stage, result)) { state.cleared = true; state.logs.push(`${stageSetup(state.stage).title} クリア！`) }
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
  document.querySelector<HTMLButtonElement>('[data-auth="spf"]')?.addEventListener('click', () => {
    if (state.auth) { state.auth.spfAuthorized = true; state.logs = ['SPF に送信サーバーを追加しました。配送を試して確認しましょう。']; save(); render() }
  })
  document.querySelector<HTMLButtonElement>('[data-auth="dkim"]')?.addEventListener('click', () => {
    if (state.auth) { state.auth.dkimSigningEnabled = true; state.logs = ['DKIM 署名鍵を有効化しました。配送を試して確認しましょう。']; save(); render() }
  })
  document.querySelectorAll<HTMLButtonElement>('[data-policy]').forEach((button) => button.addEventListener('click', () => {
    if (state.auth) { state.auth.dmarcPolicy = button.dataset.policy as AuthConfig['dmarcPolicy']; state.logs = [`DMARC ポリシーを ${state.auth.dmarcPolicy} に設定しました。配送を試して確認しましょう。`]; save(); render() }
  }))
  document.querySelector<HTMLFormElement>('#mail-form')!.addEventListener('submit', (event) => {
    event.preventDefault(); const data = new FormData(event.currentTarget as HTMLFormElement)
    const draft: MailDraft = { from: String(data.get('from')), to: String(data.get('to')).trim().toLowerCase(), subject: String(data.get('subject')), body: String(data.get('body')) }
    state.draft = draft
    startPlayback(deliver(draft.to, state.records, state.servers, state.auth), draft)
  })
  document.querySelector<HTMLFormElement>('#mail-form')!.addEventListener('input', (event) => {
    const field = event.target as HTMLInputElement | HTMLTextAreaElement
    if (field.name === 'from' || field.name === 'to' || field.name === 'subject' || field.name === 'body') state.draft = { ...state.draft, [field.name]: field.value }
  })
  document.querySelector<HTMLButtonElement>('#replay-route')?.addEventListener('click', () => { if (state.lastDelivery) startPlayback(state.lastDelivery) })
  document.querySelector<HTMLButtonElement>('#next-stage')?.addEventListener('click', () => { state = newState((state.stage + 1) as StageNumber); save(); render() })
  document.querySelector<HTMLButtonElement>('#reset')!.addEventListener('click', () => { if (playback?.timer) clearTimeout(playback.timer); playback = undefined; state = newState(); save(); render() })
}
render()
