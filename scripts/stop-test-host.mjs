import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
const file = resolve('.test-data/integration/instance.json')
if (existsSync(file)) {
  const instance = JSON.parse(readFileSync(file))
  const response = await fetch(`http://127.0.0.1:${instance.controlPort}/exit`, { method: 'POST', headers: { 'X-Mimir-Control': instance.controlToken } })
  if (!response.ok) throw new Error('Synthetic host did not accept exit')
  console.log('Stopped only the synthetic integration instance.')
}
