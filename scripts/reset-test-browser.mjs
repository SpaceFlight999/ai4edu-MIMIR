import { browserPort } from './cdp.mjs'
const response = await fetch(`http://127.0.0.1:${browserPort()}/json/version`), info = await response.json()
const socket = new WebSocket(info.webSocketDebuggerUrl)
await new Promise((resolve, reject) => { socket.addEventListener('open', resolve, { once: true }); socket.addEventListener('error', reject, { once: true }) })
socket.send(JSON.stringify({ id: 1, method: 'Browser.close' }))
await new Promise(resolve => { socket.addEventListener('close', resolve, { once: true }); setTimeout(() => { socket.close(); resolve() }, 3000).unref() })
console.log('Closed the isolated validation browser.')
