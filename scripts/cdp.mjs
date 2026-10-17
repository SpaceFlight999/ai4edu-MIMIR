import { readFileSync } from 'node:fs'
export async function connectBrowser(port) {
  const response = await fetch(`http://127.0.0.1:${port}/json/version`), info = await response.json()
  const socket = new WebSocket(info.webSocketDebuggerUrl), pending = new Map(), listeners = new Set()
  let nextId = 0
  await new Promise((resolve, reject) => { socket.addEventListener('open', resolve, { once: true }); socket.addEventListener('error', reject, { once: true }) })
  socket.addEventListener('message', (event) => {
    const message = JSON.parse(event.data)
    if (message.id && pending.has(message.id)) { const handler = pending.get(message.id); pending.delete(message.id); clearTimeout(handler.timer); message.error ? handler.reject(new Error(message.error.message)) : handler.resolve(message.result) }
    else for (const listener of listeners) listener(message)
  })
  const send = (method, params = {}, sessionId) => new Promise((resolve, reject) => {
    const id = ++nextId, timer = setTimeout(() => { pending.delete(id); reject(new Error('CDP timed out: ' + method)) }, 30000)
    pending.set(id, { resolve, reject, timer }); socket.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }))
  })
  const target = await send('Target.createTarget', { url: 'about:blank' }), attached = await send('Target.attachToTarget', { targetId: target.targetId, flatten: true })
  const sessionId = attached.sessionId
  await send('Page.enable', {}, sessionId); await send('Runtime.enable', {}, sessionId)
  return { send: (method, params) => send(method, params, sessionId), on: (listener) => { listeners.add(listener); return () => listeners.delete(listener) }, async close() { try { await send('Target.closeTarget', { targetId: target.targetId }) } finally { socket.close() } },
    async evaluate(expression) { const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }, sessionId); if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text); return result.result.value },
    async waitFor(expression, timeout = 20000) { const end = Date.now() + timeout; while (Date.now() < end) { if (await this.evaluate(expression)) return; await new Promise((resolve) => setTimeout(resolve, 100)) } throw new Error('Browser condition timed out: ' + expression) } }
}
export function browserPort() { return JSON.parse(readFileSync('artifacts/browser.json', 'utf8').replace(/^\uFEFF/, '')).port }
