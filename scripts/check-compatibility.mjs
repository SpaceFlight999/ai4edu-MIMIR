import assert from 'node:assert/strict'
import { readFileSync, writeFileSync } from 'node:fs'
import { connectBrowser, browserPort } from './cdp.mjs'
const browser = await connectBrowser(browserPort())
const instance = JSON.parse(readFileSync('.test-data/integration/instance.json'))
const checks = [], errors = []
browser.on(event => { if (event.method === 'Runtime.exceptionThrown') errors.push(event.params.exceptionDetails.text) })
try {
  await browser.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1050, deviceScaleFactor: 1, mobile: false })
  await browser.send('Page.navigate', { url: instance.url })
  await browser.waitFor("Boolean(document.querySelector('.mg-well-landing'))")
  await browser.evaluate("document.querySelector('.mimir-product-nav button[aria-label=\"论文导读\"]').click()")
  await browser.waitFor("Boolean(document.querySelector('iframe'))")
  await new Promise(resolve => setTimeout(resolve, 1200))
  const frames = await browser.send('Page.getFrameTree')
  const paperFrame = frames.frameTree.childFrames?.find(frame => frame.frame.url !== 'about:blank')
  assert.ok(paperFrame, 'Paper guide frame did not navigate')
  // The existing reader uses a separate origin. Inspect its own CDP context.
  const world = await browser.send('Page.createIsolatedWorld', { frameId: paperFrame.frame.id, worldName: 'mimir-validation' })
  let reader
  for (let attempt = 0; attempt < 100; attempt++) {
    reader = await browser.send('Runtime.evaluate', { contextId: world.executionContextId, expression: "({ready:document.readyState,text:document.body.innerText.slice(0,2200)})", returnByValue: true })
    if (reader.result.value.ready === 'complete' && reader.result.value.text.length > 20) break
    await new Promise(resolve => setTimeout(resolve, 200))
  }
  assert.equal(reader.result.value.ready, 'complete')
  assert.ok(reader.result.value.text.length > 20, 'Paper guide document is empty')
  checks.push('existing paper guide iframe loaded')
  await browser.evaluate("document.querySelector('.mimir-product-nav button[aria-label=\"文稿工作台\"]').click()")
  await browser.waitFor("!document.querySelector('.mg-app') && document.body.innerText.includes('文稿') && !document.querySelector('iframe')")
  const workbench = await browser.evaluate("document.body.innerText.slice(-2200)")
  assert.ok(workbench.includes('导出') || workbench.includes('编辑') || workbench.includes('LaTeX'), 'Workbench content missing')
  checks.push('existing manuscript workbench rendered')
  await browser.evaluate("document.querySelector('.mg-sidebar-entry').click()")
  await browser.waitFor("Boolean(document.querySelector('.mg-well-landing'))")
  checks.push('return to growth layer retained active plan')
  assert.equal(await browser.evaluate("document.querySelector('.mg-landing-foot').innerText.includes('项完成')"), true)
  await browser.evaluate("localStorage.setItem('mimir.appearance.v3',JSON.stringify({mode:'dark',conversation:{palette:'graphite'},paper:{palette:'blue'},workbench:{palette:'sand'}}))")
  await browser.send('Page.reload')
  await browser.waitFor("Boolean(document.querySelector('.mg-well-landing')) && document.body.dataset.mimirMode==='dark'")
  assert.equal(await browser.evaluate("getComputedStyle(document.querySelector('.mg-app')).color"), 'rgb(224, 227, 235)')
  let shot = await browser.send('Page.captureScreenshot', { format: 'png' }); writeFileSync('artifacts/wisdom-well-dark.png', Buffer.from(shot.data, 'base64'))
  checks.push('existing appearance preference applied to growth layer')
  await browser.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] })
  assert.equal(await browser.evaluate("getComputedStyle(document.querySelector('.mg-stream')).animationName"), 'none')
  checks.push('reduced motion preference honored')
  await browser.send('Emulation.setDeviceMetricsOverride', { width: 760, height: 1000, deviceScaleFactor: 1, mobile: false })
  assert.equal(await browser.evaluate("document.querySelector('.mg-scroll').scrollWidth <= document.querySelector('.mg-scroll').clientWidth + 1"), true)
  checks.push('narrow growth view has no horizontal overflow')
  await browser.evaluate("localStorage.setItem('mimir.appearance.v3',JSON.stringify({mode:'light'}))")
  assert.deepEqual(errors, [])
  writeFileSync('artifacts/compatibility.json', JSON.stringify({ passed: true, checks, errors }, null, 2))
  console.log('Compatibility passed: ' + checks.length + ' browser checks.')
} catch (error) {
  const body = await browser.evaluate("document.body.innerText.slice(0,2400)").catch(() => '')
  console.error(error.message)
  console.log(body.replace(/\?token=[^\s]+/g, '?token=[redacted]'))
  process.exitCode = 1
} finally { await browser.close() }
